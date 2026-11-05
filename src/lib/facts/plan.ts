// src/lib/facts/plan.ts
// Write planning (spec §5.3), pure. Given what the issuer already has (every row of the current
// generation, any status), the open same_day_conflict items and the parsed candidates, decide
// per candidate: duplicate (candidate key = K + filing + mapping_gen already exists, any status),
// ambiguous_value (same candidate key, different values — no row), contested (an open item for
// (K, available_date) exists — row is staged then parked into that item, whatever its value),
// same-day conflict (another value for (K, available_date) among published ok rows or this
// run's candidates — all new rows parked, a new item references them and the ok rows), or a
// plain insert counted as inserted (value equals the current value, or no prior disclosure) /
// versioned (value differs). Conflict detection works on sets, so arrival order cannot change
// the outcome. Values compare in canonical decimal form.
import {randomUUID} from 'node:crypto';
import type {BatchCounts} from '../dq/batches';
import type {ConflictItem,FactCandidate,FactInsert,FactRow,FilingCandidate,Market} from './types';
import {ambiguousKey,candidateKey,factKey,keyComponents,sameDayConflictKey} from './keys';
import type {FactKey} from './keys';
import {canonicalDecimal} from './json-numbers';

export interface PlanInput{
 existing:FactRow[];openConflicts:ConflictItem[];candidates:FactCandidate[];filingCandidates:FilingCandidate[];
 filings:Map<string,string>;issuerId:string;market:Market;mappingGen:number;mappingVersion:string;newId?:()=>string;
}
export interface PlanConflict{naturalKey:string;key:Record<string,string|null>;availableDate:string;newFactIds:string[];existingOkFactIds:string[];values:{filing:string;value:string}[]}
export interface PlanAmbiguous{naturalKey:string;key:Record<string,string|null>;candidates:FactCandidate[]}
export type PlanOutcome='inserted'|'versioned'|'quarantined';
export interface PlanResult{
 inserts:FactInsert[];counts:Pick<BatchCounts,'inserted'|'versioned'|'duplicates'|'quarantined'>;
 duplicates:FactCandidate[];ambiguous:PlanAmbiguous[];conflicts:PlanConflict[];contestedJoins:{itemId:string;factIds:string[]}[];
 /** Outcome per staged fact_id; rows parked later by rules move from inserted/versioned to quarantined. */
 outcomes:Map<string,PlanOutcome>;quarantinedFactIds:string[];
}

const keyOf=(c:FactCandidate):FactKey=>({concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit});
const rowKey=(r:FactRow):FactKey=>({concept:r.concept,period_start:r.period_start,period_end:r.period_end,consolidation:r.consolidation,unit:r.unit});
const seqOrder=(a:FactRow,b:FactRow)=>a.available_date.localeCompare(b.available_date)||a.created_at.localeCompare(b.created_at)||a.fact_id.localeCompare(b.fact_id);

export function planFactWrites(input:PlanInput):PlanResult{
 const {issuerId,market,mappingGen,mappingVersion}=input;const newId=input.newId??randomUUID;
 const dateOf=new Map(input.filingCandidates.map(f=>[f.sourceRef,f.availableDate]));
 const existingKeys=new Set(input.existing.map(r=>candidateKey(rowKey(r),r.filing_id,r.mapping_gen)));
 const okRows=input.existing.filter(r=>r.status==='ok');
 // Rows that stay active after this run publishes: an ok row of a filing re-mapped in this run
 // (older generation) is superseded, so it must not compete with its own replacement.
 const stagedFilingIds=new Set(input.filings.values());
 const activeRows=okRows.filter(r=>!(r.mapping_gen<mappingGen&&stagedFilingIds.has(r.filing_id)));
 const openByKey=new Map(input.openConflicts.map(i=>[i.natural_key,i]));
 const result:PlanResult={inserts:[],counts:{inserted:0,versioned:0,duplicates:0,quarantined:0},duplicates:[],ambiguous:[],conflicts:[],contestedJoins:[],outcomes:new Map(),quarantinedFactIds:[]};
 // 1. duplicates against the store, then group by candidate key
 const groups=new Map<string,{filingId:string;cands:FactCandidate[]}>();
 for(const c of input.candidates){
  const filingId=input.filings.get(c.filingRef);
  if(!filingId)throw new Error(`unknown_filing:${c.filingRef}`);
  const ck=candidateKey(keyOf(c),filingId,mappingGen);
  if(existingKeys.has(ck)){result.duplicates.push(c);continue;}
  const g=groups.get(ck)??{filingId,cands:[]};g.cands.push(c);groups.set(ck,g);
 }
 // 2. ambiguous values within one candidate key; identical repeats are duplicates
 const accepted:{c:FactCandidate;filingId:string;availableDate:string;value:string}[]=[];
 for(const {filingId,cands} of groups.values()){
  const values=new Set(cands.map(c=>canonicalDecimal(c.value)));
  const k=keyOf(cands[0]);
  if(values.size>1){result.ambiguous.push({naturalKey:ambiguousKey(issuerId,market,k,cands[0].filingRef,mappingGen),key:keyComponents(issuerId,market,k),candidates:cands});result.counts.quarantined+=cands.length;continue;}
  result.duplicates.push(...cands.slice(1));
  const availableDate=dateOf.get(cands[0].filingRef);
  if(!availableDate)throw new Error(`unknown_filing_date:${cands[0].filingRef}`);
  accepted.push({c:cands[0],filingId,availableDate,value:[...values][0]});
 }
 result.counts.duplicates=result.duplicates.length;
 // 3. (K, available_date) groups: contested → join; >1 value among candidates ∪ ok rows → conflict
 const byDay=new Map<string,typeof accepted>();
 for(const a of accepted){const dk=sameDayConflictKey(issuerId,market,keyOf(a.c),a.availableDate);const g=byDay.get(dk)??[];g.push(a);byDay.set(dk,g);}
 const currentByK=new Map<string,FactRow>();
 for(const r of [...okRows].sort(seqOrder))currentByK.set(factKey(rowKey(r)),r);
 for(const [dk,group] of byDay){
  const k=keyOf(group[0].c);const date=group[0].availableDate;
  const inserts=group.map(a=>{
   const row:FactInsert={fact_id:newId(),issuer_id:issuerId,market,filing_id:a.filingId,concept:a.c.concept,source_concept:a.c.sourceConcept,statement:a.c.statement,
    period_start:a.c.periodStart,period_end:a.c.periodEnd,duration:a.c.duration,value:a.value,unit:a.c.unit,consolidation:a.c.consolidation,available_date:date,
    mapping_gen:mappingGen,mapping_version:mappingVersion,raw_hash:a.c.rawHash};
   result.inserts.push(row);return row;
  });
  const park=()=>{for(const r of inserts){result.outcomes.set(r.fact_id,'quarantined');result.quarantinedFactIds.push(r.fact_id);}result.counts.quarantined+=inserts.length;};
  const open=openByKey.get(dk);
  if(open){result.contestedJoins.push({itemId:open.id,factIds:inserts.map(r=>r.fact_id)});park();continue;}
  const sameDayOk=activeRows.filter(r=>r.available_date===date&&sameDayConflictKey(issuerId,market,rowKey(r),r.available_date)===dk);
  const values=new Set([...inserts.map(r=>r.value),...sameDayOk.map(r=>canonicalDecimal(r.value))]);
  if(values.size>1){
   result.conflicts.push({naturalKey:dk,key:keyComponents(issuerId,market,k,date),availableDate:date,newFactIds:inserts.map(r=>r.fact_id),existingOkFactIds:sameDayOk.map(r=>r.fact_id),
    values:[...inserts.map(r=>({filing:r.filing_id,value:r.value})),...sameDayOk.map(r=>({filing:r.filing_id,value:canonicalDecimal(r.value)}))]});
   park();continue;
  }
  const current=currentByK.get(factKey(k));
  for(const r of inserts){
   const outcome:PlanOutcome=current===undefined||canonicalDecimal(current.value)===r.value?'inserted':'versioned';
   result.outcomes.set(r.fact_id,outcome);result.counts[outcome]++;
  }
 }
 return result;
}
