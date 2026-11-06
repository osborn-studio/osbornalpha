// src/lib/industry/manifest.ts
// Content-addressed input manifests (spec §5.3). buildAggregateManifest is pure: it assembles one
// (code, period_end) manifest from the run header, members, unresolved records, member state
// revisions and the aggregate result, maps each fact's filing to source_ref/citation through an
// explicit FactsDb.filingsOfIssuer lookup (FactRow carries neither; not found → null + warning), keeps
// plan 2 MetricRow.inputs verbatim (V5), and sorts every array by its total order:
//   members (issuer_id, valid_from); unresolved (ts_code, in_date, source_membership_id);
//   member_state_revs (issuer_id); facts (issuer_id, concept, period_start, period_end, unit, fact_id);
//   derived (issuer_id, metric, period_start, period_end, duration, unit); roles (metric, duration,
//   issuer_id); cells (metric, duration, period_start); warnings (unique, sorted).
// So shuffled inputs give byte-identical canonical JSON and the same hash. manifest_hash =
// sha256(canonical JSON, uncompressed). Storage key = the index row's object_path, an INCARNATION path
// 'sha256/<hash>/<uuid>.json.gz' chosen by put_industry_manifest when the row is created (Codex plan audit round 2
// R2-1): every re-registration after GC gets a new path, so a stale collector that claimed an earlier incarnation can
// only ever delete that earlier object. The object is uploaded AFTER the index row is registered
// (put_industry_manifest refuses a hash GC has claimed — round 1 #4), never overwritten (upsert:false; an existing
// object is the same bytes by construction). get() reads the CURRENT object_path from the index and verifies the
// hash of the decompressed bytes. gcManifests: claims {hash, objectPath, claim} → bucket remove of exactly those paths
// → index delete fenced by the claim token; a hash whose object removal failed keeps its index row.
import {gunzipSync,gzipSync} from 'node:zlib';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {FactRow,FilingRow,MetricRow} from '../facts/types';
import {canonicalDecimal} from '../facts/json-numbers';
import {canonicalJson,sha256Hex} from './canonical-json';
import type {AggregateCellResult} from './aggregate';
import type {AggregateManifest,HistoryClass,IndustryDb,ManifestCell,ManifestDerived,ManifestFact,ManifestMember,ManifestRole,ManifestStore,ManifestUnresolved,RunKind,Scheme,SchemeVersion} from './types';

export const MANIFEST_SCHEMA='industry-manifest/2';
export const MANIFEST_BUCKET='industry-manifests';
const HASH=/^[0-9a-f]{64}$/;
/** An incarnation path of `hash` as put_industry_manifest creates it. */
export const isManifestObjectPath=(path:string,hash:string)=>new RegExp(`^sha256/${hash}/[0-9a-f-]{36}\\.json\\.gz$`).test(path);

export interface ManifestHeader{scheme:Scheme;version:SchemeVersion;code:string;level:number;period_end:string;facts_as_of:string;knowledge_date:string;history_class:HistoryClass;method_version:string;config_hash:string;formula_version:string;code_version:string}
export interface BuildManifestInput{
 header:ManifestHeader;members:ManifestMember[];unresolved:ManifestUnresolved[];memberStateRevs:{issuer_id:string;state_rev:number}[];
 result:AggregateCellResult;
 /** filing_id → filing of every issuer that has facts in `result` (FactsDb.filingsOfIssuer, complete set) */
 filings:ReadonlyMap<string,FilingRow>;
}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const by=<T>(...keys:((x:T)=>string)[])=>(a:T,b:T)=>{for(const f of keys){const c=cmp(f(a),f(b));if(c!==0)return c;}return 0;};
const citationOf=(g:FilingRow):ManifestFact['citation']=>g.source==='edgar'?'edgar':g.document_ref!==null&&g.document_ref!==undefined?'linked':'pending';

function factOf(r:FactRow,filings:ReadonlyMap<string,FilingRow>,warnings:string[]):ManifestFact{
 const g=filings.get(r.filing_id);
 if(!g)warnings.push(`filing_not_found:${r.filing_id}`);
 return {issuer_id:r.issuer_id,concept:r.concept,period_start:r.period_start,period_end:r.period_end,duration:r.duration,fact_id:r.fact_id,value_text:canonicalDecimal(r.value),unit:r.unit,consolidation:r.consolidation,
  available_date:r.available_date,mapping_gen:r.mapping_gen,filing_id:r.filing_id,source_ref:g?g.source_ref:null,raw_hash:r.raw_hash,citation:g?citationOf(g):null};
}
const derivedOf=(m:MetricRow):ManifestDerived=>({issuer_id:m.issuer_id,metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,value:m.value,unit:m.unit,basis:m.basis,formula_version:m.formula_version,inputs:structuredClone(m.inputs)});

export function buildAggregateManifest(input:BuildManifestInput):AggregateManifest{
 const warnings=[...input.result.warnings];
 const facts=input.result.facts.map(r=>factOf(r,input.filings,warnings));
 const h=input.header;
 return {
  schema:MANIFEST_SCHEMA,kind:'aggregate',scheme:h.scheme,version:h.version,code:h.code,level:h.level,period_end:h.period_end,
  facts_as_of:h.facts_as_of,knowledge_date:h.knowledge_date,history_class:h.history_class,method_version:h.method_version,config_hash:h.config_hash,formula_version:h.formula_version,code_version:h.code_version,
  members:input.members.map(x=>({...x,locator:x.locator===null?null:structuredClone(x.locator)})).sort(by(x=>x.issuer_id,x=>x.valid_from)),
  unresolved:input.unresolved.map(x=>({...x})).sort(by(x=>x.ts_code,x=>x.in_date,x=>x.source_membership_id)),
  member_state_revs:input.memberStateRevs.map(x=>({issuer_id:x.issuer_id,state_rev:x.state_rev})).sort(by(x=>x.issuer_id)),
  facts:facts.sort(by(x=>x.issuer_id,x=>x.concept,x=>x.period_start??'',x=>x.period_end,x=>x.unit,x=>x.fact_id)),
  derived:input.result.derived.map(derivedOf).sort(by(x=>x.issuer_id,x=>x.metric,x=>x.period_start,x=>x.period_end,x=>x.duration,x=>x.unit)),
  roles:input.result.roles.map((x):ManifestRole=>({...x})).sort(by(x=>x.metric,x=>x.duration,x=>x.issuer_id)),
  cells:input.result.cells.map((x):ManifestCell=>({...x})).sort(by(x=>x.metric,x=>x.duration,x=>x.period_start)),
  warnings:[...new Set(warnings)].sort(cmp),
 };
}

export interface EncodedManifest{canonical:string;hash:string;gzip:Uint8Array}
export function encodeManifest(m:AggregateManifest):EncodedManifest{
 const canonical=canonicalJson(m);
 return {canonical,hash:sha256Hex(canonical),gzip:new Uint8Array(gzipSync(Buffer.from(canonical,'utf8')))};
}
export const manifestHash=(m:AggregateManifest)=>sha256Hex(canonicalJson(m));
/** gzip bytes → manifest; the decompressed bytes must hash to expectedHash and be canonical. */
export function decodeManifest(gz:Uint8Array,expectedHash?:string):AggregateManifest{
 const text=gunzipSync(Buffer.from(gz)).toString('utf8');
 const hash=sha256Hex(text);
 if(expectedHash!==undefined&&hash!==expectedHash)throw new Error(`manifest_hash_mismatch:${expectedHash}`);
 const m=JSON.parse(text) as AggregateManifest;
 if(m?.schema!==MANIFEST_SCHEMA||m.kind!=='aggregate')throw new Error('unsupported_manifest');
 if(canonicalJson(m)!==text)throw new Error('manifest_not_canonical');
 return m;
}
function checkCanonical(canonical:string):string{
 let parsed:unknown;
 try{parsed=JSON.parse(canonical);}catch{throw new Error('manifest_not_canonical');}
 if(canonicalJson(parsed)!==canonical)throw new Error('manifest_not_canonical');
 return sha256Hex(canonical);
}

type Registry=Pick<IndustryDb,'registerManifest'|'manifestObjectPath'>;
/** The current incarnation path of a registered hash (throws when the index row is missing). */
async function currentPath(db:Registry,hash:string):Promise<string>{
 const path=await db.manifestObjectPath(hash);
 if(path===null)throw new Error(`manifest_not_found:${hash}`);
 if(!isManifestObjectPath(path,hash))throw new Error(`invalid_manifest_object_path:${hash}`);
 return path;
}
/** Bytes kept in memory by object path (unit tests, offline integration); the index row still goes through `db`. */
export function memoryManifestStore(db:Registry):ManifestStore&{objects:Map<string,Uint8Array>}{
 const objects=new Map<string,Uint8Array>();
 return {
  objects,
  async put(kind:RunKind,canonical:string){
   const hash=checkCanonical(canonical);
   const gz=new Uint8Array(gzipSync(Buffer.from(canonical,'utf8')));
   const created=await db.registerManifest(hash,kind,gz.byteLength);   // FIRST: refused while GC holds a claim
   const path=await currentPath(db,hash);                             // this incarnation's key
   const stored=objects.has(path);
   if(!stored)objects.set(path,gz);
   return {hash,existed:stored||!created};
  },
  async get(hash){
   if(!HASH.test(hash))throw new Error('invalid_manifest_hash');
   const gz=objects.get(await currentPath(db,hash));if(!gz)throw new Error(`manifest_not_found:${hash}`);
   return decodeManifest(gz,hash);
  },
  async remove(objs){for(const o of objs)objects.delete(o.objectPath);return {removed:objs.map(o=>o.hash),failed:[]};},
 };
}

interface StorageError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:StorageError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);
/** Supabase Storage (private bucket industry-manifests) + put_industry_manifest index row. */
export function supabaseManifestStore(admin:SupabaseClient,db:Registry):ManifestStore{
 const bucket=()=>admin.storage.from(MANIFEST_BUCKET);
 return {
  async put(kind,canonical){
   const hash=checkCanonical(canonical);
   const gz=new Uint8Array(gzipSync(Buffer.from(canonical,'utf8')));
   // register FIRST (Codex plan audit round 1 #4): a hash claimed by GC is refused here (manifest_gc_in_progress),
   // before any upload; a successful registration makes the row young, so no GC can claim it before its rows are
   // staged. A failed upload after it leaves an unreferenced young index row that a later GC pass removes.
   const created=await db.registerManifest(hash,kind,gz.byteLength);
   const {error}=await bucket().upload(await currentPath(db,hash),gz,{contentType:'application/gzip',upsert:false});
   let stored=false;
   if(error){if(isExists(error as StorageError))stored=true;else throw new Error(`manifest_upload_failed:${(error as StorageError).message}`);}
   return {hash,existed:stored||!created};
  },
  async get(hash){
   if(!HASH.test(hash))throw new Error('invalid_manifest_hash');
   const {data,error}=await bucket().download(await currentPath(db,hash));
   if(error||!data)throw new Error(`manifest_not_found:${hash}`);
   return decodeManifest(new Uint8Array(await data.arrayBuffer()),hash);
  },
  async remove(objs){
   if(objs.length===0)return {removed:[],failed:[]};
   const {error}=await bucket().remove(objs.map(o=>o.objectPath));   // exactly the claimed incarnations, never "the hash"
   // Storage remove is idempotent (absent paths are not an error): success means every object is gone.
   return error?{removed:[],failed:objs.map(o=>o.hash)}:{removed:objs.map(o=>o.hash),failed:[]};
  },
 };
}

export interface GcResult{candidates:number;removed:string[];failed:string[];deleted:number}
/** One GC pass: claims (gc_industry_manifest_candidates) → the claimed object paths → index rows fenced by the claim token. */
export async function gcManifests(deps:{db:Pick<IndustryDb,'manifestGcCandidates'|'deleteManifestIndex'>;manifests:ManifestStore},limit:number):Promise<GcResult>{
 if(!Number.isInteger(limit)||limit<1)throw new Error('invalid_limit');
 const claims=await deps.db.manifestGcCandidates(limit);
 if(claims.length===0)return {candidates:0,removed:[],failed:[],deleted:0};
 const {removed,failed}=await deps.manifests.remove(claims.map(c=>({hash:c.hash,objectPath:c.objectPath})));
 const done=new Set(removed);
 const deleted=removed.length===0?0:await deps.db.deleteManifestIndex(claims.filter(c=>done.has(c.hash)).map(c=>({hash:c.hash,claim:c.claim})));
 return {candidates:claims.length,removed,failed,deleted};
}
