import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefLlmCall } from './composer';

const mocks = vi.hoisted(() => ({
  fetchEastmoneyQuote: vi.fn(),
  chat: vi.fn(),
}));

vi.mock('@/lib/data/sources/eastmoney', () => ({
  fetchEastmoneyQuote: mocks.fetchEastmoneyQuote,
}));

vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: () => false,
  fetchTushareDailyBasic: vi.fn(),
  fetchTushareFinaIndicator: vi.fn(),
}));

vi.mock('@/lib/data/sources/llm', () => ({
  chat: mocks.chat,
  extractJson: (value: string) => JSON.parse(value),
  isLLMConfigured: () => true,
}));

vi.mock('@/lib/data/personas', () => ({
  PERSONAS: [
    { id: 'value', name: 'Value', prompt: 'value prompt' },
    { id: 'risk', name: 'Risk', prompt: 'risk prompt' },
  ],
  buildUserMessage: (context: { ticker: string }) => context.ticker,
}));

import { generateDailyBrief } from './composer';

function quote(ticker = 'AAPL', changePct = 6) {
  return {
    ticker,
    name: ticker,
    market: 'US',
    currency: 'USD',
    price: 200,
    change_pct: changePct,
    pe_ttm: 30,
    pb: 8,
    market_cap_label: '3T',
    turnover: null,
    volume_ratio: null,
    amplitude: 6,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function perspectiveResponse(summary = 'summary') {
  return {
    content: JSON.stringify({
      stance: 'bullish',
      confidence: 8,
      summary,
      cites: [],
    }),
    usage: {
      inputTokens: 20,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 20,
      outputTokens: 5,
      estimated: false,
    },
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  };
}

describe('generateDailyBrief metered-call boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchEastmoneyQuote.mockResolvedValue(quote());
  });

  it('skipLLM never enters an injected model-call boundary', async () => {
    const llmCall = vi.fn();

    const brief = await generateDailyBrief(['AAPL'], {
      topN: 1,
      skipLLM: true,
      llmCall,
    });

    expect(llmCall).not.toHaveBeenCalled();
    expect(brief.meta.tokens).toEqual({ input: 0, output: 0 });
    expect(brief.meta.failures).toBe(0);
  });

  it('runs every committee/headline request through the injected boundary and aggregates normalized usage', async () => {
    let index = 0;
    const llmCall = vi.fn<BriefLlmCall>().mockImplementation(async (opts) => {
      index += 1;
      const isTopCall = opts.max_tokens === 300;
      return {
        content: isTopCall
          ? JSON.stringify({ headline: 'Top call', rationale: 'Data-backed rationale' })
          : JSON.stringify({
              stance: index === 1 ? 'bullish' : 'bearish',
              confidence: 8,
              summary: `summary-${index}`,
              cites: [],
            }),
        usage: {
          inputTokens: 100 * index,
          cacheHitInputTokens: 10 * index,
          cacheMissInputTokens: 90 * index,
          outputTokens: 20 * index,
          estimated: false,
        },
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      };
    });

    const brief = await generateDailyBrief(['AAPL'], {
      topN: 1,
      llmCall,
    });

    expect(llmCall).toHaveBeenCalledTimes(3);
    expect(llmCall.mock.calls.map(([opts]) => opts.max_tokens)).toEqual([400, 400, 300]);
    expect(brief.meta.tokens).toEqual({ input: 600, output: 120 });
    expect(brief.meta.normalized_usage).toEqual({
      inputTokens: 600,
      cacheHitInputTokens: 60,
      cacheMissInputTokens: 540,
      outputTokens: 120,
      estimated: false,
    });
    expect(brief.meta.failures).toBe(0);
    expect(brief.meta.provider).toBe('deepseek');
    expect(brief.meta.model).toBe('deepseek-v4-flash');
  });

  it('propagates stable budget errors instead of degrading them into a partial brief', async () => {
    const llmCall = vi.fn<BriefLlmCall>().mockRejectedValue(new Error('daily_cost_exhausted'));

    await expect(generateDailyBrief(['AAPL'], {
      topN: 1,
      llmCall,
    })).rejects.toThrow('daily_cost_exhausted');
  });

  it('drains later sibling committees before propagating an early cost error', async () => {
    mocks.fetchEastmoneyQuote.mockImplementation(async (ticker: string) => (
      ticker === 'FIRST' ? quote(ticker, 6) : quote(ticker, 5)
    ));
    const later = deferred<ReturnType<typeof perspectiveResponse>>();
    const llmCall = vi.fn<BriefLlmCall>().mockImplementation((opts) => {
      const ticker = opts.messages[0]?.content;
      if (ticker === 'FIRST') return Promise.reject(new Error('budget_unavailable'));
      return later.promise;
    });

    const generation = generateDailyBrief(['FIRST', 'SECOND'], {
      topN: 2,
      llmCall,
    });
    let outcome: 'pending' | 'fulfilled' | 'rejected' = 'pending';
    void generation.then(
      () => { outcome = 'fulfilled'; },
      () => { outcome = 'rejected'; },
    );

    await vi.waitFor(() => expect(llmCall).toHaveBeenCalledTimes(4));
    await Promise.resolve();
    expect(outcome).toBe('pending');

    later.resolve(perspectiveResponse('later sibling'));

    await expect(generation).rejects.toThrow('budget_unavailable');
    expect(outcome).toBe('rejected');
  });

  it('chooses the first input-ordered committee error after all committees drain', async () => {
    mocks.fetchEastmoneyQuote.mockImplementation(async (ticker: string) => (
      ticker === 'FIRST' ? quote(ticker, 6) : quote(ticker, 5)
    ));
    const first = deferred<ReturnType<typeof perspectiveResponse>>();
    const llmCall = vi.fn<BriefLlmCall>().mockImplementation((opts) => {
      const ticker = opts.messages[0]?.content;
      if (ticker === 'FIRST') return first.promise;
      return Promise.reject(new Error('daily_cost_exhausted'));
    });

    const generation = generateDailyBrief(['FIRST', 'SECOND'], {
      topN: 2,
      llmCall,
    });
    let outcome: 'pending' | 'fulfilled' | 'rejected' = 'pending';
    void generation.then(
      () => { outcome = 'fulfilled'; },
      () => { outcome = 'rejected'; },
    );

    await vi.waitFor(() => expect(llmCall).toHaveBeenCalledTimes(4));
    await Promise.resolve();
    expect(outcome).toBe('pending');

    first.reject(new Error('budget_unavailable'));

    await expect(generation).rejects.toThrow('budget_unavailable');
  });

  it('preserves ranked input order when every committee succeeds', async () => {
    mocks.fetchEastmoneyQuote.mockImplementation(async (ticker: string) => (
      ticker === 'FIRST' ? quote(ticker, 6) : quote(ticker, 5)
    ));
    const llmCall = vi.fn<BriefLlmCall>().mockResolvedValue(perspectiveResponse());

    const result = await generateDailyBrief(['FIRST', 'SECOND'], {
      topN: 2,
      llmCall,
    });

    expect(result.top.map((block) => block.ticker)).toEqual(['FIRST', 'SECOND']);
  });
});
