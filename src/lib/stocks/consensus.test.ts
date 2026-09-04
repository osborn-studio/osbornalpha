import { describe, expect, it } from 'vitest';
import { deriveConsensus, filterConsensusReports, normalizeBrokerRating, type ConsensusReport } from './consensus';

describe('deriveConsensus', () => {
  it('null for empty input', () => {
    expect(deriveConsensus([])).toBeNull();
  });

  it('null when no report has a usable price', () => {
    const reports: ConsensusReport[] = [
      { max_price: null, min_price: null },
      { max_price: undefined, min_price: undefined },
    ];
    expect(deriveConsensus(reports)).toBeNull();
  });

  it('midpoint of a single valid report, n=1, no range', () => {
    const reports: ConsensusReport[] = [{ max_price: 60, min_price: 40 }];
    expect(deriveConsensus(reports)).toEqual({
      target_median: 50,
      target_min: null,
      target_max: null,
      n: 1,
    });
  });

  it('coerces string prices to numbers', () => {
    const reports: ConsensusReport[] = [
      { max_price: '60', min_price: '40' },
      { max_price: '80', min_price: '60' },
    ];
    const result = deriveConsensus(reports);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(2);
    // midpoints: 50, 70 -> median (50+70)/2 = 60
    expect(result!.target_median).toBe(60);
    expect(result!.target_min).toBe(50);
    expect(result!.target_max).toBe(70);
  });

  it('uses whichever single price is present when only one of max/min given', () => {
    const reports: ConsensusReport[] = [
      { max_price: 100, min_price: null },
      { max_price: null, min_price: 50 },
    ];
    const result = deriveConsensus(reports);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(2);
    // midpoints: 100, 50 -> median (50+100)/2 = 75
    expect(result!.target_median).toBe(75);
    expect(result!.target_min).toBe(50);
    expect(result!.target_max).toBe(100);
  });

  it('median over odd count of per-report midpoints', () => {
    const reports: ConsensusReport[] = [
      { max_price: 44, min_price: 36 }, // mid 40
      { max_price: 64, min_price: 56 }, // mid 60
      { max_price: 84, min_price: 76 }, // mid 80
    ];
    const result = deriveConsensus(reports);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(3);
    expect(result!.target_median).toBe(60);
    expect(result!.target_min).toBe(40);
    expect(result!.target_max).toBe(80);
  });

  it('ignores rows with unparsable/non-finite prices, keeps valid ones', () => {
    const reports: ConsensusReport[] = [
      { max_price: 'n/a', min_price: 'n/a' },
      { max_price: 60, min_price: 40 },
      { max_price: NaN, min_price: NaN },
    ];
    const result = deriveConsensus(reports);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(1);
    expect(result!.target_median).toBe(50);
    expect(result!.target_min).toBeNull();
    expect(result!.target_max).toBeNull();
  });

  it('ignores zero/negative prices as invalid', () => {
    const reports: ConsensusReport[] = [
      { max_price: 0, min_price: 0 },
      { max_price: -10, min_price: -20 },
      { max_price: 60, min_price: 40 },
    ];
    const result = deriveConsensus(reports);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(1);
    expect(result!.target_median).toBe(50);
  });

  it('normalizes broker rating labels while preserving an unknown bucket', () => {
    expect(normalizeBrokerRating('强烈买入')).toBe('strong_buy');
    expect(normalizeBrokerRating('Overweight')).toBe('buy');
    expect(normalizeBrokerRating('持有')).toBe('hold');
    expect(normalizeBrokerRating('Underweight')).toBe('sell');
    expect(normalizeBrokerRating('')).toBe('unknown');
  });

  it('filters stale, duplicate, and extreme targets before aggregation', () => {
    const reports = [
      { report_date: '20260901', org_name: 'Broker A', report_title: 'Update', max_price: 120, min_price: 100 },
      { report_date: '20260901', org_name: 'Broker A', report_title: 'Update', max_price: 120, min_price: 100 },
      { report_date: '20200101', org_name: 'Broker B', report_title: 'Old', max_price: 110, min_price: 90 },
      { report_date: '20260902', org_name: 'Broker C', report_title: 'Outlier', max_price: 2_000, min_price: 1_900 },
    ];
    const filtered = filterConsensusReports(reports, { asOf: new Date('2026-09-04T00:00:00Z'), currentPrice: 100 });
    expect(filtered.accepted).toHaveLength(1);
    expect(filtered.excluded).toBe(3);
    expect(filtered.reasons).toEqual(expect.arrayContaining(['duplicate_report', 'stale_report', 'target_outlier']));
    expect(deriveConsensus(filtered.accepted)).toMatchObject({ target_median: 110, n: 1 });
  });

  it('guards stored snapshots without a current quote using the snapshot median', () => {
    const filtered = filterConsensusReports([
      { report_date: '20260901', org_name: 'A', report_title: 'A', max_price: 110, min_price: 90 },
      { report_date: '20260901', org_name: 'B', report_title: 'B', max_price: 120, min_price: 100 },
      { report_date: '20260901', org_name: 'C', report_title: 'C', max_price: 2_000, min_price: 1_900 },
    ], { asOf: new Date('2026-09-04T00:00:00Z') });
    expect(filtered.accepted).toHaveLength(2);
    expect(filtered.excluded).toBe(1);
    expect(filtered.reasons).toContain('target_outlier');
  });
});
