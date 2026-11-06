// src/lib/dq/reconcile/pair-us-gold.ts
// us.companyfacts_vs_gold (spec §5.1, T15). Left = the published US facts, right = the US entries of plan
// 2's gold file src/lib/facts/fixtures/gold/plan2.json. An entry whose recorded_by or value is '<pending>'
// (the landed gate's isPending rule) is NEVER compared: each gets exactly one incomplete_gold result, so
// the cycle shows gaps and the gold is never reported complete while ready:false. natural_key =
// <ticker>:<concept>:<period_end>:<duration>:<unit>; duration defaults like the plan-2 gate (instant
// concept → INSTANT, else 12M). Binding: an open reconcile_mismatch item of the key pins its fact;
// otherwise the CURRENT ok row as of the entry's as_of (the row the gold asserts). Tolerance 0 (exact
// decimal). inputs_hash: left raw_hash, right = gold file sha256 (also the gold_or_sample part), parser
// 'gold-us/1'. The member issuer is the ticker's resolved issuer (resolveIssuer follows a merge).
import {resolveIssuer} from '../../entities/resolve';
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {FactRow} from '../../facts/types';
import {DATASETS} from '../datasets';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,comparedNumeric,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileResultInput} from './types';

export const US_GOLD_PATH='src/lib/facts/fixtures/gold/plan2.json';
export const US_GOLD_PARSER='gold-us/1';
const PAIR='us.companyfacts_vs_gold' as const;
const SIDES={left_source:DATASETS.facts('US'),right_source:'gold.plan2'};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const str=(v:unknown)=>typeof v==='string'?v:null;

export interface UsGoldEntry{index:number;ticker:string;concept:string;period_end:string;unit:string;duration:string;value:string|null;as_of:string|null;pending:boolean;source:Record<string,unknown>}
export const usGoldKey=(e:Pick<UsGoldEntry,'ticker'|'concept'|'period_end'|'duration'|'unit'>)=>`${e.ticker}:${e.concept}:${e.period_end}:${e.duration}:${e.unit}`;

/** The US entries of the gold file in file order; throws invalid_gold_file on shape errors or duplicate keys. */
export function usGoldEntries(json:unknown):{ready:boolean;entries:UsGoldEntry[]}{
 const bad=(m:string):never=>{throw new ReconcileConfigError('invalid_gold_file',m);};
 if(!json||typeof json!=='object'||!Array.isArray((json as {entries?:unknown}).entries))bad('entries');
 const j=json as {ready?:unknown;entries:unknown[]};
 const out:UsGoldEntry[]=[];const seen=new Set<string>();
 j.entries.forEach((raw,index)=>{
  const e=(raw??{}) as Record<string,unknown>;const iss=(e.issuer??{}) as Record<string,unknown>;
  if(iss.market!=='US')return;
  const ticker=str(iss.ticker),concept=str(e.concept),periodEnd=str(e.period_end),unit=str(e.unit),value=str(e.value),recordedBy=str(e.recorded_by);
  if(ticker===null||concept===null||periodEnd===null||!DATE.test(periodEnd)||unit===null||value===null||recordedBy===null)return bad(`entry ${index}: shape`);
  const def=conceptById(concept);if(!def)return bad(`entry ${index}: unknown concept ${concept}`);
  const pending=recordedBy==='<pending>'||value==='<pending>';
  let canonical:string|null=null;
  if(!pending){try{canonical=canonicalDecimal(value);}catch{return bad(`entry ${index}: value`);}}
  const asOf=e.as_of===null||e.as_of===undefined?null:str(e.as_of);
  if(asOf!==null&&!DATE.test(asOf))return bad(`entry ${index}: as_of`);
  if(e.as_of!==null&&e.as_of!==undefined&&asOf===null)return bad(`entry ${index}: as_of`);
  const entry:UsGoldEntry={index,ticker,concept,period_end:periodEnd,unit,duration:str(e.duration)??(def.nature==='instant'?'INSTANT':'12M'),value:canonical,as_of:asOf,pending,source:(e.source??{}) as Record<string,unknown>};
  const k=usGoldKey(entry);if(seen.has(k))return bad(`duplicate ${k}`);
  seen.add(k);out.push(entry);
 });
 return {ready:j.ready===true,entries:out};
}

/** Is the entry's key reported in conflicts by the lineage read of the member's current target? */
async function inLineageConflict(ctx:PairContext,issuerId:string,e:UsGoldEntry,left:FactRow):Promise<boolean>{
 const target=await ctx.db.targetOf(issuerId);
 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),'US',{concepts:[e.concept],asOf:todayOf(ctx)});
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/US`);
 return env.conflicts.some(c=>String(c.key.concept)===e.concept&&String(c.key.period_end)===e.period_end&&String(c.key.unit)===e.unit&&(c.key.period_start??null)===(left.period_start??null));
}

export function usCompanyfactsVsGoldPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:DATASETS.facts('US'),right:'gold.plan2',
  inputs:{repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'},
  // the current gold file is this pair's right evidence; its entry for the key must still exist and be recorded (plan audit P2)
  async currentRight(ctx,rec){
   try{
    const {json,sha256}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
    const e=usGoldEntries(json).entries.find(x=>usGoldKey(x)===String(rec.natural_key));
    return e&&!e.pending&&e.value!==null?sha256:null;
   }catch(err){if(err instanceof ReconcileConfigError)return null;throw err;}
  },
  async members(ctx){
   const {json}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const byOwner=new Map<string,MemberPlan>();
   const entries=[...usGoldEntries(json).entries].sort((x,y)=>x.ticker<y.ticker?-1:x.ticker>y.ticker?1:x.index-y.index);
   for(const e of entries){
    // the ticker's owner AT the entry's own date, never today; a merged owner stays the recorded owner (no redirect)
    const r=await resolveIssuer(ctx.tables,{ticker:e.ticker},{asOf:e.as_of??e.period_end});
    if(!r)throw new ReconcileConfigError('issuer_unresolved',e.ticker);
    const owner=r.redirected_from??r.issuer_id;
    const plan=byOwner.get(owner)??{issuerId:owner,market:'US' as const,expectedKeys:[]};
    plan.expectedKeys.push({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending,owner_issuer_id:owner}});
    byOwner.set(owner,plan);
   }
   return [...byOwner.values()];
  },
  async evaluate(ctx,member){
   const {json,sha256:goldSha}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const current=new Map(usGoldEntries(json).entries.map(e=>[usGoldKey(e),e]));
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const e=current.get(k.naturalKey);
    if(!e){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_removed'}));continue;}
    if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
    const bound=open.get(k.naturalKey);
    let rows:FactRow[];
    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).filter(r=>r.issuer_id===member.issuerId).slice(0,1);   // fenced issuer's facts only
    else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:e.as_of??todayOf(ctx),from:e.period_end,to:e.period_end})).rows
     .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
    const left=rows[0];
    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
    const passed=compareDecimal(left.value,e.value)===0;
    // a same-day lineage conflict on this key belongs to facts.lineage_same_day: record only, never quarantine here
    const lineageConflict=bound===undefined&&await inLineageConflict(ctx,member.issuerId,e,left);
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
    const action=lineageConflict?'record' as const:actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
    const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
    out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of,...(lineageConflict?{lineage_conflict:true}:{})},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}
