import { createHash } from 'node:crypto';
import type { EvidenceQualityFlag, EvidenceScope, ExternalEvidence, RawEvidenceResult } from './types';
import { canonicalizeEvidenceUrl } from './url';

export { canonicalizeEvidenceUrl } from './url';

const OFFICIAL_DOMAINS = [
  'sec.gov', 'sse.com.cn', 'szse.cn', 'bse.cn', 'hkexnews.hk', 'hkex.com.hk',
  'twse.com.tw', 'mops.twse.com.tw', 'edinet-fsa.go.jp', 'dart.fss.or.kr',
];
const PROFESSIONAL_NEWS = [
  'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com', 'nikkei.com',
  'caixin.com', 'yicai.com', 'cls.cn', '21jingji.com',
];

function cleanText(value: string | null | undefined, maxLength: number): string {
  return (value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
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

function qualityFor(
  domain: string,
  trustScore: number,
  relevanceScore: number,
  publishedAt: string | null,
  snippet: string,
  providerScore: number | null,
): { score: number; flags: EvidenceQualityFlag[] } {
  const flags: EvidenceQualityFlag[] = [];
  if (trustScore >= 0.9) flags.push('official_source');
  else if (trustScore >= 0.75) flags.push('professional_source');
  if (providerScore != null) flags.push('provider_ranked');
  if (publishedAt) flags.push('dated_source');
  if (snippet) flags.push('snippet_available');
  if (trustScore < 0.7) flags.push('unverified_source');
  // Quality is intentionally separate from relevance: it answers whether a
  // result is well-sourced and inspectable, not whether it matches the query.
  const score = trustScore * 0.65 + (publishedAt ? 0.15 : 0) + (snippet ? 0.1 : 0)
    + (domain.length > 0 ? 0.05 : 0) + relevanceScore * 0.05;
  return { score: Number(Math.min(1, score).toFixed(3)), flags };
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
    const snippet = cleanText(result.snippet, 800);
    const relevanceScore = Number((providerScore * 0.7 + trustScore * 0.3).toFixed(3));
    const quality = qualityFor(domain, trustScore, relevanceScore, publishedAt, snippet, Number.isFinite(result.score) ? providerScore : null);
    output.push({
      citationId: `web_${createHash('sha256').update(url).digest('hex').slice(0, 12)}`,
      title,
      url,
      domain,
      snippet,
      sourceType: scope,
      publishedAt,
      fetchedAt: fetchedAt.toISOString(),
      trustScore,
      relevanceScore,
      qualityScore: quality.score,
      qualityFlags: quality.flags,
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
