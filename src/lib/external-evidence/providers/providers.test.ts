import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBraveProvider } from './brave';
import { createSerperProvider } from './serper';
import { createTavilyProvider } from './tavily';

const query = { query: 'AAPL news', scope: 'news' as const, freshnessDays: 7, limit: 3 };

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe('search provider adapters', () => {
  it('normalizes Tavily results and does not request raw article bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ results: [{ title: 'A', url: 'https://a.test', content: 'summary', score: 0.9 }] }));
    vi.stubGlobal('fetch', fetcher);
    const results = await createTavilyProvider('secret').search(query);
    expect(results[0]).toMatchObject({ title: 'A', snippet: 'summary', score: 0.9 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ include_raw_content: false, max_results: 3 });
  });

  it('passes credentials in provider headers instead of query strings', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ web: { results: [] } }))
      .mockResolvedValueOnce(jsonResponse({ news: [] }));
    vi.stubGlobal('fetch', fetcher);
    await createBraveProvider('brave-secret').search(query);
    await createSerperProvider('serper-secret').search(query);
    expect(fetcher.mock.calls[0][0]).not.toContain('brave-secret');
    expect(fetcher.mock.calls[0][1].headers['X-Subscription-Token']).toBe('brave-secret');
    expect(fetcher.mock.calls[1][1].headers['X-API-KEY']).toBe('serper-secret');
  });
});
