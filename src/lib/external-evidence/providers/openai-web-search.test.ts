import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpenAIWebSearchInput,
  createOpenAIWebSearchProvider,
  parseOpenAIWebSearchResults,
} from './openai-web-search';

const query = { query: 'AAPL filing', scope: 'filing' as const, freshnessDays: 30, limit: 3 };

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI Responses web search provider', () => {
  it('extracts cited URLs, exact excerpts, and uncited source-list fallbacks', () => {
    expect(parseOpenAIWebSearchResults({ output: [
      {
        type: 'message',
        content: [{
          type: 'output_text', text: 'Apple filed an annual report.',
          annotations: [{ type: 'url_citation', start_index: 0, end_index: 28, title: 'Apple 10-K', url: 'https://sec.gov/aapl' }],
        }],
      },
      {
        type: 'web_search_call',
        action: { sources: [
          { type: 'url', title: 'Apple 10-K', url: 'https://sec.gov/aapl' },
          { type: 'url', url: 'https://investor.apple.com/report' },
        ] },
      },
    ] }, 3)).toEqual([
      expect.objectContaining({ title: 'Apple 10-K', url: 'https://sec.gov/aapl', snippet: 'Apple filed an annual report' }),
      expect.objectContaining({ title: 'investor.apple.com', url: 'https://investor.apple.com/report', snippet: '' }),
    ]);
    expect(parseOpenAIWebSearchResults({ output: [{
      type: 'web_search_call',
      action: { sources: [{ title: 'Dated source', url: 'https://example.com', published_date: '2026-09-01' }] },
    }] }, 1)[0]).toMatchObject({ publishedAt: '2026-09-01' });
  });

  it('translates scope and freshness into an explicit search contract', () => {
    const input = buildOpenAIWebSearchInput(query);
    expect(input).toContain('AAPL filing');
    expect(input).toContain('primary exchange, regulator');
    expect(input).toContain('last 30 days');
    expect(input).toContain('do not invent publication dates');
  });

  it('forces hosted search and keeps the credential out of the URL and body', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [] }) });
    vi.stubGlobal('fetch', fetcher);
    await createOpenAIWebSearchProvider('secret', { model: 'gpt-4.1-mini' }).search(query);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    expect(fetcher.mock.calls[0][1].headers.authorization).toBe('Bearer secret');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gpt-4.1-mini',
      tools: [{ type: 'web_search', search_context_size: 'low' }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
      input: buildOpenAIWebSearchInput(query),
    });
    expect(fetcher.mock.calls[0][0]).not.toContain('secret');
    expect(fetcher.mock.calls[0][1].body).not.toContain('secret');
  });
});
