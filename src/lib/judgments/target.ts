// src/lib/judgments/target.ts
// Target, settlement window and retrospective rules (spec §3.4; plan 契约补充 "结算窗口算术").
// defaultResolveTarget fixes the target at registration from the method's horizon: trading_sessions
// → session_index on the latest price_bar input date (n ≥ 1); calendar_days → date = as_of + n
// (n ≥ 1); calendar_months → period = month(as_of) + n (n = 0 is the as_of month); fiscal_quarters →
// fiscal_period: anchor = the latest period_end among the issuer's PUBLISHED filings (mapping_gen > 0,
// the landed isPublished rule) with available_date ≤ as_of (S05), stepped by 3 months to the n-th
// quarter end strictly after as_of (n ≥ 1; a month-end anchor stays on month ends, any other day is
// clamped to the month length); the calendar {anchor_period_end, months: 3} is frozen in the target
// so replay never reads later filings; extrapolated = false only when that period_end is itself a
// published period_end. The facts market comes from the fact / metric inputs, else from the issuer's
// primary security (factsMarketOf). Unresolvable → Abstained{reason:'target_unresolvable', missing}.
// settleWindow is time.ts settleWindowOf (Task 1, the TS twin of register_judgment's SQL recomputation,
// pinned by Task 3's cross-check): this file adds no window arithmetic of its own. DEFAULT_GRACE_DAYS,
// graceDaysOf, settleAfterDate (time.ts) and retrospectiveOf (= contract.ts isRetrospective) are
// re-exported so callers of target.ts see one set of names.
import type {Abstained,FactsMarket,Horizon,Input,JudgmentInputsDb,LabelPolicy,Target,WorkItem} from './types';
import {JudgmentError} from './errors';
import {factsMarketOf} from './markets';
import {addDaysIso,addMonthsPeriod,monthEndIso,settleWindowOf} from './time';
export {DEFAULT_GRACE_DAYS,graceDaysOf,settleAfterDate} from './time';
export {isRetrospective as retrospectiveOf} from './contract';

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const unresolvable=(why:string):Abstained=>({abstained:true,reason:'target_unresolvable',missing:[why]});
export function stepQuarter(anchor:string,k:number):string{
 const period=anchor.slice(0,7);const day=Number(anchor.slice(8,10));
 const isEnd=anchor===monthEndIso(period);
 const p=addMonthsPeriod(period,3*k);const end=monthEndIso(p);
 if(isEnd)return end;
 return `${p}-${String(Math.min(day,Number(end.slice(8,10)))).padStart(2,'0')}`;
}
export function nthQuarterEndAfter(anchor:string,asOf:string,n:number):string{
 let seen=0;
 for(let k=1;k<=n+1000;k++){const d=stepQuarter(anchor,k);if(d>asOf&&++seen===n)return d;}
 throw new RangeError(`no quarter end ${n} after ${asOf} from ${anchor}`);
}
async function factsMarketFor(item:WorkItem,inputs:Input[],db:JudgmentInputsDb):Promise<FactsMarket|null>{
 const ms=new Set<FactsMarket>();
 for(const x of inputs)if(x.kind==='financial_fact'||x.kind==='financial_metric')ms.add(x.snapshot.market);
 if(ms.size>1)return null;
 if(ms.size===1)return [...ms][0];
 const sec=await db.issuerPrimarySecurity(item.subject.key,item.asOf);
 return sec?factsMarketOf(sec.market):null;
}
export async function defaultResolveTarget(horizon:Horizon,item:WorkItem,inputs:Input[],db:JudgmentInputsDb):Promise<Target|Abstained>{
 const n=horizon.n;
 if(!Number.isInteger(n)||n<0)return unresolvable('horizon.n');
 switch(horizon.unit){
  case 'trading_sessions':{
   const dates=inputs.flatMap(x=>x.kind==='price_bar'?[x.snapshot.date]:[]).sort();
   if(dates.length===0)return unresolvable('price_bar');
   if(n<1)return unresolvable('horizon.n');
   return {kind:'session_index',base_date:dates[dates.length-1],n};
  }
  case 'calendar_days':
   if(n<1)return unresolvable('horizon.n');
   return {kind:'date',date:addDaysIso(item.asOf,n)};
  case 'calendar_months':return {kind:'period',period:addMonthsPeriod(item.asOf.slice(0,7),n)};
  case 'fiscal_quarters':{
   if(item.subject.type!=='issuer')return unresolvable('issuer_subject');
   if(n<1)return unresolvable('horizon.n');
   const market=await factsMarketFor(item,inputs,db);
   if(!market)return unresolvable('facts_market');
   const published=(await db.facts.filingsOfIssuer(item.subject.key,market,{to:item.asOf})).filter(f=>f.mapping_gen>0&&f.available_date<=item.asOf&&f.period_end!==null);
   if(published.length===0)return unresolvable('published_filing');
   const known=new Set(published.map(f=>f.period_end as string));
   const anchor=[...known].sort().at(-1)!;
   const period_end=nthQuarterEndAfter(anchor,item.asOf,n);
   return {kind:'fiscal_period',period_end,calendar:{anchor_period_end:anchor,months:3},extrapolated:!known.has(period_end)};
  }
 }
}
export const settleWindow=(t:Target,h:Horizon,params:Record<string,number|string>):{settle_after:string;settle_by:string}=>settleWindowOf(t,h,params);
export function labelPolicyOf(params:Record<string,number|string>):LabelPolicy{
 const p=params.label_policy;
 if(p!=='first_observed'&&p!=='cutoff_vintage')throw new JudgmentError('invalid_parameter',`label_policy ${String(p)}`);
 return p;
}
/** Registration-time check that a submitted target is the one the horizon defines (spec §6.2 step 2). */
export function targetConsistent(t:Target,h:Horizon,asOf:string,inputs:readonly Input[]):boolean{
 switch(t.kind){
  case 'session_index':return h.unit==='trading_sessions'&&t.n===h.n&&DAY.test(t.base_date)&&t.base_date<=asOf&&inputs.some(x=>x.kind==='price_bar'&&x.snapshot.date===t.base_date);
  case 'date':return h.unit==='calendar_days'&&t.date===addDaysIso(asOf,h.n);
  case 'period':return h.unit==='calendar_months'&&t.period===addMonthsPeriod(asOf.slice(0,7),h.n);
  case 'fiscal_period':
   if(h.unit!=='fiscal_quarters'||t.calendar.months!==3||!DAY.test(t.calendar.anchor_period_end)||t.calendar.anchor_period_end>asOf)return false;
   try{return t.period_end===nthQuarterEndAfter(t.calendar.anchor_period_end,asOf,h.n);}catch{return false;}
 }
}
