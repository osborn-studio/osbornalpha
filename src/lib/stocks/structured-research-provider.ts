import { createHash } from 'node:crypto';
import { EVIDENCE_QUALITY_FLAGS, type EvidenceQualityFlag } from '@/lib/external-evidence/types';
import { canonicalizeEvidenceUrl } from '@/lib/external-evidence/url';
import type { Market } from '@/lib/supabase/database.types';
import { normalizeBrokerRating } from './consensus';
import type { StockReportItem } from './research-types';

const PROVIDER_ID = 'structured-research-http';
const TIMEOUT_MS = 8_000;
const SUPPORTED_MARKETS = new Set<Market>(['HK', 'US']);

export interface StructuredResearchLoad {
  provider: string;
  configured: boolean;
  items: StockReportItem[];
  warnings: string[];
}

interface Dependencies {
  endpoint?: string | null;
  token?: string | null;
  fetch?: typeof fetch;
}

function endpoint(value: string | null | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function nullableNumber(value: unknown, positive = false): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && (!positive || value > 0));
}

function boundedScore(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function normalizedItem(value: unknown): StockReportItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300
    || (item.broker !== null && typeof item.broker !== 'string')
    || (item.rating !== null && typeof item.rating !== 'string')
    || !nullableNumber(item.targetPriceMin, true)
    || !nullableNumber(item.targetPriceMax, true)
    || !nullableNumber(item.targetChangePct)
    || (item.publishedAt !== null && (typeof item.publishedAt !== 'string' || !Number.isFinite(Date.parse(item.publishedAt))))
    || typeof item.source !== 'string' || !item.source.trim()
    || typeof item.trustScore !== 'number' || !Number.isFinite(item.trustScore)
    || item.trustScore < 0 || item.trustScore > 1) return null;
  const rawUrl = item.url === null ? null : typeof item.url === 'string' ? canonicalizeEvidenceUrl(item.url) : null;
  if (item.url !== null && rawUrl === null) return null;
  const qualityFlags = Array.isArray(item.qualityFlags)
    ? item.qualityFlags.filter((flag): flag is EvidenceQualityFlag => (
        typeof flag === 'string' && (EVIDENCE_QUALITY_FLAGS as readonly string[]).includes(flag)
      ))
    : [];
  const stableKey = [item.source, item.broker ?? '', item.title, item.publishedAt ?? ''].join('|');
  return {
    id: typeof item.id === 'string' && item.id.length <= 200
      ? item.id
      : `sr_${createHash('sha256').update(stableKey).digest('hex').slice(0, 12)}`,
    title: item.title.trim(),
    broker: typeof item.broker === 'string' ? item.broker.trim() || null : null,
    rating: typeof item.rating === 'string' ? item.rating.trim() || null : null,
    ratingNormalized: normalizeBrokerRating(typeof item.rating === 'string' ? item.rating : null),
    targetPriceMin: item.targetPriceMin as number | null,
    targetPriceMax: item.targetPriceMax as number | null,
    targetChangePct: item.targetChangePct as number | null,
    url: rawUrl,
    publishedAt: item.publishedAt as string | null,
    source: item.source.trim(),
    trustScore: item.trustScore,
    relevanceScore: boundedScore(item.relevanceScore, item.trustScore),
    qualityScore: boundedScore(item.qualityScore, item.trustScore),
    qualityFlags,
  };
}

export async function loadConfiguredStructuredResearch(
  ticker: string,
  market: Market,
  dependencies: Dependencies = {},
): Promise<StructuredResearchLoad> {
  if (!SUPPORTED_MARKETS.has(market)) {
    return { provider: PROVIDER_ID, configured: false, items: [], warnings: ['structured_research_market_unsupported'] };
  }
  const url = endpoint(dependencies.endpoint === undefined ? process.env.STRUCTURED_RESEARCH_API_URL : dependencies.endpoint);
  if (!url) {
    return { provider: PROVIDER_ID, configured: false, items: [], warnings: ['structured_research_provider_unconfigured'] };
  }
  const normalizedTicker = ticker.trim().toUpperCase();
  url.searchParams.set('ticker', normalizedTicker);
  url.searchParams.set('market', market);
  const token = dependencies.token === undefined ? process.env.STRUCTURED_RESEARCH_API_TOKEN?.trim() : dependencies.token?.trim();
  const response = await (dependencies.fetch ?? fetch)(url, {
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`${PROVIDER_ID}_http_${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${PROVIDER_ID}_invalid_response`);
  const payload = body as Record<string, unknown>;
  if (String(payload.ticker).toUpperCase() !== normalizedTicker || !Array.isArray(payload.items) || payload.items.length > 100) {
    throw new Error(`${PROVIDER_ID}_invalid_response`);
  }
  const items = payload.items.map(normalizedItem);
  if (items.some((item) => item === null)) throw new Error(`${PROVIDER_ID}_invalid_response`);
  return { provider: PROVIDER_ID, configured: true, items: items as StockReportItem[], warnings: [] };
}
