import { createHash } from 'node:crypto';
import type { EvidenceScope, ExternalEvidence, RawEvidenceResult } from './types';

const OFFICIAL_DOMAINS = [
  'sec.gov', 'sse.com.cn', 'szse.cn', 'bse.cn', 'hkexnews.hk', 'hkex.com.hk',
  'twse.com.tw', 'mops.twse.com.tw', 'edinet-fsa.go.jp', 'dart.fss.or.kr',
];
const PROFESSIONAL_NEWS = [
  'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com', 'nikkei.com',
  'caixin.com', 'yicai.com', 'cls.cn', '21jingji.com',
];
const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']);

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.local') || host === '::' || host === '::1'
    || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function cleanText(value: string | null | undefined, maxLength: number): string {
  return (value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function canonicalizeEvidenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || isPrivateHostname(url.hostname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function domainMatches(domain: string, candidates: string[]): boolean {
  return candidates.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

export function trustScoreFor(domain: string, scope: EvidenceScope): number {
  if (domainMatches(domain, OFFICIAL_DOMAINS)) return 0.95;
  if (domainMatches(domain, PROFESSIONAL_NEWS)) return 0.78;
  if (scope === 'broker' || scope === 'filing' || scope === 'company') return 0.68;
  return 0.55;
}

function normalizeDate(value: string | null | undefined, now: Date): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() + 86_400_000) return null;
  return date.toISOString();
}

export function normalizeEvidenceResults(
  raw: RawEvidenceResult[],
  scope: EvidenceScope,
  fetchedAt: Date,
  freshnessDays = 365,
): ExternalEvidence[] {
  const seen = new Set<string>();
  const output: ExternalEvidence[] = [];
  const oldestAllowedAt = fetchedAt.getTime() - freshnessDays * 86_400_000;
  for (const result of raw) {
    const url = canonicalizeEvidenceUrl(result.url);
    const title = cleanText(result.title, 240);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const trustScore = trustScoreFor(domain, scope);
    const providerScore = Number.isFinite(result.score) ? Math.min(1, Math.max(0, Number(result.score))) : 0.5;
    const publishedAt = normalizeDate(result.publishedAt, fetchedAt);
    if (publishedAt && Date.parse(publishedAt) < oldestAllowedAt) continue;
    output.push({
      citationId: `web_${createHash('sha256').update(url).digest('hex').slice(0, 12)}`,
      title,
      url,
      domain,
      snippet: cleanText(result.snippet, 800),
      sourceType: scope,
      publishedAt,
      fetchedAt: fetchedAt.toISOString(),
      trustScore,
      relevanceScore: Number((providerScore * 0.7 + trustScore * 0.3).toFixed(3)),
    });
  }
  return output;
}

export function dedupeAndRankEvidence(results: ExternalEvidence[], limit: number): ExternalEvidence[] {
  const byUrl = new Map<string, ExternalEvidence>();
  for (const result of results) {
    const current = byUrl.get(result.url);
    if (!current || result.relevanceScore > current.relevanceScore) byUrl.set(result.url, result);
  }
  return [...byUrl.values()]
    .sort((a, b) => b.relevanceScore - a.relevanceScore || (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, limit);
}
