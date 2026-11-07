// src/lib/judgments/resolvers/price.test.ts
// F4 Task 11 (spec §7.3 row 1, §7.4, §14.1 price_return bullets) over the synthetic fixtures: session_index end and
// forward paging, date end, benchmark same-date alignment and benchmark_gap, base_bar_missing, basis_mismatch on
// both sides of 0.5 %, capability gate, delisted, close-only evidence, provider failure, evidence shape, and the
// accept_refetched override path.
import {describe,expect,it} from 'vitest';
import {digest} from '../canonical';
import type {JudgmentRow,KlineRangeRequest,ResolveContext} from '../types';
import {fixtureKline,loadKlineFixture,priceJudgment,stubInputsDb,truncateFixture,unverifiedCapability,verifiedCapability} from '../testing/fixtures';
import type {KlineFixture,PriceJudgmentSpec} from '../testing/fixtures';
import {PRICE_RESOLVER_VERSION,priceReturnResolverWith} from './price';
import type {CapabilityLookup} from './price';

const ZZA=loadKlineFixture('synthetic-us-zza.json'),ZZB=loadKlineFixture('synthetic-us-zzb.json'),ZZC=loadKlineFixture('synthetic-a-zz0001-close-only.json');
const NOW='2026-03-02T04:00:00.000Z';
const resolver=priceReturnResolverWith({capabilityOf:verifiedCapability});
const judgment=(s:Partial<PriceJudgmentSpec>={})=>priceJudgment({baseDate:'2026-01-12',registeredClose:106,batchId:'00000000-0000-4000-8000-000000000001',...s}).row;
function run(j:JudgmentRow,fixtures:KlineFixture[],o:{now?:string;primary?:{ticker:string;market:'US'|'A'|'HK'}|null}={}){
 const calls:KlineRangeRequest[]=[];
 const inputsDb=stubInputsDb({kline:fixtureKline(fixtures,calls),issuerPrimarySecurity:async()=>o.primary===undefined?{ticker:'ZZA',market:'US'}:o.primary});
 const now=o.now??NOW;
 const ctx:ResolveContext={judgment:j,cutoff:now,now,inputsDb,signal:new AbortController().signal};
 return {calls,result:resolver.resolve(ctx)};
}
type Ev={bars:{date:string;open:number|null;fields_present:string[]}[];bars_sha256:string;benchmark_bars?:unknown[];origin:{transform?:string}|null;capability:{main:unknown};result:{value:number};fetched_at:string;from:string;to:string};

describe('price_return resolver',()=>{
 it('session_index: end = base + n on the frozen source/adjustment, r = close[end]/close[base] − 1, evidence 5 bars before base through end',async()=>{
  const {calls,result}=run(judgment(),[ZZA]);
  const r=await result;
  if(r.status!=='resolved')throw new Error(JSON.stringify(r));
  expect(r).toMatchObject({value:111/106-1,unit:'ratio',from:'2026-01-12',to:'2026-01-20',label_available_at:'2026-01-20T21:00:00.000Z'});
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ticker:'ZZA',market:'US',adjustment:'qfq',source:'eastmoney',from:'2026-01-02',to:'2026-01-30'});
  const ev=r.evidence as unknown as Ev;
  expect(ev.bars).toHaveLength(11);                                          // ≥ n + 6 (acceptance 3)
  expect(ev.bars[0].date).toBe('2026-01-05');expect(ev.bars[10].date).toBe('2026-01-20');
  expect(ev.bars_sha256).toBe(digest(ev.bars));
  expect(ev).toMatchObject({from:'2026-01-02',to:'2026-01-30',fetched_at:NOW,origin:{},capability:{main:{status:'verified'}},result:{value:111/106-1}});
  expect(ev.bars[0].fields_present).toEqual(['open','high','low','close','volume']);
 });
 it('session_index short of n bars: one forward page from `to`, then Pending with the label estimate',async()=>{
  const {calls,result}=run(judgment(),[truncateFixture(ZZA,'2026-01-16')]);
  expect(await result).toEqual({status:'pending',reason:'awaiting_bars',estimated_at:'2026-01-17T21:00:00.000Z'});
  expect(calls.map(c=>[c.from,c.to])).toEqual([['2026-01-02','2026-01-30'],['2026-01-31','2026-02-17']]);
 });
 it('fewer than 5 bars before base: one backward page of 20 days',async()=>{
  const {calls,result}=run(judgment({baseDate:'2026-01-07',registeredClose:103}),[ZZA]);
  const r=await result;
  expect(r.status).toBe('resolved');
  expect(calls.map(c=>[c.from,c.to])).toEqual([['2025-12-28','2026-01-25'],['2025-12-08','2025-12-27']]);
  if(r.status!=='resolved')throw new Error(JSON.stringify(r));
  expect((r.evidence as unknown as Ev).from).toBe('2025-12-08');   // explicit unsafe boundary: evidence is Record<string,unknown>
 });
 it('a bar is eligible only once its session closed at the cutoff: intraday and midnight cutoffs never take the unfinished end bar (P1-07)',async()=>{
  // 2026-01-20 is the 5th session after base; the US close that day is 21:00Z (EST).
  for(const now of ['2026-01-20T00:00:00.000Z','2026-01-20T15:00:00.000Z','2026-01-20T20:59:59.999Z']){
   const r=await run(judgment(),[ZZA],{now}).result;
   expect({now,r}).toEqual({now,r:{status:'pending',reason:'awaiting_bars',estimated_at:'2026-01-17T21:00:00.000Z'}});
  }
  const closed=await run(judgment(),[ZZA],{now:'2026-01-20T21:00:00.000Z'}).result;
  expect(closed).toMatchObject({status:'resolved',value:111/106-1,to:'2026-01-20',label_available_at:'2026-01-20T21:00:00.000Z'});
  if(closed.status!=='resolved')throw new Error(closed.status);
  expect((closed.evidence as unknown as Ev).bars.at(-1)!.date).toBe('2026-01-20');               // nothing after the cutoff in the evidence
  // with a benchmark both closes must have passed
  const bench=judgment({benchmark:{ticker:'ZZB',market:'US'}});
  expect((await run(bench,[ZZA,ZZB],{now:'2026-01-20T15:00:00.000Z'}).result).status).toBe('pending');
 });
 it('date target: end = first bar on or after target.date (holiday → next session); window to = date + 20 d',async()=>{
  const {calls,result}=run(judgment({targetDate:'2026-01-19'}),[ZZA]);
  expect(await result).toMatchObject({status:'resolved',value:111/106-1,to:'2026-01-20'});
  expect(calls[0]).toMatchObject({from:'2026-01-02',to:'2026-02-08'});
 });
 it('date target without an end bar: Pending before `to`, Unavailable(empty) once `to` has passed',async()=>{
  const short=truncateFixture(ZZA,'2026-01-16');
  expect((await run(judgment({targetDate:'2026-01-19'}),[short],{now:'2026-02-01T00:00:00.000Z'}).result).status).toBe('pending');
  expect(await run(judgment({targetDate:'2026-01-19'}),[short],{now:'2026-02-09T00:00:00.000Z'}).result).toEqual({status:'unavailable',failure:'empty'});
 });
 it('no bar on base_date → Inconsistent(base_bar_missing) with the bars near base and a hash of the evidence',async()=>{
  const r=await run(judgment({baseDate:'2026-01-19',registeredClose:110}),[ZZA]).result;
  if(r.status!=='inconsistent')throw new Error(r.status);
  expect(r.reason_code).toBe('settlement_base_bar_missing');
  expect(r.detail).toMatchObject({base_date:'2026-01-19',series_from:'2026-01-09',series_to:'2026-02-06'});
  expect((r.detail.bars_near_base as {date:string}[]).map(b=>b.date)).toEqual(['2026-01-14','2026-01-15','2026-01-16','2026-01-20','2026-01-21','2026-01-22','2026-01-23']);
  expect(r.evidence_hash).toBe(digest(r.evidence));
 });
 it('basis check: 0.47 % passes, 0.93 % → Inconsistent(basis_mismatch) carrying the complete evidence and result',async()=>{
  expect((await run(judgment({registeredClose:106.5}),[ZZA]).result).status).toBe('resolved');
  const r=await run(judgment({registeredClose:107}),[ZZA]).result;
  if(r.status!=='inconsistent')throw new Error(r.status);
  expect(r.reason_code).toBe('settlement_basis_mismatch');
  expect(r.detail).toMatchObject({registered_bar:{close:107,date:'2026-01-12'},refetched_bar:{date:'2026-01-12',close:106},source:'eastmoney'});
  expect((r.evidence as unknown as Ev).result.value).toBe(111/106-1);
  expect((r.evidence as unknown as Ev).bars).toHaveLength(11);
  expect(r.evidence_hash).toBe(digest(r.evidence));
 });
 it('benchmark: aligned on the same bar dates, r_rel = (1 + r)/(1 + r_b) − 1; a missing benchmark date → Inconsistent(benchmark_gap)',async()=>{
  const r=await run(judgment({benchmark:{ticker:'ZZB',market:'US'}}),[ZZA,ZZB]).result;
  if(r.status!=='resolved')throw new Error(r.status);
  expect(r.value).toBeCloseTo((111/106)/(55.5/53)-1,12);
  expect((r.evidence as unknown as Ev).benchmark_bars).toHaveLength(11);
  const gap={...ZZB,bars:ZZB.bars.filter(b=>b.time!=='2026-01-14')};
  const g=await run(judgment({benchmark:{ticker:'ZZB',market:'US'}}),[ZZA,gap]).result;
  if(g.status!=='inconsistent')throw new Error(g.status);
  expect(g).toMatchObject({reason_code:'settlement_benchmark_gap',detail:{missing_dates:['2026-01-14']}});
 });
 it('capability not verified (main or benchmark) → Unavailable(adjustment_unsupported) before any read',async()=>{
  const calls:KlineRangeRequest[]=[];
  const j=judgment();
  const ctx=(benchOnly:boolean):ResolveContext=>({judgment:benchOnly?judgment({benchmark:{ticker:'ZZB',market:'HK'}}):j,cutoff:NOW,now:NOW,inputsDb:stubInputsDb({kline:fixtureKline([ZZA,ZZB],calls)}),signal:new AbortController().signal});
  expect(await priceReturnResolverWith({capabilityOf:unverifiedCapability}).resolve(ctx(false))).toEqual({status:'unavailable',failure:'adjustment_unsupported'});
  const hkUnverified=priceReturnResolverWith({capabilityOf:((_s:unknown,m:unknown)=>m==='HK'?null:{status:'verified',evidence:'fixtures/judgments/kline/synthetic-us-zzb.json',verified_at:'2026-11-06'}) as unknown as CapabilityLookup});
  expect(await hkUnverified.resolve(ctx(true))).toEqual({status:'unavailable',failure:'adjustment_unsupported'});
  expect(calls).toHaveLength(0);
 });
 it('end bar missing and the issuer has no primary security any more → Unavailable(delisted)',async()=>{
  const short=truncateFixture(ZZA,'2026-01-16');
  expect(await run(judgment(),[short],{primary:null}).result).toEqual({status:'unavailable',failure:'delisted'});
  expect((await run(judgment(),[ZZA],{primary:null}).result).status).toBe('resolved');   // a settleable judgment is never voided by a later delisting
 });
 it('DataGateway close-only: evidence keeps close only (others null, fields_present [close]) and origin.transform close_only',async()=>{
  const j=judgment({ticker:'ZZ0001',market:'A',source:'datagateway',registeredClose:10.5,closeOnly:true});
  const r=await run(j,[ZZC],{primary:{ticker:'ZZ0001',market:'A'}}).result;
  if(r.status!=='resolved')throw new Error(r.status);
  expect(r).toMatchObject({to:'2026-01-19',label_available_at:'2026-01-19T07:00:00.000Z'});
  expect(r.value).toBeCloseTo(11/10.5-1,12);
  const ev=r.evidence as unknown as Ev;
  expect(ev.bars.every(b=>b.open===null&&b.fields_present.length===1&&b.fields_present[0]==='close')).toBe(true);
  expect(ev.origin?.transform).toBe('close_only');
 });
 it('provider failures surface as Unavailable(<failure>); an empty series is Unavailable(empty)',async()=>{
  const j=judgment();
  const ctx=(kline:ResolveContext['inputsDb']['kline']):ResolveContext=>({judgment:j,cutoff:NOW,now:NOW,inputsDb:stubInputsDb({kline}),signal:new AbortController().signal});
  expect(await resolver.resolve(ctx(async()=>({failure:'rate_limited'})))).toEqual({status:'unavailable',failure:'rate_limited'});
  expect(await resolver.resolve(ctx(async()=>({source:'eastmoney',adjustment:'qfq',volumeUnit:'shares',bars:[]})))).toEqual({status:'unavailable',failure:'empty'});
 });
 it('fromOverride(accept_refetched) settles from the frozen evidence without reads; tampered evidence or another verdict kind throws',async()=>{
  const j=judgment({registeredClose:107});
  const inc=await run(j,[ZZA]).result;
  if(inc.status!=='inconsistent')throw new Error(inc.status);
  const override={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched' as const,evidence_hash:inc.evidence_hash,evidence:inc.evidence},evidence_hash:inc.evidence_hash,resolved_by:'9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',at:NOW,cutoff:NOW};
  const r=resolver.fromOverride(j,override);
  expect(r).toMatchObject({status:'resolved',value:111/106-1,from:'2026-01-12',to:'2026-01-20',label_available_at:'2026-01-20T21:00:00.000Z',evidence:{override:{reason_code:'settlement_basis_mismatch',evidence_hash:inc.evidence_hash}}});
  const codeOf=(f:()=>unknown)=>{try{f();}catch(e){return (e as {code?:string}).code;}return 'no_throw';};
  expect(codeOf(()=>resolver.fromOverride(j,{...override,resolution:{...override.resolution,evidence:{...inc.evidence,bars:[]}}}))).toBe('override_mismatch');
  expect(codeOf(()=>resolver.fromOverride(j,{...override,resolution:{kind:'choose_fact',chosen:{}}}))).toBe('override_mismatch');
  expect(resolver.version).toBe(PRICE_RESOLVER_VERSION);
 });
});
