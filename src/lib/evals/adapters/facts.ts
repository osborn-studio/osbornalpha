// src/lib/evals/adapters/facts.ts
// facts read adapter (spec §5.1.2, §5.6; §0 R5-6–R5-8). factsReader sees only the read subset of FactsDb (a type-level
// Pick: no write method is reachable) plus the TableClient resolveIssuer needs. Document binding: filingsOfIssuer, then
// the filing chosen in memory by selectFiling (§4.2 table; R5-8 for CN), then readFacts(history, from = to = period_end,
// asOf = today) and the rows of THAT filing whose period, duration and consolidation equal the target (period_start
// only when the target defines it). Units are never filtered here (the kind decides unit_mismatch / ambiguous).
// Current binding: the current rows at asOf. Metric targets are derived live (R5-7): readFacts(DERIVE_CONCEPTS[market],
// history) → deriveMetrics(rows, basedOnRev = that envelope's state_rev) → the target metric; the evaluator never calls
// materialize and never reads the financial_metrics cache. A truncated envelope is read_error(truncated).
// stateRev(): deps.stateRev() when it answers, else the largest envelope state_rev seen (state_rev is per issuer).
// privilegedFactsReader (service-role tables) adds readNonVisible (quarantined / superseded generation, §5.1.1),
// resolveProvenance (provenance.ts, R5-5/R5-6) and hints (§5.3.2: late facts, resolved quarantine, raised generation).
import {MAX_PAGE} from '../../db/table-client';
import type {RangeOptions,Row,TableClient} from '../../db/table-client';
import {resolveIssuer} from '../../entities/resolve';
import {conflictPrefix,factRowFromTable} from '../../facts/db';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics} from '../../facts/derive';
import type {FactRow,FactsDb,FilingRow,MetricRow} from '../../facts/types';
import type {CaseTarget,DocumentId,FactTarget,Hint,MetricTarget,ModuleReader,PrivilegedReader,Projection,ReadErrorReason,ReadResult,ReadRow,ReplayRequest,SubjectRef} from '../types';
import {provenanceResolver} from './provenance';
import type {RawObjectStorage,SnapshotParsers} from './provenance';

export type FactsReadDb=Pick<FactsDb,'readFacts'|'filingsOfIssuer'|'factsByIds'|'metricsOfIssuer'>;
/** readNonVisible cannot answer (contract return type has no error arm): the kind maps this to read_error(reason). */
export class NonVisibleReadError extends Error{constructor(public readonly reason:ReadErrorReason){super(reason);this.name='NonVisibleReadError';}}
export interface FactsReaderDeps{
 db:FactsReadDb;
 /** resolveIssuer's client; for the privileged reader also financial_facts, filings, fact_sync_runs, ingest_batches, dq_quarantine. */
 tables:TableClient;
 /** Report-level db_state_rev override; null → the largest envelope state_rev this reader saw. */
 stateRev:()=>Promise<number|null>;
 /** projections/facts.ts::projectRequest (Task 10); absent → project() rejects with projector_missing. */
 projector?:(request:ReplayRequest,today:string)=>Promise<Projection>;
}
export interface PrivilegedFactsReaderDeps extends FactsReaderDeps{db:FactsReadDb&Pick<FactsDb,'scopeRows'>;storage:RawObjectStorage;parsers:SnapshotParsers}

const RESOLVE_REFUSALS=/^(empty_query|ambiguous_query|ambiguous_owner|invalid_identifier:)/;
/** Must mirror tushare-statements.ts FORM_BY_MONTH (end-date month → form_type) for the periodic report types. */
const CN_PERIODIC:Record<string,string>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};
const errorResult=(error:ReadErrorReason,stateRev:number|null=null):ReadResult=>({rows:[],truncated:error==='truncated',stateRev,error});

/** §4.2 document → filing, in memory over filingsOfIssuer(issuer, market, {}) (it has no source_ref/document_ref filter). */
export function selectFiling(filings:FilingRow[],target:CaseTarget,documentId:DocumentId):{filing:FilingRow}|{error:ReadErrorReason}{
 if(documentId.kind==='edgar_accession'){
  const m=filings.filter(f=>f.source==='edgar'&&f.source_ref===documentId.value);
  return m.length===1?{filing:m[0]}:{error:m.length===0?'filing_not_found':'filing_ambiguous'};
 }
 if(documentId.kind!=='cninfo_announcement')return {error:'filing_not_found'};
 const all=filings.filter(f=>f.source==='tushare'&&f.document_ref===documentId.value);
 if(all.length===1)return {filing:all[0]};
 // Deviation (recorded by the commander): several filings linked to this announcement and none (or more than one) matches
 // the target period / periodic form stays filing_ambiguous rather than filing_not_found, because the announcement does exist.
 if(all.length>1){
  const byPeriod=all.filter(f=>f.period_end===target.period_end);
  const left=byPeriod.length>1?byPeriod.filter(f=>f.form_type===CN_PERIODIC[target.period_end.slice(5,7)]):byPeriod;
  return left.length===1?{filing:left[0]}:{error:'filing_ambiguous'};
 }
 const unlinked=filings.some(f=>f.source==='tushare'&&f.document_ref===null&&f.period_end===target.period_end);
 return {error:unlinked?'filing_not_linked':'filing_not_found'};
}

/** concept, period_end, duration, consolidation always; period_start only when the target defines it (undefined = legacy). */
export function factKeyMatches(f:Pick<FactRow,'concept'|'period_start'|'period_end'|'duration'|'consolidation'>,t:FactTarget):boolean{
 return f.concept===t.concept&&f.period_end===t.period_end&&f.duration===t.duration&&f.consolidation===t.consolidation&&(t.period_start===undefined||f.period_start===t.period_start);
}
export function readRowOfFact(f:FactRow,sourceRef:string|undefined):ReadRow{
 const row:ReadRow={value_text:f.value_text,unit:f.unit,period_start:f.period_start,period_end:f.period_end,duration:f.duration,consolidation:f.consolidation,available_date:f.available_date,
  fact_id:f.fact_id,filing_id:f.filing_id,mapping_gen:f.mapping_gen,mapping_version:f.mapping_version,raw_hash:f.raw_hash,run_id:f.run_id,status:f.status};
 if(sourceRef!==undefined)row.source_ref=sourceRef;
 return row;
}
export function readRowOfMetric(m:MetricRow):ReadRow{
 return {value_text:m.value,unit:m.unit,period_start:m.period_start,period_end:m.period_end,duration:m.duration,consolidation:'consolidated',
  available_date:m.inputs.map(i=>i.available_date).sort().at(-1)??m.as_of,
  metric:{metric:m.metric,formula_version:m.formula_version,basis:m.basis,input_unit:m.input_unit,based_on_rev:m.based_on_rev,inputs:m.inputs.map(i=>({fact_id:i.fact_id,concept:i.concept,filing_id:i.filing_id,available_date:i.available_date}))}};
}
const metricMatches=(m:MetricRow,t:MetricTarget)=>m.metric===t.metric&&m.period_start===t.period_start&&m.period_end===t.period_end&&m.duration===t.duration&&m.basis===t.basis&&m.input_unit===t.input_unit;

/** Complete-set TableClient read: offset pages in `orderBy` (a unique column) until an empty page. */
async function selectPaged(tables:TableClient,table:string,match:Row,orderBy:string,range:RangeOptions={}):Promise<Row[]>{
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await tables.select(table,match,{...range,orderBy,offset,limit:MAX_PAGE});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

export function factsReader(deps:FactsReaderDeps):ModuleReader{return buildReader(deps,null);}
/** inScope: extra market evidence only the privileged reader may use (fact_sync_scope is service_role-only; the public path must never touch it). */
type InScope=(issuerId:string,market:SubjectRef['market'])=>Promise<boolean>;
function buildReader(deps:FactsReaderDeps,inScope:InScope|null):ModuleReader{
 const {db}=deps;
 let observed:number|null=null;
 const observe=(rev:number)=>{if(observed===null||rev>observed)observed=rev;};
 const sourceRefs=async(ref:SubjectRef)=>new Map((await db.filingsOfIssuer(ref.issuerId,ref.market,{})).map(f=>[f.filing_id,f.source_ref]));
 const readCurrentFact=async(ref:SubjectRef,t:FactTarget,asOf:string):Promise<ReadResult>=>{
  const r=await db.readFacts(ref.issuerId,ref.market,{concepts:[t.concept],asOf,from:t.period_end,to:t.period_end,history:false});
  observe(r.stateRev);
  if(r.truncated)return errorResult('truncated',r.stateRev);
  const hits=r.rows.filter(f=>factKeyMatches(f,t)&&f.is_current!==false);
  const refs=hits.length>0?await sourceRefs(ref):new Map<string,string>();
  return {rows:hits.map(f=>readRowOfFact(f,refs.get(f.filing_id))),truncated:false,stateRev:r.stateRev};
 };
 const readCurrentMetric=async(ref:SubjectRef,t:MetricTarget,asOf:string):Promise<ReadResult>=>{
  if(t.formula_version!==FORMULA_VERSION)return errorResult('formula_version_mismatch');
  const r=await db.readFacts(ref.issuerId,ref.market,{concepts:[...DERIVE_CONCEPTS[ref.market]],asOf,history:true});
  observe(r.stateRev);
  if(r.truncated)return errorResult('truncated',r.stateRev);
  let metrics:MetricRow[];
  try{metrics=deriveMetrics(r.rows,{market:ref.market,asOf,basedOnRev:r.stateRev});}catch{return errorResult('read_failed',r.stateRev);}
  return {rows:metrics.filter(m=>metricMatches(m,t)).map(readRowOfMetric),truncated:false,stateRev:r.stateRev};
 };
 return {
  module:'facts',privileged:false,
  async resolveSubject(subject,today){
   const q=subject.cik!==undefined?{cik:subject.cik}:subject.ticker!==undefined?{ticker:subject.ticker}:null;
   if(q===null)return null;
   try{
    const r=await resolveIssuer(deps.tables,q,{today});
    if(!r)return null;
    // issuers carry no market: the issuer must have filings in subject.market (anon-readable); the privileged reader also accepts a scope row
    const inMarket=(await db.filingsOfIssuer(r.issuer_id,subject.market,{})).length>0||(inScope!==null&&await inScope(r.issuer_id,subject.market));
    return inMarket?{issuerId:r.issuer_id,market:subject.market}:null;
   }catch(e){
    if(e instanceof Error&&RESOLVE_REFUSALS.test(e.message))return null;
    throw e;
   }
  },
  async readDocumentBound(ref,target,documentId,today){
   if(target.type!=='fact')return errorResult('read_failed');
   const pick=selectFiling(await db.filingsOfIssuer(ref.issuerId,ref.market,{}),target,documentId);
   if('error' in pick)return errorResult(pick.error);
   const r=await db.readFacts(ref.issuerId,ref.market,{concepts:[target.concept],asOf:today,from:target.period_end,to:target.period_end,history:true});
   observe(r.stateRev);
   if(r.truncated)return errorResult('truncated',r.stateRev);
   const rows=r.rows.filter(f=>f.filing_id===pick.filing.filing_id&&factKeyMatches(f,target)).map(f=>readRowOfFact(f,pick.filing.source_ref));
   return {rows,truncated:false,stateRev:r.stateRev};
  },
  readCurrent:(ref,target,asOf)=>target.type==='fact'?readCurrentFact(ref,target,asOf):readCurrentMetric(ref,target,asOf),
  project:(request,today)=>deps.projector?deps.projector(request,today):Promise.reject(new Error('projector_missing')),
  async stateRev(){const v=await deps.stateRev();return v??observed;},
 };
}

/** §5.1.1: quarantined (a non-ok row of the key) or superseded_generation (a stored row of the key not on its filing's active generation). */
async function readNonVisible(deps:FactsReaderDeps,ref:SubjectRef,target:CaseTarget,documentId:DocumentId|null,asOf:string):Promise<'quarantined'|'superseded_generation'|null>{
 if(target.type!=='fact')return null;
 const filings=await deps.db.filingsOfIssuer(ref.issuerId,ref.market,{});
 let filing:FilingRow|null=null;
 if(documentId!==null){const p=selectFiling(filings,target,documentId);if('error' in p)return null;filing=p.filing;}
 const inScope=(f:Pick<FactRow,'filing_id'>)=>filing===null||f.filing_id===filing.filing_id;
 const r=await deps.db.readFacts(ref.issuerId,ref.market,{concepts:[target.concept],asOf,from:target.period_end,to:target.period_end,history:true,includeNonOk:true});
 if(r.truncated)throw new NonVisibleReadError('truncated');
 if(r.rows.some(f=>f.status==='quarantined'&&inScope(f)&&factKeyMatches(f,target)))return 'quarantined';
 const active=new Map(filings.map(f=>[f.filing_id,f.mapping_gen]));
 const match=filing===null?{issuer_id:ref.issuerId,market:ref.market,concept:target.concept,period_end:target.period_end}:{filing_id:filing.filing_id,concept:target.concept,period_end:target.period_end};
 const stored=(await selectPaged(deps.tables,'financial_facts',match,'fact_id')).map(factRowFromTable);
 const superseded=stored.some(f=>inScope(f)&&factKeyMatches(f,target)&&f.status==='ok'&&f.available_date<=asOf&&active.has(f.filing_id)&&f.mapping_gen<active.get(f.filing_id)!);
 return superseded?'superseded_generation':null;
}

/** §5.3.2 hints over service-role tables; `since` is an ISO instant, comparisons are strict (created/resolved/published AFTER since). */
async function factsHints(deps:FactsReaderDeps,reader:ModuleReader,request:ReplayRequest,since:string):Promise<Hint[]>{
 const sinceMs=Date.parse(since);
 if(Number.isNaN(sinceMs))throw new RangeError(`invalid since: ${since}`);
 const ref=await reader.resolveSubject(request.issuer,request.asOf);
 if(!ref)return [];
 const after=(v:unknown)=>v!==null&&v!==undefined&&Date.parse(String(v))>sinceMs;
 const iso=(v:unknown)=>new Date(String(v)).toISOString();
 const concepts=[...new Set(request.concepts)].sort();
 const out:Hint[]=[];
 for(const concept of concepts)
  for(const f of await selectPaged(deps.tables,'financial_facts',{issuer_id:ref.issuerId,market:ref.market,concept},'fact_id',{gte:{created_at:since}}))
   if(after(f.created_at))out.push({kind:'late_fact',ref:String(f.fact_id),at:iso(f.created_at)});
 const prefixes=concepts.map(c=>`${conflictPrefix(ref.issuerId,ref.market)}${c}:`);
 for(const q of await selectPaged(deps.tables,'dq_quarantine',{table_name:'financial_facts'},'id',{gte:{resolved_at:since}}))
  if(after(q.resolved_at)&&prefixes.some(p=>String(q.natural_key).startsWith(p)))out.push({kind:'quarantine_resolved',ref:String(q.id),at:iso(q.resolved_at)});
 const runs=await selectPaged(deps.tables,'fact_sync_runs',{issuer_id:ref.issuerId,market:ref.market,status:'published'},'run_id');
 const before=runs.filter(r=>!after(r.published_at)).reduce((n,r)=>Math.max(n,Number(r.mapping_gen)),0);
 for(const r of runs)if(after(r.published_at)&&Number(r.mapping_gen)>before)out.push({kind:'mapping_gen_raised',ref:String(r.run_id),at:iso(r.published_at)});
 const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 return out.sort((a,b)=>cmp(a.at,b.at)||cmp(a.kind,b.kind)||cmp(a.ref,b.ref));
}

export function privilegedFactsReader(deps:PrivilegedFactsReaderDeps):PrivilegedReader{
 const reader=buildReader(deps,async(id,market)=>(await deps.db.scopeRows(market,[id])).length>0);
 const resolve=provenanceResolver({db:deps.db,tables:deps.tables,storage:deps.storage,parsers:deps.parsers});
 return {...reader,privileged:true,
  readNonVisible:(ref,target,documentId,asOf)=>readNonVisible(deps,ref,target,documentId,asOf),
  resolveProvenance:(ref,row,opts)=>resolve(ref,row,opts),
  hints:(request,since)=>factsHints(deps,reader,request,since)};
}
