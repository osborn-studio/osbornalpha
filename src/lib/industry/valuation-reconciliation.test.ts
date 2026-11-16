import {describe, expect, it} from 'vitest';
import {analyzeValuationReconciliation} from './valuation-reconciliation';

const dates = Array.from({length: 30}, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const pair = (tradeDate: string, computedValue: string | null = '100', officialValue: string | null = '100') =>
  ({tradeDate, computedValue, officialValue});
const analyze = (computedValue: string, officialValue = '100') =>
  analyzeValuationReconciliation({expectedDates: [dates[0]], pairs: [pair(dates[0], computedValue, officialValue)]});

describe('offline valuation reconciliation diagnostics (spec §6.4; no publication authority)', () => {
  it('includes both exact 1% boundaries, rejecting values just outside without rounding', () => {
    for (const v of ['99', '101', '100.00']) expect(analyze(v).counts.within).toBe(1);
    for (const v of ['98.999999999999', '101.000000000001']) expect(analyze(v).counts.outside).toBe(1);
    expect(analyze('101000000000000000000000000000001', '100000000000000000000000000000000').counts.outside).toBe(1);
  });

  it('counts missing expected cells, unavailable official values and nonpositive official denominators', () => {
    const result = analyzeValuationReconciliation({expectedDates: dates.slice(0, 7), pairs: [
      pair(dates[0], null, null), pair(dates[1], '100', null), pair(dates[2], '100', '0'),
      pair(dates[3], '100', '-1'), pair(dates[4], '100'), pair(dates[5], '102'),
    ]});
    expect(result).toEqual({assessment: 'diagnostic_only', nExpected: 7, nPairs: 2,
      counts: {within: 1, outside: 1, no_computed: 2, no_official: 1, invalid_denominator: 2},
      thresholds: {minimumPairs: false, pairCoverage: false, withinShare: false}, thresholdsMet: false});
  });

  it('requires at least 24 pairs even if all ten numeric comparisons agree', () => {
    const result = analyzeValuationReconciliation({expectedDates: dates.slice(0, 10), pairs: dates.slice(0, 10).map(d => pair(d))});
    expect(result.nPairs).toBe(10);
    expect(result.thresholds).toEqual({minimumPairs: false, pairCoverage: true, withinShare: true});
    expect(result.thresholdsMet).toBe(false);
  });

  it('keeps a completely absent series below every threshold without dividing by zero', () => {
    const result = analyzeValuationReconciliation({expectedDates: dates, pairs: []});
    expect(result.nPairs).toBe(0);
    expect(result.counts.no_computed).toBe(30);
    expect(result.thresholds).toEqual({minimumPairs: false, pairCoverage: false, withinShare: false});
    expect(result.thresholdsMet).toBe(false);
  });

  it('uses the entire expected grid, including omitted dates, for the 90% coverage threshold', () => {
    const run = (n: number) => analyzeValuationReconciliation({expectedDates: dates, pairs: dates.slice(0, n).map(d => pair(d))});
    expect(run(27).thresholdsMet).toBe(true);
    expect(run(26).thresholds).toEqual({minimumPairs: true, pairCoverage: false, withinShare: true});
    expect(run(24).counts.no_computed).toBe(6);
  });

  it('requires 95% within among actual numeric pairs, independently of coverage', () => {
    const run = (outside: number) => analyzeValuationReconciliation({expectedDates: dates,
      pairs: dates.map((d, i) => pair(d, i < outside ? '102' : '100'))});
    expect(run(1).thresholdsMet).toBe(true);
    expect(run(2).thresholds.withinShare).toBe(false);
    const forty = [...dates, ...dates.slice(0, 10).map(d => d.replace('10-', '09-'))];
    expect(analyzeValuationReconciliation({expectedDates: forty,
      pairs: forty.map((d, i) => pair(d, i < 2 ? '102' : '100'))}).thresholdsMet).toBe(true);
  });

  it('rejects ambiguous grids, duplicate observations, unexpected dates and malformed decimals', () => {
    for (const input of [null, {}, {expectedDates: [], pairs: []},
      {expectedDates: [dates[0], dates[0]], pairs: []},
      {expectedDates: ['2026-02-30'], pairs: []},
      {expectedDates: [dates[0]], pairs: [pair(dates[0]), pair(dates[0])]},
      {expectedDates: [dates[0]], pairs: [pair(dates[1])]},
      ...['1e2', 'NaN', '', ' 100', 100, undefined].map(v =>
        ({expectedDates: [dates[0]], pairs: [{...pair(dates[0]), computedValue: v}]})),
      {expectedDates: [dates[0]], pairs: [pair(dates[0], '100', 'NaN')]},
    ]) expect(() => analyzeValuationReconciliation(input)).toThrow('invalid_reconciliation');
  });
});
