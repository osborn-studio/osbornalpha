// src/lib/macro/evidence.ts
// Raw evidence bytes (spec §4.3, §0.2 N2; pattern of src/lib/facts/snapshot-store.ts). put() stores
// the exact fetched bytes in the private bucket macro-raw at <adapter>/<sha256>.<ext> and a
// <adapter>/<sha256>.meta.json sidecar (retrieval receipt; never a secret) with upsert:false, so
// identical bytes fetched again answer 'exists' and evidence is never rewritten. The declared
// sha256 must be the bytes' hash and the declared host the URL's host, else the evidence path
// would lie. Upload failure is evidence_upload_failed: the caller writes no observation from it.
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Adapter,EvidenceInput} from './types';

export const EVIDENCE_BUCKET='macro-raw';
export type EvidenceExt='csv'|'json'|'html'|'txt';
export interface EvidenceStore{put(input:EvidenceInput):Promise<{objectPath:string;status:'stored'|'exists'}>}
export class EvidenceError extends Error{
 constructor(readonly code:'evidence_hash_mismatch'|'evidence_invalid'|'evidence_upload_failed',message?:string){super(message===undefined?code:`${code}: ${message}`);this.name='EvidenceError';}
}
const ADAPTERS:readonly Adapter[]=['fred_csv','akshare'];
const PATH=/^(fred_csv|akshare)\/[0-9a-f]{64}\.(csv|json|html|txt)$/;
// FRED answers Content-Type application/csv (verified 2026-11-06); it is still CSV. The upload MIME comes from the
// extension (MIME below), never from the server header, so it is always one the bucket allows.
const EXT:Record<string,EvidenceExt>={'text/csv':'csv','application/csv':'csv','application/json':'json','text/html':'html','text/plain':'txt'};
const MIME:Record<EvidenceExt,string>={csv:'text/csv',json:'application/json',html:'text/html',txt:'text/plain'};

export const sha256Hex=(bytes:Uint8Array|string):string=>createHash('sha256').update(bytes).digest('hex');
/** Extension by the response Content-Type (parameters ignored); anything else is stored as txt. */
export function extFor(contentType:string):EvidenceExt{return EXT[contentType.split(';')[0].trim().toLowerCase()]??'txt';}
export function evidencePath(adapter:Adapter,sha256:string,contentType:string):string{
 const p=`${adapter}/${sha256}.${extFor(contentType)}`;
 if(!PATH.test(p))throw new EvidenceError('evidence_invalid',`path:${p.slice(0,90)}`);
 return p;
}
export const metaPathOf=(objectPath:string):string=>objectPath.replace(/\.(csv|json|html|txt)$/,'.meta.json');
const mimeOf=(objectPath:string)=>MIME[objectPath.slice(objectPath.lastIndexOf('.')+1) as EvidenceExt];

function check(e:EvidenceInput):string{
 if(!ADAPTERS.includes(e.adapter))throw new EvidenceError('evidence_invalid',`adapter:${String(e.adapter).slice(0,40)}`);
 if(sha256Hex(e.bytes)!==e.sha256)throw new EvidenceError('evidence_hash_mismatch');
 let host:string|null=null;try{const u=new URL(e.fetchUrl);host=/^https?:$/.test(u.protocol)?u.hostname.toLowerCase():null;}catch{host=null;}
 if(host===null||host!==e.fetchHost)throw new EvidenceError('evidence_invalid',`host:${e.fetchHost}`);
 return evidencePath(e.adapter,e.sha256,e.contentType);
}
const metaOf=(e:EvidenceInput)=>JSON.stringify({sha256:e.sha256,adapter:e.adapter,byte_length:e.bytes.byteLength,fetch_url:e.fetchUrl,fetch_host:e.fetchHost,http_status:e.httpStatus,content_type:e.contentType,fetched_at:e.fetchedAt,tool_versions:e.toolVersions});

interface UploadError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:UploadError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);

export function supabaseEvidenceStore(admin:SupabaseClient):EvidenceStore{
 const bucket=()=>admin.storage.from(EVIDENCE_BUCKET);
 const upload=async(path:string,body:Uint8Array|string,contentType:string):Promise<'stored'|'exists'>=>{
  const {error}=await bucket().upload(path,body,{contentType,upsert:false});
  if(!error)return 'stored';
  if(isExists(error as UploadError))return 'exists';
  throw new EvidenceError('evidence_upload_failed',(error as UploadError).message);
 };
 return {
  async put(e){
   const objectPath=check(e);
   const status=await upload(objectPath,e.bytes,mimeOf(objectPath));
   await upload(metaPathOf(objectPath),metaOf(e),'application/json');
   return {objectPath,status};
  },
 };
}

export function memoryEvidenceStore():EvidenceStore&{objects:Map<string,string|Uint8Array>;read(path:string):string|Uint8Array|undefined}{
 const objects=new Map<string,string|Uint8Array>();
 return {
  objects,
  read(path){const v=objects.get(path);return v instanceof Uint8Array?new Uint8Array(v):v;},
  async put(e){
   const objectPath=check(e);
   if(objects.has(objectPath))return {objectPath,status:'exists'};
   objects.set(objectPath,new Uint8Array(e.bytes));objects.set(metaPathOf(objectPath),metaOf(e));
   return {objectPath,status:'stored'};
  },
 };
}
