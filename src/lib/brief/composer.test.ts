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
  buildUserMessage: () => 'stock context',
}));

import { generateDailyBrief } from './composer';

function quote() {
  return {
    ticker: 'AAPL',
    name: 'Apple',
    market: 'US',
    currency: 'USD',
    price: 200,
    change_pct: 6,
    pe_ttm: 30,
    pb: 8,
    market_cap_label: '3T',
    turnover: null,
    volume_ratio: null,
    amplitude: 6,
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
});
