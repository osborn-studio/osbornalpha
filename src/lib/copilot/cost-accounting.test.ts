import { describe, expect, it } from 'vitest';
import { copilotUsageLabels } from './cost-accounting';

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
