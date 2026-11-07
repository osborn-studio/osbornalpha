// src/lib/judgments/kline.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {KlineProviderError} from '@/lib/data/kline/types';
import type {SourceKlineBar} from '@/lib/data/kline/types';
import type {fetchDatagatewayDailyKline} from '@/lib/data/sources/datagateway';
import type {fetchEastmoneyKline} from '@/lib/data/sources/eastmoney';
import {EASTMONEY_PAGE,closeOnlyOf,readKlineRange} from './kline';
import type {KlineRange} from './kline';
import {anonJudgmentInputsDb} from './inputs-db';
import type {KlineRangeRequest} from './types';

/** Weekdays in [from, to] as bars with close = 100 + day index. */
function weekdays(from:string,to:string):SourceKlineBar[]{
 const out:SourceKlineBar[]=[];
 for(let t=Date.parse(`${from}T00:00:00Z`),i=0;t<=Date.parse(`${to}T00:00:00Z`);t+=86_400_000){const d=new Date(t);if(d.getUTCDay()===0||d.getUTCDay()===6)continue;const c=100+(i++);out.push({time:d.toISOString().slice(0,10),open:c,high:c+1,low:c-1,close:c,volume:1000});}
 return out;
}
const HISTORY=weekdays('2023-01-02','2024-12-31');
type Em=typeof fetchEastmoneyKline;type Dg=typeof fetchDatagatewayDailyKline;
/** Eastmoney fake: the latest min(limit, cap) bars with time <= endDate (inclusive). */
const emFake=(cap=EASTMONEY_PAGE,adjustment:'qfq'|'hfq'='qfq')=>vi.fn(async(_t:string,_p:string,limit:number,o:{endDate?:string}={})=>{
 const upTo=HISTORY.filter(b=>o.endDate===undefined||b.time<=o.endDate);
 const bars=upTo.slice(-Math.min(limit,cap));
 return bars.length?{source:'eastmoney' as const,bars,adjustment,volumeUnit:'shares' as const}:null;
});
const req=(o:Partial<KlineRangeRequest>={}):KlineRangeRequest=>({ticker:'600519.SH',market:'A',adjustment:'qfq',source:'eastmoney',from:'2024-03-01',to:'2024-03-29',signal:new AbortController().signal,...o});
const ok=(r:Awaited<ReturnType<typeof readKlineRange>>)=>{if('failure' in r)throw new Error(`failure ${r.failure}`);return r as KlineRange;};

describe('readKlineRange (spec §5.7, §7.4)',()=>{
 it('eastmoney: inclusive [from,to], ascending, one page when the window is recent enough',async()=>{
  const em=emFake();
  const r=ok(await readKlineRange(req(),{eastmoney:em as unknown as Em}));
  expect(r.bars[0].time).toBe('2024-03-01');expect(r.bars.at(-1)!.time).toBe('2024-03-29');
  expect(r.bars.map(b=>b.time)).toEqual(HISTORY.filter(b=>b.time>='2024-03-01'&&b.time<='2024-03-29').map(b=>b.time));
  expect(r).toMatchObject({source:'eastmoney',adjustment:'qfq',volumeUnit:'shares',close_only:false,from:'2024-03-01',to:'2024-03-29'});
  expect(em.mock.calls[0][3]).toMatchObject({adjustment:'qfq',endDate:'2024-03-30'});   // overshoot by one day
  expect(em).toHaveBeenCalledTimes(1);
 });
 it('eastmoney: pages backwards when the provider caps a page, until the window start is covered',async()=>{
  const em=emFake(40);
  const r=ok(await readKlineRange(req({from:'2023-06-01',to:'2024-02-29'}),{eastmoney:em as unknown as Em}));
  expect(r.bars[0].time).toBe('2023-06-01');expect(r.bars.at(-1)!.time).toBe('2024-02-29');
  expect(new Set(r.bars.map(b=>b.time)).size).toBe(r.bars.length);
  expect(em.mock.calls.length).toBeGreaterThan(4);
  const ends=em.mock.calls.map(c=>(c[3] as {endDate:string}).endDate);
  expect([...ends].sort().reverse()).toEqual(ends);   // strictly moving back
 });
 it('eastmoney: an overlapping page that disagrees → invalid_data; a stuck provider stops without looping',async()=>{
  let call=0;
  const flaky=vi.fn(async()=>{call++;const bars=HISTORY.slice(-30).map(b=>call===1?b:{...b,close:b.close+1});return {source:'eastmoney' as const,bars,adjustment:'qfq' as const,volumeUnit:'shares' as const};});
  expect(await readKlineRange(req({from:'2023-01-02',to:'2024-12-31'}),{eastmoney:flaky as unknown as Em})).toEqual({failure:'invalid_data'});
  const stuck=vi.fn(async()=>({source:'eastmoney' as const,bars:HISTORY.slice(-30),adjustment:'qfq' as const,volumeUnit:'shares' as const}));
  const r=ok(await readKlineRange(req({from:'2023-01-02',to:'2024-12-31'}),{eastmoney:stuck as unknown as Em}));
  expect(r.bars).toHaveLength(30);expect(stuck).toHaveBeenCalledTimes(2);
 });
 it('validation: duplicate dates in a page, non-positive close, wrong adjustment → invalid_data; unsorted pages are sorted',async()=>{
  const page=(bars:SourceKlineBar[],adjustment:'qfq'|'hfq'='qfq')=>vi.fn(async()=>({source:'eastmoney' as const,bars,adjustment,volumeUnit:'shares' as const}));
  const w=HISTORY.filter(b=>b.time>='2024-03-01'&&b.time<='2024-03-29');
  expect(await readKlineRange(req(),{eastmoney:page([...w,w[3]]) as unknown as Em})).toEqual({failure:'invalid_data'});
  expect(await readKlineRange(req(),{eastmoney:page([{...w[0],close:0},...w.slice(1)]) as unknown as Em})).toEqual({failure:'invalid_data'});
  expect(await readKlineRange(req(),{eastmoney:page(w,'hfq') as unknown as Em})).toEqual({failure:'invalid_data'});
  const r=ok(await readKlineRange(req(),{eastmoney:page([...w].reverse()) as unknown as Em}));
  expect(r.bars.map(b=>b.time)).toEqual(w.map(b=>b.time));
 });
 it('datagateway: 365-day windows forwards with a one-day overshoot; close-only is reported',async()=>{
  const calls:{startDate?:string;endDate?:string}[]=[];
  const dg=vi.fn(async(_t:string,_m:string,_l:number,adjustment:string,o:{startDate?:string;endDate?:string;onCloseOnly?:()=>void}={})=>{
   calls.push({startDate:o.startDate,endDate:o.endDate});o.onCloseOnly?.();
   return {source:'datagateway' as const,adjustment:adjustment as 'qfq',volumeUnit:'shares' as const,bars:HISTORY.filter(b=>b.time>=o.startDate!&&b.time<=o.endDate!)};
  });
  const r=ok(await readKlineRange(req({source:'datagateway',market:'US',ticker:'NVDA',from:'2023-01-03',to:'2024-06-28'}),{datagateway:dg as unknown as Dg}));
  expect(calls).toEqual([{startDate:'2023-01-02',endDate:'2024-01-01'},{startDate:'2024-01-02',endDate:'2024-06-29'}]);
  expect(r.close_only).toBe(true);expect(closeOnlyOf(r)).toBe(true);
  expect(r.bars[0].time).toBe('2023-01-03');expect(r.bars.at(-1)!.time).toBe('2024-06-28');
  const none=vi.fn(async()=>null);
  expect(await readKlineRange(req({source:'datagateway'}),{datagateway:none as unknown as Dg})).toEqual({failure:'unsupported'});
 });
 it('failures: other sources unsupported, provider kinds pass through, aborts are timeouts, empty windows are empty',async()=>{
  expect(await readKlineRange(req({source:'sina'}))).toEqual({failure:'unsupported'});
  const limited=vi.fn(async()=>{throw new KlineProviderError('rate_limited','429',true,429);});
  expect(await readKlineRange(req(),{eastmoney:limited as unknown as Em})).toEqual({failure:'rate_limited'});
  const ac=new AbortController();
  const aborting=vi.fn(async()=>{ac.abort();throw new DOMException('aborted','AbortError');});
  expect(await readKlineRange(req({signal:ac.signal}),{eastmoney:aborting as unknown as Em})).toEqual({failure:'timeout'});
  const pre=new AbortController();pre.abort();
  expect(await readKlineRange(req({signal:pre.signal}),{eastmoney:emFake() as unknown as Em})).toEqual({failure:'timeout'});
  expect(await readKlineRange(req({from:'2025-03-01',to:'2025-03-02'}),{eastmoney:emFake() as unknown as Em})).toEqual({failure:'empty'});
  expect(await readKlineRange(req(),{eastmoney:vi.fn(async()=>null) as unknown as Em})).toEqual({failure:'empty'});
  await expect(readKlineRange(req({from:'2024-03-29',to:'2024-03-01'}))).rejects.toThrow(RangeError);
  await expect(readKlineRange(req({adjustment:'none' as never}))).rejects.toThrow(RangeError);
  expect(closeOnlyOf({source:'eastmoney',bars:[],adjustment:'qfq',volumeUnit:'shares'})).toBe(false);
 });
 it('anonJudgmentInputsDb routes kline through readKlineRange by default',async()=>{
  const pre=new AbortController();pre.abort();
  const db=anonJudgmentInputsDb({anon:{} as SupabaseClient});
  expect(await db.kline(req({signal:pre.signal}))).toEqual({failure:'timeout'});   // unsupportedKline would say 'unsupported'
 });
});
