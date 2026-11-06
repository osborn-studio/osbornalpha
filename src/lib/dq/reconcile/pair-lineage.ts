// src/lib/dq/reconcile/pair-lineage.ts
// facts.lineage_same_day (spec §4.4, §5.1). Members: every target T that has referrers
// (issuers.status='merged' rows' merged_into, deduplicated) × each market where readFactsLineage over
// lineageOf(T) reports conflicts; expected keys = those conflicts at cycle creation, keyed
// <T>:<K>:<available_date> (K = facts/keys factKey). opts.targets restricts the enumeration (tests and
// targeted script runs); the registry instance has none. Evaluation re-reads the lineage: a conflict
// still present → compared, passed=false, action lineage_item (one lineage_conflict item per key, payload
// {fact_ids, values, key, available_date, target}; never auto-chosen); a conflict that is gone → the
// frozen fact_ids still ok are compared (equal values → passed, reason conflict_cleared), none ok →
// left_missing. A truncated lineage read is an execution failure (member retried), never a result.
import {selectAll} from '../../db/table-client';
import {CONCEPT_IDS} from '../../facts/concepts';
import {factKey} from '../../facts/keys';
import type {FactRow,LineageConflict,Market} from '../../facts/types';
import {compareDecimal} from './decimal';
import {ReconcileConfigError,comparedNumeric,notCompared,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {ExpectedKey,MemberPlan,PairContext,ReconcileResultInput} from './types';

const MARKETS:readonly Market[]=['US','CN'];
const s=(v:unknown)=>v===null||v===undefined?null:String(v);
export const lineageNaturalKey=(target:string,c:Pick<LineageConflict,'key'|'available_date'>):string=>
 `${target}:${factKey({concept:String(c.key.concept),period_start:s(c.key.period_start),period_end:String(c.key.period_end),consolidation:String(c.key.consolidation),unit:String(c.key.unit)})}:${c.available_date}`;
const byIssuerThenId=(a:FactRow,b:FactRow)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0;

async function conflictsOf(ctx:PairContext,target:string,market:Market):Promise<LineageConflict[]>{
 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),market,{concepts:[...CONCEPT_IDS],asOf:todayOf(ctx)});
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/${market}`);
 return env.conflicts;
}

async function planOf(ctx:PairContext,target:string,market:Market):Promise<MemberPlan>{
 const keys=new Map<string,ExpectedKey>();
 for(const c of await conflictsOf(ctx,target,market)){const nk=lineageNaturalKey(target,c);if(!keys.has(nk))keys.set(nk,{naturalKey:nk,locator:{key:c.key,available_date:c.available_date,fact_ids:c.fact_ids}});}
 return {issuerId:target,market,expectedKeys:[...keys.values()]};
}

export function lineageSameDayPair(opts:{targets?:readonly string[]}={}):RegisteredPair{
 return {
  id:'facts.lineage_same_day',kind:'numeric',left:'facts.lineage',right:'facts.lineage',
  inputs:{repoFile:null,parserVersion:'lineage/1',goldSchema:null},
  async currentRight(){return null;},   // never produces reconcile_mismatch items (lineage verdicts are lineage_conflict items)
  async members(ctx){
   const merged=await selectAll(ctx.tables,'issuers',{status:'merged'},'issuer_id');
   const targets=[...new Set(merged.map(r=>r.merged_into).filter((x):x is string=>typeof x==='string'))]
    .filter(t=>opts.targets===undefined||opts.targets.includes(t)).sort();
   const out:MemberPlan[]=[];
   for(const target of targets)for(const market of MARKETS){
    const plan=await planOf(ctx,target,market);
    if(plan.expectedKeys.length>0)out.push(plan);
   }
   return out;
  },
  /** one pending target (plan audit Q2): the same keys members() would give it now; zero conflicts → zero keys */
  async memberFor(ctx,issuerId,market){return planOf(ctx,issuerId,market);},
  async evaluate(ctx,member){
   let live:Map<string,LineageConflict>;
   try{live=new Map((await conflictsOf(ctx,member.issuerId,member.market)).map(c=>[lineageNaturalKey(member.issuerId,c),c]));}
   catch(e){if(e instanceof ReconcileConfigError)throw new Error(`lineage_read_truncated:${member.issuerId}`);throw e;}
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const c=live.get(k.naturalKey);
    const ids=c?c.fact_ids:(Array.isArray(k.locator.fact_ids)?k.locator.fact_ids.map(String):[]);
    const rows=(await ctx.db.factsByIds(ids)).sort(byIssuerThenId);
    const sides=(l:FactRow,r:FactRow)=>({left_source:`facts.lineage:${l.issuer_id}`,right_source:`facts.lineage:${r.issuer_id}`});
    const values=rows.map(r=>({issuer_id:r.issuer_id,filing:r.filing_id,fact_id:r.fact_id,value:r.value,status:r.status}));
    if(c){
     const left=rows[0];const right=left?(rows.find(r=>compareDecimal(r.value,left.value)!==0)??rows[1]):undefined;
     if(!left||!right){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'conflict_rows_missing',fact_ids:ids}));continue;}
     out.push(comparedNumeric(k.naturalKey,left.value,right.value,{passed:false,tolerance:'0',sides:sides(left,right),action:'lineage_item',
      detail:{target:member.issuerId,available_date:c.available_date,key:c.key,values,tolerance_rule:'exact/1'},
      item:{natural_key:k.naturalKey,payload:{fact_ids:c.fact_ids,values:values.map(({issuer_id,filing,fact_id,value})=>({issuer_id,filing,fact_id,value})),key:c.key,available_date:c.available_date,target:member.issuerId},detail:{target:member.issuerId,market:member.market}}}));
     continue;
    }
    const ok=rows.filter(r=>r.status==='ok');
    if(ok.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'no_ok_value',values}));continue;}
    const first=ok[0],other=ok.find(r=>compareDecimal(r.value,first.value)!==0);
    out.push(comparedNumeric(k.naturalKey,first.value,(other??ok[ok.length-1]).value,{passed:other===undefined,tolerance:'0',sides:sides(first,other??ok[ok.length-1]),action:'record',
     detail:{target:member.issuerId,reason:other===undefined?'conflict_cleared':'conflict_not_reported',values,tolerance_rule:'exact/1'}}));
   }
   return out;
  },
 };
}
