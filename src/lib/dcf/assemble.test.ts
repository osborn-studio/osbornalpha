import { describe, expect, it } from 'vitest';
import { mergeAssumptions, DEFAULT_ASSUMPTIONS } from './assemble';

describe('mergeAssumptions', () => {
  it('fills every required field from defaults when seed is empty', () => {
    const a = mergeAssumptions({}, {});
    expect(a.revenueLines.length).toBeGreaterThan(0);
    expect(a.wacc).toBe(DEFAULT_ASSUMPTIONS.wacc);
    expect(a.forecastYears).toBe(DEFAULT_ASSUMPTIONS.forecastYears);
  });
  it('seed overrides defaults; overrides beat seed', () => {
    const a = mergeAssumptions({ wacc: 0.09, sharesDiluted: 500 }, { wacc: 0.12 });
    expect(a.wacc).toBe(0.12);          // override wins
    expect(a.sharesDiluted).toBe(500);  // seed wins over default
  });
  it('never returns NaN for numeric fields', () => {
    const a = mergeAssumptions({ revenueLines: [] }, {});
    for (const v of [a.wacc, a.terminalG, a.taxRate, a.sharesDiluted, a.netDebt])
      expect(Number.isFinite(v)).toBe(true);
  });
});
