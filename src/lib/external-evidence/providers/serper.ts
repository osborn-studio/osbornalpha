import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { fetchSearchJson } from './http';

export function createSerperProvider(apiKey: string): EvidenceSearchProvider {
  return {
    id: 'serper',
    async search(query: EvidenceQuery): Promise<RawEvidenceResult[]> {
      const endpoint = query.scope === 'news' ? 'news' : 'search';
      const data = await fetchSearchJson(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ q: query.query, num: query.limit, tbs: `qdr:d${query.freshnessDays}` }),
      });
      const results = query.scope === 'news' ? data?.news : data?.organic;
      return Array.isArray(results) ? results.map((item: any) => ({
        title: String(item.title || ''),
        url: String(item.link || ''),
        snippet: typeof item.snippet === 'string' ? item.snippet : null,
        publishedAt: typeof item.date === 'string' ? item.date : null,
        score: typeof item.position === 'number' ? 1 / Math.max(1, item.position) : null,
      })) : [];
    },
  };
}
