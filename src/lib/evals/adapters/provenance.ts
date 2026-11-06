// src/lib/evals/adapters/provenance.ts
// Source-chain resolution of facts rows (spec §5.1.4; §0 R5-5, R5-6). raw_hash is NEVER an object name: the resolver
// lists disclosure-raw/{source}/{issuer_id}/, downloads each {sha256}.json, checks sha256(bytes) = the name, re-parses
// it with the landed parser of its source (parseCompanyFacts; parseTushareStatements on that one page, its meta read
// from the {sha256}.meta.json sidecar) and looks for the candidate whose rawHash (= rawHashOf(snapshot sha, locator))
// equals the stored raw_hash. That candidate must agree with the stored row on concept, period, duration, unit, the
// filing's source_ref and the lossless value (a Tushare sum is the parser's own summed candidate); {object_path,
// locator} are recorded. producer_code_version = fact_sync_runs.run_id → batch_id → ingest_batches.code_version.
// factsByIds visibility depends on the caller's role (a privileged run sees non-ok rows), so eligibility is checked
// explicitly (R5-6): status ok, same issuer and market, mapping_gen = the filing's active generation. A metric row is
// resolved through every input fact. Parsed objects are memoised per path (content-addressed, immutable) and producer
// versions per run_id; listings, filings and fact rows are read fresh on every call. Any failed step → ok:false + reason.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {TableClient} from '../../db/table-client';
import {decimalEquals} from '../../facts/json-numbers';
import {sha256Hex} from '../../facts/providers/shared';
import {SNAPSHOT_BUCKET,metaPath} from '../../facts/snapshot-store';
import type {FactCandidate,FactRow,FactsDb,FilingRow,ParseResult,RawSnapshot,Source} from '../../facts/types';
import type {ProvenanceCheck,ReadRow,SubjectRef} from '../types';

export interface RawObjectStorage{
 /** Full object paths under `prefix` (e.g. 'edgar/<issuer_id>/'), sidecars included; callers filter. */
 list(prefix:string):Promise<string[]>;
 /** Object bytes, or null when the object does not exist. */
 get(path:string):Promise<Uint8Array|null>;
}
export interface SnapshotParsers{edgar:(snapshot:RawSnapshot,opts:{sinceYear:number})=>ParseResult;tushare:(snapshots:RawSnapshot[],opts:{sinceYear:number})=>ParseResult}
export interface ProvenanceDeps{db:Pick<FactsDb,'factsByIds'|'filingsOfIssuer'>;tables:TableClient;storage:RawObjectStorage;parsers:SnapshotParsers}
export interface InputProvenance{fact_id:string;concept:string;ok:boolean;reason:string|null;source_ref:string|null;raw_hash:string|null;producer_code_version:string|null;object_path:string|null;locator:string|null}
/** ProvenanceCheck plus, for a metric row, one chain per input fact (CCR 1; named input_chains so it does not clash with the contract's ProvenanceCheck.inputs). */
export interface FactProvenance extends ProvenanceCheck{input_chains?:InputProvenance[]}
export type ProvenanceResolver=(ref:SubjectRef,row:ReadRow,opts:{artifacts:boolean})=>Promise<FactProvenance>;

export const FACT_FIELDS=['fact_id','filing_id','source_ref','available_date','mapping_gen','mapping_version','raw_hash','run_id'] as const;
export const METRIC_FIELDS=['metric','formula_version','basis','input_unit','inputs[].fact_id','based_on_rev'] as const;
/** Stored objects are re-parsed in full: the locator, not a since-year window, identifies the row. */
export const PARSE_SINCE_YEAR=1900;
export const STORAGE_LIST_PAGE=1000;
const OBJECT_NAME=/^[0-9a-f]{64}\.json$/;
const STORED_NAME=/^[0-9a-f]{64}(\.meta)?\.json$/;
const blank=(v:unknown)=>v===undefined||v===null||v==='';
const baseName=(p:string)=>p.slice(p.lastIndexOf('/')+1);

/** Required source-chain fields the row lacks (spec §5.1.4 table, in table order); the unprivileged check is exactly this. */
export function missingFields(row:ReadRow):string[]{
 const m=row.metric;
 if(m){
  const out:string[]=[];
  for(const k of ['metric','formula_version','basis','input_unit'] as const)if(blank(m[k]))out.push(k);
  if(m.inputs.length===0||m.inputs.some(i=>blank(i.fact_id)))out.push('inputs[].fact_id');
  if(!Number.isInteger(m.based_on_rev))out.push('based_on_rev');
  return out;
 }
 return FACT_FIELDS.filter(k=>blank(row[k]));
}

/** fact_sync_runs.run_id → batch_id → ingest_batches.code_version; null when any link or the version is missing. */
export async function producerCodeVersion(tables:TableClient,runId:string):Promise<string|null>{
 const [run]=await tables.select('fact_sync_runs',{run_id:runId},{limit:1});
 if(!run||blank(run.batch_id))return null;
 const [batch]=await tables.select('ingest_batches',{batch_id:String(run.batch_id)},{limit:1});
 const v=batch?.code_version;
 return typeof v==='string'&&v.trim()!==''?v:null;
}

type Parsed=ParseResult|'hash_mismatch'|'unreadable';
async function loadAndParse(deps:ProvenanceDeps,source:Source,path:string):Promise<Parsed>{
 const bytes=await deps.storage.get(path);
 if(bytes===null)return 'unreadable';
 const sha=sha256Hex(bytes);
 if(`${sha}.json`!==baseName(path))return 'hash_mismatch';
 try{
  if(source==='edgar')return deps.parsers.edgar({bytes,sha256:sha,meta:{source:'edgar',fetched_at:'',http_status:200}},{sinceYear:PARSE_SINCE_YEAR});
  const metaBytes=await deps.storage.get(metaPath(path));
  if(metaBytes===null)return 'unreadable';
  const meta={...(JSON.parse(new TextDecoder().decode(metaBytes)) as Record<string,unknown>)};
  delete meta.sha256;delete meta.bytes;
  const snapshot:RawSnapshot={bytes,sha256:sha,meta:{...(meta as Partial<RawSnapshot['meta']>),source:'tushare',fetched_at:String(meta.fetched_at??''),http_status:Number(meta.http_status??200)}};
  return deps.parsers.tushare([snapshot],{sinceYear:PARSE_SINCE_YEAR});
 }catch{return 'unreadable';}
}

function candidateMismatch(c:FactCandidate,f:FactRow,g:FilingRow):string|null{
 if(c.concept!==f.concept)return 'concept';
 if(c.periodStart!==f.period_start||c.periodEnd!==f.period_end)return 'period';
 if(c.duration!==f.duration)return 'duration';
 if(c.unit!==f.unit)return 'unit';
 if(c.filingRef!==g.source_ref)return 'source_ref';
 if(!decimalEquals(c.value,f.value_text))return 'value';
 return null;
}

interface Resolved{ok:boolean;reason:string|null;source_ref:string|null;raw_hash:string|null;producer_code_version:string|null;object_path:string|null;locator:string|null}
const failed=(reason:string,over:Partial<Resolved>={}):Resolved=>({ok:false,reason,source_ref:null,raw_hash:null,producer_code_version:null,object_path:null,locator:null,...over});
interface Expect{source_ref?:string;value_text?:string;raw_hash?:string;run_id?:string;concept?:string}

export function provenanceResolver(deps:ProvenanceDeps):ProvenanceResolver{
 const parsed=new Map<string,Promise<Parsed>>();
 const producers=new Map<string,Promise<string|null>>();
 const parseObject=(source:Source,path:string):Promise<Parsed>=>{
  let p=parsed.get(path);
  if(!p){p=loadAndParse(deps,source,path);parsed.set(path,p);}
  return p;
 };
 const producerOf=(runId:string):Promise<string|null>=>{
  let p=producers.get(runId);
  if(!p){const q=producerCodeVersion(deps.tables,runId);producers.set(runId,q);q.catch(()=>{if(producers.get(runId)===q)producers.delete(runId);});p=q;}
  return p;
 };
 const locate=async(source:Source,issuerId:string,rawHash:string):Promise<{path:string;candidate:FactCandidate}|{reason:string}>=>{
  const paths=(await deps.storage.list(`${source}/${issuerId}/`)).filter(p=>OBJECT_NAME.test(baseName(p))).sort();
  let mismatched=0,unreadable=0;
  for(const path of paths){
   const r=await parseObject(source,path);
   if(r==='hash_mismatch'){mismatched++;continue;}
   if(r==='unreadable'){unreadable++;continue;}
   const candidate=r.candidates.find(c=>c.rawHash===rawHash);
   if(candidate)return {path,candidate};
  }
  return {reason:mismatched>0?'object_hash_mismatch':unreadable>0?'object_unreadable':paths.length===0?'no_raw_objects':'candidate_not_found'};
 };
 /** One stored fact: eligibility (R5-6), row agreement, filing, producer; with artifacts the snapshot candidate (R5-5). */
 const resolveFact=async(ref:SubjectRef,factId:string,expect:Expect,artifacts:boolean,input:boolean):Promise<Resolved>=>{
  const [stored]=await deps.db.factsByIds([factId]);
  if(!stored)return failed(input?'input_missing':'fact_missing');
  const notEligible=input?'input_not_eligible':'fact_not_eligible';
  if(stored.status!=='ok'||stored.issuer_id!==ref.issuerId||stored.market!==ref.market)return failed(notEligible,{raw_hash:stored.raw_hash});
  if(expect.concept!==undefined&&stored.concept!==expect.concept)return failed(notEligible,{raw_hash:stored.raw_hash});
  if(expect.value_text!==undefined&&!decimalEquals(expect.value_text,stored.value_text))return failed('row_mismatch:value',{raw_hash:stored.raw_hash});
  for(const k of ['raw_hash','run_id'] as const)if(expect[k]!==undefined&&expect[k]!==stored[k])return failed(`row_mismatch:${k}`,{raw_hash:stored.raw_hash});
  const filing=(await deps.db.filingsOfIssuer(ref.issuerId,ref.market,{})).find(f=>f.filing_id===stored.filing_id);
  if(!filing)return failed('filing_missing',{raw_hash:stored.raw_hash});
  if(stored.mapping_gen!==filing.mapping_gen)return failed(input?'input_not_eligible':'not_active_generation',{raw_hash:stored.raw_hash,source_ref:filing.source_ref});
  if(expect.source_ref!==undefined&&expect.source_ref!==filing.source_ref)return failed('source_ref_mismatch',{raw_hash:stored.raw_hash,source_ref:filing.source_ref});
  const producer=await producerOf(stored.run_id);
  const known={source_ref:filing.source_ref,raw_hash:stored.raw_hash,producer_code_version:producer};
  if(producer===null)return failed('producer_code_version_missing',known);
  if(!artifacts)return {ok:true,reason:null,...known,object_path:null,locator:null};
  const hit=await locate(filing.source,ref.issuerId,stored.raw_hash);
  if('reason' in hit)return failed(hit.reason,known);
  const mismatch=candidateMismatch(hit.candidate,stored,filing);
  if(mismatch!==null)return failed(`candidate_mismatch:${mismatch}`,{...known,object_path:hit.path});
  const locator=(hit.candidate as FactCandidate&{locator?:unknown}).locator;
  if(typeof locator!=='string'||locator==='')return failed('locator_missing',{...known,object_path:hit.path});
  return {ok:true,reason:null,...known,object_path:hit.path,locator};
 };
 return async(ref,row,opts)=>{
  const missing=missingFields(row);
  if(missing.length>0)return {ok:false,missing,reason:'fields_missing'};
  if(row.metric){
   const inputs:InputProvenance[]=[];
   for(const i of row.metric.inputs)inputs.push({fact_id:i.fact_id,concept:i.concept,...await resolveFact(ref,i.fact_id,{concept:i.concept},opts.artifacts,true)});
   const bad=inputs.find(x=>!x.ok);
   const versions=[...new Set(inputs.map(x=>x.producer_code_version).filter((v):v is string=>v!==null))].sort();
   const reason=bad?(bad.reason==='input_missing'||bad.reason==='input_not_eligible'?bad.reason:`input:${bad.reason}`):null;
   return {ok:!bad,missing:[],...(reason?{reason}:{}),...(versions.length>0?{producer_code_version:versions.join(',')}:{}),input_chains:inputs};
  }
  const r=await resolveFact(ref,row.fact_id!,{source_ref:row.source_ref,value_text:row.value_text,raw_hash:row.raw_hash,run_id:row.run_id},opts.artifacts,false);
  return {ok:r.ok,missing:[],...(r.reason?{reason:r.reason}:{}),...(r.producer_code_version?{producer_code_version:r.producer_code_version}:{}),...(r.object_path?{object_path:r.object_path}:{}),...(r.locator?{locator:r.locator}:{})};
 };
}

/** In-memory objects (memorySnapshotStore().objects): the unit tests and the F6 frozen world. */
export function memoryRawStorage(objects:Map<string,string|Uint8Array>):RawObjectStorage{
 return {
  async list(prefix){return [...objects.keys()].filter(k=>k.startsWith(prefix)).sort();},
  async get(path){const v=objects.get(path);if(v===undefined)return null;return typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v);},
 };
}

/** Supabase Storage (service_role): bucket disclosure-raw, listing paged by name; a missing object is null. */
export function supabaseRawStorage(admin:SupabaseClient):RawObjectStorage{
 const bucket=()=>admin.storage.from(SNAPSHOT_BUCKET);
 return {
  async list(prefix){
   const dir=prefix.replace(/\/+$/,'');const out:string[]=[];
   for(let offset=0;;offset+=STORAGE_LIST_PAGE){
    const {data,error}=await bucket().list(dir,{limit:STORAGE_LIST_PAGE,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw new Error(`storage_list_failed:${error.message}`);
    const page=data??[];
    for(const o of page)if(STORED_NAME.test(o.name))out.push(`${dir}/${o.name}`);
    if(page.length<STORAGE_LIST_PAGE)return out;
   }
  },
  async get(path){
   const {data,error}=await bucket().download(path);
   if(error){
    const e=error as {message:string;statusCode?:unknown;status?:unknown};
    if(String(e.statusCode??e.status??'')==='404'||/not.?found/i.test(e.message))return null;
    throw new Error(`storage_download_failed:${e.message}`);
   }
   return data?new Uint8Array(await data.arrayBuffer()):null;
  },
 };
}
