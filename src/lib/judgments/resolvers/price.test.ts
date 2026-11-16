// src/lib/judgments/resolvers/price.test.ts
// F4 Task 11 (spec §7.3 row 1, §7.4, §14.1 price_return bullets) over the synthetic fixtures: session_index end and
// forward paging, date end, benchmark same-date alignment and benchmark_gap, base_bar_missing, basis_mismatch on
// both sides of 0.5 %, capability gate, delisted, close-only evidence, provider failure, evidence shape, and the
// accept_refetched override path.
import {describe,expect,it} from 'vitest';
import {digest} from '../canonical';
import type {JudgmentRow,KlineRangeRequest,QuarantineOverride,ResolveContext} from '../types';
import {fixtureKline,loadKlineFixture,priceJudgment,stubInputsDb,truncateFixture,unverifiedCapability,verifiedCapability} from '../testing/fixtures';
import type {KlineFixture,PriceJudgmentSpec} from '../testing/fixtures';
import {PRICE_RESOLVER_VERSION,priceReturnResolverWith} from './price';
import type {CapabilityLookup} from './price';

const ZZA=loadKlineFixture('synthetic-us-zza.json'),ZZB=loadKlineFixture('synthetic-us-zzb.json'),ZZC=loadKlineFixture('synthetic-a-zz0001-close-only.json');
const NOW='2026-03-02T04:00:00.000Z';
const resolver=priceReturnResolverWith({capabilityOf:verifiedCapability});
const judgment=(s:Partial<PriceJudgmentSpec>={})=>priceJudgment({baseDate:'2026-01-12',registeredClose:106,batchId:'00000000-0000-4000-8000-000000000001',...s}).row;
type Sec={ticker:string;market:'US'|'A'|'HK'}|null;
function run(j:JudgmentRow,fixtures:KlineFixture[],o:{now?:string;primary?:Sec|((on:string)=>Sec)}={}){
 const calls:KlineRangeRequest[]=[];
 const inputsDb=stubInputsDb({kline:fixtureKline(fixtures,calls),issuerPrimarySecurity:async (_i,on)=>o.primary===undefined?{ticker:'ZZA',market:'US'}:typeof o.primary==='function'?o.primary(on):o.primary});
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
  const pre=['2025-12-08','2025-12-09','2025-12-10','2025-12-11','2025-12-12','2025-12-15','2025-12-16'].map(time=>({time,open:95,high:96,low:94,close:95,volume:1000}));
  const ext:KlineFixture={...ZZA,bars:[...pre,...ZZA.bars]};
  const {calls,result}=run(judgment({baseDate:'2026-01-05',registeredClose:101}),[ext]);
  const r=await result;
  if(r.status!=='resolved')throw new Error(JSON.stringify(r));
  expect(calls.map(c=>[c.from,c.to])).toEqual([['2025-12-26','2026-01-23'],['2025-12-06','2025-12-25']]);
  expect(r.value).toBe(106/101-1);
  const ev=r.evidence as unknown as Ev;
  expect(ev.from).toBe('2025-12-06');
  expect(ev.bars).toHaveLength(11);
 });
 it('S-04: fewer than 5 pre-base bars after paging: Pending while the base is recent, Unavailable(insufficient_history) once it is not',async()=>{
  const young:KlineFixture={...ZZA,bars:ZZA.bars.filter(b=>b.time>='2026-01-05')};
  const j=judgment({baseDate:'2026-01-07',registeredClose:103});
  expect((await run(j,[young],{now:'2026-01-20T22:00:00.000Z'}).result).status).toBe('pending');
  expect(await run(j,[young]).result).toEqual({status:'unavailable',failure:'insufficient_history'});
 });
 it('S-05: duplicate or descending bar dates from any kline implementation → Unavailable(invalid_data)',async()=>{
  const dup:KlineFixture={...ZZA,bars:[...ZZA.bars,{...ZZA.bars[3]}]};
  expect(await run(judgment(),[dup]).result).toEqual({status:'unavailable',failure:'invalid_data'});
  const desc:KlineFixture={...ZZA,bars:[...ZZA.bars].reverse()};
  expect(await run(judgment(),[desc]).result).toEqual({status:'unavailable',failure:'invalid_data'});
  const gap=judgment({benchmark:{ticker:'ZZB',market:'US'}});
  expect(await run(gap,[ZZA,{...ZZB,bars:[...ZZB.bars,{...ZZB.bars[3]}]}]).result).toEqual({status:'unavailable',failure:'invalid_data'});
 });
 it('S-03: the base input must be ONE registered price_bar of the same ticker, market, date, source AND adjustment — never a fallback',async()=>{
  const j=judgment();
  const bar=j.inputs[0] as Extract<JudgmentRow['inputs'][number],{kind:'price_bar'}>;
  const hfq={...bar,ref:{...bar.ref,adjustment:'hfq' as const},snapshot:{...bar.snapshot,adjustment:'hfq' as const}};
  const src={...bar,ref:{...bar.ref,source:'sina' as const},snapshot:{...bar.snapshot,source:'sina' as const}};
  for(const inputs of [[hfq],[src],[],[bar,{...bar,hash:'x'}]])
   expect({n:inputs.length,r:await run({...j,inputs},[ZZA]).result}).toEqual({n:inputs.length,r:{status:'unavailable',failure:'base_input_missing'}});
  expect((await run(j,[ZZA]).result).status).toBe('resolved');
 });
 it('S-06: delisting is judged on the frozen ticker: the primary security at the target date is no longer it, or none',async()=>{
  const short=truncateFixture(ZZA,'2026-01-16');
  const oldNew=(on:string):Sec=>on<'2026-01-15'?{ticker:'ZZA',market:'US'}:{ticker:'ZZANEW',market:'US'};
  expect(await run(judgment(),[short],{primary:oldNew}).result).toEqual({status:'unavailable',failure:'delisted'});
  expect(await run(judgment(),[short],{primary:on=>on<'2026-01-15'?{ticker:'ZZA',market:'US'}:null}).result).toEqual({status:'unavailable',failure:'delisted'});
  // the frozen ticker was never the primary (dual listing): its absence of bars is not a delisting
  expect((await run(judgment(),[short],{primary:{ticker:'OTHER',market:'US'}}).result).status).toBe('pending');
  expect((await run(judgment(),[short],{primary:{ticker:'ZZA',market:'US'}}).result).status).toBe('pending');
  expect((await run(judgment(),[ZZA],{primary:oldNew}).result).status).toBe('resolved');
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
  const hkUnverified=priceReturnResolverWith({capabilityOf:((_s:unknown,m:unknown)=>m==='HK'?null:{status:'verified',evidence:'fixtures/judgments/kline-synthetic/synthetic-us-zzb.json',verified_at:'2026-11-06'}) as unknown as CapabilityLookup});
  expect(await hkUnverified.resolve(ctx(true))).toEqual({status:'unavailable',failure:'adjustment_unsupported'});
  expect(calls).toHaveLength(0);
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
 it('S-01: fromOverride never trusts a stored result; it validates the frozen evidence and recomputes r',async()=>{
  const j=judgment({registeredClose:107});
  const inc=await run(j,[ZZA]).result;
  if(inc.status!=='inconsistent')throw new Error(inc.status);
  const codeOf=(f:()=>unknown)=>{try{f();}catch(e){return (e as {code?:string}).code;}return 'no_throw';};
  const mk=(ev:Record<string,unknown>,over:Partial<QuarantineOverride>={}):QuarantineOverride=>{const h=digest(ev);return {reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:h,evidence:ev},evidence_hash:h,resolved_by:'9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',at:NOW,cutoff:NOW,...over};};
  const ev=inc.evidence as Record<string,unknown>&{bars:{close:number}[];result:Record<string,unknown>};
  expect(resolver.fromOverride(j,mk(ev))).toMatchObject({status:'resolved',value:111/106-1});
  // the counterexample: a forged result, re-hashed so the hash binds the forgery
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,result:{...ev.result,value:0.9}})))).toBe('override_mismatch');
  // forged bars with a consistent bars_sha256 and a result matching the forged bars are still caught by the bar checks (end beyond cutoff / identity)
  expect(codeOf(()=>resolver.fromOverride(j,mk(ev,{evidence_hash:'0'.repeat(64)})))).toBe('override_mismatch');                 // outer hash differs
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,bars:ev.bars.map((b,i)=>i===10?{...b,close:222}:b)})))).toBe('override_mismatch'); // bars_sha256 stale
  const forgedBars=ev.bars.map((b,i)=>i===10?{...b,close:222}:b);
  const f2={...ev,bars:forgedBars,bars_sha256:digest(forgedBars)};
  expect(codeOf(()=>resolver.fromOverride(j,mk(f2)))).toBe('override_mismatch');                                               // stored result no longer matches the recomputation
  const f3={...f2,result:{...ev.result,value:222/106-1,r:222/106-1}};
  const forged=resolver.fromOverride(j,mk(f3));                                                                                  // internally consistent bars: the value is the RECOMPUTED one
  expect(forged).toMatchObject({status:'resolved',value:222/106-1});
  for(const bad of [{ticker:'ZZB'},{market:'HK'},{source:'sina'},{adjustment:'hfq'},{base_date:'2026-01-13'}])
   expect({bad,c:codeOf(()=>resolver.fromOverride(j,mk({...ev,...bad})))}).toEqual({bad,c:'override_mismatch'});
  const dupBars=[...ev.bars,ev.bars[10]];
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,bars:dupBars,bars_sha256:digest(dupBars)})))).toBe('override_mismatch');
  const noBase=ev.bars.filter((_,i)=>i!==5);
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,bars:noBase,bars_sha256:digest(noBase)})))).toBe('override_mismatch');
  const short=ev.bars.slice(2);
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,bars:short,bars_sha256:digest(short)})))).toBe('override_mismatch');        // fewer than 5 pre-base bars
  expect(codeOf(()=>resolver.fromOverride(j,mk(ev,{cutoff:'2026-01-20T20:59:59.999Z'})))).toBe('override_mismatch');                // end bar not closed at the override cutoff
  expect(codeOf(()=>priceReturnResolverWith({capabilityOf:unverifiedCapability}).fromOverride(j,mk(ev)))).toBe('override_mismatch');
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,registered_bar:{...(ev.registered_bar as object),close:1}})))).toBe('override_mismatch');
 });
 it('S-01 benchmark: benchmark bars must sit on the same dates and replay r_rel',async()=>{
  const j=judgment({registeredClose:107,benchmark:{ticker:'ZZB',market:'US'}});
  const inc=await run(j,[ZZA,ZZB]).result;
  if(inc.status!=='inconsistent')throw new Error(inc.status);
  const ev=inc.evidence as Record<string,unknown>&{benchmark_bars:{date:string}[]};
  const mk=(e:Record<string,unknown>):QuarantineOverride=>{const h=digest(e);return {reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:h,evidence:e},evidence_hash:h,resolved_by:'r',at:NOW,cutoff:NOW};};
  expect(resolver.fromOverride(j,mk(ev))).toMatchObject({status:'resolved'});
  const moved=ev.benchmark_bars.slice(1);
  const codeOf=(f:()=>unknown)=>{try{f();}catch(e){return (e as {code?:string}).code;}return 'no_throw';};
  expect(codeOf(()=>resolver.fromOverride(j,mk({...ev,benchmark_bars:moved,benchmark_bars_sha256:digest(moved)})))).toBe('override_mismatch');
  const {benchmark_bars:_b,benchmark_bars_sha256:_h,...noBench}=ev;
  expect(codeOf(()=>resolver.fromOverride(j,mk(noBench)))).toBe('override_mismatch');
 });
 it('S2-01: a backward page failing with empty adds zero bars: the insufficient_history rule applies, not Unavailable(empty)',async()=>{
  const young:KlineFixture={...ZZA,bars:ZZA.bars.filter(b=>b.time>='2026-01-05')};
  const j=judgment({baseDate:'2026-01-07',registeredClose:103});
  const kline=(inner:ResolveContext['inputsDb']['kline']):ResolveContext['inputsDb']['kline']=>async r=>r.to<'2026-01-02'?{failure:'empty'}:inner(r);
  const go=(now:string)=>resolver.resolve({judgment:j,cutoff:now,now,inputsDb:stubInputsDb({kline:kline(fixtureKline([young])),issuerPrimarySecurity:async()=>({ticker:'ZZA',market:'US'})}),signal:new AbortController().signal});
  expect(await go('2026-01-20T22:00:00.000Z')).toEqual({status:'pending',reason:'insufficient_history'});
  expect(await go(NOW)).toEqual({status:'unavailable',failure:'insufficient_history'});
 });
 it('S2-02: delisting looks at the frozen ticker at the scan window end `to`, not at base + n calendar days',async()=>{
  const short=truncateFixture(ZZA,'2026-01-16');
  // OLD disappears Jan 19; the fifth session after base is Jan 20 (Jan 17/18 weekend, no calendar): base + 5 days = Jan 17 would still see OLD
  const gone19=(on:string):Sec=>on<'2026-01-19'?{ticker:'ZZA',market:'US'}:{ticker:'ZZANEW',market:'US'};
  expect(await run(judgment(),[short],{primary:gone19}).result).toEqual({status:'unavailable',failure:'delisted'});
  // it disappears only after the scan window: still waiting for bars
  const late=(on:string):Sec=>on<'2026-03-01'?{ticker:'ZZA',market:'US'}:null;
  expect((await run(judgment(),[short],{primary:late}).result).status).toBe('pending');
 });
 it('S2-03: the registered base snapshot must carry the same identity as its ref and the condition (qfq ref, hfq snapshot → base_input_missing / override_mismatch)',async()=>{
  const j=judgment({registeredClose:107});
  const bar=j.inputs[0] as Extract<JudgmentRow['inputs'][number],{kind:'price_bar'}>;
  for(const snap of [{adjustment:'hfq' as const},{source:'sina' as const},{ticker:'ZZB'},{market:'HK' as const},{date:'2026-01-13'}]){
   const bent={...j,inputs:[{...bar,snapshot:{...bar.snapshot,...snap}}]};
   expect({snap,r:await run(bent,[ZZA]).result}).toEqual({snap,r:{status:'unavailable',failure:'base_input_missing'}});
  }
  const inc=await run(j,[ZZA]).result;
  if(inc.status!=='inconsistent')throw new Error(inc.status);
  const h=digest(inc.evidence);
  const o:QuarantineOverride={reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:h,evidence:inc.evidence},evidence_hash:h,resolved_by:'r',at:NOW,cutoff:NOW};
  const bent={...j,inputs:[{...bar,snapshot:{...bar.snapshot,adjustment:'hfq' as const}}]};
  let code:string|undefined;try{resolver.fromOverride(bent,o);}catch(e){code=(e as {code?:string}).code;}
  expect(code).toBe('override_mismatch');
 });
});
