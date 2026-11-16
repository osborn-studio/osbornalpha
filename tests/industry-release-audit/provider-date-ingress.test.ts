import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scanJsonNumbers} from '../../src/lib/facts/json-numbers';
import {fetchSwDaily} from '../../src/lib/industry/providers/tushare-valuation';
import {planOfficialObservations} from '../../src/lib/industry/valuation-ingestion';
import type {TushareCall} from '../../src/lib/industry/providers/tushare-industry';

// Provider bytes enter through the same lossless scanner as real Tushare responses.
// No fabricated internal TusharePage or private helper behavior is asserted.
async function observations(dateLiteral: string) {
 const raw = new TextEncoder().encode(`{"data":{"fields":["ts_code","trade_date","pe","pb","total_mv","float_mv","close"],"items":[["801780.SI",${dateLiteral},10,2,100,80,3]]}}`);
 const {data} = scanJsonNumbers(raw) as {data: {fields: string[]; items: unknown[][]}};
 const call: TushareCall = async () => ({...data, raw, has_more: false});
 const pages = await fetchSwDaily(call, {tsCode: '801780.SI', from: '2026-10-30', to: '2026-10-30'}, {minIntervalMs: 0});
 return planOfficialObservations(pages, {code: '801780', expectedDates: ['2026-10-30']});
}

for (const date of ['"20261030"', '20261030']) {
 test(`accepts the exact scalar provider date ${date}`, async () => {
  const plan = await observations(date);
  assert.equal(plan.rows.length, 5);
  assert.equal(plan.missingMetrics, 0);
  assert.ok(plan.rows.every(row => row.trade_date === '2026-10-30'));
 });
}

for (const date of ['20261029.999999999999999999', '["20261030"]']) {
 test(`rejects malformed provider date ${date} before filling observation slots`, async () => {
  await assert.rejects(() => observations(date));
 });
}
