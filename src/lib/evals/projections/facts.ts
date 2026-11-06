// src/lib/evals/projections/facts.ts
// Replay projections of the facts module (spec §5.3.1, §5.3.2, §0 R5-7). projectFacts reads one issuer's
// disclosure log at asOf (readFacts history=true: status ok, active mapping generation, with
// disclosure_seq / is_current / is_revision), filters request.durations, keeps the replay fields and joins
// source_ref from filingsOfIssuer. projectMetrics derives live — readFacts(DERIVE_CONCEPTS[market], asOf,
// history) → deriveMetrics(rows, {market, asOf, basedOnRev: stateRev}), never materialize (it writes) — and
// enriches inputs[] to {concept, period_end, source_ref} via factsByIds + filings. Every read problem is a
// ProjectionError(reason) (subject_unresolved, truncated, projection_join_missing) that kinds/replay.ts turns
// into read_error(reason). projectFactsRouteBody / projectMetricsRouteBody compute the same projection from
// the public route JSON (route-equivalence test; later the --http smoke). diffProjections names changes as
// facts[<concept>/<period_start>..<period_end>/<duration>/<unit>/<available_date>/<source_ref>].<field> or
// metrics[<metric>/<period_start>..<period_end>/<duration>/<basis>/<formula_version>].<field>; null is the
// empty segment; a one-sided row is the bare facts[<id>] path; a module change is 'module'. All string
// ordering is code-unit (C collation) order.
import type {TableClient} from '../../db/table-client';
import {resolveIssuer} from '../../entities/resolve';
import {DERIVE_CONCEPTS,deriveMetrics} from '../../facts/derive';
import type {FactRow,FactsDb,FilingRow} from '../../facts/types';
import {canonicalJson} from '../canonical-json';
import type {EvalModule,Projection,ProjectionRow,ReadErrorReason,ReplayRequest,Subject,SubjectRef} from '../types';

export type ProjectionDb=Pick<FactsDb,'readFacts'|'filingsOfIssuer'|'factsByIds'>;
export interface ProjectionDeps{db:ProjectionDb;resolve(subject:Subject,today:string):Promise<SubjectRef|null>}
export class ProjectionError extends Error{constructor(public readonly reason:ReadErrorReason,message?:string){super(message??reason);this.name='ProjectionError';}}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const seg=(v:unknown)=>v===null||v===undefined?'':String(v);

/** Subject → issuer by today's ownership (cik first, else ticker); market is the subject's. */
export async function resolveFactsSubject(tables:TableClient,subject:Subject,today:string):Promise<SubjectRef|null>{
 const q=subject.cik!==undefined?{cik:subject.cik}:subject.ticker!==undefined?{ticker:subject.ticker}:null;
 if(q===null)return null;
 const r=await resolveIssuer(tables,q,{today});
 return r?{issuerId:r.issuer_id,market:subject.market}:null;
}

const FACT_SORT=['concept','period_start','period_end','consolidation','unit','available_date','source_ref'] as const;
export function sortFactRows(rows:ProjectionRow[]):ProjectionRow[]{
 return [...rows].sort((a,b)=>{for(const k of FACT_SORT){const c=cmp(seg(a[k]),seg(b[k]));if(c!==0)return c;}return cmp(seg(a.duration),seg(b.duration))||Number(a.disclosure_seq??0)-Number(b.disclosure_seq??0);});
}
const METRIC_SORT=['metric','period_start','period_end','duration','basis','formula_version'] as const;
export function sortMetricRows(rows:ProjectionRow[]):ProjectionRow[]{
 return [...rows].sort((a,b)=>{for(const k of METRIC_SORT){const c=cmp(seg(a[k]),seg(b[k]));if(c!==0)return c;}return cmp(canonicalJson(a),canonicalJson(b));});
}

async function referenced(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<SubjectRef>{
 const ref=await deps.resolve(request.issuer,today);
 if(!ref)throw new ProjectionError('subject_unresolved');
 return ref;
}
async function filingMap(db:ProjectionDb,ref:SubjectRef):Promise<Map<string,FilingRow>>{
 return new Map((await db.filingsOfIssuer(ref.issuerId,ref.market,{})).map(f=>[f.filing_id,f]));
}
const durationFilter=(request:ReplayRequest)=>request.durations&&request.durations.length>0?new Set<string>(request.durations):null;

export function factProjectionRow(r:FactRow,sourceRef:string):ProjectionRow{
 return {concept:r.concept,period_start:r.period_start,period_end:r.period_end,duration:r.duration,consolidation:r.consolidation,unit:r.unit,value_text:r.value_text,
  available_date:r.available_date,source_ref:sourceRef,disclosure_seq:r.disclosure_seq??null,is_current:r.is_current??null,is_revision:r.is_revision??null};
}

export async function projectFacts(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<Projection>{
 const ref=await referenced(deps,request,today);
 if(request.concepts.length===0)return {module:'facts',rows:[]};
 const env=await deps.db.readFacts(ref.issuerId,ref.market,{concepts:[...request.concepts],asOf:request.asOf,history:true});
 if(env.truncated)throw new ProjectionError('truncated');
 const durations=durationFilter(request);
 const filings=await filingMap(deps.db,ref);
 const rows=env.rows.filter(r=>durations===null||durations.has(r.duration)).map(r=>{
  const f=filings.get(r.filing_id);
  if(!f)throw new ProjectionError('projection_join_missing',`filing ${r.filing_id} of fact ${r.fact_id}`);
  return factProjectionRow(r,f.source_ref);
 });
 return {module:'facts',rows:sortFactRows(rows)};
}

export async function projectMetrics(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<Projection>{
 const ref=await referenced(deps,request,today);
 const wanted=new Set(request.metrics??[]);
 if(wanted.size===0)return {module:'metrics',rows:[]};
 const env=await deps.db.readFacts(ref.issuerId,ref.market,{concepts:[...DERIVE_CONCEPTS[ref.market]],asOf:request.asOf,history:true});
 if(env.truncated)throw new ProjectionError('truncated');
 const durations=durationFilter(request);
 const metrics=deriveMetrics(env.rows,{market:ref.market,asOf:request.asOf,basedOnRev:env.stateRev}).filter(m=>wanted.has(m.metric)&&(durations===null||durations.has(m.duration)));
 const ids=[...new Set(metrics.flatMap(m=>m.inputs.map(i=>i.fact_id)))];
 const facts=new Map((ids.length>0?await deps.db.factsByIds(ids):[]).map(f=>[f.fact_id,f]));
 const filings=await filingMap(deps.db,ref);
 const rows=metrics.map((m):ProjectionRow=>({metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,basis:m.basis,formula_version:m.formula_version,value:m.value,unit:m.unit,
  inputs:m.inputs.map((i):ProjectionRow=>{
   const f=facts.get(i.fact_id);const g=f?filings.get(f.filing_id):undefined;
   if(!f||!g)throw new ProjectionError('projection_join_missing',`input ${i.fact_id} of ${m.metric}`);
   return {concept:i.concept,period_end:f.period_end,source_ref:g.source_ref};
  })}));
 return {module:'metrics',rows:sortMetricRows(rows)};
}

/** A request with metrics is a metrics projection (concepts must then be []); otherwise a facts projection. */
export const projectRequest=(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<Projection>=>
 request.metrics&&request.metrics.length>0?projectMetrics(deps,request,today):projectFacts(deps,request,today);

/** Public facts route body (concepts or factIds mode); consolidation is not in the public shape and is always 'consolidated' (FactInsert). */
export interface FactsRouteBody{
 truncated:boolean;
 facts:{factId:string;concept:string;periodStart:string|null;periodEnd:string;duration:string;value:string;unit:string;availableDate:string;filingId:string;disclosureSeq:number|null;isCurrent:boolean|null;isRevision:boolean|null}[];
 filings:{filingId:string;sourceRef:string}[];
}
export function projectFactsRouteBody(body:FactsRouteBody):Projection{
 if(body.truncated)throw new ProjectionError('truncated');
 const refs=new Map(body.filings.map(f=>[f.filingId,f.sourceRef]));
 return {module:'facts',rows:sortFactRows(body.facts.map(r=>{
  const src=refs.get(r.filingId);
  if(src===undefined)throw new ProjectionError('projection_join_missing',`filing ${r.filingId}`);
  return {concept:r.concept,period_start:r.periodStart,period_end:r.periodEnd,duration:r.duration,consolidation:'consolidated',unit:r.unit,value_text:r.value,
   available_date:r.availableDate,source_ref:src,disclosure_seq:r.disclosureSeq,is_current:r.isCurrent,is_revision:r.isRevision};
 }))};
}
export interface MetricsRouteBody{
 truncated:boolean;formulaVersion:string;
 metrics:{metric:string;periodStart:string;periodEnd:string;duration:string;value:string;unit:string;basis:string;inputs:{fact_id:string;concept:string}[]}[];
}
/** evidence = the facts route in factIds mode for every input fact id (periodEnd + filing sourceRef). */
export function projectMetricsRouteBody(body:MetricsRouteBody,evidence:FactsRouteBody):Projection{
 if(body.truncated)throw new ProjectionError('truncated');
 const facts=new Map(evidence.facts.map(f=>[f.factId,f]));
 const refs=new Map(evidence.filings.map(f=>[f.filingId,f.sourceRef]));
 return {module:'metrics',rows:sortMetricRows(body.metrics.map((m):ProjectionRow=>({metric:m.metric,period_start:m.periodStart,period_end:m.periodEnd,duration:m.duration,basis:m.basis,formula_version:body.formulaVersion,value:m.value,unit:m.unit,
  inputs:m.inputs.map((i):ProjectionRow=>{
   const f=facts.get(i.fact_id);const src=f?refs.get(f.filingId):undefined;
   if(!f||src===undefined)throw new ProjectionError('projection_join_missing',`input ${i.fact_id}`);
   return {concept:i.concept,period_end:f.periodEnd,source_ref:src};
  })})))};
}

export function rowIdentity(module:EvalModule,r:ProjectionRow):string{
 return module==='metrics'
  ?`${seg(r.metric)}/${seg(r.period_start)}..${seg(r.period_end)}/${seg(r.duration)}/${seg(r.basis)}/${seg(r.formula_version)}`
  :`${seg(r.concept)}/${seg(r.period_start)}..${seg(r.period_end)}/${seg(r.duration)}/${seg(r.unit)}/${seg(r.available_date)}/${seg(r.source_ref)}`;
}
function indexed(p:Projection):Map<string,ProjectionRow>{
 const out=new Map<string,ProjectionRow>();const seen=new Map<string,number>();
 for(const r of p.rows){const id=rowIdentity(p.module,r);const n=(seen.get(id)??0)+1;seen.set(id,n);out.set(n===1?id:`${id}#${n}`,r);}
 return out;
}
/** Sorted, de-duplicated changed field paths (empty ⇔ same rows by identity and value). */
export function diffProjections(before:Projection,after:Projection):string[]{
 if(before.module!==after.module)return ['module'];
 const a=indexed(before),b=indexed(after);const out=new Set<string>();
 for(const id of new Set([...a.keys(),...b.keys()])){
  const x=a.get(id),y=b.get(id);
  if(!x||!y){out.add(`${before.module}[${id}]`);continue;}
  for(const f of new Set([...Object.keys(x),...Object.keys(y)]))if(canonicalJson(x[f]??null)!==canonicalJson(y[f]??null))out.add(`${before.module}[${id}].${f}`);
 }
 return [...out].sort(cmp);
}
