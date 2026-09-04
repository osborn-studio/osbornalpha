import { EVIDENCE_SCOPES, type EvidenceSearchRequest, type NormalizedEvidenceSearchRequest } from './types';

const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,19}$/i;

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function isSafeEvidenceTicker(value: string): boolean {
  return TICKER_RE.test(value);
}

export function normalizeEvidenceTickerParam(raw: string): string | null {
  try {
    const ticker = decodeURIComponent(raw).toUpperCase();
    return isSafeEvidenceTicker(ticker) ? ticker : null;
  } catch {
    return null;
  }
}

export function normalizeEvidenceSearchRequest(input: EvidenceSearchRequest): NormalizedEvidenceSearchRequest {
  const query = cleanText(input.query, 200);
  const rawTicker = cleanText(input.ticker, 20)?.toUpperCase();
  const ticker = rawTicker && isSafeEvidenceTicker(rawTicker) ? rawTicker : undefined;
  const name = cleanText(input.name, 100);
  const market = cleanText(input.market, 20);
  const scopes = Array.from(new Set(
    (input.scopes ?? ['news']).filter((scope) => EVIDENCE_SCOPES.includes(scope)),
  ));

  if (input.ticker && !ticker) throw new Error('invalid_ticker');
  if (!query && !ticker && !name) throw new Error('evidence_query_required');

  return {
    ...(query ? { query } : {}),
    ...(ticker ? { ticker } : {}),
    ...(name ? { name } : {}),
    ...(market ? { market } : {}),
    scopes: scopes.length > 0 ? scopes : ['news'],
    freshnessDays: clampInteger(input.freshnessDays, 14, 1, 365),
    limit: clampInteger(input.limit, 12, 1, 20),
  };
}
