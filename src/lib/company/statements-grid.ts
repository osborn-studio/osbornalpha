// src/lib/company/statements-grid.ts
// Statements grid (spec §5.3, §0 #66). Pure: one company_read_snapshot envelope → columns keyed by
// <period_start>:<period_end>:<duration> (INSTANT start = end), newest first; rows in catalogue
// order (shares_outstanding last on BS, DEI tags included by concept); one primary unit per row
// (most periods, tie → smallest code unit) with other-unit facts flagged (U). disclosed / annual
// read the current disclosure of each natural key; quarterly runs the landed deriveMetrics on the
// SAME history envelope and keeps q_single_* only (CN q_single_revenue is concept revenue = 营业总收入).
// A truncated envelope is an error, never a partial grid. The evidence gate runs afterwards in the
// route (gateFacts + gateCell) over factIds.
import {FACT_CONCEPTS,conceptById} from '@/lib/facts/concepts';
import {Q_SINGLE_CONCEPTS,deriveMetrics} from '@/lib/facts/derive';
import type {FactRow,Market,MetricRow} from '@/lib/facts/types';
import type {Basis,Cell,DerivedCell,FactCell,FilingSummary,GridRow,PeriodCol,ReadSnapshotResult,StatementKind} from './types';

export const GRID_PERIOD_CHOICES=[8,20,40] as const;
export type GridPeriods=typeof GRID_PERIOD_CHOICES[number];
export interface GridOptions{statement:StatementKind;basis:Basis;periods:GridPeriods;market:Market;asOf:string}
export interface GridResult{ok:true;statement:StatementKind;basis:Basis;stateRev:number;mappingGen:number|null;periods:PeriodCol[];rows:GridRow[];filings:Record<string,FilingSummary>;factIds:string[];otherUnitOnly:Record<string,string[]>}
export type GridOutcome=GridResult|{ok:false;error:'read_truncated'|'invalid_basis'};
export type Badge='R'|'n'|'!'|'U';

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const DUR_ORDER:Record<string,number>={'3M':0,'6M':1,'9M':2,'12M':3,TTM:4,INSTANT:5};
export const periodKeyOf=(p:{period_start:string|null;period_end:string;duration:string})=>`${p.period_start??p.period_end}:${p.period_end}:${p.duration}`;
export function statementConcepts(statement:StatementKind):string[]{
 const ids=FACT_CONCEPTS.filter(c=>c.statement===statement).map(c=>c.id);
 return statement==='BS'?[...ids.filter(id=>id!=='shares_outstanding'),'shares_outstanding']:ids;
}
export function quarterlyConcepts(statement:StatementKind,market:Market):string[]{
 return statement==='BS'?[]:Q_SINGLE_CONCEPTS[market].filter(c=>conceptById(c)?.statement===statement);
}
/** `concepts` for readSnapshot: the statement's concepts, or (quarterly) its single-quarter concepts — derive needs only the same concept's history. */
export function gridReadConcepts(statement:StatementKind,basis:Basis,market:Market):string[]{
 return basis==='quarterly'?quarterlyConcepts(statement,market):statementConcepts(statement);
}
export function primaryUnitOf(entries:Iterable<{period:string;unit:string}>):string|null{
 const per=new Map<string,Set<string>>();
 for(const {period,unit} of entries){const s=per.get(unit)??new Set<string>();s.add(period);per.set(unit,s);}
 let best:string|null=null,n=-1;
 for(const [u,s] of per)if(s.size>n||(s.size===n&&best!==null&&u<best)){best=u;n=s.size;}
 return best;
}
const colOrder=(a:PeriodCol,b:PeriodCol)=>cmp(b.periodEnd,a.periodEnd)||cmp(b.periodStart,a.periodStart)||(DUR_ORDER[a.duration]??9)-(DUR_ORDER[b.duration]??9);
/** Exported for the overview / packet handlers (Task 10, 15): one FactCell / DerivedCell shape everywhere. */
export const factCellOf=(r:FactRow,otherUnits=false):FactCell=>{
 if(r.disclosure_seq===undefined||r.is_revision===undefined)throw new Error(`grid_sequence_missing:${r.fact_id}`);
 return {kind:'fact',factId:r.fact_id,value:r.value_text,unit:r.unit,availableDate:r.available_date,filingId:r.filing_id,disclosureSeq:r.disclosure_seq,isRevision:r.is_revision,mappingGen:r.mapping_gen,rawHash:r.raw_hash,runId:r.run_id,otherUnits};
};
export const derivedCellOf=(m:MetricRow):DerivedCell=>{
 const rules=new Set(m.inputs.map(i=>i.ytd_rule).filter(Boolean));
 const rule=rules.has('same_filing')?'a' as const:rules.has('never_revised')?'b' as const:null;
 return {kind:'derived',metric:m.metric,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,formulaVersion:m.formula_version,
  inputs:m.inputs.map(i=>({factId:i.fact_id,concept:i.concept,filingId:i.filing_id,availableDate:i.available_date})),...(rule?{rule}:{})};
};
interface Entry{period:PeriodCol;unit:string;cell:FactCell|DerivedCell;mappingGen:number|null}

export function buildStatementsGrid(snapshot:ReadSnapshotResult,opts:GridOptions):GridOutcome{
 if(snapshot.truncated)return {ok:false,error:'read_truncated'};
 if(opts.basis==='quarterly'&&opts.statement==='BS')return {ok:false,error:'invalid_basis'};
 const concepts=gridReadConcepts(opts.statement,opts.basis,opts.market);
 const wanted=new Set(concepts);
 const rows=snapshot.rows.filter(r=>r.status==='ok'&&r.consolidation==='consolidated'&&r.market===opts.market);
 const byConcept=new Map<string,Entry[]>();
 const push=(c:string,e:Entry)=>{const l=byConcept.get(c)??[];l.push(e);byConcept.set(c,l);};
 if(opts.basis==='quarterly'){
  for(const m of deriveMetrics(rows,{market:opts.market,asOf:opts.asOf,basedOnRev:snapshot.stateRev})){
   if(!m.metric.startsWith('q_single_'))continue;
   const c=m.metric.slice('q_single_'.length);if(!wanted.has(c))continue;
   push(c,{period:{key:`${m.period_start}:${m.period_end}:3M`,periodStart:m.period_start,periodEnd:m.period_end,duration:'3M'},unit:m.unit,cell:derivedCellOf(m),mappingGen:null});
  }
 }else{
  for(const r of rows){
   if(r.is_current!==true||!wanted.has(r.concept))continue;
   if(opts.basis==='annual'&&r.duration!=='12M'&&r.duration!=='INSTANT')continue;
   push(r.concept,{period:{key:periodKeyOf(r),periodStart:r.period_start??r.period_end,periodEnd:r.period_end,duration:r.duration},unit:r.unit,cell:factCellOf(r),mappingGen:r.mapping_gen});
  }
 }
 const cols=new Map<string,PeriodCol>();
 for(const es of byConcept.values())for(const e of es)cols.set(e.period.key,e.period);
 const periods=[...cols.values()].sort(colOrder).slice(0,opts.periods);
 const filingById=new Map(snapshot.filings.map(f=>[f.filingId,f]));
 const filings:Record<string,FilingSummary>={};const factIds=new Set<string>();const otherUnitOnly:Record<string,string[]>={};
 let mappingGen:number|null=null;
 const addFiling=(id:string)=>{const f=filingById.get(id);if(f)filings[id]=f;};
 const out:GridRow[]=[];
 for(const c of concepts){
  const es=byConcept.get(c);if(!es||es.length===0)continue;
  const primary=primaryUnitOf(es.map(e=>({period:e.period.key,unit:e.unit})));
  const def=conceptById(c);
  const cells:Record<string,Cell>={};
  for(const p of periods){
   const here=es.filter(e=>e.period.key===p.key);
   const main=here.find(e=>e.unit===primary);const others=here.some(e=>e.unit!==primary);
   if(!main){cells[p.key]=null;if(others)(otherUnitOnly[c]??=[]).push(p.key);continue;}
   const cell=main.cell.kind==='fact'?{...main.cell,otherUnits:others}:main.cell;
   cells[p.key]=cell;
   if(main.mappingGen!==null)mappingGen=Math.max(mappingGen??0,main.mappingGen);
   if(cell.kind==='fact'){factIds.add(cell.factId);addFiling(cell.filingId);}
   else for(const i of cell.inputs){factIds.add(i.factId);addFiling(i.filingId);}
  }
  const sourceConcepts=[...new Set(snapshot.rows.filter(r=>r.concept===c).map(r=>r.source_concept))].sort();
  out.push({concept:c,unit:primary,unitKind:def?.unitKind??'money',sourceConcepts,notes:def?.notes??null,cells});
 }
 if(opts.basis==='quarterly'){
  for(const r of rows)if(factIds.has(r.fact_id))mappingGen=Math.max(mappingGen??0,r.mapping_gen);
 }
 return {ok:true,statement:opts.statement,basis:opts.basis,stateRev:snapshot.stateRev,mappingGen,periods,rows:out,filings,factIds:[...factIds].sort(),otherUnitOnly};
}

export function badgesOf(cell:Cell,filings:Record<string,FilingSummary>,otherUnitOnly:Record<string,string[]>,concept:string,periodKey:string):Badge[]{
 const out:Badge[]=[];
 if(cell?.kind==='fact'){
  if(cell.isRevision)out.push('R');else if(cell.disclosureSeq>1)out.push('n');
  if(filings[cell.filingId]?.citation==='pending')out.push('!');
  if(cell.otherUnits)out.push('U');
 }else if(cell?.kind==='derived'){
  if(cell.inputs.some(i=>filings[i.filingId]?.citation==='pending'))out.push('!');
 }
 if(cell===null&&otherUnitOnly[concept]?.includes(periodKey))out.push('U');
 return out;
}
