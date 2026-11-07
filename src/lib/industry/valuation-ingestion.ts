/** Internal preparation for spec §6.1–6.2. Pure plans only; jobs remain deferred_i3.
 * Neither plans nor official observations authorize formulas, reconciliation or public use.
 */
import {canonicalDecimal} from '../facts/json-numbers';
import {canonicalJson, sha256Hex} from './canonical-json';
import {isDecimal} from './decimal';
import {assertDay} from './method';
import {locatorOf, ymdToIso} from './providers/tushare-industry';
import type {TusharePage} from './providers/tushare-industry';
import {validateDateRange} from './providers/tushare-valuation';
import type {DateRange, SwDailyRow, TradeCalendarRow} from './providers/tushare-valuation';
import type {OfficialInput} from './types';

const METRICS = ['pe', 'pb', 'total_mv', 'float_mv', 'close'] as const;
const HASH = /^[a-f0-9]{64}$/;
function iso(v: string): string {
 const d = ymdToIso(v);
 if (!d) throw new Error('invalid_source_date');
 return d;
}
export function validateExpectedDates(dates: readonly string[]): Set<string> {
 if (!dates.length) throw new Error('expected_dates');
 for (const d of dates) assertDay('expectedDate', d);
 const unique = new Set(dates);
 if (unique.size !== dates.length) throw new Error('expected_dates');
 return unique;
}

/** Requires every calendar day in the requested closed interval, including holidays.
 * Sampling boundaries (weekly/monthly and recent window) remain the future caller's responsibility.
 */
export function validateTradeCalendar(pages: readonly TusharePage<TradeCalendarRow>[], q: DateRange) {
 validateDateRange(q);
 const days = new Map<string, boolean>();
 for (const [i, p] of pages.entries()) {
  if (p.api !== 'trade_cal' || p.request.api !== 'trade_cal' || !HASH.test(p.raw_hash) ||
   p.request.params.exchange !== 'SSE' || p.request.params.start_date !== q.from.replaceAll('-', '') || p.request.params.end_date !== q.to.replaceAll('-', '') ||
   p.page !== i + 1 || p.offset !== pages.slice(0, i).reduce((n, page) => n + page.rows.length, 0) ||
   p.has_more !== (i < pages.length - 1) || (p.snapshot !== null && p.snapshot.sha256 !== p.raw_hash)) throw new Error('calendar_evidence');
 }
 for (const p of pages) for (const r of p.rows) {
  if (p.api !== 'trade_cal' || r.exchange !== 'SSE' || !['0', '1'].includes(r.is_open)) throw new Error('calendar_row');
  const date = iso(r.cal_date);
  if (date < q.from || date > q.to) throw new Error('calendar_range');
  if (days.has(date)) throw new Error('calendar_duplicate');
  if (r.pretrade_date !== null && r.pretrade_date !== '' && iso(r.pretrade_date) >= date) throw new Error('calendar_previous_date');
  days.set(date, r.is_open === '1');
 }
 const count = (Date.parse(q.to) - Date.parse(q.from)) / 86400000 + 1;
 if (days.size !== count) throw new Error('calendar_incomplete');
 const sorted = [...days].sort(([a], [b]) => a.localeCompare(b));
 return {evidence: pages.map(p => structuredClone({raw_hash: p.raw_hash, fetched_at: p.fetched_at, request: p.request, snapshot: p.snapshot})), days: sorted.map(([date, isOpen]) => ({date, isOpen})), openDates: sorted.filter(([, open]) => open).map(([date]) => date)};
}

/** Reject wrong keys/invalid values; identical duplicate keys collapse; conflicts produce no row.
 * Stored values preserve upstream units (mv = 万元, close = index points, pe/pb = ratio).
 * Evidence hashes never serve as observation identity. All returned rows are internal materials.
 */
export function planOfficialObservations(pages: readonly TusharePage<SwDailyRow>[], q: {code: string; expectedDates: readonly string[]}) {
 if (!/^\d{6}$/.test(q.code)) throw new Error('invalid_sw_code');
 const expected = validateExpectedDates(q.expectedDates);
 const groups = new Map<string, OfficialInput[]>();
 let skippedDates = 0;
 for (const p of pages) {
  if (p.api !== 'sw_daily' || !HASH.test(p.raw_hash) || !Number.isInteger(p.page) || p.page < 1 || !Number.isInteger(p.offset) || p.offset < 0) throw new Error('official_evidence');
  for (const [row, r] of p.rows.entries()) {
   if (r.ts_code !== `${q.code}.SI`) throw new Error('official_key');
   const date = iso(r.trade_date);
   for (const metric of METRICS) if (r[metric] !== null && !isDecimal(r[metric])) throw new Error('official_value');
   if (!expected.has(date)) {skippedDates++; continue;}
   for (const metric of METRICS) {
    const value = r[metric];
    if (value === null) continue;
    const locator = {...locatorOf(p, row), page_sha256: p.raw_hash, snapshot_unit: metric.endsWith('_mv') ? 'wan_cny' : metric === 'close' ? 'index_points' : 'ratio'};
    const input: OfficialInput = {scheme: 'sw2021', version: '2021', code: q.code, trade_date: date, metric, value: canonicalDecimal(value),
     source: 'tushare:sw_daily', upstream: 'sw', raw_hash: sha256Hex(canonicalJson({api: 'sw_daily', page_sha256: p.raw_hash, page: p.page, row})), locator};
    const key = `${date}:${metric}`;
    groups.set(key, [...(groups.get(key) ?? []), input]);
   }
  }
 }
 const rows: OfficialInput[] = [], conflicts: {code: string; trade_date: string; metric: OfficialInput['metric']}[] = [];
 for (const [, candidates] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  candidates.sort((a, b) => Number(a.locator.page) - Number(b.locator.page) || Number(a.locator.row) - Number(b.locator.row) || a.raw_hash.localeCompare(b.raw_hash) || canonicalJson(a.locator).localeCompare(canonicalJson(b.locator)));
  const first = candidates[0];
  if (new Set(candidates.map(r => r.value)).size > 1) conflicts.push({code: q.code, trade_date: first.trade_date, metric: first.metric});
  else rows.push(first);
 }
 // Count unavailable unique expected slots, including absent dates, nulls and conflicts.
 return {rows, conflicts, skippedDates, missingMetrics: expected.size * METRICS.length - rows.length};
}
