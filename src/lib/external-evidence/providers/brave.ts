import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { fetchSearchJson } from './http';

export function createBraveProvider(apiKey: string): EvidenceSearchProvider {
  return {
    id: 'brave',
    async search(query: EvidenceQuery): Promise<RawEvidenceResult[]> {
      const params = new URLSearchParams({
        q: query.query,
        count: String(query.limit),
        freshness: query.freshnessDays <= 1 ? 'pd' : query.freshnessDays <= 7 ? 'pw' : 'pm',
        text_decorations: 'false',
      });
      const data = await fetchSearchJson(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { accept: 'application/json', 'X-Subscription-Token': apiKey },
      });
      const results = data?.web?.results;
      return Array.isArray(results) ? results.map((item: any) => ({
        title: String(item.title || ''),
        url: String(item.url || ''),
        snippet: typeof item.description === 'string' ? item.description : null,
        publishedAt: typeof item.page_age === 'string' ? item.page_age : null,
      })) : [];
    },
  };
}
