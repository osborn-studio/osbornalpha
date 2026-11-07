// src/lib/dcf/assemble.ts
// DCF assumptions with leaf-level provenance (spec §9.1, §0 #65). Merge order by LEAF PATH:
// defaults < LLM < facts < user overrides. revenueLines is fixed at ONE line: LLM and defaults may write
// only revenueLines[0].cagr; revenueLines[0].baseRevenue comes only from facts or the user; any other
// write (extra lines, LLM baseRevenue) is dropped with dcf_revenue_line_rejected. The equity bridge
// (revenueLines[0].baseRevenue, sharesDiluted, netDebt) must be `fact` or `user`, otherwise the result is
// status 'unavailable' (dcf_bridge_missing) and the LLM is not called. The LLM is asked only for cagr and
// cost ratios, in the stated currency unit; currency/currencyUnit follow the facts (or the market).
import {chatResolved,extractJson} from '@/lib/data/sources/llm';
import {resolveUserLlm} from '@/lib/llm/resolve';
import type {Market} from '@/lib/facts/types';
import type {SeedResult} from '@/lib/company/dcf-seed';
import type {DcfAssumptions} from './engine';

export type Provenance='fact'|'llm'|'default'|'user';
export type DcfWarningCode='dcf_revenue_line_rejected'|'dcf_llm_field_rejected'|'dcf_user_field_rejected'|'dcf_llm_failed'|'dcf_llm_unconfigured'|'dcf_no_facts'|'dcf_estimates';
export interface DcfWarning{code:DcfWarningCode;detail?:string}
export const BRIDGE_LEAVES=['revenueLines[0].baseRevenue','sharesDiluted','netDebt'] as const;
const RATIOS=['grossMarginPct','sgaPct','rdPct','sbcPct','daPct','capexPct','wcPctOfRev','taxRate'] as const;
const OTHER=['wacc','terminalG','forecastYears','exitEvEbitda'] as const;
export type Leaf='revenueLines[0].name'|'revenueLines[0].baseRevenue'|'revenueLines[0].cagr'|typeof RATIOS[number]|typeof OTHER[number]|'sharesDiluted'|'netDebt';
const LEAVES:readonly Leaf[]=['revenueLines[0].name','revenueLines[0].baseRevenue','revenueLines[0].cagr',...RATIOS,...OTHER,'sharesDiluted','netDebt'];
/** Defaults never contain a bridge leaf. */
export const DEFAULTS:ReadonlyMap<Leaf,number|string>=new Map<Leaf,number|string>([['revenueLines[0].name','合计'],['revenueLines[0].cagr',0.08],['grossMarginPct',0.4],['sgaPct',0.15],['rdPct',0.05],['sbcPct',0.02],['daPct',0.04],['capexPct',0.05],['wcPctOfRev',0.05],['taxRate',0.25],['wacc',0.1],['terminalG',0.025],['forecastYears',8],['exitEvEbitda',12]]);
export const MARKET_UNITS:Record<Market,{currency:string;currencyUnit:string;divisor:string}>={US:{currency:'USD',currencyUnit:'百万',divisor:'1000000'},CN:{currency:'CNY',currencyUnit:'亿',divisor:'100000000'}};
export type Layer=Map<Leaf,number|string>;
/** Accepted range per leaf (spec §9.1): anything outside is dropped with a warning, never clamped. */
const RANGES:Partial<Record<Leaf,(v:number)=>boolean>>={
 'revenueLines[0].cagr':v=>v>=-1&&v<=2,
 forecastYears:v=>Number.isInteger(v)&&v>=1&&v<=30,
 wacc:v=>v>0&&v<1,terminalG:v=>v>=-0.05&&v<=0.1,sharesDiluted:v=>v>0,exitEvEbitda:v=>v>0&&v<=100,taxRate:v=>v>=0&&v<=1,
};
for(const r of RATIOS)if(!RANGES[r])RANGES[r]=v=>v>=-1&&v<=1;
const inRange=(leaf:Leaf,v:number)=>(RANGES[leaf]?.(v))??true;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const asObj=(v:unknown)=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;

/** JSON from the LLM or the user → leaf layer. The LLM may write only revenueLines[0].cagr and the cost ratios. */
export function layerOf(src:'llm'|'user',input:unknown,warnings:DcfWarning[]):Layer{
 const out:Layer=new Map();const o=asObj(input);if(!o)return out;
 const rejectCode:DcfWarningCode=src==='llm'?'dcf_llm_field_rejected':'dcf_user_field_rejected';
 for(const [k,v] of Object.entries(o)){
  if(k==='revenueLines'){
   if(!Array.isArray(v)){warnings.push({code:'dcf_revenue_line_rejected',detail:`${src}:not_array`});continue;}
   if(v.length!==1)warnings.push({code:'dcf_revenue_line_rejected',detail:`${src}:length=${v.length}`});
   const first=asObj(v[0]);if(!first)continue;
   for(const [f,x] of Object.entries(first)){
    if(f==='cagr'&&finite(x)){if(inRange('revenueLines[0].cagr',x))out.set('revenueLines[0].cagr',x);else warnings.push({code:rejectCode,detail:'revenueLines[0].cagr'});}
    else if(src==='user'&&f==='baseRevenue'&&finite(x))out.set('revenueLines[0].baseRevenue',x);
    else if(src==='user'&&f==='name'&&typeof x==='string'&&x.trim())out.set('revenueLines[0].name',x.trim().slice(0,40));
    else if(f==='baseRevenue')warnings.push({code:'dcf_revenue_line_rejected',detail:`${src}:baseRevenue`});
   }
   continue;
  }
  const allowed:readonly string[]=src==='llm'?RATIOS:[...RATIOS,...OTHER,'sharesDiluted','netDebt'];
  if(allowed.includes(k)&&finite(v)){if(inRange(k as Leaf,v))out.set(k as Leaf,v);else warnings.push({code:rejectCode,detail:k});}
  else if(src==='llm'&&(k==='sharesDiluted'||k==='netDebt'))warnings.push({code:'dcf_llm_field_rejected',detail:k});
 }
 return out;
}
export function factLayer(seed:SeedResult):Layer{
 const out:Layer=new Map();const s=seed.seed;
 if(s.baseRevenue!==undefined)out.set('revenueLines[0].baseRevenue',s.baseRevenue);
 if(s.grossMarginPct!==undefined)out.set('grossMarginPct',s.grossMarginPct);
 if(s.sharesDiluted!==undefined)out.set('sharesDiluted',s.sharesDiluted);
 if(s.netDebt!==undefined)out.set('netDebt',s.netDebt);
 return out;
}
export function mergeLayers(layers:{defaults:ReadonlyMap<Leaf,number|string>;llm:Layer;facts:Layer;user:Layer}):{values:Map<Leaf,number|string>;provenance:Record<string,Provenance>}{
 const values=new Map<Leaf,number|string>();const provenance:Record<string,Provenance>={};
 const order=[['user',layers.user],['fact',layers.facts],['llm',layers.llm],['default',layers.defaults]] as const;
 for(const leaf of LEAVES)for(const [src,layer] of order)if(layer.has(leaf)){values.set(leaf,layer.get(leaf)!);provenance[leaf]=src;break;}
 return {values,provenance};
}
export function bridgeMissing(provenance:Record<string,Provenance>,seed:SeedResult):{field:string;reason:string}[]{
 return BRIDGE_LEAVES.filter(l=>provenance[l]!=='fact'&&provenance[l]!=='user').map(l=>({field:l,reason:seed.missing.find(m=>m.field===l)?.reason??'no_fact'}));
}
function toAssumptions(v:Map<Leaf,number|string>,meta:{currency:string;currencyUnit:string}):DcfAssumptions{
 const n=(l:Leaf)=>Number(v.get(l));
 return {revenueLines:[{name:String(v.get('revenueLines[0].name')??'合计'),baseRevenue:n('revenueLines[0].baseRevenue'),cagr:n('revenueLines[0].cagr')}],
  grossMarginPct:n('grossMarginPct'),sgaPct:n('sgaPct'),rdPct:n('rdPct'),sbcPct:n('sbcPct'),daPct:n('daPct'),capexPct:n('capexPct'),wcPctOfRev:n('wcPctOfRev'),taxRate:n('taxRate'),
  wacc:n('wacc'),terminalG:n('terminalG'),forecastYears:n('forecastYears'),sharesDiluted:n('sharesDiluted'),netDebt:n('netDebt'),exitEvEbitda:n('exitEvEbitda'),
  currency:meta.currency,currencyUnit:meta.currencyUnit};
}
/** User-only: per-year non-recurring items for the adjusted variant; absolute values, at most 30 finite numbers. */
export function nonRecurringOf(overrides:unknown,warnings:DcfWarning[]):number[]|null{
 const v=asObj(overrides)?.nonRecurring;if(v===undefined)return null;
 if(Array.isArray(v)&&v.length<=30&&v.every(finite))return v;
 warnings.push({code:'dcf_user_field_rejected',detail:'nonRecurring'});return null;
}
export interface AssembleResult{status:'ok'|'unavailable';assumptions:DcfAssumptions|null;provenance:Record<string,Provenance>;missing:{field:string;reason:string}[];warnings:DcfWarning[];meta:{currency:string;currencyUnit:string;divisor:string}}
/** Returns parsed JSON, or null when the user has no LLM configured; throws on failure. */
export type LlmFill=(prompt:string)=>Promise<unknown|null>;
async function userLlm(prompt:string):Promise<unknown|null>{
 const llm=await resolveUserLlm();if(!llm)return null;
 const resp=await chatResolved(llm,{system:'You are a sell-side analyst. Output ONLY JSON with exactly the requested keys.',messages:[{role:'user',content:prompt}],max_tokens:400,responseJson:true});
 return extractJson(resp.content);
}
function extractPrompt(ticker:string,meta:{currency:string;currencyUnit:string;divisor:string},seed:SeedResult):string{
 const hasGm=seed.seed.grossMarginPct!==undefined;
 return [
  `为 ${ticker} 估计 DCF 的收入增速与成本结构比率。金额单位：${meta.currencyUnit} ${meta.currency}（原值 ÷ ${meta.divisor}）。`,
  `已披露事实（不要修改、不要返回）：基期收入 ${seed.seed.baseRevenue??'未知'}${hasGm?`；毛利率 ${seed.seed.grossMarginPct}`:''}。`,
  '只返回 JSON，仅含这些键；所有比率是占收入的小数份额（0.15 表示 15%），cagr 为年复合增速小数：',
  `{"revenueLines":[{"cagr":0}],${hasGm?'':'"grossMarginPct":0,'}"sgaPct":0,"rdPct":0,"sbcPct":0,"daPct":0,"capexPct":0,"wcPctOfRev":0,"taxRate":0}`,
 ].join('\n');
}
export async function assembleAssumptions(ticker:string,market:Market,seed:SeedResult,overrides:unknown,llm:LlmFill=userLlm):Promise<AssembleResult>{
 const warnings:DcfWarning[]=[];
 const meta=seed.meta.currency?{currency:seed.meta.currency,currencyUnit:seed.meta.currencyUnit!,divisor:seed.meta.divisor!}:MARKET_UNITS[market];
 const facts=factLayer(seed);let user=layerOf('user',overrides,warnings);
 const nonRecurring=nonRecurringOf(overrides,warnings);
 const pre=mergeLayers({defaults:DEFAULTS,llm:new Map(),facts,user});
 const missing=bridgeMissing(pre.provenance,seed);
 if(missing.length>0)return {status:'unavailable',assumptions:null,provenance:pre.provenance,missing,warnings,meta};
 let llmLayer:Layer=new Map();
 try{const out=await llm(extractPrompt(ticker,meta,seed));if(out===null)warnings.push({code:'dcf_llm_unconfigured'});else llmLayer=layerOf('llm',out,warnings);}
 catch{warnings.push({code:'dcf_llm_failed'});}
 let merged=mergeLayers({defaults:DEFAULTS,llm:llmLayer,facts,user});
 if(!(Number(merged.values.get('wacc'))>Number(merged.values.get('terminalG')))){   // wacc must exceed terminal growth, else Gordon is undefined
  user=new Map(user);user.delete('wacc');user.delete('terminalG');warnings.push({code:'dcf_user_field_rejected',detail:'wacc<=terminalG'});
  merged=mergeLayers({defaults:DEFAULTS,llm:llmLayer,facts,user});
 }
 if(!Object.values(merged.provenance).includes('fact'))warnings.push({code:'dcf_no_facts'});   // final provenance, not the seed (plan audit Q7)
 warnings.push({code:'dcf_estimates'});
 const assumptions=toAssumptions(merged.values,meta);
 if(nonRecurring){assumptions.nonRecurring=nonRecurring;merged.provenance.nonRecurring='user';}
 return {status:'ok',assumptions,provenance:merged.provenance,missing:[],warnings,meta};
}
