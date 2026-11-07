/** Preparatory adapters only: no job registration, database writes or comparator policy. */
import {canonicalDecimal} from '../../facts/json-numbers';
import {assertDay} from '../method';
import {decodeText, fetchPaged, ymdToIso} from './tushare-industry';
import type {FetchOptions, TushareCall, TusharePage} from './tushare-industry';

export const SW_DAILY_FIELDS = ['ts_code', 'trade_date', 'pe', 'pb', 'total_mv', 'float_mv', 'close'] as const;
export const TRADE_CAL_FIELDS = ['exchange', 'cal_date', 'is_open', 'pretrade_date'] as const;
export interface SwDailyRow {ts_code: string; trade_date: string; pe: string | null; pb: string | null; total_mv: string | null; float_mv: string | null; close: string | null}
export interface TradeCalendarRow {exchange: string; cal_date: string; is_open: string; pretrade_date: string | null}
export interface DateRange {from: string; to: string}
export function validateDateRange(q: DateRange): void {
 assertDay('from', q.from); assertDay('to', q.to);
 if (q.from > q.to) throw new Error('invalid_date_range');
}
const compact = (d: string) => d.replaceAll('-', '');

/** One code/year segment, as specified in §6.2; exact decimals and page snapshots are retained. */
export function fetchSwDaily(call: TushareCall, q: DateRange & {tsCode: string}, opts: FetchOptions = {}): Promise<TusharePage<SwDailyRow>[]> {
 validateDateRange(q);
 if (!/^\d{6}\.SI$/.test(q.tsCode)) throw new Error('invalid_sw_code');
 if (q.from.slice(0, 4) !== q.to.slice(0, 4)) throw new Error('sw_year_segment_required');
 return fetchPaged(call, 'sw_daily', {ts_code: q.tsCode, start_date: compact(q.from), end_date: compact(q.to)}, SW_DAILY_FIELDS,
  (fields, items) => decodeText(fields, items).map(r => {
   // Decode scalar text first: Number() would round malformed date literals into real days.
   if (r.ts_code === null || r.ts_code.length !== 9 || !/^\d{6}\.SI$/.test(r.ts_code)) throw new Error('invalid_sw_code');
   if (r.trade_date === null || r.trade_date.length !== 8 || !ymdToIso(r.trade_date)) throw new Error('invalid_source_date');
   const decimal = (field: string) => r[field] === null ? null : canonicalDecimal(r[field]);
   return {ts_code: r.ts_code, trade_date: r.trade_date, pe: decimal('pe'), pb: decimal('pb'), total_mv: decimal('total_mv'), float_mv: decimal('float_mv'), close: decimal('close')};
  }), {...opts, pageSize: opts.pageSize ?? 4000});
}

/** SSE is explicit (verified recording K1–K3); no inference from missing market data. */
export function fetchTradeCalendar(call: TushareCall, q: DateRange, opts: FetchOptions = {}): Promise<TusharePage<TradeCalendarRow>[]> {
 validateDateRange(q);
 return fetchPaged(call, 'trade_cal', {exchange: 'SSE', start_date: compact(q.from), end_date: compact(q.to)}, TRADE_CAL_FIELDS,
  (fields, items) => decodeText(fields, items) as unknown as TradeCalendarRow[], opts);
}
