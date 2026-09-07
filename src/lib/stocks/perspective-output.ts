import type { PersonaSpec, PerspectiveResult } from '@/lib/data/personas';
import { resolvePerspectiveCitations } from '@/lib/external-evidence';
import type { ExternalEvidence, PerspectiveCitation } from '@/lib/external-evidence/types';
import { sanitizeAiList, sanitizeAiText } from '@/lib/llm/sanitize';
import type { PerspectiveAnalysisResolvedMode } from './perspective-analysis';
import { parseCreateWatchlistAlert } from '@/lib/watchlist/alerts';
import {
  PERSPECTIVE_CLAIM_KINDS,
  type PerspectiveClaim,
  type PerspectiveClaimInvalidation,
  type PerspectiveClaimKind,
} from './perspective-claims';

const MAX_DATA_CITES = 8;
const MAX_CITATIONS = 8;
const MAX_CLAIMS = 6;
const MAX_CLAIM_LENGTH = 240;
const MAX_INVALIDATION_LENGTH = 240;
const CLAIM_KINDS = new Set<string>(PERSPECTIVE_CLAIM_KINDS);
const PROHIBITED_RECOMMENDATION = /(?:建议|推荐)(?:立即|现在|直接)?(?:买入|卖出)|明天(?:一定|肯定|会)(?:涨|跌)|guaranteed\s+(?:gain|return)|(?:buy|sell)\s+recommendation/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function dataCites(value: unknown, allowed?: ReadonlySet<string>): string[] {
  return sanitizeAiList(Array.isArray(value) ? value.slice(0, MAX_DATA_CITES).map(String) : [])
    .filter((label) => !allowed || allowed.has(label));
}

function uniqueCitations(groups: PerspectiveCitation[][]): PerspectiveCitation[] {
  const seen = new Set<string>();
  return groups.flat().filter((citation) => {
    if (seen.has(citation.id)) return false;
    seen.add(citation.id);
    return true;
  }).slice(0, MAX_CITATIONS);
}

function claimKind(value: unknown): PerspectiveClaimKind {
  return typeof value === 'string' && CLAIM_KINDS.has(value)
    ? value as PerspectiveClaimKind
    : 'thesis';
}

function normalizeInvalidation(value: unknown): PerspectiveClaimInvalidation | undefined {
  const input = record(value);
  if (!input) return undefined;
  const condition = sanitizeAiText(String(input.condition ?? '')).slice(0, MAX_INVALIDATION_LENGTH);
  if (!condition) return undefined;
  const parsed = parseCreateWatchlistAlert({
    itemId: 'perspective-claim-draft',
    alertType: input.alert_type ?? input.alertType,
    operator: input.operator,
    threshold: input.threshold,
    config: input.config ?? {},
    enabled: false,
  });
  if (!parsed) return undefined;
  return {
    condition,
    alertType: parsed.alert_type,
    operator: parsed.operator,
    threshold: parsed.threshold_numeric,
    config: parsed.config,
  };
}

function normalizeClaims(
  value: unknown,
  evidence: ExternalEvidence[],
  allowedDataCites?: ReadonlySet<string>,
): PerspectiveClaim[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CLAIMS).flatMap((raw, index) => {
    const item = record(raw);
    if (!item) return [];
    const text = sanitizeAiText(String(item.text ?? '')).slice(0, MAX_CLAIM_LENGTH);
    if (!text) return [];
    const invalidation = normalizeInvalidation(item.invalidation);
    return [{
      id: `claim_${index + 1}`,
      kind: claimKind(item.kind),
      text,
      dataCites: dataCites(item.data_cites ?? item.dataCites, allowedDataCites),
      citations: resolvePerspectiveCitations(item.citation_ids ?? item.citationIds, evidence, MAX_CITATIONS),
      ...(invalidation ? { invalidation } : {}),
    }];
  });
}

export class PerspectiveOutputError extends Error {
  constructor(public readonly code: 'invalid_model_output' | 'evidence_citation_required' | 'non_compliant_model_output') {
    super(code);
    this.name = 'PerspectiveOutputError';
  }
}

export function normalizePerspectiveModelOutput(input: {
  value: unknown;
  persona: PersonaSpec;
  evidence: ExternalEvidence[];
  analysisMode: PerspectiveAnalysisResolvedMode;
  allowedDataCites?: readonly string[];
}): PerspectiveResult {
  const parsed = record(input.value);
  if (!parsed) throw new PerspectiveOutputError('invalid_model_output');

  const stance = (['bullish', 'neutral', 'bearish'] as const).includes(parsed.stance as never)
    ? parsed.stance as PerspectiveResult['stance']
    : 'neutral';
  const confidence = Math.max(0, Math.min(10, Number(parsed.confidence) || 5));
  const allowedDataCites = input.allowedDataCites
    ? new Set(input.allowedDataCites)
    : undefined;
  const legacyDataCites = dataCites(parsed.data_cites ?? parsed.cites, allowedDataCites);
  const legacyCitations = resolvePerspectiveCitations(parsed.citation_ids, input.evidence, MAX_CITATIONS);
  let summary = sanitizeAiText(String(parsed.summary ?? '')).slice(0, 300);
  let claims = normalizeClaims(parsed.claims, input.evidence, allowedDataCites);

  // Keep existing providers readable while they migrate to the claim schema.
  if (claims.length === 0 && summary) {
    claims = [{ id: 'claim_1', kind: 'thesis', text: summary, dataCites: legacyDataCites, citations: legacyCitations }];
  }
  if (!summary && claims.length > 0) summary = claims[0].text;
  if (!summary || claims.length === 0) throw new PerspectiveOutputError('invalid_model_output');
  if (PROHIBITED_RECOMMENDATION.test(summary)
    || claims.some((claim) => PROHIBITED_RECOMMENDATION.test(claim.text))) {
    throw new PerspectiveOutputError('non_compliant_model_output');
  }

  const unsupportedClaim = claims.some((claim) => claim.dataCites.length === 0 && claim.citations.length === 0);
  const citations = uniqueCitations([legacyCitations, ...claims.map((claim) => claim.citations)]);
  if (unsupportedClaim || (input.analysisMode === 'evidence_backed' && citations.length === 0)) {
    throw new PerspectiveOutputError('evidence_citation_required');
  }
  const cites = [...new Set([...legacyDataCites, ...claims.flatMap((claim) => claim.dataCites)])]
    .slice(0, MAX_DATA_CITES);

  return {
    persona: input.persona.id,
    name: input.persona.name,
    stance,
    confidence,
    summary,
    cites,
    citations,
    claims,
  };
}
