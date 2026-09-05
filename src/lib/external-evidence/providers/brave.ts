import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { asJsonRecord, asText, fetchSearchJson } from './http';

export function createBraveProvider(apiKey: string): EvidenceSearchProvider {
  return {
    id: 'brave',
    async search(query: EvidenceQuery, signal?: AbortSignal): Promise<RawEvidenceResult[]> {
      const params = new URLSearchParams({
        q: query.query,
        count: String(query.limit),
        freshness: query.freshnessDays <= 1 ? 'pd' : query.freshnessDays <= 7 ? 'pw' : 'pm',
        text_decorations: 'false',
      });
      const data = asJsonRecord(await fetchSearchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { accept: 'application/json', 'X-Subscription-Token': apiKey }, signal,
      }));
      const web = asJsonRecord(data?.web);
      const results = web?.results;
      return Array.isArray(results) ? results.flatMap((item) => {
        const row = asJsonRecord(item);
        if (!row) return [];
        return [{
          title: asText(row.title) || '',
          url: asText(row.url) || '',
          snippet: asText(row.description),
          publishedAt: asText(row.page_age),
        }];
      }) : [];
    },
  };
}
