// src/lib/industry/db.ts
// IndustryDb (spec §4.9): the only data access of the industry module. Every write of a protected
// table is a SQL function of migration 20261111091000 called through rpc (service_role holds no
// insert/update/delete/truncate there, spec §4.3 V1/V2); the one direct table write is
// upsertClassifications (service_role keeps insert/update on industry_classifications). Reads use
// .from() under RLS, so an anon client sees exactly the licensed rows. Errors: SQL raises carry the
// code as the message → IndustryDbError(code); 23P01 → membership_overlap; 42501 →
// IndustryDbError('unknown','permission_denied'); the rest → unknown. Table reads that feed planning
// are complete-set reads paged past PostgREST max_rows (1,000) in a fixed order. numeric columns are
// read from their *_text twins (PostgREST sends numeric as a JSON number); timestamps are returned
// in toISOString() form. The row normalisers and argument builders below are shared with
// pg-industry-db.ts so both adapters return identical shapes. New RPCs are not registered in
// database.types.ts (repo convention): the client is narrowed locally.
import type {SupabaseClient} from '@supabase/supabase-js';
import {chunk,chunkIds,isoTs} from '../facts/db';
import type {PgErrorLike} from '../facts/db';
import {IndustryDbError} from './types';
import type {
 AggDuration,AggMetric,ApplyMembershipsResult,ClassificationRow,CorrectWindowsResult,FreshnessRow,IndustryDb,IndustryDbErrorCode,ManifestGcClaim,ManifestUnresolved,MarkRow,
 MembershipRow,MetricCellRow,MetricRunRow,NewMetricRun,ObservationResult,RunDependency,RunKind,SourceMembershipInput,
 SourceMembershipRow,StagedMetricCell,ValuationCellRow,ValuationRunRow,
} from './types';
export {IndustryDbError} from './types';
export type {IndustryDb} from './types';

/** Rows per stage_industry_metrics / apply_observations / upsert_industry_source_memberships call. */
export const STAGE_CHUNK=500;
/** Rows per stage_industry_run_dependencies call (one row per cell × candidate member). */
export const DEPS_CHUNK=2000;
/** Page size of complete-set table reads (= PostgREST max_rows). */
export const READ_PAGE=1000;
/** gc_industry_manifest_candidates / delete_industry_manifests skip index rows younger than this (a building run uploads before it stages). */
export const MANIFEST_GC_GRACE_SECONDS=86400;
const MESSAGE_CODES:readonly IndustryDbErrorCode[]=['membership_conflict','membership_overlap','same_day_change','incomplete_run','obsolete_run','dependencies_incomplete','dependency_regression','pairs_mismatch','illegal_transition','run_not_building','fetch_event_payload_changed','manifest_gc_in_progress','lease_lost'];

/** PostgreSQL / PostgREST error → IndustryDbError (shared by the Supabase and pg adapters). */
export function toIndustryDbError(e:PgErrorLike|IndustryDbError):IndustryDbError{
 if(e instanceof IndustryDbError)return e;
 const message=e.message??'';
 const head=message.split(/[\s:]/,1)[0];
 if((MESSAGE_CODES as readonly string[]).includes(head))return new IndustryDbError(head as IndustryDbErrorCode,message);
 if(e.code==='23P01')return new IndustryDbError('membership_overlap',message||'membership_overlap');
 if(e.code==='42501')return new IndustryDbError('unknown','permission_denied');
 return new IndustryDbError('unknown',message||'unknown');
}

const str=(v:unknown):string=>String(v);
const strOrNull=(v:unknown):string|null=>v===null||v===undefined?null:String(v);
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:isoTs(v);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const numOrNull=(v:unknown):number|null=>v===null||v===undefined?null:Number(v);
/** Key-sorted JSON: jsonb reorders object keys, so stored and incoming attributes compare by content. */
export function stableJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(stableJson).join(',')}]`;
 if(v&&typeof v==='object')return `{${Object.keys(v as object).sort().map(k=>`${JSON.stringify(k)}:${stableJson((v as Record<string,unknown>)[k])}`).join(',')}}`;
 return JSON.stringify(v);
}

export function classificationFromTable(r:Record<string,unknown>):ClassificationRow{
 return {scheme:r.scheme as ClassificationRow['scheme'],version:r.version as ClassificationRow['version'],code:str(r.code),level:Number(r.level),name_zh:strOrNull(r.name_zh),name_en:strOrNull(r.name_en),parent_code:strOrNull(r.parent_code),attributes:obj(r.attributes)};
}
/** Same node content (level, names, parent, attributes); scheme/version/code are the key. */
export function sameClassification(a:ClassificationRow,b:ClassificationRow):boolean{
 return a.level===b.level&&a.name_zh===b.name_zh&&a.name_en===b.name_en&&a.parent_code===b.parent_code&&stableJson(a.attributes??{})===stableJson(b.attributes??{});
}
export function sourceFromTable(r:Record<string,unknown>):SourceMembershipRow{
 return {id:str(r.id),scheme:'sw2021',version:'2021',source:str(r.source),ts_code:str(r.ts_code),name:strOrNull(r.name),l1_code:str(r.l1_code),l2_code:str(r.l2_code),l3_code:str(r.l3_code),
  in_date:str(r.in_date),out_date:strOrNull(r.out_date),observed_at:isoTs(r.observed_at),batch_id:str(r.batch_id),raw_hash:str(r.raw_hash),locator:obj(r.locator),
  status:r.status as SourceMembershipRow['status'],superseded_by:strOrNull(r.superseded_by),issuer_id:strOrNull(r.issuer_id),
  resolution:obj(r.resolution) as SourceMembershipRow['resolution'],resolution_error:(r.resolution_error??null) as SourceMembershipRow['resolution_error']};
}
export function membershipFromTable(r:Record<string,unknown>):MembershipRow{
 return {membership_id:str(r.membership_id),issuer_id:str(r.issuer_id),scheme:r.scheme as MembershipRow['scheme'],version:r.version as MembershipRow['version'],code:str(r.code),level:Number(r.level),
  valid_from:str(r.valid_from),valid_to:strOrNull(r.valid_to),available_date:str(r.available_date),valid_to_available_date:strOrNull(r.valid_to_available_date),
  source:str(r.source),source_membership_id:strOrNull(r.source_membership_id),batch_id:str(r.batch_id),status:r.status as MembershipRow['status'],superseded_by:strOrNull(r.superseded_by),
  provenance:obj(r.provenance) as MembershipRow['provenance']};
}
export function markFromTable(r:Record<string,unknown>):MarkRow{
 return {observation_id:str(r.observation_id),ticker:str(r.ticker),trade_date:str(r.trade_date),fetch_event_id:str(r.fetch_event_id),observed_at:isoTs(r.observed_at),
  close:str(r.close_text),total_share:str(r.total_share_text),free_share:strOrNull(r.free_share_text),market_cap:str(r.market_cap_text),source:str(r.source),upstream:r.upstream as MarkRow['upstream'],raw_hash:str(r.raw_hash),
  locator:obj(r.locator),batch_id:str(r.batch_id),status:r.status as MarkRow['status'],supersedes:strOrNull(r.supersedes)};
}
export function metricRunFromTable(r:Record<string,unknown>):MetricRunRow{
 const g=obj(r.expected_grid);
 return {run_id:str(r.run_id),scheme:r.scheme as MetricRunRow['scheme'],version:r.version as MetricRunRow['version'],level:Number(r.level),generation:Number(r.generation),
  facts_as_of:str(r.facts_as_of),knowledge_date:str(r.knowledge_date),history_class:r.history_class as MetricRunRow['history_class'],method_version:str(r.method_version),
  config_hash:str(r.config_hash),formula_version:str(r.formula_version),code_version:str(r.code_version),
  expected_grid:{codes:Array.isArray(g.codes)?g.codes.map(String):[],period_ends:Array.isArray(g.period_ends)?g.period_ends.map(String):[],metrics:Array.isArray(g.metrics)?g.metrics.map(x=>String(x) as AggMetric):[]},
  fingerprint_at:isoTs(r.fingerprint_at),reused_from_run:strOrNull(r.reused_from_run),batch_id:str(r.batch_id),status:r.status as MetricRunRow['status'],
  coverage_summary:obj(r.coverage_summary),created_at:isoTs(r.created_at),activated_at:isoOrNull(r.activated_at)};
}
export function metricCellFromTable(r:Record<string,unknown>):MetricCellRow{
 return {run_id:str(r.run_id),code:str(r.code),metric:r.metric as AggMetric,period_start:str(r.period_start),period_end:str(r.period_end),duration:r.duration as AggDuration,
  status:r.status as MetricCellRow['status'],missing_reason:(r.missing_reason??null) as MetricCellRow['missing_reason'],value:strOrNull(r.value_text),unit:str(r.unit),
  n_members:Number(r.n_members),n_with_data:Number(r.n_with_data),n_unresolved:Number(r.n_unresolved),manifest_hash:strOrNull(r.manifest_hash),updated_at:isoOrNull(r.updated_at)};
}
export function valuationRunFromTable(r:Record<string,unknown>):ValuationRunRow{
 return {run_id:str(r.run_id),scheme:r.scheme as ValuationRunRow['scheme'],version:r.version as ValuationRunRow['version'],level:Number(r.level),generation:Number(r.generation),
  method_version:str(r.method_version),config_hash:str(r.config_hash),formula_version:str(r.formula_version),code_version:str(r.code_version),
  expected_dates:Array.isArray(r.expected_dates)?r.expected_dates.map(String):[],comparator_basis:r.comparator_basis as ValuationRunRow['comparator_basis'],recompute_from:str(r.recompute_from),
  carried_from_run:strOrNull(r.carried_from_run),fingerprint_at:isoTs(r.fingerprint_at),batch_id:str(r.batch_id),status:r.status as ValuationRunRow['status'],
  reconciliation:obj(r.reconciliation),created_at:isoTs(r.created_at),published_at:isoOrNull(r.published_at),activated_at:isoOrNull(r.activated_at)};
}
export function valuationCellFromTable(r:Record<string,unknown>):ValuationCellRow{
 return {run_id:str(r.run_id),scheme:r.scheme as ValuationCellRow['scheme'],version:r.version as ValuationCellRow['version'],code:str(r.code),trade_date:str(r.trade_date),
  metric:r.metric as ValuationCellRow['metric'],status:r.status as ValuationCellRow['status'],missing_reason:strOrNull(r.missing_reason),value:strOrNull(r.value_text),
  facts_as_of:str(r.facts_as_of),n_members:numOrNull(r.n_members),n_with_data:numOrNull(r.n_with_data),n_unresolved:numOrNull(r.n_unresolved),
  mcap_coverage:strOrNull(r.mcap_coverage_text),manifest_hash:strOrNull(r.manifest_hash),updated_at:isoOrNull(r.updated_at),series_qualified:r.series_qualified===true,published:r.published===true};
}
export const dependencyFromTable=(r:Record<string,unknown>):RunDependency=>({cell_key:str(r.cell_key),issuer_id:str(r.issuer_id),state_rev:Number(r.state_rev)});
export const freshnessFromJson=(x:unknown):FreshnessRow[]=>(Array.isArray(x)?x:[]).map(r=>{const o=obj(r);return {dataset:str(o.dataset),status:o.status as FreshnessRow['status'],last_ok_at:isoOrNull(o.last_ok_at)};});
/** gc_industry_manifest_candidates jsonb → claims (hash, incarnation object path, claim token; Codex round 2 R2-1). */
export const gcClaimsFromJson=(x:unknown):ManifestGcClaim[]=>(Array.isArray(x)?x:[]).map(r=>{const o=obj(r);return {hash:str(o.hash),objectPath:str(o.object_path),claim:str(o.claim)};});
export const unresolvedFromTable=(r:Record<string,unknown>):ManifestUnresolved=>({ts_code:str(r.ts_code),in_date:str(r.in_date),out_date:strOrNull(r.out_date),source_membership_id:str(r.id)});
/** Distinct ts_code count of unresolved records (spec §5.2 n_unresolved). */
export const distinctTsCodes=(rows:ManifestUnresolved[]):number=>new Set(rows.map(r=>r.ts_code)).size;
/** Source-record column holding the code of a level (1→l1_code, 2→l2_code, 3→l3_code). */
export function levelColumn(level:number):'l1_code'|'l2_code'|'l3_code'{
 if(level===1)return 'l1_code';if(level===2)return 'l2_code';if(level===3)return 'l3_code';
 throw new IndustryDbError('unknown',`invalid_level:${level}`);
}

/** NewMetricRun → create_industry_metric_run argument (one jsonb object). */
export function newRunArgs(r:NewMetricRun):Record<string,unknown>{
 return {scheme:r.scheme,version:r.version,level:r.level,facts_as_of:r.facts_as_of,knowledge_date:r.knowledge_date,history_class:r.history_class,method_version:r.method_version,
  config_hash:r.config_hash,formula_version:r.formula_version,code_version:r.code_version,expected_grid:r.expected_grid,fingerprint_at:r.fingerprint_at,
  reused_from_run:r.reused_from_run,batch_id:r.batch_id};
}
/** StagedMetricCell → stage_industry_metrics row (value stays a decimal string; run/updated_at come from the function). */
export function stagedCellArgs(rows:StagedMetricCell[]):Record<string,unknown>[]{
 return rows.map(c=>({code:c.code,metric:c.metric,period_start:c.period_start,period_end:c.period_end,duration:c.duration,status:c.status,missing_reason:c.missing_reason,
  value:c.value,unit:c.unit,n_members:c.n_members,n_with_data:c.n_with_data,n_unresolved:c.n_unresolved,manifest_hash:c.manifest_hash}));
}
export function sourceArgs(rows:SourceMembershipInput[]):Record<string,unknown>[]{
 return rows.map(r=>({source:r.source,ts_code:r.ts_code,name:r.name,l1_code:r.l1_code,l2_code:r.l2_code,l3_code:r.l3_code,in_date:r.in_date,out_date:r.out_date,observed_at:r.observed_at,raw_hash:r.raw_hash,locator:r.locator}));
}
export function upsertSourceResult(x:unknown):{inserted:number;superseded:number;duplicates:number;changed:{old_id:string;new_id:string;nullToDate:boolean}[]}{
 const o=obj(x);
 return {inserted:Number(o.inserted??0),superseded:Number(o.superseded??0),duplicates:Number(o.duplicates??0),
  changed:(Array.isArray(o.changed)?o.changed:[]).map(c=>{const y=obj(c);return {old_id:str(y.old_id),new_id:str(y.new_id),nullToDate:y.null_to_date===true};})};
}
export function correctResult(x:unknown):CorrectWindowsResult{return {...applyResult(x),quarantined:Number(obj(x).quarantined??0)};}
export function applyResult(x:unknown):ApplyMembershipsResult{
 const o=obj(x);
 return {inserted:Number(o.inserted??0),closed:Number(o.closed??0),superseded:Number(o.superseded??0),duplicates:Number(o.duplicates??0),membership_ids:(Array.isArray(o.membership_ids)?o.membership_ids:[]).map(String)};
}
export function observationResult(x:unknown):ObservationResult{const o=obj(x);return {inserted:Number(o.inserted??0),duplicates:Number(o.duplicates??0),superseded:Number(o.superseded??0)};}
export const addObservations=(a:ObservationResult,b:ObservationResult):ObservationResult=>({inserted:a.inserted+b.inserted,duplicates:a.duplicates+b.duplicates,superseded:a.superseded+b.superseded});
export function fingerprintFromJson(x:unknown):{takenAt:string;revs:Map<string,number>}{
 const o=obj(x);const revs=new Map<string,number>();
 for(const r of Array.isArray(o.revs)?o.revs:[]){const y=obj(r);revs.set(str(y.issuer_id),Number(y.state_rev));}
 return {takenAt:isoTs(o.taken_at),revs};
}
export const runFamilyKey=(kind:RunKind,scheme:string,version:string,level:number)=>`${kind}:${scheme}:${version}:${level}`;

interface RpcResult{data:unknown;error:PgErrorLike|null;count?:number|null}
// The query builder is left untyped on purpose (same as facts/db.ts and table-client.ts).
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}
type Query=PromiseLike<RpcResult>&{range:(from:number,to:number)=>Query};

export function supabaseIndustryDb(client:SupabaseClient):IndustryDb{
 const c=client as unknown as NarrowClient;
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toIndustryDbError(error);return data as T;};
 const rows=async<T>(q:PromiseLike<RpcResult>):Promise<T[]>=>{const {data,error}=await q;if(error)throw toIndustryDbError(error);return (data??[]) as T[];};
 /** `make` builds the filtered AND ordered query afresh per page; pages until a short page. */
 const pageAll=async(make:()=>Query):Promise<Record<string,unknown>[]>=>{
  const out:Record<string,unknown>[]=[];
  for(let from=0;;from+=READ_PAGE){
   const part=await rows<Record<string,unknown>>(make().range(from,from+READ_PAGE-1));
   out.push(...part);
   if(part.length<READ_PAGE)return out;
  }
 };
 const unresolvedOf=async(q:{code:string;level:number;on:string;knownBy:string})=>{
  const col=levelColumn(q.level);const upTo=q.on<q.knownBy?q.on:q.knownBy;
  return (await pageAll(()=>c.from('industry_source_memberships').select('id,ts_code,in_date,out_date').eq('status','current').is('issuer_id',null).eq(col,q.code)
   .lte('in_date',upTo).or(`out_date.is.null,out_date.gte.${q.on}`).order('ts_code').order('in_date').order('id'))).map(unresolvedFromTable);
 };
 const db:IndustryDb={
  async upsertClassifications(_batch,input){
   let inserted=0,unchanged=0;const conflicts:ClassificationRow[]=[];
   const groups=new Map<string,ClassificationRow[]>();
   for(const r of input){const k=`${r.scheme}\u0000${r.version}`;groups.set(k,[...(groups.get(k)??[]),r]);}
   for(const group of groups.values()){
    const existing=new Map((await db.classificationTree(group[0].scheme,group[0].version)).map(r=>[r.code,r]));
    const fresh:ClassificationRow[]=[];
    for(const r of group){
     const e=existing.get(r.code);
     if(!e){if(!fresh.some(f=>f.code===r.code))fresh.push(r);continue;}
     if(sameClassification(e,r))unchanged++;else conflicts.push(r);
    }
    fresh.sort((a,b)=>a.level-b.level||(a.code<b.code?-1:a.code>b.code?1:0));   // parents before children (parent FK)
    for(const part of chunk(fresh,STAGE_CHUNK)){
     if(part.length===0)continue;
     const {error}=await c.from('industry_classifications').insert(part.map(r=>({scheme:r.scheme,version:r.version,code:r.code,level:r.level,name_zh:r.name_zh,name_en:r.name_en,parent_code:r.parent_code,attributes:r.attributes??{}})));
     if(error)throw toIndustryDbError(error);
     inserted+=part.length;
    }
   }
   return {inserted,unchanged,conflicts};
  },
  async classificationTree(scheme,version){
   return (await pageAll(()=>c.from('industry_classifications').select('*').eq('scheme',scheme).eq('version',version).order('level').order('code'))).map(classificationFromTable);
  },
  async setDatasetLicense(key,status,by,note){await call('set_industry_dataset_license',{p_key:key,p_status:status,p_by:by,p_note:note});},
  async isDatasetPublic(key){return (await call<unknown>('industry_dataset_is_public',{p_key:key}))===true;},
  async upsertSourceMemberships(batch,input){
   const out={inserted:0,superseded:0,duplicates:0,changed:[] as {old_id:string;new_id:string;nullToDate:boolean}[]};
   for(const part of chunk(input,STAGE_CHUNK)){
    if(part.length===0)continue;
    const r=upsertSourceResult(await call<unknown>('upsert_industry_source_memberships',{p_batch:batch,p_rows:sourceArgs(part)}));
    out.inserted+=r.inserted;out.superseded+=r.superseded;out.duplicates+=r.duplicates;out.changed.push(...r.changed);
   }
   return out;
  },
  async currentSourceMemberships(opts){
   return (await pageAll(()=>{
    let q=c.from('industry_source_memberships').select('*').eq('status','current');
    if(opts.l1Code!==undefined)q=q.eq('l1_code',opts.l1Code);
    if(opts.unresolvedOnly)q=q.is('issuer_id',null);
    return q.order('ts_code').order('l3_code').order('in_date').order('id');
   })).map(sourceFromTable);
  },
  async recordResolutionError(ids,error){return Number(await call<unknown>('record_industry_source_resolution_error',{p_ids:ids,p_error:error}));},
  async applyMemberships(batch,issuer,scheme,version,input,sourceIds,resolution){
   return applyResult(await call<unknown>('apply_industry_memberships',{p_batch:batch,p_issuer:issuer,p_scheme:scheme,p_version:version,p_rows:input,p_source_ids:sourceIds,p_resolution:resolution}));
  },
  async correctMembershipWindows(batch,issuer,scheme,version,sourceId,rows){return correctResult(await call<unknown>('correct_industry_membership_windows',{p_batch:batch,p_issuer:issuer,p_scheme:scheme,p_version:version,p_source:sourceId,p_rows:rows}));},
  async applySicMembership(batch,issuer,observed,code,provenance,fence){
   const x=await call<{outcome:'inserted'|'duplicate'|'changed'|'none'}>('apply_sic_memberships',{p_batch:batch,p_issuer:issuer,p_version:'sec-current',p_observed:observed,p_code:code,p_provenance:provenance,p_lease_batch:fence.leaseBatch,p_sec_submissions:fence.secSubmissions??null});
   return x.outcome;
  },
  async membershipCandidates(q){
   return (await pageAll(()=>c.from('issuer_industry_memberships').select('*').eq('scheme',q.scheme).eq('version',q.version).eq('code',q.code).eq('level',q.level)
    .lte('valid_from',q.on).order('issuer_id').order('valid_from').order('membership_id'))).map(membershipFromTable);
  },
  async membershipsOfIssuer(issuer,q){
   return (await pageAll(()=>{
    let x=c.from('issuer_industry_memberships').select('*').eq('issuer_id',issuer);
    if(q.scheme!==undefined)x=x.eq('scheme',q.scheme);
    if(q.on!==undefined)x=x.lte('valid_from',q.on).or(`valid_to.is.null,valid_to.gt.${q.on}`);
    return x.order('scheme').order('version').order('level').order('valid_from').order('membership_id');
   })).map(membershipFromTable);
  },
  beginFetchEvent:(job,params,batch)=>call<string>('begin_industry_fetch_event',{p_job:job,p_params:params,p_batch:batch}),
  async retryFetchEvent(id){await call('retry_industry_fetch_event',{p_id:id});},
  async applyObservations(kind:'marks'|'official',fetchEventId:string,input:unknown[]){
   let out:ObservationResult={inserted:0,duplicates:0,superseded:0};
   for(const part of chunk(input,STAGE_CHUNK)){
    if(part.length===0)continue;
    out=addObservations(out,observationResult(await call<unknown>('apply_observations',{p_kind:kind,p_fetch_event:fetchEventId,p_rows:part})));
   }
   return out;
  },
  async currentMarksOn(tradeDate,tickers){
   const out:MarkRow[]=[];
   for(const part of chunkIds([...new Set(tickers)]))out.push(...(await pageAll(()=>c.from('security_marks').select('*').eq('trade_date',tradeDate).eq('status','ok').in('ticker',part).order('ticker'))).map(markFromTable));
   return out.sort((a,b)=>a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0);
  },
  async createMetricRun(row){
   const x=await call<{run_id:string;generation:number|string}>('create_industry_metric_run',{p:newRunArgs(row)});
   return {runId:String(x.run_id),generation:Number(x.generation)};
  },
  async setMetricRunCoverage(run,summary){await call('set_industry_metric_run_coverage',{p_run:run,p_summary:summary});},
  async stageMetricRows(run,input){let n=0;for(const part of chunk(input,STAGE_CHUNK))n+=Number(await call<unknown>('stage_industry_metrics',{p_run:run,p_rows:stagedCellArgs(part)}));return n;},
  async stageRunDependencies(run,kind,input){let n=0;for(const part of chunk(input,DEPS_CHUNK))n+=Number(await call<unknown>('stage_industry_run_dependencies',{p_run:run,p_kind:kind,p_rows:part}));return n;},
  async activateMetricRun(run){const x=await call<{activated_at:string}>('activate_industry_metric_run',{p_run:run});return {activatedAt:isoTs(x.activated_at)};},
  async failRun(kind,run,reason){await call('fail_industry_run',{p_kind:kind,p_run:run,p_reason:reason});},
  async activeMetricRun(scheme,version,level){
   const r=await rows<Record<string,unknown>>(c.from('industry_metric_runs').select('*').eq('scheme',scheme).eq('version',version).eq('level',level).eq('status','active').limit(1));
   return r[0]?metricRunFromTable(r[0]):null;
  },
  async metricRun(run){const r=await rows<Record<string,unknown>>(c.from('industry_metric_runs').select('*').eq('run_id',run).limit(1));return r[0]?metricRunFromTable(r[0]):null;},
  async metricRowsOfRun(run,filter={}){
   return (await pageAll(()=>{
    let q=c.from('industry_metrics').select('*').eq('run_id',run);
    if(filter.codes)q=q.in('code',filter.codes);
    if(filter.metrics)q=q.in('metric',filter.metrics);
    if(filter.periodEnds)q=q.in('period_end',filter.periodEnds);
    if(filter.durations)q=q.in('duration',filter.durations);
    return q.order('code').order('metric').order('period_end').order('period_start');
   })).map(metricCellFromTable);
  },
  async runDependencies(kind,run){
   return (await pageAll(()=>c.from('industry_run_dependencies').select('cell_key,issuer_id,state_rev').eq('run_kind',kind).eq('run_id',run).order('cell_key').order('issuer_id'))).map(dependencyFromTable);
  },
  async activeValuationRun(scheme,version,level){
   const r=await rows<Record<string,unknown>>(c.from('industry_valuation_runs').select('*').eq('scheme',scheme).eq('version',version).eq('level',level).eq('status','active').limit(1));
   return r[0]?valuationRunFromTable(r[0]):null;
  },
  async publishedValuations(run,filter){
   return (await pageAll(()=>{
    let q=c.from('industry_valuations').select('*').eq('run_id',run).eq('published',true);
    if(filter.codes)q=q.in('code',filter.codes);
    if(filter.from!==undefined)q=q.gte('trade_date',filter.from);
    if(filter.to!==undefined)q=q.lte('trade_date',filter.to);
    return q.order('code').order('metric').order('trade_date');
   })).map(valuationCellFromTable);
  },
  async registerManifest(hash,kind,byteLength){return (await call<unknown>('put_industry_manifest',{p_hash:hash,p_kind:kind,p_bytes:byteLength}))===true;},
  async manifestObjectPath(hash){const r=await rows<{object_path:string}>(c.from('industry_manifests').select('object_path').eq('manifest_hash',hash).limit(1));return r[0]?.object_path??null;},
  async manifestGcCandidates(limit){return gcClaimsFromJson(await call<unknown>('gc_industry_manifest_candidates',{p_limit:limit}));},
  async deleteManifestIndex(claims){return Number(await call<unknown>('delete_industry_manifests',{p_claims:claims}));},
  async pruneRuns(keep){return Number(await call<unknown>('prune_industry_runs',{p_keep:keep}));},
  async stateFingerprint(market){return fingerprintFromJson(await call<unknown>('industry_state_fingerprint',{p_market:market}));},
  async freshness(){return freshnessFromJson(await call<unknown>('industry_freshness',{}));},
  async metricRunVisible(run){return (await call<unknown>('industry_metric_run_visible',{p_run:run}))===true;},
  async unresolvedCount(q){return distinctTsCodes(await unresolvedOf(q));},
  unresolvedOf,
 };
 return db;
}
