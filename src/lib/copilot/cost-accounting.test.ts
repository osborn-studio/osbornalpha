import { describe, expect, it } from 'vitest';
import { aggregateNormalizedUsage, copilotUsageLabels } from './cost-accounting';

describe('copilotUsageLabels', () => {
  it('keeps the provider and model when every successful turn shares them', () => {
    expect(copilotUsageLabels([
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
    ])).toEqual({ provider: 'deepseek', model: 'deepseek-v4-flash' });
  });

  it('uses mixed with a sorted unique model label across providers', () => {
    expect(copilotUsageLabels([
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      { provider: 'ark', model: 'byo-model' },
      { provider: 'ark', model: 'byo-model' },
    ])).toEqual({ provider: 'mixed', model: 'byo-model+deepseek-v4-flash' });
  });

  it('bounds an oversized mixed-model label to the stable mixed sentinel', () => {
    expect(copilotUsageLabels([
      { provider: 'a', model: 'a'.repeat(150) },
      { provider: 'b', model: 'b'.repeat(150) },
    ])).toEqual({ provider: 'mixed', model: 'mixed' });
  });
});

describe('aggregateNormalizedUsage', () => {
  it('marks saturation estimated and conservatively reallocates all input to cache miss', () => {
    expect(aggregateNormalizedUsage({
      inputTokens: Number.MAX_SAFE_INTEGER - 5,
      cacheHitInputTokens: Number.MAX_SAFE_INTEGER - 5,
      cacheMissInputTokens: 0,
      outputTokens: Number.MAX_SAFE_INTEGER - 5,
      estimated: false,
    }, {
      inputTokens: 10,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 10,
      outputTokens: 10,
      estimated: false,
    })).toEqual({
      inputTokens: Number.MAX_SAFE_INTEGER,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: Number.MAX_SAFE_INTEGER,
      estimated: true,
    });
  });
});
