/**
 * Offline numeric diagnostics for spec §6.4. Callers supply ONE series with already aligned
 * current observations and computed values. This does not choose/validate a valuation formula,
 * comparator basis, observation provenance, metric or licence. It cannot qualify or publish a
 * series. I-3 and owner decision H remain deferred; no jobs or public routes import this module.
 */
import {decAbs, decCmp, decMul, decSub, isDecimal} from './decimal';
import {assertDay} from './method';

type PairStatus = 'within' | 'outside' | 'no_computed' | 'no_official' | 'invalid_denominator';
const invalid = (): never => { throw new Error('invalid_reconciliation'); };
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nullableDecimal = (v: unknown): v is string | null => v === null || isDecimal(v);
function day(v: unknown): string {
  if (typeof v !== 'string') return invalid();
  try { assertDay('tradeDate', v); } catch { return invalid(); }
  return v;
}

export function analyzeValuationReconciliation(input: unknown) {
  if (!object(input) || !Array.isArray(input.expectedDates) || !input.expectedDates.length || !Array.isArray(input.pairs)) return invalid();
  const expected = new Set(input.expectedDates.map(day));
  if (expected.size !== input.expectedDates.length) return invalid();
  const seen = new Set<string>();
  const counts: Record<PairStatus, number> = {within: 0, outside: 0, no_computed: 0, no_official: 0, invalid_denominator: 0};
  for (const row of input.pairs) {
    if (!object(row)) return invalid();
    const tradeDate = day(row.tradeDate);
    if (!expected.has(tradeDate) || seen.has(tradeDate) || !nullableDecimal(row.computedValue) || !nullableDecimal(row.officialValue)) return invalid();
    seen.add(tradeDate);
    const computed = row.computedValue, official = row.officialValue;
    let status: PairStatus;
    if (computed === null) status = 'no_computed';
    else if (official === null) status = 'no_official';
    else if (decCmp(official, '0') <= 0) status = 'invalid_denominator';
    // |computed / official - 1| <= .01, using exact multiplication instead of a rounded ratio.
    else status = decCmp(decAbs(decSub(computed, official)), decMul(official, '0.01')) <= 0 ? 'within' : 'outside';
    counts[status]++;
  }
  counts.no_computed += expected.size - seen.size;
  const nPairs = counts.within + counts.outside;
  const thresholds = {
    minimumPairs: nPairs >= 24,
    pairCoverage: nPairs * 10 >= expected.size * 9,
    withinShare: nPairs > 0 && counts.within * 20 >= nPairs * 19,
  };
  return {assessment: 'diagnostic_only' as const, nExpected: expected.size, nPairs, counts, thresholds,
    thresholdsMet: Object.values(thresholds).every(Boolean)};
}
