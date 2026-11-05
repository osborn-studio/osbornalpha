// src/lib/facts/rules.ts
// Statement rules on a sync run (spec §7.1 identity_bs / identity_gp, §7.2 warnings). Groups are
// the (filing, period_start, period_end, unit) cells that contain at least one new row; inputs are
// the new rows plus the current-generation ok rows of that same cell, so an identity is always
// checked inside one report version. Only new rows are quarantined. Rule ids and tolerances are
// the spec's. Unlike the generic doubles in src/lib/dq/rules.ts, the math here is exact: fact
// values are canonical decimal strings of up to 512 characters, so they are compared as scaled
// BigInts (no 15-digit rounding, no Infinity on 1e300-sized values). Tolerances are exact rationals.
import type {RuleResult} from '../dq/rules';
import type {BatchError} from '../dq/batches';
import type {FactInsert,FactRow,Market} from './types';
import {identityKey} from './keys';
import {daysBetween} from './classify';
import {canonicalDecimal} from './json-numbers';

export type AnyFactRow=FactInsert|FactRow;
export interface FactRulesInput{newRows:FactInsert[];okRows:FactRow[];sourceRefOf:Map<string,string>;issuerId:string;market:Market;mappingGen:number}
export interface RuleQuarantine{reason:'identity_bs'|'identity_gp';naturalKey:string;key:Record<string,string|null>;factIds:string[];rule:string;detail:Record<string,unknown>}
export interface FactRulesResult{quarantine:RuleQuarantine[];warnings:Map<string,string[]>}
/** Rational tolerances as [numerator, denominator]; the *_NUM/_DEN pairs below are the exact forms. */
export const IDENTITY_TOLERANCE=0.005;
export const GROSS_MARGIN_RANGE:[number,number]=[-1,1];
export const REVENUE_MAX_JUMP=10;
export const WARNING_RULES=['gross_margin_range','revenue_jump'] as const;
export const MAX_WARNING_KEYS=20;
const IDENTITY_TOL_RATIO:[bigint,bigint]=[5n,1000n];

/** Exact decimal: value = n / 10^s. */
interface Dec{n:bigint;s:number}
function dec(v:string):Dec|null{
 let c:string;
 try{c=canonicalDecimal(v);}catch{return null;}
 const neg=c.startsWith('-');const body=neg?c.slice(1):c;
 const [i,f='']=body.split('.');
 const n=BigInt(i+f);
 return {n:neg?-n:n,s:f.length};
}
const abs=(x:bigint)=>x<0n?-x:x;
const pow10=(k:number)=>10n**BigInt(k);
/** Both operands at a common scale. */
function align(a:Dec,b:Dec):[bigint,bigint,number]{
 const s=Math.max(a.s,b.s);
 return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];
}
const sub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x-y,s};};
const add=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};
const ONE:Dec={n:1n,s:0};
/** Sign of a − b. */
const cmp=(a:Dec,b:Dec):number=>{const [x,y]=align(a,b);return x<y?-1:x>y?1:0;};
const absDec=(a:Dec):Dec=>({n:abs(a.n),s:a.s});
const maxDec=(...xs:Dec[]):Dec=>xs.reduce((m,x)=>cmp(x,m)>0?x:m);
/** |diff| ≤ (num/den) × scale, exactly. */
const within=(diff:Dec,scale:Dec,num:bigint,den:bigint):boolean=>{
 const [d,sc]=align(absDec(diff),scale);
 return d*den<=sc*num;
};
/** Display only: a finite double when representable, else the canonical string. */
const shown=(v:string):number|string=>{const x=Number(v);return Number.isFinite(x)?x:v;};

/** |left − right| ≤ tolerance × max(|left|,|right|,1) with exact arithmetic (same rule as dq identityRule). */
function identity(ruleId:string,left:string,right:Dec,rightText:string):RuleResult{
 const l=dec(left);
 if(l===null)return {ruleId,passed:false,detail:{left,right:rightText,reason:'not_a_number'}};
 const diff=sub(l,right);
 const scale=maxDec(absDec(l),absDec(right),ONE);
 if(within(diff,scale,IDENTITY_TOL_RATIO[0],IDENTITY_TOL_RATIO[1]))return {ruleId,passed:true};
 return {ruleId,passed:false,detail:{left:shown(left),right:shown(rightText),tolerance:IDENTITY_TOLERANCE}};
}
const text=(d:Dec):string=>{
 const neg=d.n<0n;const digits=abs(d.n).toString().padStart(d.s+1,'0');
 const i=digits.slice(0,digits.length-d.s),f=digits.slice(digits.length-d.s);
 return `${neg?'-':''}${i}${f?`.${f}`:''}`;
};

const cell=(r:AnyFactRow)=>`${r.filing_id}|${r.period_start??''}|${r.period_end}|${r.unit}`;

export function evaluateFactRules(input:FactRulesInput):FactRulesResult{
 const {issuerId,market,mappingGen,sourceRefOf}=input;
 const out:FactRulesResult={quarantine:[],warnings:new Map(WARNING_RULES.map(r=>[r,[]]))};
 const groups=new Map<string,{rows:Map<string,AnyFactRow>;fresh:Set<string>;sample:AnyFactRow}>();
 for(const r of input.newRows){const g=groups.get(cell(r))??{rows:new Map(),fresh:new Set(),sample:r};g.rows.set(r.concept,r);g.fresh.add(r.concept);groups.set(cell(r),g);}
 for(const r of input.okRows){const g=groups.get(cell(r));if(g&&!g.rows.has(r.concept))g.rows.set(r.concept,r);}
 for(const g of groups.values()){
  const s=g.sample;const sourceRef=sourceRefOf.get(s.filing_id)??s.filing_id;
  const get=(c:string)=>g.rows.get(c);
  const park=(reason:RuleQuarantine['reason'],statement:'IS'|'BS',res:RuleResult,inputs:string[])=>{
   const factIds=inputs.filter(c=>g.fresh.has(c)).map(c=>g.rows.get(c)!.fact_id);
   if(factIds.length===0)return;
   out.quarantine.push({reason,naturalKey:identityKey(issuerId,market,statement,s.period_start,s.period_end,s.unit,sourceRef,mappingGen),
    key:{issuer_id:issuerId,market,statement,period_start:s.period_start,period_end:s.period_end,unit:s.unit,filing_id:s.filing_id,source_ref:sourceRef},
    factIds,rule:res.ruleId,detail:{...(res.detail??{}),concepts:inputs}});
  };
  const val=(c:string)=>get(c)?.value;
  const d=(c:string)=>{const v=val(c);return v===undefined?undefined:dec(v);};
  // identity_bs: assets = liabilities_and_equity, else assets = liabilities + equity_total
  const assetsV=val('total_assets');
  if(assetsV!==undefined){
   const leV=val('liabilities_and_equity');const liab=d('total_liabilities');const eq=d('equity_total');
   if(leV!==undefined){
    const le=dec(leV);
    const res=le===null?{ruleId:'identity_bs',passed:false,detail:{left:assetsV,right:leV,reason:'not_a_number'}}:identity('identity_bs',assetsV,le,leV);
    if(!res.passed)park('identity_bs','BS',res,['total_assets','liabilities_and_equity']);
   }else if(liab!==undefined&&eq!==undefined){
    const sum=liab!==null&&eq!==null?add(liab,eq):null;
    const res=sum===null?{ruleId:'identity_bs',passed:false,detail:{left:assetsV,reason:'not_a_number'}}:identity('identity_bs',assetsV,sum,text(sum));
    if(!res.passed)park('identity_bs','BS',res,['total_assets','total_liabilities','equity_total']);
   }
  }
  // identity_gp: gross_profit = revenue − cost_of_revenue, only when gross_profit is disclosed
  const gpV=val('gross_profit');const gp=d('gross_profit');const rev=d('revenue');const cost=d('cost_of_revenue');
  if(gpV!==undefined&&rev!==undefined&&cost!==undefined){
   const net=rev!==null&&cost!==null?sub(rev,cost):null;
   const res=net===null?{ruleId:'identity_gp',passed:false,detail:{left:gpV,reason:'not_a_number'}}:identity('identity_gp',gpV,net,text(net));
   if(!res.passed)park('identity_gp','IS',res,['gross_profit','revenue','cost_of_revenue']);
  }
  // warnings (never quarantine)
  const warnKey=identityKey(issuerId,market,'IS',s.period_start,s.period_end,s.unit,sourceRef,mappingGen);
  if(rev!==undefined&&rev!==null&&rev.n!==0n&&(gp!==undefined||cost!==undefined)){
   // |margin| ≤ 1 ⇔ |numerator| ≤ |revenue| (GROSS_MARGIN_RANGE is [-1,1]); a missing/invalid numerator input is skipped as before
   const numer=gp!==undefined?gp:cost!==undefined&&cost!==null?sub(rev,cost):null;
   if(numer!==null&&cmp(absDec(numer),absDec(rev))>0)out.warnings.get('gross_margin_range')!.push(warnKey);
  }
  const revRow=get('revenue');
  if(revRow!==undefined&&g.fresh.has('revenue')&&revRow.duration!=='INSTANT'){
   const prior=input.okRows.filter(r=>r.concept==='revenue'&&r.unit===revRow.unit&&r.duration===revRow.duration&&r.is_current!==false&&(()=>{const dd=daysBetween(r.period_end,revRow.period_end);return dd!==null&&dd>=350&&dd<=380;})());
   const prev=new Set(prior.map(r=>dec(r.value)).map(x=>x===null?'':text(x)));
   const cur=dec(revRow.value);
   if(prev.size===1&&!prev.has('')&&cur!==null){
    const p=dec([...prev][0])!;
    // |cur − prev| ≤ REVENUE_MAX_JUMP × max(|prev|,1)
    if(!within(sub(cur,p),maxDec(absDec(p),ONE),BigInt(REVENUE_MAX_JUMP),1n))out.warnings.get('revenue_jump')!.push(warnKey);
   }
  }
 }
 return out;
}

/** Appends `from` into `into` rule by rule (batch-level accumulation across issuers). */
export function mergeWarnings(into:Map<string,string[]>,from:Map<string,string[]>):Map<string,string[]>{
 for(const [rule,keys] of from){const list=into.get(rule)??[];list.push(...keys);into.set(rule,list);}
 return into;
}

/** One rule_warning_summary entry per rule that fired (INFO code: never degrades the batch). */
export function summarizeWarnings(warnings:Map<string,string[]>):BatchError[]{
 return [...warnings].filter(([,keys])=>keys.length>0).map(([rule,keys])=>({code:'rule_warning_summary',key:rule,message:JSON.stringify({count:keys.length,keys:keys.slice(0,MAX_WARNING_KEYS)})}));
}
