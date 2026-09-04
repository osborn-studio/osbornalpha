import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePerspectiveCitations } from './citations';
import { canonicalizeEvidenceUrl, dedupeAndRankEvidence, normalizeEvidenceResults } from './normalize';
import { buildEvidenceQueries } from './query';
import { normalizeEvidenceSearchRequest, normalizeEvidenceTickerParam } from './request';
import { searchExternalEvidenceUncached } from './service';
import { classifyHeadlineSentiment } from './sentiment';
import { buildEvidencePersistenceRows } from './store';
import type { EvidenceSearchProvider } from './types';

afterEach(() => vi.restoreAllMocks());

describe('external evidence request and query planning', () => {
  it('normalizes bounds and limits query fan-out to four scopes', () => {
    const request = normalizeEvidenceSearchRequest({
      ticker: 'aapl', name: ' Apple\nInc ', market: 'US',
      scopes: ['news', 'filing', 'broker', 'company', 'macro'], freshnessDays: 999, limit: 99,
    });
    expect(request).toMatchObject({ ticker: 'AAPL', name: 'Apple Inc', freshnessDays: 365, limit: 20 });
    expect(buildEvidenceQueries(request)).toHaveLength(4);
  });

  it('rejects missing subjects and unsafe tickers', () => {
    expect(() => normalizeEvidenceSearchRequest({})).toThrow('evidence_query_required');
    expect(() => normalizeEvidenceSearchRequest({ ticker: '../secret' })).toThrow('invalid_ticker');
    expect(normalizeEvidenceTickerParam('%E0%A4%A')).toBeNull();
  });
});

describe('external evidence normalization', () => {
  it('blocks private URLs, strips tracking params, dedupes and assigns stable citations', () => {
    expect(canonicalizeEvidenceUrl('http://127.0.0.1/admin')).toBeNull();
    expect(canonicalizeEvidenceUrl('http://[::1]/admin')).toBeNull();
    expect(canonicalizeEvidenceUrl('http://[fd00::1]/internal')).toBeNull();
    const normalized = normalizeEvidenceResults([
      { title: '<b>Official filing</b>', url: 'https://www.sec.gov/a?utm_source=x&id=1', score: 0.8 },
      { title: 'Duplicate', url: 'https://www.sec.gov/a?id=1', score: 0.4 },
    ], 'filing', new Date('2026-09-04T00:00:00Z'));
    const ranked = dedupeAndRankEvidence(normalized, 10);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ title: 'Official filing', domain: 'sec.gov', trustScore: 0.95 });
    expect(ranked[0].url).not.toContain('utm_source');
    expect(ranked[0].citationId).toMatch(/^web_[a-f0-9]{12}$/);
  });

  it('rejects explicitly stale results while preserving undated evidence', () => {
    const normalized = normalizeEvidenceResults([
      { title: 'Too old', url: 'https://reuters.com/old', publishedAt: '2026-08-01T00:00:00Z' },
      { title: 'Recent', url: 'https://reuters.com/recent', publishedAt: '2026-09-01T00:00:00Z' },
      { title: 'Undated', url: 'https://sec.gov/undated' },
    ], 'news', new Date('2026-09-04T00:00:00Z'), 14);

    expect(normalized.map((item) => item.title)).toEqual(['Recent', 'Undated']);
  });
});

describe('external evidence service', () => {
  it('returns an honest unavailable snapshot without a configured provider', async () => {
    const snapshot = await searchExternalEvidenceUncached({ ticker: 'AAPL' }, {
      provider: null,
      now: () => new Date('2026-09-04T00:00:00Z'),
    });
    expect(snapshot).toMatchObject({ status: 'unavailable', provider: null, results: [] });
  });

  it('keeps successful evidence when one scoped query fails', async () => {
    const provider: EvidenceSearchProvider = {
      id: 'test',
      search: vi.fn(async (query) => {
        if (query.scope === 'filing') throw new Error('timeout');
        return [{ title: 'Apple raises guidance', url: 'https://reuters.com/apple', snippet: 'Growth beat', score: 0.9 }];
      }),
    };
    const snapshot = await searchExternalEvidenceUncached({ ticker: 'AAPL', scopes: ['news', 'filing'] }, {
      provider,
      now: () => new Date('2026-09-04T00:00:00Z'),
    });
    expect(snapshot.status).toBe('partial');
    expect(snapshot.results).toHaveLength(1);
    expect(snapshot.warnings[0]).toContain('filing:timeout');
    expect(resolvePerspectiveCitations([snapshot.results[0].citationId, 'invented'], snapshot.results)).toHaveLength(1);
  });
});

describe('headline sentiment', () => {
  it('classifies directional wording without fabricating neutral scores', () => {
    expect(classifyHeadlineSentiment('Company raises guidance after record growth')).toBe(0.5);
    expect(classifyHeadlineSentiment('Regulator opens fraud probe')).toBe(-0.5);
    expect(classifyHeadlineSentiment('Company announces September meeting')).toBeNull();
  });
});

describe('evidence persistence records', () => {
  it('stores a query hash and normalized evidence without storing credentials or raw queries', () => {
    const request = normalizeEvidenceSearchRequest({ query: 'private research question', ticker: 'AAPL', scopes: ['news'] });
    const result = normalizeEvidenceResults([
      { title: 'Verified update', url: 'https://reuters.com/update', snippet: 'Public excerpt', score: 0.9 },
    ], 'news', new Date('2026-09-04T00:00:00Z'))[0];
    const rows = buildEvidencePersistenceRows(request, {
      requestId: '00000000-0000-4000-8000-000000000001', status: 'complete', provider: 'test', queryCount: 1,
      results: [result], fetchedAt: '2026-09-04T00:00:00.000Z', durationMs: 10,
      estimatedCostMicrousd: 2_000, warnings: [],
    });
    expect(rows.run.request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows.run).not.toHaveProperty('query');
    expect(JSON.stringify(rows)).not.toContain('private research question');
    expect(rows.evidence[0]).toMatchObject({ citation_id: result.citationId, canonical_url: result.url });
    expect(rows.links[0]).toMatchObject({ ticker: 'AAPL', citation_id: result.citationId });
  });
});
