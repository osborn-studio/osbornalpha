import { describe, expect, it } from 'vitest';
import { formatCostUsage } from './usage-today-format';

describe('formatCostUsage', () => {
  it('formats CNY platform cost to two decimal places without exposing micrormb', () => {
    expect(formatCostUsage({
      usedMicrormb: 1_234_567,
      capUsedMicrormb: 1_234_567,
      limitMicrormb: 8_800_000,
      currency: 'CNY',
    })).toBe('¥1.23/¥8.80');
  });

  it('formats an unlimited admin cost row sensibly', () => {
    expect(formatCostUsage({
      usedMicrormb: 350_000,
      capUsedMicrormb: 0,
      limitMicrormb: -1,
      currency: 'CNY',
    })).toBe('¥0.35/∞');
  });
});
