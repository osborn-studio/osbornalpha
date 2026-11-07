// src/lib/judgments/resolvers/price.ts
// price_return resolver (spec §7.3 row 1, §7.4). r = close[end] / close[base] − 1 on the FROZEN source/adjustment
// (never the environment's provider choice, audit G16). Window [base_date − 10 d, to]: session_index to =
// base_date + ceil(n × 1.52) + 10 d, date to = target.date + 20 d. No bar on base_date → Inconsistent(base_bar_missing);
// fewer than 5 bars before base → one backward page of 20 d; session_index end = base + n (one forward page from
// `to`, still short → Pending); date end = first bar ≥ target.date (none → Pending, none after `to` has passed →
// Unavailable(empty)). A benchmark is read on the same window and aligned on the SAME bar dates (any missing →
// Inconsistent(benchmark_gap)), r_rel = (1 + r) / (1 + r_b) − 1. Registered vs refetched base close differing by
// more than 0.5 % → Inconsistent(basis_mismatch) whose evidence is the complete would-be settlement evidence
// (incl. `result`), so an accept_refetched override settles from it without refetching (§7.6). Capability entries
// not 'verified' → Unavailable(adjustment_unsupported) (O6); an issuer subject with no primary security while the
// end bar is still missing → Unavailable(delisted) (§12.4). Evidence bars: 5 before base through end (≥ n + 6 when
// the provider has them), bars_sha256 = digest(bars); DataGateway close-only bars keep close only (audit G27).
// Cutoff (plan audit P1-07): a bar exists for this resolution only once its session has closed at the cutoff —
// closeInstantUtc(bar.time, market) ≤ cutoff (with a benchmark: both markets closed) — so a provider's current,
// unfinished daily bar can never become a permanent end bar.
import type {KlineSourceName,SourceKlineBar,SourceKlineSeries} from '@/lib/data/kline/types';
import {digest} from '../canonical';
import {JudgmentError} from '../errors';
import {addDaysIso,closeInstantUtc} from '../time';
import type {Input,JudgmentRow,KlineFailure,PriceMarket,PriceReturnParams,QuarantineOverride,Resolver,ResolverResult,ResolveContext,Target} from '../types';
import {capabilityOf} from './price-capabilities';
import {validatePriceReturnParams} from './schemas';

export const PRICE_RESOLVER_VERSION='price_return/1';
/** Policy constant (plan 1 identity tolerance): same source, same basis should agree almost exactly (spec §7.4). */
export const BASIS_TOLERANCE=0.005;
export const PRE_BASE_BARS=5;
/** Main + benchmark series, each bounded by the slowest provider path: Eastmoney US multi-prefix tries (3 × 5 s) vs DataGateway 7 s (spec §7.1). */
export const PRICE_MAX_FETCH_MS=2*15_000;
const SESSION_DAYS=1.52,LEAD_DAYS=10,TAIL_DAYS=10,DATE_TAIL_DAYS=20,BACK_PAGE_DAYS=20,NEAR_BASE_DAYS=5,RECENT_BASE_DAYS=30;
const FULL_FIELDS=['open','high','low','close','volume'];

export type CapabilityLookup=typeof capabilityOf;
export interface EvidenceBar{date:string;open:number|null;high:number|null;low:number|null;close:number;volume:number|null;amount:number|null;fields_present:string[]}
export interface PriceResult{value:number;r:number;r_benchmark:number|null;from:string;to:string;label_available_at:string}
type PriceBarInput=Extract<Input,{kind:'price_bar'}>;
type InconsistentCode=Extract<ResolverResult,{status:'inconsistent'}>['reason_code'];

const isFailure=(x:SourceKlineSeries|KlineFailure):x is KlineFailure=>'failure' in x;
const byTime=(a:SourceKlineBar,b:SourceKlineBar)=>a.time<b.time?-1:a.time>b.time?1:0;
const merge=(a:SourceKlineBar[],b:SourceKlineBar[])=>{const m=new Map<string,SourceKlineBar>();for(const x of [...a,...b])if(!m.has(x.time))m.set(x.time,x);return [...m.values()].sort(byTime);};
const maxIso=(xs:string[])=>xs.reduce((m,x)=>x>m?x:m);
const unavailable=(failure:string):ResolverResult=>({status:'unavailable',failure});
const inconsistent=(reason_code:InconsistentCode,detail:Record<string,unknown>,evidence:Record<string,unknown>):ResolverResult=>({status:'inconsistent',reason_code,detail,evidence,evidence_hash:digest(evidence)});
const validate=(p:unknown):p is PriceReturnParams=>validatePriceReturnParams(p);

/** Read window (spec §7.3); null for target kinds price_return does not settle. */
export function priceWindow(p:PriceReturnParams,t:Target):{from:string;to:string}|null{
 const from=addDaysIso(p.base_date,-LEAD_DAYS);
 if(t.kind==='session_index')return {from,to:addDaysIso(p.base_date,Math.ceil(t.n*SESSION_DAYS)+TAIL_DAYS)};
 if(t.kind==='date')return {from,to:addDaysIso(t.date,DATE_TAIL_DAYS)};
 return null;
}
/** The registered price_bar input of the base date (spec §7.4 basis check); null when the judgment froze none. */
export function registeredBase(j:JudgmentRow,p:PriceReturnParams):PriceBarInput|null{
 const hits=j.inputs.filter((i):i is PriceBarInput=>i.kind==='price_bar'&&i.ref.ticker===p.ticker&&i.ref.market===p.market&&i.ref.date===p.base_date&&i.ref.source===p.source&&i.ref.adjustment===p.adjustment);
 const ok=(h:PriceBarInput)=>{const q=h.snapshot;return !!q&&q.ticker===h.ref.ticker&&q.market===h.ref.market&&q.date===h.ref.date&&q.source===h.ref.source&&q.adjustment===h.ref.adjustment&&q.ticker===p.ticker&&q.market===p.market&&q.date===p.base_date&&q.source===p.source&&q.adjustment===p.adjustment&&Number.isFinite(q.close)&&q.close>0;};   // S2-03: the frozen snapshot carries the identity of its ref and of the condition
 return hits.length===1&&ok(hits[0])?hits[0]:null;   // S-03: exactly one registered base of the condition's own source and adjustment; never a fallback
}
/** DataGateway's close-only branch synthesises open=high=low=close and volume=0. */
const closeOnlyBar=(source:KlineSourceName,b:SourceKlineBar)=>source==='datagateway'&&b.volume===0&&b.open===b.close&&b.high===b.close&&b.low===b.close;
export function evidenceBar(b:SourceKlineBar,closeOnly:boolean):EvidenceBar{
 if(closeOnly)return {date:b.time,open:null,high:null,low:null,close:b.close,volume:null,amount:null,fields_present:['close']};
 return {date:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,amount:b.amount??null,fields_present:b.amount===undefined?FULL_FIELDS:[...FULL_FIELDS,'amount']};
}

/** S-06 / S2-02 / spec §12.4: no end bar exists. The frozen ticker was the issuer's primary security at the base date and by the end
 *  of the scan window `to` (the date bound the read used; there is no exchange calendar, O4) the issuer's primary is another ticker
 *  or none (OLD -> NEW listing change). A frozen ticker that was never primary (dual listing) is never judged delisted from the
 *  primary alone. */
async function frozenTickerDelisted(ctx:ResolveContext,p:PriceReturnParams,scanEnd:string):Promise<boolean>{
 const j=ctx.judgment;
 const at=(s:{ticker:string;market:PriceMarket}|null)=>s!==null&&s.ticker===p.ticker&&s.market===p.market;
 if(!at(await ctx.inputsDb.issuerPrimarySecurity(j.subject_key,p.base_date)))return false;
 return !at(await ctx.inputsDb.issuerPrimarySecurity(j.subject_key,scanEnd));
}

export function priceReturnResolverWith(opts:{capabilityOf:CapabilityLookup}):Resolver{
 const labelAvailableAt=(params:unknown,target:Target):string|null=>{
  if(!validate(params))return null;
  if(target.kind==='session_index')return closeInstantUtc(addDaysIso(params.base_date,target.n),params.market);
  if(target.kind==='date')return closeInstantUtc(target.date,params.market);
  return null;
 };
 async function resolve(ctx:ResolveContext):Promise<ResolverResult>{
  const j=ctx.judgment,c=j.condition,t=j.target;
  if(!c||c.resolver!=='price_return'||!t||!validate(c.params))return unavailable('invalid_condition');
  const p=c.params;
  if(t.kind==='session_index'&&t.base_date!==p.base_date)return unavailable('invalid_condition');
  const w=priceWindow(p,t);
  if(!w)return unavailable('invalid_condition');
  const capMain=opts.capabilityOf(p.source,p.market,p.adjustment);
  const capBench=p.benchmark?opts.capabilityOf(p.source,p.benchmark.market,p.adjustment):null;
  if(capMain?.status!=='verified'||(p.benchmark&&capBench?.status!=='verified'))return unavailable('adjustment_unsupported');
  const registered=registeredBase(j,p);
  if(!registered)return unavailable('base_input_missing');
  // P1-07: only bars whose session has closed at the cutoff are eligible (both markets when there is a benchmark).
  const closedBy=(date:string)=>closeInstantUtc(date,p.market)<=ctx.cutoff&&(!p.benchmark||closeInstantUtc(date,p.benchmark.market)<=ctx.cutoff);
  const read=async(ticker:string,market:PriceMarket,from:string,to:string):Promise<SourceKlineBar[]|KlineFailure>=>{
   const r=await ctx.inputsDb.kline({ticker,market,adjustment:p.adjustment,source:p.source,from,to,signal:ctx.signal});
   if(isFailure(r))return r;
   for(let i=0;i<r.bars.length;i++)if(typeof r.bars[i].time!=='string'||(i>0&&!(r.bars[i-1].time<r.bars[i].time)))return {failure:'invalid_data'};   // S-05: unique, strictly ascending
   return r.bars.filter(b=>closedBy(b.time));
  };
  let from=w.from,to=w.to;
  const first=await read(p.ticker,p.market,from,to);
  if(!Array.isArray(first))return unavailable(first.failure);
  let bars=first;
  if(bars.length===0)return unavailable('empty');
  const regCloseOnly=registered.snapshot.fields_present.length===1&&registered.snapshot.fields_present[0]==='close';
  const closeOnly=(b:SourceKlineBar)=>regCloseOnly||closeOnlyBar(p.source,b);
  let baseIdx=bars.findIndex(b=>b.time===p.base_date);
  if(baseIdx<0){
   const near=bars.filter(b=>b.time>=addDaysIso(p.base_date,-NEAR_BASE_DAYS)&&b.time<=addDaysIso(p.base_date,NEAR_BASE_DAYS)).map(b=>evidenceBar(b,closeOnly(b)));
   return inconsistent('settlement_base_bar_missing',{base_date:p.base_date,series_from:bars[0].time,series_to:bars[bars.length-1].time,bars_near_base:near},
    {source:p.source,adjustment:p.adjustment,ticker:p.ticker,market:p.market,from,to,base_date:p.base_date,bars:bars.map(b=>evidenceBar(b,closeOnly(b))),fetched_at:ctx.now});
  }
  if(baseIdx<PRE_BASE_BARS){
   const backFrom=addDaysIso(from,-BACK_PAGE_DAYS);
   const back=await read(p.ticker,p.market,backFrom,addDaysIso(from,-1));
   if(!Array.isArray(back)&&back.failure!=='empty')return unavailable(back.failure);   // S2-01: empty = zero additional pre-base bars
   from=backFrom;bars=merge(Array.isArray(back)?back:[],bars);baseIdx=bars.findIndex(b=>b.time===p.base_date);
  }
  if(baseIdx<PRE_BASE_BARS){
   // S-04: the evidence needs PRE_BASE_BARS bars before the base (n + 6 in all); a young listing may still be catching up at the provider.
   return ctx.now.slice(0,10)<=addDaysIso(p.base_date,RECENT_BASE_DAYS)?{status:'pending',reason:'insufficient_history'}:unavailable('insufficient_history');
  }
  const endIdxOf=()=>t.kind==='session_index'?(baseIdx+t.n<bars.length?baseIdx+t.n:-1):t.kind==='date'?bars.findIndex(b=>b.time>=t.date):-1;
  let endIdx=endIdxOf();
  if(endIdx<0&&t.kind==='session_index'){
   const nextTo=addDaysIso(to,Math.ceil(t.n*SESSION_DAYS)+TAIL_DAYS);
   const fwd=await read(p.ticker,p.market,addDaysIso(to,1),nextTo);
   if(!Array.isArray(fwd)&&fwd.failure!=='empty')return unavailable(fwd.failure);   // nothing printed after `to` yet
   to=nextTo;bars=merge(bars,Array.isArray(fwd)?fwd:[]);endIdx=endIdxOf();
  }
  if(endIdx<0){
   if(j.subject_type==='issuer'&&await frozenTickerDelisted(ctx,p,to))return unavailable('delisted');
   if(t.kind==='date'&&ctx.now.slice(0,10)>to)return unavailable('empty');
   const est=labelAvailableAt(p,t);
   return est?{status:'pending',reason:'awaiting_bars',estimated_at:est}:{status:'pending',reason:'awaiting_bars'};
  }
  const baseBar=bars[baseIdx],endBar=bars[endIdx];
  if(!(baseBar.close>0)||!Number.isFinite(endBar.close))return unavailable('invalid_data');
  const slice=bars.slice(Math.max(0,baseIdx-PRE_BASE_BARS),endIdx+1);
  const evBars=slice.map(b=>evidenceBar(b,closeOnly(b)));
  const anyCloseOnly=evBars.some(b=>b.fields_present.length===1);
  const r=endBar.close/baseBar.close-1;
  let rb:number|null=null;let bench:Record<string,unknown>={};
  if(p.benchmark){
   const bb=await read(p.benchmark.ticker,p.benchmark.market,from,to);
   if(!Array.isArray(bb))return unavailable(bb.failure);
   const byDate=new Map(bb.map(b=>[b.time,b]));
   const missing=slice.filter(b=>!byDate.has(b.time)).map(b=>b.time);
   const bEv=slice.flatMap(b=>{const x=byDate.get(b.time);return x?[evidenceBar(x,closeOnlyBar(p.source,x))]:[];});
   bench={benchmark:p.benchmark,benchmark_bars:bEv,benchmark_bars_sha256:digest(bEv)};
   if(missing.length>0)return inconsistent('settlement_benchmark_gap',{missing_dates:missing},
    {source:p.source,adjustment:p.adjustment,ticker:p.ticker,market:p.market,from,to,base_date:p.base_date,end_date:endBar.time,bars:evBars,bars_sha256:digest(evBars),...bench,fetched_at:ctx.now});
   const b0=byDate.get(baseBar.time)!,b1=byDate.get(endBar.time)!;
   if(!(b0.close>0)||!Number.isFinite(b1.close))return unavailable('invalid_data');
   rb=b1.close/b0.close-1;
  }
  const value=rb===null?r:(1+r)/(1+rb)-1;
  const label=maxIso([closeInstantUtc(endBar.time,p.market),...(p.benchmark?[closeInstantUtc(endBar.time,p.benchmark.market)]:[])]);
  const result:PriceResult={value,r,r_benchmark:rb,from:p.base_date,to:endBar.time,label_available_at:label};
  const evidence:Record<string,unknown>={source:p.source,adjustment:p.adjustment,ticker:p.ticker,market:p.market,from,to,base_date:p.base_date,end_date:endBar.time,
   bars:evBars,bars_sha256:digest(evBars),...bench,fetched_at:ctx.now,
   origin:registered?(anyCloseOnly?{...registered.origin,transform:'close_only'}:registered.origin):null,
   capability:{main:capMain,benchmark:capBench},registered_bar:registered?registered.snapshot:null,result};
  if(registered&&Math.abs(registered.snapshot.close-baseBar.close)/registered.snapshot.close>BASIS_TOLERANCE)
   return inconsistent('settlement_basis_mismatch',{registered_bar:registered.snapshot,refetched_bar:evidenceBar(baseBar,closeOnly(baseBar)),source:p.source},evidence);
  return {status:'resolved',value,unit:'ratio',from:p.base_date,to:endBar.time,label_available_at:label,evidence};
 }
 function fromOverride(j:JudgmentRow,o:QuarantineOverride):ResolverResult{
  const bad=(why:string)=>new JudgmentError('override_mismatch',`price_return ${why}`);
  const c=j.condition,t=j.target;
  if(c?.resolver!=='price_return'||!t||!validate(c.params)||o.reason_code!=='settlement_basis_mismatch'||o.resolution.kind!=='accept_refetched')
   throw new JudgmentError('override_mismatch',`price_return cannot apply ${o.resolution.kind} for ${o.reason_code}`);
  const p=c.params,ev=o.resolution.evidence;
  // The hash binds the override to the quarantined evidence and to the incident's hash (S-01); nothing in the evidence is trusted afterwards.
  if(digest(ev)!==o.resolution.evidence_hash||o.evidence_hash!==o.resolution.evidence_hash)throw bad('evidence_hash');
  if(ev.ticker!==p.ticker||ev.market!==p.market||ev.source!==p.source||ev.adjustment!==p.adjustment||ev.base_date!==p.base_date)throw bad('identity');
  const capMain=opts.capabilityOf(p.source,p.market,p.adjustment);
  const capBench=p.benchmark?opts.capabilityOf(p.source,p.benchmark.market,p.adjustment):null;
  if(capMain?.status!=='verified'||(p.benchmark&&capBench?.status!=='verified'))throw bad('capability');
  const registered=registeredBase(j,p);
  if(!registered||digest(ev.registered_bar)!==digest(registered.snapshot))throw bad('registered_bar');
  const barsOk=(x:unknown):x is EvidenceBar[]=>Array.isArray(x)&&x.every(b=>!!b&&typeof b==='object'&&typeof (b as EvidenceBar).date==='string'&&typeof (b as EvidenceBar).close==='number'&&Number.isFinite((b as EvidenceBar).close))
   &&x.every((b,i)=>i===0||(x[i-1] as EvidenceBar).date<(b as EvidenceBar).date);
  const bars=ev.bars;
  if(!barsOk(bars)||digest(bars)!==ev.bars_sha256)throw bad('bars');
  const baseIdx=bars.findIndex(b=>b.date===p.base_date);
  if(baseIdx<PRE_BASE_BARS)throw bad('base_or_history');   // base present and >= 5 bars before it (n + 6 in all)
  const endIdx=bars.length-1;
  const end=bars[endIdx];
  if(t.kind==='session_index'){if(t.base_date!==p.base_date||endIdx!==baseIdx+t.n)throw bad('end_index');}
  else if(t.kind==='date'){const first=bars.findIndex(b=>b.date>=t.date);if(first!==endIdx||first<=baseIdx)throw bad('end_date');}
  else throw bad('target');
  if(ev.end_date!==end.date)throw bad('end_date');
  const main=bars[baseIdx];
  if(!(main.close>0))throw bad('base_close');
  let rb:number|null=null;
  let label=closeInstantUtc(end.date,p.market);
  const closes=[closeInstantUtc(end.date,p.market)];
  if(p.benchmark){
   const bb=ev.benchmark_bars;
   if(JSON.stringify(ev.benchmark)!==JSON.stringify(p.benchmark)||!barsOk(bb)||digest(bb)!==ev.benchmark_bars_sha256)throw bad('benchmark_bars');
   // aligned on the very same dates as the main window (P1: a benchmark bar missing for any date is a gap, never settled)
   const mainRange=bars.slice(Math.max(0,baseIdx-PRE_BASE_BARS)).map(b=>b.date);
   if(bb.length!==mainRange.length||bb.some((b,i)=>b.date!==mainRange[i]))throw bad('benchmark_alignment');
   const b0=bb[bb.findIndex(b=>b.date===p.base_date)],b1=bb[bb.length-1];
   if(!(b0.close>0))throw bad('benchmark_base_close');
   rb=b1.close/b0.close-1;
   closes.push(closeInstantUtc(end.date,p.benchmark.market));
   label=closes.reduce((m,x)=>x>m?x:m);
  }
  if(label>o.cutoff)throw bad('end_not_closed_at_cutoff');
  const r=end.close/main.close-1;
  const value=rb===null?r:(1+r)/(1+rb)-1;
  if(!Number.isFinite(value))throw bad('value');
  // Recompute, never trust: the stored result must equal the replay of the frozen bars.
  const stored=ev.result as Partial<PriceResult>|undefined;
  if(!stored||stored.value!==value||stored.r!==r||stored.r_benchmark!==rb||stored.from!==p.base_date||stored.to!==end.date||stored.label_available_at!==label)throw bad('result');
  const result:PriceResult={value,r,r_benchmark:rb,from:p.base_date,to:end.date,label_available_at:label};
  return {status:'resolved',value,unit:'ratio',from:p.base_date,to:end.date,label_available_at:label,
   evidence:{...ev,result,override:{reason_code:o.reason_code,evidence_hash:o.evidence_hash,resolved_by:o.resolved_by,at:o.at,cutoff:o.cutoff}}};
 }
 return {name:'price_return',version:PRICE_RESOLVER_VERSION,validateParams:validate,labelAvailableAt,maxFetchMs:PRICE_MAX_FETCH_MS,resolve,fromOverride};
}

export const priceReturnResolver=priceReturnResolverWith({capabilityOf});
