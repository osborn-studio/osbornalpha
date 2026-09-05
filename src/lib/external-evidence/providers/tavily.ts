import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { asFiniteNumber, asJsonRecord, asText, fetchSearchJson } from './http';

export function createTavilyProvider(apiKey: string): EvidenceSearchProvider {
  return {
    id: 'tavily',
    async search(query: EvidenceQuery, signal?: AbortSignal): Promise<RawEvidenceResult[]> {
      const data = asJsonRecord(await fetchSearchJson('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: query.query,
          topic: query.scope === 'news' ? 'news' : 'general',
          days: query.freshnessDays,
          search_depth: 'advanced',
          max_results: query.limit,
          include_answer: false,
          include_raw_content: false,
        }),
        signal,
      }));
      return Array.isArray(data?.results) ? data.results.flatMap((item) => {
        const row = asJsonRecord(item);
        if (!row) return [];
        return [{
          title: asText(row.title) || '',
          url: asText(row.url) || '',
          snippet: asText(row.content),
          publishedAt: asText(row.published_date),
          score: asFiniteNumber(row.score),
        }];
      }) : [];
    },
  };
}
