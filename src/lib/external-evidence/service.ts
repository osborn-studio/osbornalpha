import { unstable_cache } from 'next/cache';
import { buildEvidenceQueries } from './query';
import { dedupeAndRankEvidence, normalizeEvidenceResults } from './normalize';
import { normalizeEvidenceSearchRequest } from './request';
import { resolveEvidenceSearchProviders } from './resolve-provider';
import { persistEvidenceSnapshot } from './store';
import { configuredOfficialDocumentProvider, enrichOfficialEvidenceDocuments } from './official-documents';
import type {
  EvidenceQuery,
  EvidenceSearchProvider,
  EvidenceDocumentProvider,
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
  documentProvider?: EvidenceDocumentProvider | null;
  signal?: AbortSignal;
}

export interface ExternalEvidenceSearchOptions {
  signal?: AbortSignal;
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
    try {
      await persist(request, snapshot);
    } catch {
      return {
        ...snapshot,
        warnings: [...new Set([...snapshot.warnings, 'audit_persist_failed'])],
      };
    }
  }
  return snapshot;
}

async function runQueries(
  queries: EvidenceQuery[],
  provider: EvidenceSearchProvider,
  fetchedAt: Date,
  signal?: AbortSignal,
): Promise<{ results: ExternalEvidence[]; warnings: string[]; failedQueries: EvidenceQuery[] }> {
  const results: ExternalEvidence[] = [];
  const warnings: string[] = [];
  const failedQueries: EvidenceQuery[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < queries.length) {
      if (signal?.aborted) throw signal.reason;
      const query = queries[cursor++];
      try {
        const raw = await provider.search(query, signal);
        results.push(...normalizeEvidenceResults(raw, query.scope, fetchedAt, query.freshnessDays));
      } catch (error) {
        if (signal?.aborted) throw error;
        const code = error instanceof Error ? error.message : 'search_provider_error';
        warnings.push(`${query.scope}:${code.slice(0, 80)}`);
        failedQueries.push(query);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, queries.length) }, () => worker()));
  return { results, warnings, failedQueries };
}

export async function searchExternalEvidenceUncached(
  input: EvidenceSearchRequest | NormalizedEvidenceSearchRequest,
  dependencies: SearchDependencies = {},
): Promise<EvidenceSearchSnapshot> {
  const request = normalizeEvidenceSearchRequest(input);
  if (dependencies.signal?.aborted) throw dependencies.signal.reason;
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
  const searched = { results: [] as ExternalEvidence[], warnings: [] as string[] };
  const usedProviders = new Set<string>();
  let queryCount = 0;
  const failoverWarnings: string[] = [];
  let pendingQueries = queries;
  let lastProviderId: string | null = null;
  let firstProviderFailedAll = false;
  for (let index = 0; index < providers.length && pendingQueries.length > 0; index += 1) {
    const provider = providers[index];
    const result = await runQueries(pendingQueries, provider, fetchedAt, dependencies.signal);
    usedProviders.add(provider.id);
    lastProviderId = provider.id;
    if (index === 0) firstProviderFailedAll = result.failedQueries.length === queries.length;
    queryCount += pendingQueries.length;
    searched.results.push(...result.results);
    searched.warnings.push(...result.warnings.map((warning) => `${provider.id}:${warning}`));
    pendingQueries = result.failedQueries;
    if (pendingQueries.length > 0 && index < providers.length - 1) {
      failoverWarnings.push(`provider_failover:${provider.id}`);
    }
  }
  const ranked = dedupeAndRankEvidence(searched.results, request.limit);
  if (dependencies.signal?.aborted) throw dependencies.signal.reason;
  const documents = await enrichOfficialEvidenceDocuments(
    ranked,
    dependencies.documentProvider === undefined ? configuredOfficialDocumentProvider() : dependencies.documentProvider,
    fetchedAt,
  );
  const results = documents.results;
  const warnings = [
    ...failoverWarnings,
    ...searched.warnings,
    ...documents.warnings,
  ];
  const failedAll = pendingQueries.length === queries.length;
  const provider = firstProviderFailedAll && pendingQueries.length === 0 && lastProviderId
    ? lastProviderId
    : usedProviders.size === 1
    ? [...usedProviders][0]
    : usedProviders.size > 1 ? 'mixed' : null;
  return finishSnapshot(request, {
    requestId: crypto.randomUUID(),
    status: failedAll ? 'error' : pendingQueries.length > 0 ? 'partial' : 'complete',
    provider,
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

export async function searchExternalEvidence(
  input: EvidenceSearchRequest,
  options: ExternalEvidenceSearchOptions = {},
): Promise<EvidenceSearchSnapshot> {
  const request = normalizeEvidenceSearchRequest(input);
  if (options.signal) {
    return searchExternalEvidenceUncached(request, {
      signal: options.signal,
      persist: persistEvidenceSnapshot,
    });
  }
  const serialized = JSON.stringify(request);
  if (request.scopes.every((scope) => scope === 'news' || scope === 'filing')) {
    return cachedFastSearch(serialized);
  }
  if (request.scopes.length === 1 && request.scopes[0] === 'broker') {
    return cachedBrokerSearch(serialized);
  }
  return cachedResearchSearch(serialized);
}
