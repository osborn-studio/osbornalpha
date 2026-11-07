// src/lib/company/evidence-index.ts
// Evidence index builder (spec §0.1 item 2): the verified association fact → raw snapshot that the
// landed facts layer does not store. For one (issuer, market) stream: list the snapshots under
// {source}/{issuer}/ (bucket disclosure-raw), verify the byte SHA-256 against the object name and
// the .meta.json sidecar, re-parse with the LANDED parsers (read-only imports; sinceYear 1900 so no
// period is skipped; Tushare one snapshot at a time — a superset of the sync candidates), and match
// each ok fact row on the FULL key (raw_hash, concept, source_concept, filing source_ref,
// period_start, period_end, unit, canonical value): a Tushare row shares one raw_hash across its
// concepts, so the hash alone is not enough. The JSON pointer is derived from the parser locator and
// re-resolved against the bytes; any doubt (missing object/sidecar, hash mismatch, parser error,
// zero or several matches, value or pointer mismatch) writes NO row (the fact stays
// evidence_incomplete). Output feeds CompanyDb.replaceEvidence (whole-stream replacement).
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SNAPSHOT_BUCKET,metaPath} from '@/lib/facts/snapshot-store';
import {decodeCompanyFacts,parseCompanyFacts} from '@/lib/facts/providers/edgar-companyfacts';
import {addDecimals,parseTushareStatements} from '@/lib/facts/providers/tushare-statements';
import {canonicalDecimal,decimalEquals,isNumToken,scanJsonNumbers} from '@/lib/facts/json-numbers';
import type {FactCandidate,FactRow,Market,ParseResult,RawSnapshot,Source} from '@/lib/facts/types';
import {EVIDENCE_INDEX_VERSION} from './types';
import type {EvidenceIndexRow,FilingSummary} from './types';

export interface SnapshotSidecar{source:Source;api?:string;url?:string;params?:Record<string,unknown>;fields?:string;fetched_at:string;http_status:number;has_more?:boolean;page?:number;sha256?:string;bytes?:number}
export interface SnapshotObjectStore{
 /** Full paths of the data objects (<sha256>.json, sidecars excluded) under prefix, ascending. */
 list(prefix:string):Promise<string[]>;
 get(path:string):Promise<Uint8Array|null>;
 meta(path:string):Promise<SnapshotSidecar|null>;
}
const OBJECT=/^[0-9a-f]{64}\.json$/;
const parseSidecar=(v:string|Uint8Array|null|undefined):SnapshotSidecar|null=>{
 if(v===null||v===undefined)return null;
 try{const j=JSON.parse(typeof v==='string'?v:new TextDecoder().decode(v));return j&&typeof j==='object'?j as SnapshotSidecar:null;}catch{return null;}
};
export function memorySnapshotObjectStore(objects:Map<string,string|Uint8Array>):SnapshotObjectStore{
 return {
  async list(prefix){return [...objects.keys()].filter(k=>k.startsWith(prefix)&&OBJECT.test(k.slice(prefix.length))).sort();},
  async get(path){const v=objects.get(path);return v===undefined?null:typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v);},
  async meta(path){return parseSidecar(objects.get(metaPath(path)));},
 };
}
interface StorageError{message:string;statusCode?:string|number;status?:number}
const notFound=(e:StorageError)=>String(e.statusCode??e.status??'')==='404'||/not found/i.test(e.message);
export function supabaseSnapshotObjectStore(admin:SupabaseClient):SnapshotObjectStore{
 const bucket=()=>admin.storage.from(SNAPSHOT_BUCKET);
 const get=async(path:string):Promise<Uint8Array|null>=>{
  const {data,error}=await bucket().download(path);
  if(error){if(notFound(error as StorageError))return null;throw new Error('snapshot_download_failed');}
  return new Uint8Array(await data.arrayBuffer());
 };
 return {
  async list(prefix){
   const folder=prefix.replace(/\/$/,'');const out:string[]=[];
   for(let offset=0;;offset+=1000){
    const {data,error}=await bucket().list(folder,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw new Error('snapshot_list_failed');
    for(const o of data??[])if(OBJECT.test(o.name))out.push(`${folder}/${o.name}`);
    if((data??[]).length<1000)break;
   }
   return out.sort();
  },
  get,
  async meta(path){return parseSidecar(await get(metaPath(path)));},
 };
}

// ---- pointers ----
const esc=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const unesc=(s:string)=>s.replace(/~1/g,'/').replace(/~0/g,'~');
export function edgarPointer(locator:string):string|null{
 const m=/^facts\.([^.]+)\.([^.]+)\.units\.([^[]+)\[(\d+)\]\(/.exec(locator);
 return m?`/facts/${esc(m[1])}/${esc(m[2])}/units/${esc(m[3])}/${m[4]}`:null;
}
export function tusharePointer(locator:string,sourceConcept:string):{pointer:string;field:string}|null{
 const m=/,row=(\d+)\]$/.exec(locator);const dot=sourceConcept.indexOf('.');
 return m&&dot>0?{pointer:`/data/items/${m[1]}`,field:sourceConcept.slice(dot+1)}:null;
}
export function resolvePointer(doc:unknown,pointer:string):unknown{
 if(pointer==='')return doc;
 let cur:unknown=doc;
 for(const raw of pointer.split('/').slice(1)){
  const k=unesc(raw);
  if(Array.isArray(cur)){if(!/^\d+$/.test(k))return undefined;cur=cur[Number(k)];}
  else if(cur!==null&&typeof cur==='object'&&Object.prototype.hasOwnProperty.call(cur,k))cur=(cur as Record<string,unknown>)[k];
  else return undefined;
 }
 return cur;
}
const cellDecimal=(v:unknown):string|null=>{
 try{if(isNumToken(v))return canonicalDecimal(v.__num);if(typeof v==='string'&&v!=='')return canonicalDecimal(v);}catch{/* not a decimal */}
 return null;
};
/** Value at the Tushare row pointer for `field` (a+b sums), or null. */
function tushareValue(json:unknown,pointer:string,field:string):string|null{
 const fields=resolvePointer(json,'/data/fields');const row=resolvePointer(json,pointer);
 if(!Array.isArray(fields)||!Array.isArray(row))return null;
 const parts=field.split('+').map(f=>{const i=fields.indexOf(f);return i<0||i!==fields.lastIndexOf(f)?null:cellDecimal(row[i]);});
 return parts.every((p):p is string=>p!==null)?parts.reduce(addDecimals):null;
}

// ---- builder ----
type Located=FactCandidate&{locator:string};
/** A candidate with its pointer and re-resolved value; the decoded document itself is dropped after loading. */
export interface ResolvedCandidate{concept:string;sourceConcept:string;filingRef:string;periodStart:string|null;periodEnd:string;unit:string;value:string;locator:string;pointer:string|null;field:string|null;resolved:string|null}
export interface ParsedSnapshot{path:string;sha256:string;meta:SnapshotSidecar;byHash:Map<string,ResolvedCandidate[]>}
export type SnapshotFailure='missingObject'|'missingSidecar'|'hashMismatch'|'parseFailed'|'storageError';
export type ParsedSnapshotCache=Map<string,ParsedSnapshot|{failed:SnapshotFailure}>;
export interface EvidenceIndexStats{objects:number;missingObject:number;missingSidecar:number;hashMismatch:number;parseFailed:number;facts:number;indexed:number;unmatched:number;multiMatch:number;valueMismatch:number;pointerUnresolved:number;storageError:number}
export interface EvidenceIndexResult{rows:EvidenceIndexRow[];stats:EvidenceIndexStats}
export interface EvidenceIndexInput{issuerId:string;market:Market;rows:FactRow[];filings:FilingSummary[];cache?:ParsedSnapshotCache}
export const EVIDENCE_SINCE_YEAR=1900;
const SECRET_PARAM=/token|secret|password|api_?key/i;
/** Drops secret-looking keys at ANY depth (company_evidence_check rejects a token key anywhere in params). */
const deepScrub=(v:unknown):unknown=>Array.isArray(v)?v.map(deepScrub):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([k])=>!SECRET_PARAM.test(k)).map(([k,x])=>[k,deepScrub(x)])):v;
const scrub=(p:Record<string,unknown>|undefined)=>{if(!p||typeof p!=='object'||Array.isArray(p))return null;const o=deepScrub(p) as Record<string,unknown>;return Object.keys(o).length?o:null;};
// Optional columns the SQL check bounds: out-of-range values are stored as null rather than rejecting the whole stream.
const ISO_TS=/^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$/;
const tsOf=(v:unknown)=>typeof v==='string'&&ISO_TS.test(v)&&!Number.isNaN(Date.parse(v))?v:null;
const strOf=(v:unknown,max:number)=>typeof v==='string'&&v.length>=1&&v.length<=max?v:null;
const intOf=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=lo&&v<=hi?v:null;
const sha256=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const emptyStats=():EvidenceIndexStats=>({objects:0,missingObject:0,missingSidecar:0,hashMismatch:0,parseFailed:0,facts:0,indexed:0,unmatched:0,multiMatch:0,valueMismatch:0,pointerUnresolved:0,storageError:0});

function resolveCandidate(c:Located,source:Source,doc:unknown):ResolvedCandidate{
 let pointer:string|null=null,field:string|null=null,resolved:string|null=null;
 if(source==='edgar'){
  pointer=edgarPointer(c.locator);
  const entry=pointer===null?undefined:resolvePointer(doc,pointer) as {val?:unknown}|undefined;
  resolved=entry&&typeof entry.val==='string'?entry.val:null;
 }else{
  const t=tusharePointer(c.locator,c.sourceConcept);
  if(t){pointer=t.pointer;field=t.field;resolved=tushareValue(doc,t.pointer,t.field);}
 }
 return {concept:c.concept,sourceConcept:c.sourceConcept,filingRef:c.filingRef,periodStart:c.periodStart??null,periodEnd:c.periodEnd,unit:c.unit,value:c.value,locator:c.locator,pointer,field,resolved};
}
async function loadSnapshot(reader:SnapshotObjectStore,path:string,prefix:string,source:Source):Promise<ParsedSnapshot|{failed:SnapshotFailure}>{
 let bytes:Uint8Array|null,meta:SnapshotSidecar|null;
 try{bytes=await reader.get(path);if(!bytes)return {failed:'missingObject'};meta=await reader.meta(path);}catch{return {failed:'storageError'};}
 if(!meta)return {failed:'missingSidecar'};
 const sha=sha256(bytes);
 if(sha!==path.slice(prefix.length,-'.json'.length)||(meta.sha256!==undefined&&meta.sha256!==sha)||meta.source!==source)return {failed:'hashMismatch'};
 const snap:RawSnapshot={bytes,sha256:sha,meta:meta as RawSnapshot['meta']};
 try{
  const p:ParseResult=source==='edgar'?parseCompanyFacts(snap,{sinceYear:EVIDENCE_SINCE_YEAR}):parseTushareStatements([snap],{sinceYear:EVIDENCE_SINCE_YEAR});
  const candidates=[...p.candidates,...p.ambiguous.flatMap(a=>a.candidates),...p.oddDuration].filter((c):c is Located=>typeof (c as Partial<Located>).locator==='string');
  const doc=source==='edgar'?decodeCompanyFacts(bytes):scanJsonNumbers(bytes);
  const byHash=new Map<string,ResolvedCandidate[]>();
  for(const c of candidates){const list=byHash.get(c.rawHash)??[];list.push(resolveCandidate(c,source,doc));byHash.set(c.rawHash,list);}
  return {path,sha256:sha,meta,byHash};   // doc and candidates go out of scope here
 }catch{return {failed:'parseFailed'};}
}

export async function buildEvidenceIndex(deps:{reader:SnapshotObjectStore},input:EvidenceIndexInput):Promise<EvidenceIndexResult>{
 const source:Source=input.market==='US'?'edgar':'tushare';
 const prefix=`${source}/${input.issuerId}/`;
 const cache:ParsedSnapshotCache=input.cache??new Map();
 const stats=emptyStats();
 const byHash=new Map<string,{snap:ParsedSnapshot;cand:ResolvedCandidate}[]>();
 for(const path of await deps.reader.list(prefix)){   // sequential: one decoded document alive at a time
  stats.objects++;
  let got=cache.get(path);
  if(got===undefined){got=await loadSnapshot(deps.reader,path,prefix,source);cache.set(path,got);}
  if('failed' in got){stats[got.failed]++;continue;}
  for(const [h,cands] of got.byHash){const list=byHash.get(h)??[];for(const cand of cands)list.push({snap:got,cand});byHash.set(h,list);}
 }
 const filingOf=new Map(input.filings.map(f=>[f.filingId,f]));
 const out:EvidenceIndexRow[]=[];
 for(const f of input.rows){
  if(f.status!=='ok')continue;
  stats.facts++;
  const filing=filingOf.get(f.filing_id);
  const ref=filing&&filing.source===source?filing.sourceRef:undefined;
  const hits=(byHash.get(f.raw_hash)??[]).filter(({cand:c})=>ref!==undefined&&c.concept===f.concept&&c.sourceConcept===f.source_concept&&c.filingRef===ref
   &&(c.periodStart??'')===(f.period_start??'')&&c.periodEnd===f.period_end&&c.unit===f.unit);
  if(hits.length===0){stats.unmatched++;continue;}
  if(hits.length>1){stats.multiMatch++;continue;}
  const {snap,cand}=hits[0];
  if(!decimalEquals(cand.value,f.value_text)){stats.valueMismatch++;continue;}
  const {pointer,field,resolved}=cand;
  if(pointer===null||pointer.length>1024||cand.locator.length>1024||resolved===null||!decimalEquals(resolved,f.value_text)){stats.pointerUnresolved++;continue;}
  out.push({fact_id:f.fact_id,raw_hash:f.raw_hash,snapshot_sha256:snap.sha256,snapshot_path:snap.path,hash_locator:cand.locator,json_pointer:pointer,field:strOf(field,64),source,
   api:strOf(snap.meta.api,64),url:strOf(snap.meta.url,2048),params:scrub(snap.meta.params),captured_at:tsOf(snap.meta.fetched_at),http_status:intOf(snap.meta.http_status,100,599),page:intOf(snap.meta.page,0,2147483647),index_version:EVIDENCE_INDEX_VERSION});
  stats.indexed++;
 }
 out.sort((a,b)=>a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0);
 return {rows:out,stats};
}
