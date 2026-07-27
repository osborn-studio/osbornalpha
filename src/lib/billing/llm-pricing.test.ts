import { describe, expect, it } from 'vitest';
import {
  calculateCostMicrormb,
  DEFAULT_USD_CNY_MICROS,
  normalizeUsage,
  reservationCostMicrormb,
} from './llm-pricing';

describe('normalizeUsage', () => {
  it('normalizes DeepSeek cache-hit and cache-miss detail', () => {
    expect(normalizeUsage({
      prompt_tokens: 1_000,
      completion_tokens: 200,
      prompt_cache_hit_tokens: 300,
      prompt_cache_miss_tokens: 700,
    })).toEqual({
      inputTokens: 1_000,
      cacheHitInputTokens: 300,
      cacheMissInputTokens: 700,
      outputTokens: 200,
      estimated: false,
    });
  });

  it('treats missing cache detail as all cache misses', () => {
    expect(normalizeUsage({ prompt_tokens: 1_000, completion_tokens: 200 })).toMatchObject({
      inputTokens: 1_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000,
      outputTokens: 200,
    });
  });

  it('never lets malformed or overlapping cache detail undercount input', () => {
    for (const detail of [
      { prompt_cache_hit_tokens: 900, prompt_cache_miss_tokens: 900 },
      { prompt_cache_hit_tokens: '900' },
    ]) {
      const usage = normalizeUsage({
        prompt_tokens: 1_000,
        completion_tokens: 1,
        ...detail,
      });

      expect(usage.cacheHitInputTokens + usage.cacheMissInputTokens).toBe(1_000);
      expect(usage.cacheMissInputTokens).toBe(1_000);
    }
  });

  it('clamps invalid negative and non-finite usage to zero', () => {
    expect(normalizeUsage({
      prompt_tokens: -1,
      completion_tokens: Number.NaN,
      prompt_cache_hit_tokens: Number.POSITIVE_INFINITY,
    })).toEqual({
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: false,
    });
  });
});

describe('DeepSeek pricing', () => {
  it('calculates the exact cost of 1M cache-miss input tokens plus 1M output tokens', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(3_024_000);
  });

  it('reserves the exact positive cost for estimated input plus 9,000 output tokens', () => {
    expect(reservationCostMicrormb(
      'deepseek',
      'deepseek-v4-flash',
      100_000,
      9_000,
      DEFAULT_USD_CNY_MICROS,
    )).toBe(118_944);
  });

  it('rejects unpriced provider and model pairs with a stable error', () => {
    expect(() => calculateCostMicrormb('openai', 'gpt-4o', {
      inputTokens: 1,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1,
      outputTokens: 1,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toThrow('pricing_unavailable');
  });
});
