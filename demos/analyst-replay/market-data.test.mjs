import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketWindowLoader } from './market-data.mjs';
import { parseDatagatewayDailyKline } from '../../src/lib/data/sources/datagateway.ts';

const hk = {ticker:'700.HK', market:'HK', recommended_at:'2026-06-16T02:00:00Z'};
const us = {ticker:'AAPL', market:'US', recommended_at:'2026-06-16T14:00:00Z'};
const off = async () => null;
function resolution(dates, adjustment = 'none', fetchedAt = '2026-09-01T14:00Z') {
  return {source:'tencent', adjustment, freshness:'fresh', fetchedAt,
    bars:dates.map((time, i) => ({time, close:100 + i}))};
}
function weekdays(start, count) {
  const date = new Date(start + 'T00:00Z'), days = [];
  while (days.length < count) {
    if (date.getUTCDay() % 6 !== 0) days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

test('joins requests for the same exchange date and ticker and isolates returned close evidence', async () => {
  let calls = 0;
  const load = createMarketWindowLoader({gateway:off,resolve: async ({ticker,range}) => {
    calls++;
    assert.equal(ticker,'00700.HK');
    assert.equal(range,'1y');
    return resolution(weekdays('2026-06-10',35));
  }});
  const [a,b] = await Promise.all([load(hk), load({...hk,ticker:'00700.HK',recommended_at:'2026-06-15T18:00:00Z'})]);
  assert.equal(calls,1);
  assert.deepEqual(a,b);
  assert.equal(a.mode,'provider');
  assert.equal(a.bars.length,11);
  assert.equal(a.baseDate,'2026-06-16');
  assert.deepEqual([a.d5Date,a.d10Date],[a.bars[5].time,a.bars[10].time]);
  assert.equal(a.fetchedAt,'2026-09-01T14:00Z');
  a.bars.splice(0);
  assert.equal((await load(hk)).bars.length,11);
  assert.equal(calls,1);
});

test('uses closed sessions only, the market date in New York, and a short-lived cache for immature calls', async () => {
  let now = 0, calls = 0;
  const load = createMarketWindowLoader({gateway:off,now:()=>now,resolve:async () => {
    calls++;
    // 12:00 New York time. The 16th is still trading.
    return resolution(['2026-06-12','2026-06-15','2026-06-16'], 'none', '2026-06-16T16:00:00Z');
  }});
  const call = {...us, recommended_at:'2026-06-16T02:00:00Z'};
  const initial = await load(call);
  assert.deepEqual(initial.bars,[{time:'2026-06-15',close:101}]);
  assert.equal(initial.d5Date,null);
  assert.equal(initial.d10Date,null);
  assert.equal(calls,1);
  await load(call);
  now += 31_000;
  await load(call);
  assert.equal(calls,2);
  const recent = await load(us);
  assert.equal(recent.baseDate,null);
  assert.deepEqual(recent.bars,[]);
});

test('rejects history truncated before the original decision date and handles the weekend left edge', async () => {
  const load = createMarketWindowLoader({gateway:off,resolve:async () => resolution(weekdays('2026-06-22',21))});
  await assert.rejects(load(us), {code:'before_window',status:422});
  const sunday = await load({...us,recommended_at:'2026-06-21T15:00:00Z'});
  assert.equal(sunday.baseDate, '2026-06-22');
  assert.equal(sunday.bars.length, 11);
});

test('an upstream timeout uses only the matching verified snapshot within its coverage', async () => {
  const load = createMarketWindowLoader({gateway:off,resolve:()=>new Promise(()=>{}),timeoutMs:15});
  const sample = await load(hk);
  assert.deepEqual([sample.source,sample.mode,sample.d10Date,sample.bars[0].close,sample.bars[10].close],
    ['腾讯财经','snapshot','2026-07-02',447.4,430.2]);
  await assert.rejects(load(us), {code:'price_unavailable',status:503});
  await assert.rejects(load({...hk,recommended_at:'2026-11-22T04:00:00Z'}),{code:'price_unavailable'});
  await assert.rejects(load({...hk,ticker:'600519.SH'}),{code:'invalid_request'});
});

test('verifies the scoring price basis and preserves a single provider for the whole window', async () => {
  const dates = weekdays('2026-06-16',21);
  const wrongBasis = createMarketWindowLoader({gateway:off, resolve:async()=>resolution(dates,'none')});
  await assert.rejects(wrongBasis({...hk,ticker:'600519.SH',market:'A'}),{code:'price_unavailable'});
  const load = createMarketWindowLoader({
    gateway:async()=>({...resolution(dates.slice(0,6)),source:'datagateway'}),
    resolve:async()=>resolution(dates),
  });
  const window = await load(us);
  assert.equal(window.source,'腾讯财经');
  assert.equal(window.bars.length,11);
  const closeData = {data:[{date:'2026-06-16',symbol:'AAPL',value:'123.45'}]};
  assert.throws(()=>parseDatagatewayDailyKline(closeData,'none',{requireExplicitAdjustment:true}),/did not report/);
  assert.equal(parseDatagatewayDailyKline({...closeData,adjustment:'raw'},'none',{requireExplicitAdjustment:true}).bars[0].close,123.45);
});

test('discards stale fallback caches, erroneous weekend bars and mismatched market symbols', async () => {
  const dates = weekdays('2026-06-16',21);
  const stale = createMarketWindowLoader({gateway:off,resolve:async()=>({...resolution(dates),freshness:'stale'})});
  await assert.rejects(stale(us),{code:'price_unavailable'});
  const week = createMarketWindowLoader({gateway:off,resolve:async()=>resolution([...dates,'2026-07-18'])});
  await assert.rejects(week(us),{code:'price_unavailable'});
  await assert.rejects(week({...us,ticker:'ABC.HK'}),{code:'invalid_request'});
});
