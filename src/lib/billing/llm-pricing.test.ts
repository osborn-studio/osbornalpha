import { describe, expect, it } from 'vitest';
import {
  calculateCostMicrormb,
  calculateCostUsd,
  DEFAULT_DAILY_LIMIT_MICRORMB,
  DEFAULT_USD_CNY_MICROS,
  normalizeUsage,
  PRICING_VERSION,
  reservationCostMicrormb,
} from './llm-pricing';

describe('pricing defaults', () => {
  it('pins the reviewed pricing version and operational defaults', () => {
    expect(PRICING_VERSION).toBe('deepseek-2026-04-24');
    expect(DEFAULT_USD_CNY_MICROS).toBe(7_200_000);
    expect(DEFAULT_DAILY_LIMIT_MICRORMB).toBe(8_800_000);
  });
});

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
      estimated: true,
    });
  });

  it('uses later valid aliases when earlier aliases are malformed', () => {
    expect(normalizeUsage({
      input_tokens: Number.NaN,
      prompt_tokens: 1_000,
      output_tokens: -1,
      completion_tokens: 20,
      prompt_cache_hit_tokens: Number.POSITIVE_INFINITY,
      cache_hit_input_tokens: 300,
      prompt_cache_miss_tokens: -1,
      cache_miss_input_tokens: 700,
    })).toEqual({
      inputTokens: 1_000,
      cacheHitInputTokens: 300,
      cacheMissInputTokens: 700,
      outputTokens: 20,
      estimated: false,
    });
  });

  it('derives input total from a valid cache breakdown when prompt tokens are unavailable', () => {
    expect(normalizeUsage({
      completion_tokens: 20,
      prompt_cache_hit_tokens: 300,
      prompt_cache_miss_tokens: 700,
    })).toEqual({
      inputTokens: 1_000,
      cacheHitInputTokens: 300,
      cacheMissInputTokens: 700,
      outputTokens: 20,
      estimated: false,
    });
  });

  it('marks absent or malformed usage as estimated', () => {
    expect(normalizeUsage(undefined)).toEqual({
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: true,
    });
    expect(normalizeUsage({ prompt_tokens: 'invalid', completion_tokens: Number.NaN })).toEqual({
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: true,
    });
  });

  it('marks input-only, output-only, and single-breakdown usage as estimated', () => {
    expect(normalizeUsage({ prompt_tokens: 100 })).toMatchObject({
      inputTokens: 100,
      outputTokens: 0,
      estimated: true,
    });
    expect(normalizeUsage({ completion_tokens: 20 })).toMatchObject({
      inputTokens: 0,
      outputTokens: 20,
      estimated: true,
    });
    expect(normalizeUsage({
      completion_tokens: 20,
      prompt_cache_hit_tokens: 100,
    })).toMatchObject({
      inputTokens: 100,
      cacheHitInputTokens: 100,
      cacheMissInputTokens: 0,
      outputTokens: 20,
      estimated: true,
    });
  });

  it('marks contradictory cache detail as estimated while preserving conservative totals', () => {
    expect(normalizeUsage({
      prompt_tokens: 0,
      completion_tokens: 1,
      prompt_cache_hit_tokens: 1_000,
      prompt_cache_miss_tokens: 0,
    })).toEqual({
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 1,
      estimated: true,
    });
    expect(normalizeUsage({
      prompt_tokens: 100,
      completion_tokens: 1,
      prompt_cache_hit_tokens: 40,
      prompt_cache_miss_tokens: 40,
    })).toEqual({
      inputTokens: 100,
      cacheHitInputTokens: 40,
      cacheMissInputTokens: 60,
      outputTokens: 1,
      estimated: true,
    });
  });
});

describe('DeepSeek pricing', () => {
  it('calculates the exact cache-hit input cost', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 1_000_000,
      cacheHitInputTokens: 1_000_000,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(20_160);
  });

  it('calculates the exact cost of 1M cache-miss input tokens plus 1M output tokens', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(3_024_000);
  });

  it('calculates USD from the reviewed registry without a currency conversion dependency', () => {
    expect(calculateCostUsd('deepseek', 'deepseek-v4-flash', {
      inputTokens: 2_000_000,
      cacheHitInputTokens: 1_000_000,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 1_000_000,
      estimated: false,
    })).toBe(0.4228);
  });

  it('rounds a fractional micro-RMB cost up', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 1,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1,
      outputTokens: 0,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(2);
  });

  it('charges cache-miss tokens from an inconsistent hand-built usage total', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000,
      outputTokens: 0,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(1_008);
  });

  it('treats contradictory cache totals as entirely cache-miss input', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 1_000,
      cacheHitInputTokens: 1_000,
      cacheMissInputTokens: 1,
      outputTokens: 0,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(1_010);
  });

  it('treats a zero input total with cache components as entirely cache-miss input', () => {
    expect(calculateCostMicrormb('deepseek', 'deepseek-v4-flash', {
      inputTokens: 0,
      cacheHitInputTokens: 1_000,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: false,
    }, DEFAULT_USD_CNY_MICROS)).toBe(1_008);
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
