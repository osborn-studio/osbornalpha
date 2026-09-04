import { unstable_cache } from 'next/cache';
import { buildEvidenceQueries } from './query';
import { dedupeAndRankEvidence, normalizeEvidenceResults } from './normalize';
import { normalizeEvidenceSearchRequest } from './request';
import { resolveEvidenceSearchProviders } from './resolve-provider';
import { persistEvidenceSnapshot } from './store';
import type {
  EvidenceQuery,
  EvidenceSearchProvider,
  EvidenceSearchRequest,
  EvidenceSearchSnapshot,
  ExternalEvidence,
  NormalizedEvidenceSearchRequest,
} from './types';

interface SearchDependencies {
  provider?: EvidenceSearchProvider | null;
  providers?: EvidenceSearchProvider[];
  now?: () => Date;
  persist?: (request: NormalizedEvidenceSearchRequest, snapshot: EvidenceSearchSnapshot) => Promise<void>;
}

function estimatedSearchCostMicrousd(queryCount: number): number | null {
  const perQuery = Number(process.env.SEARCH_COST_MICRO_USD_PER_QUERY);
  return Number.isFinite(perQuery) && perQuery >= 0 ? Math.round(perQuery * queryCount) : null;
}

async function finishSnapshot(
  request: NormalizedEvidenceSearchRequest,
  snapshot: EvidenceSearchSnapshot,
  persist?: SearchDependencies['persist'],
): Promise<EvidenceSearchSnapshot> {
  if (persist) {
    try { await persist(request, snapshot); } catch { /* Audit storage is best-effort. */ }
  }
  return snapshot;
}

async function runQueries(
  queries: EvidenceQuery[],
  provider: EvidenceSearchProvider,
  fetchedAt: Date,
): Promise<{ results: ExternalEvidence[]; warnings: string[] }> {
  const results: ExternalEvidence[] = [];
  const warnings: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < queries.length) {
      const query = queries[cursor++];
      try {
        const raw = await provider.search(query);
        results.push(...normalizeEvidenceResults(raw, query.scope, fetchedAt, query.freshnessDays));
      } catch (error) {
        const code = error instanceof Error ? error.message : 'search_provider_error';
        warnings.push(`${query.scope}:${code.slice(0, 80)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, queries.length) }, () => worker()));
  return { results, warnings };
}

export async function searchExternalEvidenceUncached(
  input: EvidenceSearchRequest | NormalizedEvidenceSearchRequest,
  dependencies: SearchDependencies = {},
): Promise<EvidenceSearchSnapshot> {
  const request = normalizeEvidenceSearchRequest(input);
  const providers = dependencies.providers
    ?? (dependencies.provider !== undefined
      ? (dependencies.provider ? [dependencies.provider] : [])
      : resolveEvidenceSearchProviders());
  const fetchedAt = dependencies.now?.() ?? new Date();
  const startedAt = Date.now();
  if (providers.length === 0) {
    return finishSnapshot(request, {
      requestId: crypto.randomUUID(),
      status: 'unavailable',
      provider: null,
      queryCount: 0,
      results: [],
      fetchedAt: fetchedAt.toISOString(),
      durationMs: Date.now() - startedAt,
      estimatedCostMicrousd: 0,
      warnings: ['search_provider_not_configured'],
    }, dependencies.persist);
  }

  const queries = buildEvidenceQueries(request);
  let searched = { results: [] as ExternalEvidence[], warnings: [] as string[] };
  let provider = providers[0];
  let queryCount = 0;
  const failoverWarnings: string[] = [];
  for (let index = 0; index < providers.length; index += 1) {
    provider = providers[index];
    searched = await runQueries(queries, provider, fetchedAt);
    queryCount += queries.length;
    const failedAll = searched.warnings.length === queries.length;
    if (!failedAll || index === providers.length - 1) break;
    failoverWarnings.push(`provider_failover:${provider.id}`);
  }
  const results = dedupeAndRankEvidence(searched.results, request.limit);
  const warnings = [...failoverWarnings, ...searched.warnings];
  const failedAll = searched.warnings.length === queries.length;
  return finishSnapshot(request, {
    requestId: crypto.randomUUID(),
    status: failedAll ? 'error' : searched.warnings.length > 0 ? 'partial' : 'complete',
    provider: provider.id,
    queryCount,
    results,
    fetchedAt: fetchedAt.toISOString(),
    durationMs: Date.now() - startedAt,
    estimatedCostMicrousd: estimatedSearchCostMicrousd(queryCount),
    warnings,
  }, dependencies.persist);
}

async function searchSerialized(serialized: string): Promise<EvidenceSearchSnapshot> {
  return searchExternalEvidenceUncached(JSON.parse(serialized), { persist: persistEvidenceSnapshot });
}

const cachedFastSearch = unstable_cache(searchSerialized, ['external-evidence-fast-v1'], {
  revalidate: 15 * 60,
  tags: ['external-evidence'],
});
const cachedResearchSearch = unstable_cache(searchSerialized, ['external-evidence-research-v1'], {
  revalidate: 30 * 60,
  tags: ['external-evidence'],
});
const cachedBrokerSearch = unstable_cache(searchSerialized, ['external-evidence-broker-v1'], {
  revalidate: 6 * 60 * 60,
  tags: ['external-evidence'],
});

export async function searchExternalEvidence(input: EvidenceSearchRequest): Promise<EvidenceSearchSnapshot> {
  const request = normalizeEvidenceSearchRequest(input);
  const serialized = JSON.stringify(request);
  if (request.scopes.every((scope) => scope === 'news' || scope === 'filing')) {
    return cachedFastSearch(serialized);
  }
  if (request.scopes.length === 1 && request.scopes[0] === 'broker') {
    return cachedBrokerSearch(serialized);
  }
  return cachedResearchSearch(serialized);
}
