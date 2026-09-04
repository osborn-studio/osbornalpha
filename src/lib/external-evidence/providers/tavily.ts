import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { fetchSearchJson } from './http';

export function createTavilyProvider(apiKey: string): EvidenceSearchProvider {
  return {
    id: 'tavily',
    async search(query: EvidenceQuery): Promise<RawEvidenceResult[]> {
      const data = await fetchSearchJson('https://api.tavily.com/search', {
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
      });
      return Array.isArray(data?.results) ? data.results.map((item: any) => ({
        title: String(item.title || ''),
        url: String(item.url || ''),
        snippet: typeof item.content === 'string' ? item.content : null,
        publishedAt: typeof item.published_date === 'string' ? item.published_date : null,
        score: typeof item.score === 'number' ? item.score : null,
      })) : [];
    },
  };
}
