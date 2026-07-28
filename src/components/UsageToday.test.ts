import { describe, expect, it } from 'vitest';
import { costUsageRows, formatCostUsage } from './usage-today-format';

describe('formatCostUsage', () => {
  it('formats CNY platform cost to two decimal places without exposing micrormb', () => {
    expect(formatCostUsage({
      usedMicrormb: 1_234_567,
      capUsedMicrormb: 1_234_567,
      limitMicrormb: 8_800_000,
      currency: 'CNY',
    })).toBe('¥1.23/¥8.80');
  });

  it('keeps matching normal-user cap and total spend on one concise row', () => {
    expect(costUsageRows({
      usedMicrormb: 1_234_567,
      capUsedMicrormb: 1_234_567,
      limitMicrormb: 8_800_000,
      currency: 'CNY',
    })).toEqual([{ labelKey: 'platformCost', value: '¥1.23/¥8.80' }]);
  });

  it('formats an unlimited admin cost row without implying it has a cap', () => {
    expect(formatCostUsage({
      usedMicrormb: 350_000,
      capUsedMicrormb: 0,
      limitMicrormb: -1,
      currency: 'CNY',
    })).toBe('¥0.35');
  });

  it('renders separately labelled cap-used and total rows when exempt spend differs', () => {
    expect(costUsageRows({
      usedMicrormb: 3_500_000,
      capUsedMicrormb: 500_000,
      limitMicrormb: 8_800_000,
      currency: 'CNY',
    })).toEqual([
      { labelKey: 'platformCapCost', value: '¥0.50/¥8.80' },
      { labelKey: 'platformTotalCost', value: '¥3.50' },
    ]);
  });

  it('shows non-exempt and total admin spend separately without a cap ratio', () => {
    expect(costUsageRows({
      usedMicrormb: 3_500_000,
      capUsedMicrormb: 500_000,
      limitMicrormb: -1,
      currency: 'CNY',
    })).toEqual([
      { labelKey: 'platformNonExemptCost', value: '¥0.50' },
      { labelKey: 'platformTotalCost', value: '¥3.50' },
    ]);
  });
});
