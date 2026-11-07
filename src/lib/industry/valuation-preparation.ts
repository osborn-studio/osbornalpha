/** Internal, read-only input preparation for §6.1/§6.3. No formulas or method approval.
 * Current observations intentionally may postdate tradeDate (§6.1 reconstruction); their observed_at
 * must be preserved by future manifests. tradeDate is never a publication availability timestamp.
 */
import type {IssuerSecurityInput} from '../entities/types';
import {decCmp, decMul, isDecimal} from './decimal';
import {membersAtPure} from './memberships';
import {assertDay} from './method';
import type {MarkRow, MembershipRow, OfficialInput, ValuationCellRow} from './types';
import {validateExpectedDates} from './valuation-ingestion';
import {analyzeValuationReconciliation} from './valuation-reconciliation';

type SecurityWindow = Pick<IssuerSecurityInput, 'issuer_id' | 'ticker' | 'share_class' | 'is_primary' | 'valid_from' | 'valid_to'>;
type PreparedMember = {issuer_id: string; membership_id: string} & (
 {status: 'ambiguous_primary' | 'no_mark'; ticker: string | null} |
 {status: 'ready'; ticker: string; mark: MarkRow});
const timestamp = (s: string) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));

export function prepareValuationMembers(q: {code: string; tradeDate: string; memberships: MembershipRow[]; securities: readonly SecurityWindow[]; marks: readonly MarkRow[]}) {
 assertDay('tradeDate', q.tradeDate);
 if (!/^\d{6}$/.test(q.code)) throw new Error('invalid_sw_code');
 const members = membersAtPure(q.memberships, {scheme: 'sw2021', version: '2021', code: q.code, level: 1, on: q.tradeDate, knownBy: q.tradeDate});
 const prepared: PreparedMember[] = members.map(member => {
  const identity = {issuer_id: member.issuer_id, membership_id: member.membership_id};
  const securities = q.securities.filter(r => r.issuer_id === member.issuer_id && r.share_class === 'A' && r.is_primary && r.valid_from <= q.tradeDate && (r.valid_to == null || r.valid_to > q.tradeDate));
  if (securities.length !== 1) return {...identity, status: 'ambiguous_primary', ticker: null};
  const ticker = securities[0].ticker;
  const marks = q.marks.filter(r => r.ticker === ticker && r.trade_date === q.tradeDate && r.status === 'ok');
  if (marks.length > 1) throw new Error('ambiguous_current_mark');
  if (!marks.length) return {...identity, ticker, status: 'no_mark'};
  const mark = marks[0];
  if (!mark.observation_id || !timestamp(mark.observed_at) || !isDecimal(mark.close) || !isDecimal(mark.total_share) || !isDecimal(mark.market_cap) ||
   decCmp(mark.close, '0') <= 0 || decCmp(mark.total_share, '0') <= 0 || decCmp(decMul(mark.close, mark.total_share), mark.market_cap) !== 0 ||
   (mark.free_share !== null && (!isDecimal(mark.free_share) || decCmp(mark.free_share, '0') <= 0))) throw new Error('invalid_current_mark');
  return {...identity, ticker, status: 'ready', mark: structuredClone(mark)};
 });
 return {assessment: 'preparation_only' as const, historyClass: 'reconstruction' as const, factsAsOf: q.tradeDate, knownBy: q.tradeDate, members: prepared};
}

type ComputedCell = Pick<ValuationCellRow, 'run_id' | 'scheme' | 'version' | 'code' | 'metric' | 'trade_date' | 'status' | 'value'>;
type CurrentOfficial = Pick<OfficialInput, 'scheme' | 'version' | 'code' | 'metric' | 'trade_date' | 'value'> & {observation_id: string; observed_at: string; status: 'ok' | 'superseded'};
/** Alignment checks around #141's numeric diagnostics. officialMetric is an explicitly supplied
 * candidate mapping for internal experiments, NOT an approved comparator. No qualification, DB pair
 * rows, official values or publication flags are emitted. SQL staging must re-read current versions.
 */
export function diagnoseAlignedValuationSeries(q: {runId: string; code: string; metric: ValuationCellRow['metric']; officialMetric: OfficialInput['metric']; expectedDates: readonly string[]}, computed: readonly ComputedCell[], official: readonly CurrentOfficial[]) {
 const expected = validateExpectedDates(q.expectedDates);
 const cells = new Map<string, string | null>();
 const values = new Map<string, string>();
 for (const r of computed) {
  if (r.run_id !== q.runId || r.scheme !== 'sw2021' || r.version !== '2021' || r.code !== q.code || r.metric !== q.metric || !expected.has(r.trade_date) || cells.has(r.trade_date)) throw new Error('computed_key');
  if ((r.status === 'missing' && r.value !== null) || (r.status === 'ok' && !isDecimal(r.value)) || !['ok', 'missing'].includes(r.status)) throw new Error('computed_value');
  cells.set(r.trade_date, r.value);
 }
 for (const r of official) {
  if (r.status === 'superseded') continue;
  if (r.status !== 'ok' || r.scheme !== 'sw2021' || r.version !== '2021' || r.code !== q.code || r.metric !== q.officialMetric || !expected.has(r.trade_date)) throw new Error('official_key');
  if (!r.observation_id || !timestamp(r.observed_at) || !isDecimal(r.value)) throw new Error('official_value');
  if (values.has(r.trade_date)) throw new Error('ambiguous_current_official');
  values.set(r.trade_date, r.value);
 }
 return analyzeValuationReconciliation({expectedDates: [...expected], pairs: [...expected].map(tradeDate => ({tradeDate, computedValue: cells.get(tradeDate) ?? null, officialValue: values.get(tradeDate) ?? null}))});
}
