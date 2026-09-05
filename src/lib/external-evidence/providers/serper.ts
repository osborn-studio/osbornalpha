import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { asFiniteNumber, asJsonRecord, asText, fetchSearchJson } from './http';

export function createSerperProvider(apiKey: string): EvidenceSearchProvider {
  return {
    id: 'serper',
    async search(query: EvidenceQuery, signal?: AbortSignal): Promise<RawEvidenceResult[]> {
      const endpoint = query.scope === 'news' ? 'news' : 'search';
      const data = asJsonRecord(await fetchSearchJson(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ q: query.query, num: query.limit, tbs: `qdr:d${query.freshnessDays}` }),
        signal,
      }));
      const results = query.scope === 'news' ? data?.news : data?.organic;
      return Array.isArray(results) ? results.flatMap((item) => {
        const row = asJsonRecord(item);
        if (!row) return [];
        const position = asFiniteNumber(row.position);
        return [{
          title: asText(row.title) || '',
          url: asText(row.link) || '',
          snippet: asText(row.snippet),
          publishedAt: asText(row.date),
          score: position == null ? null : 1 / Math.max(1, position),
        }];
      }) : [];
    },
  };
}
