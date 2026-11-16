import {describe, it, expect} from 'vitest';
import {fixtureTushareCall} from './tushare-industry';
import type {TushareCall} from './tushare-industry';
import {scanJsonNumbers} from '../../facts/json-numbers';
import {fetchSwDaily, fetchTradeCalendar} from './tushare-valuation';
import {planOfficialObservations, validateTradeCalendar} from '../valuation-ingestion';

const opts = {minIntervalMs: 0};
const fx = fixtureTushareCall();
describe('disabled valuation ingestion preparation', () => {
 it('decodes recorded official decimals and retains exact page evidence', async () => {
  const pages = await fetchSwDaily(fx, {tsCode: '801780.SI', from: '2026-10-26', to: '2026-10-30'}, opts);
  expect(pages[0].rows).toHaveLength(5);
  expect(typeof pages[0].rows[0].pe).toBe('string');
  const plan = planOfficialObservations(pages, {code: '801780', expectedDates: ['2026-10-30']});
  expect(plan.rows).toHaveLength(5);
  expect(plan.rows.find(r => r.metric === 'pe')).toMatchObject({scheme: 'sw2021', version: '2021', code: '801780', trade_date: '2026-10-30', locator: {snapshot_unit: 'ratio'}});
  expect(plan.rows[0].raw_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(plan.rows[0].locator).toMatchObject({api: 'sw_daily', request: {params: {ts_code: '801780.SI'}}, page_sha256: pages[0].raw_hash});
  expect(plan.skippedDates).toBe(4);
 });
 it('requires complete calendar dates; preserves closed days and rejects holes and duplicates', async () => {
  const pages = await fetchTradeCalendar(fx, {from: '2026-10-01', to: '2026-10-31'}, opts);
  const q = {from: '2026-10-01', to: '2026-10-31'};
  const calendar = validateTradeCalendar(pages, q);
  expect(calendar.openDates).toHaveLength(17);
  expect(calendar.openDates.at(-1)).toBe('2026-10-30');
  expect(calendar.days).toHaveLength(31);
  expect(calendar.evidence[0].raw_hash).toBe(pages[0].raw_hash);
  expect(() => validateTradeCalendar([{...pages[0], raw_hash: 'bad'}], q)).toThrow('calendar_evidence');
  expect(() => validateTradeCalendar([{...pages[0], has_more: true}], q)).toThrow('calendar_evidence');
  expect(() => validateTradeCalendar([{...pages[0], rows: [...pages[0].rows.slice(1), pages[0].rows[1]]}], q)).toThrow('calendar_duplicate');
  expect(() => validateTradeCalendar([{...pages[0], rows: pages[0].rows.slice(1)}], q)).toThrow('calendar_incomplete');
  expect(() => validateTradeCalendar([...pages, ...pages], q)).toThrow('calendar_evidence');
  expect(() => validateTradeCalendar([{...pages[0], rows: pages[0].rows.map((r, i) => i ? r : {...r, is_open: '2'})}], q)).toThrow('calendar_row');
 });
 it('rejects invalid dates and codes before making a request', () => {
  expect(() => fetchSwDaily(fx, {tsCode: '801780', from: '2026-10-01', to: '2026-10-31'})).toThrow('invalid_sw_code');
  expect(() => fetchTradeCalendar(fx, {from: '2026-02-30', to: '2026-10-31'})).toThrow();
 });
 it('requests explicit date ranges and bounds each official fetch to one year', async () => {
  const requests: unknown[] = [];
  const call: typeof fx = async (api, params, fields) => {
   requests.push({api, params});
   return {fields: fields.split(','), items: [], has_more: false, raw: new Uint8Array([1])};
  };
  await fetchSwDaily(call, {tsCode: '801780.SI', from: '2026-10-28', to: '2026-10-29'}, opts);
  await fetchTradeCalendar(call, {from: '2026-10-28', to: '2026-10-29'}, opts);
  expect(requests).toEqual([
   {api: 'sw_daily', params: {ts_code: '801780.SI', start_date: '20261028', end_date: '20261029', limit: 4000, offset: 0}},
   {api: 'trade_cal', params: {exchange: 'SSE', start_date: '20261028', end_date: '20261029', limit: 2000, offset: 0}},
  ]);
  expect(() => fetchSwDaily(call, {tsCode: '801780.SI', from: '2025-10-28', to: '2026-10-29'})).toThrow('sw_year_segment_required');
 });
 it('never lets page order choose conflicting observations, and normalizes equivalent decimals', async () => {
  const [p] = await fetchSwDaily(fx, {tsCode: '801780.SI', from: '2026-10-26', to: '2026-10-30'}, opts);
  const r = p.rows[0];
  const q = {code: '801780', expectedDates: ['2026-10-30']};
  const one = {...p, rows: [r]};
  const same = {...p, page: 2, rows: [{...r, pe: r.pe + '0'}]};
  // Fixture PE has two decimal places: a trailing zero is the same observation.
  expect(planOfficialObservations([one, same], q).conflicts).toEqual([]);
  const alternate = {...one, raw_hash: 'b'.repeat(64)};
  expect(planOfficialObservations([one, alternate], q).rows).toEqual(planOfficialObservations([alternate, one], q).rows);
  const changed = {...p, page: 2, rows: [{...r, pe: '999'}]};
  for (const pages of [[one, changed], [changed, one]]) {
   const plan = planOfficialObservations(pages, q);
   expect(plan.rows.some(r => r.metric === 'pe')).toBe(false);
   expect(plan.conflicts).toEqual([{code: '801780', trade_date: '2026-10-30', metric: 'pe'}]);
  }
 });
 it('rejects wrong keys, malformed values and evidence; missing metrics are counted, never coerced to zero', async () => {
  const [p] = await fetchSwDaily(fx, {tsCode: '801780.SI', from: '2026-10-26', to: '2026-10-30'}, opts);
  const q = {code: '801780', expectedDates: ['2026-10-30']};
  const r = p.rows[0];
  for (const patch of [{ts_code: '801120.SI'}, {trade_date: '20260230'}, {pe: 'NaN'}]) {
   expect(() => planOfficialObservations([{...p, rows: [{...r, ...patch}]}], q)).toThrow();
  }
  expect(() => planOfficialObservations([{...p, raw_hash: 'bad'}], q)).toThrow('official_evidence');
  const plan = planOfficialObservations([{...p, rows: [{...r, pe: null, pb: '-1'}]}], q);
  expect(plan.missingMetrics).toBe(1);
  expect(planOfficialObservations([], q).missingMetrics).toBe(5);
  const repeatedNulls = {...p, rows: [{...r, pe: null}, {...r, pe: null}]};
  expect(planOfficialObservations([repeatedNulls], q).missingMetrics).toBe(1);
  expect(plan.rows.find(r => r.metric === 'pb')?.value).toBe('-1');
  expect(() => planOfficialObservations([p], {...q, expectedDates: ['2026-10-30', '2026-10-30']})).toThrow('expected_dates');
 });
});

// Start at provider bytes, before any numeric coercion or observation planning.
const day = '2026-10-30';
async function sourcePages(dateLiteral: string, metrics = '10,2,100,80,3', codeLiteral = '"801780.SI"') {
 const raw = new TextEncoder().encode(`{"data":{"fields":["ts_code","trade_date","pe","pb","total_mv","float_mv","close"],"items":[[${codeLiteral},${dateLiteral},${metrics}]]}}`);
 const {data} = scanJsonNumbers(raw) as {data: {fields: string[]; items: unknown[][]}};
 const call: TushareCall = async () => ({...data, raw, has_more: false});
 return fetchSwDaily(call, {tsCode: '801780.SI', from: day, to: day}, opts);
}
const officialQuery = {code: '801780', expectedDates: [day]};
describe('lossless provider date ingress', () => {
 it.each(['"20261030"', '20261030'])('accepts exact scalar %s and fills only its date', async literal => {
  const pages = await sourcePages(literal);
  expect(pages[0].rows[0].trade_date).toBe('20261030');
  const plan = planOfficialObservations(pages, officialQuery);
  expect(plan.rows).toHaveLength(5);
  expect(plan.rows.every(r => r.trade_date === day)).toBe(true);
  expect(plan.missingMetrics).toBe(0);
 });
 it.each(['20261029.999999999999999999', '20261030.000000000000000001', '20261030.0', '2.026103e7',
  '["20261030"]', '{"date":"20261030"}', 'true', 'null', '""', JSON.stringify('20261030\n'), '"20260230"', '"2026103"', '"2026-10-30"'])
 ('rejects malformed provider date %s before returning pages', async literal => {
  await expect(sourcePages(literal)).rejects.toThrow();
 });
 it.each(['["801780.SI"]', '{"code":"801780.SI"}', 'null', '801780', JSON.stringify('801780.SI\n')])('rejects malformed identity %s', async literal => {
  await expect(sourcePages('"20261030"', undefined, literal)).rejects.toThrow();
 });
 it('validates real calendar dates while preserving exact date literals', async () => {
  for (const literal of ['"20240229"', '20240229']) {
   const pages = await sourcePages(literal);
   expect(planOfficialObservations(pages, {code: '801780', expectedDates: ['2024-02-29']}).rows).toHaveLength(5);
   expect(planOfficialObservations(pages, officialQuery)).toMatchObject({rows: [], skippedDates: 1, missingMetrics: 5});
  }
  await expect(sourcePages('20230229')).rejects.toThrow();
 });
 it('retains null as unavailable, zero and negatives as observations, and exact decimals', async () => {
  const pages = await sourcePages('20261030', 'null,0,-1,12345678901234567890.123456789,3e-2');
  const plan = planOfficialObservations(pages, {...officialQuery, expectedDates: [day, '2026-10-29']});
  expect(plan.missingMetrics).toBe(6); // one null plus all five slots on the absent day
  expect(Object.fromEntries(plan.rows.map(r => [r.metric, r.value]))).toEqual({pb: '0', total_mv: '-1', float_mv: '12345678901234567890.123456789', close: '0.03'});
  const allNull = await sourcePages('"20261030"', 'null,null,null,null,null');
  expect(planOfficialObservations(allNull, officialQuery)).toMatchObject({rows: [], missingMetrics: 5});
  await expect(sourcePages('"20261030"', '10,2,100,80')).rejects.toThrow(); // absent cell is not null
 });
 it('rejects non-string dates even when supplied directly to the planner', async () => {
  const pages = await sourcePages('"20261030"');
  for (const value of [20261030, ['20261030'], {toString: () => '20261030'}]) {
   const rows = [{...pages[0].rows[0], trade_date: value as unknown as string}];
   expect(() => planOfficialObservations([{...pages[0], rows}], officialQuery)).toThrow('invalid_source_date');
  }
 });
});
