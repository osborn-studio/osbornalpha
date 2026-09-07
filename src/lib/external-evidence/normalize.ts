import { createHash } from 'node:crypto';
import type { EvidenceQualityFlag, EvidenceScope, ExternalEvidence, RawEvidenceResult } from './types';
import { canonicalizeEvidenceUrl } from './url';

export { canonicalizeEvidenceUrl } from './url';

export const OFFICIAL_EVIDENCE_DOMAINS = [
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

function normalizedEventTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\b(the|a|an|and|or|of|to|for|on|in|at|by|with)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleNgrams(value: string): Set<string> {
  const compact = normalizedEventTitle(value).replace(/\s+/g, '');
  const grams = new Set<string>();
  const size = compact.length < 12 ? 2 : 3;
  for (let index = 0; index <= compact.length - size; index += 1) grams.add(compact.slice(index, index + size));
  return grams;
}

function diceSimilarity(left: string, right: string): number {
  const a = titleNgrams(left);
  const b = titleNgrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function withinEventWindow(left: string | null, right: string | null): boolean {
  if (!left || !right) return true;
  return Math.abs(Date.parse(left) - Date.parse(right)) <= 3 * 86_400_000;
}

function representsSameEvent(left: ExternalEvidence, right: ExternalEvidence): boolean {
  const leftTitle = normalizedEventTitle(left.title);
  const rightTitle = normalizedEventTitle(right.title);
  if (leftTitle === rightTitle) return withinEventWindow(left.publishedAt, right.publishedAt);
  return Math.min(leftTitle.length, rightTitle.length) >= 18
    && withinEventWindow(left.publishedAt, right.publishedAt)
    && diceSimilarity(left.title, right.title) >= 0.78;
}

function eventClusterId(items: ExternalEvidence[]): string {
  const canonicalTitle = items.map((item) => normalizedEventTitle(item.title)).sort()[0] ?? '';
  return `evt_${createHash('sha256').update(canonicalTitle).digest('hex').slice(0, 12)}`;
}

function domainMatches(domain: string, candidates: string[]): boolean {
  return candidates.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

export function trustScoreFor(domain: string, scope: EvidenceScope): number {
  if (domainMatches(domain, OFFICIAL_EVIDENCE_DOMAINS)) return 0.95;
  if (domainMatches(domain, PROFESSIONAL_NEWS)) return 0.78;
  if (scope === 'broker' || scope === 'filing' || scope === 'company') return 0.68;
  return 0.55;
}

export function isOfficialEvidenceDomain(domain: string): boolean {
  return domainMatches(domain.toLowerCase(), OFFICIAL_EVIDENCE_DOMAINS);
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

const RECENCY_HALF_LIFE_DAYS: Record<EvidenceScope | 'social', number> = {
  news: 7,
  social: 2,
  broker: 30,
  filing: 180,
  company: 90,
  industry: 45,
  macro: 45,
};

export function evidenceRecencyScore(item: ExternalEvidence, now: Date): number {
  if (!item.publishedAt) return item.qualityFlags.includes('official_source') ? 0.65 : 0.2;
  const publishedAt = Date.parse(item.publishedAt);
  if (!Number.isFinite(publishedAt)) return 0.2;
  const ageDays = Math.max(0, (now.getTime() - publishedAt) / 86_400_000);
  const halfLife = RECENCY_HALF_LIFE_DAYS[item.sourceType] ?? 30;
  return Number(Math.exp((-Math.LN2 * ageDays) / halfLife).toFixed(3));
}

export function evidenceRankingScore(item: ExternalEvidence, now: Date): number {
  return Number((
    item.relevanceScore * 0.55
    + item.qualityScore * 0.3
    + evidenceRecencyScore(item, now) * 0.15
  ).toFixed(4));
}

export function dedupeAndRankEvidence(
  results: ExternalEvidence[],
  limit: number,
  now = new Date(Math.max(0, ...results.map((item) => Date.parse(item.fetchedAt) || 0))),
): ExternalEvidence[] {
  const byUrl = new Map<string, ExternalEvidence>();
  for (const result of results) {
    const current = byUrl.get(result.url);
    if (!current || result.relevanceScore > current.relevanceScore) byUrl.set(result.url, result);
  }
  const ranked = [...byUrl.values()]
    .sort((a, b) => evidenceRankingScore(b, now) - evidenceRankingScore(a, now)
      || (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const clusters: ExternalEvidence[][] = [];
  for (const item of ranked) {
    const cluster = clusters.find((candidate) => representsSameEvent(candidate[0], item));
    if (cluster) cluster.push(item);
    else clusters.push([item]);
  }
  return clusters.slice(0, limit).map((cluster) => {
    const representative = cluster[0];
    const corroboratingSources = cluster.slice(1)
      .filter((item, index, items) => item.domain !== representative.domain
        && items.findIndex((candidate) => candidate.domain === item.domain) === index)
      .map((item) => ({
        title: item.title,
        url: item.url,
        domain: item.domain,
        publishedAt: item.publishedAt,
        trustScore: item.trustScore,
        qualityScore: item.qualityScore,
      }));
    const corroborationCount = 1 + corroboratingSources.length;
    return {
      ...representative,
      eventClusterId: eventClusterId(cluster),
      corroborationCount,
      corroboratingSources,
      qualityFlags: corroborationCount > 1
        ? [...new Set([...representative.qualityFlags, 'cross_source_corroborated' as const])]
        : representative.qualityFlags,
    };
  });
}
