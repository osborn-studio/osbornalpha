import { describe, expect, it } from 'vitest';
import { computeComposite, type DcfAssumptions } from './engine';

const BASE: DcfAssumptions = {
  revenueLines: [
    { name: '主营', baseRevenue: 100, cagr: 0.1 },
    { name: '次要', baseRevenue: 50, cagr: 0.05 },
  ],
  grossMarginPct: 0.6, sgaPct: 0.2, rdPct: 0.05, sbcPct: 0.03,
  daPct: 0.04, capexPct: 0.05, wcPctOfRev: 0.1, taxRate: 0.25,
  wacc: 0.1, terminalG: 0.03, forecastYears: 8,
  sharesDiluted: 100, netDebt: 200, exitEvEbitda: 12,
  currency: 'CNY', currencyUnit: '亿',
};

describe('computeComposite', () => {
  it('ev = pvExplicit + pvTerminal for every variant', () => {
    const r = computeComposite(BASE);
    for (const k of ['fcff', 'ebitda', 'adjusted', 'exSbc'] as const) {
      const v = r.valuation[k];
      expect(v.ev).toBeCloseTo(v.pvExplicit + v.pvTerminal, 6);
    }
  });
  it('equity = ev - netDebt; perShare = equity / sharesDiluted', () => {
    const v = computeComposite(BASE).valuation.fcff;
    expect(v.equity).toBeCloseTo(v.ev - BASE.netDebt, 6);
    expect(v.perShare).toBeCloseTo(v.equity / BASE.sharesDiluted, 6);
  });
  it('fcfExSbc < fcff when SBC > 0', () => {
    const r = computeComposite(BASE);
    for (const row of r.forecast) expect(row.fcfExSbc).toBeLessThan(row.fcff);
    expect(r.valuation.exSbc.perShare).toBeLessThan(r.valuation.fcff.perShare);
  });
  it('nonRecurring lowers fcffAdj', () => {
    const r0 = computeComposite(BASE);
    const r1 = computeComposite({ ...BASE, nonRecurring: Array(8).fill(10) });
    expect(r0.forecast[0].fcffAdj).toBeCloseTo(r0.forecast[0].fcff, 6);
    expect(r1.forecast[0].fcffAdj).toBeLessThan(r0.forecast[0].fcffAdj);
  });
  it('terminalPctEv in (0,1)', () => {
    const r = computeComposite(BASE);
    for (const k of ['fcff', 'ebitda', 'adjusted', 'exSbc'] as const) {
      expect(r.valuation[k].terminalPctEv).toBeGreaterThan(0);
      expect(r.valuation[k].terminalPctEv).toBeLessThan(1);
    }
  });
  it('rangePerShare: min <= median <= max', () => {
    const { min, median, max } = computeComposite(BASE).valuation.rangePerShare;
    expect(min).toBeLessThanOrEqual(median);
    expect(median).toBeLessThanOrEqual(max);
  });
});
