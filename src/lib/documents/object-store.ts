// src/lib/documents/object-store.ts
// ObjectStore over the private bucket disclosure-docs (spec §4.10, §4.11). Content-addressed paths:
// originals at blobs/{sha256}.{pdf|htm|xml|json}, extraction output at
// extractions/{content_sha256}/{pages_json_sha256}.pages.json — the bytes alone decide the object,
// so an existing object is never rewritten: put() uploads with upsert:false and answers 'exists'
// for a duplicate. Objects are never deleted (replay obligation). Every path is validated before
// any request. Acquisition metadata is not stored here (it lives on the document/asset rows).
// Duplicate-upload error shape (spec §15 question 6) is UNVERIFIED against hosted Supabase in this
// repo; the installed storage-js (2.105) raises StorageApiError{message, status, statusCode} where
// statusCode is the body's statusCode (Supabase answers HTTP 400 with statusCode '409', error
// 'Duplicate', message 'The resource already exists'). isDuplicateError therefore accepts
// statusCode '409', HTTP status 409, or a message/error matching /already exists|duplicate/i; the
// F3-0 Vercel/Supabase smoke records the real shape in the runbook (Task 19). Not-found reads
// (download / info) are normalised the same way (statusCode '404', status 404, /not.?found/i).
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {DOCS_BUCKET} from './types';
import type {DocMime,ObjectStore} from './types';

export type ObjectStoreErrorCode='object_put_failed'|'object_get_failed'|'object_not_found'|'invalid_path'|'signed_url_failed';
export class ObjectStoreError extends Error{
 constructor(public code:ObjectStoreErrorCode,message?:string){super(message===undefined?code:`${code}: ${message}`);this.name='ObjectStoreError';}
}

const EXT=new Map<string,string>(Object.entries({'application/pdf':'pdf','text/html':'htm','application/xhtml+xml':'htm','application/xml':'xml','text/xml':'xml','application/json':'json'}));
const SHA=/^[0-9a-f]{64}$/;
const PATH=/^(?:blobs\/[0-9a-f]{64}\.(?:pdf|htm|xml|json)|extractions\/[0-9a-f]{64}\/[0-9a-f]{64}\.pages\.json)$/;
/** Bucket file_size_limit (migration one, spec §14 E); the memory store enforces it like Storage does. */
export const MAX_OBJECT_BYTES=52428800;
/** Longest signed URL lifetime accepted (7 days, the Storage maximum). */
export const MAX_SIGNED_SECONDS=604800;

export function extOfMime(mime:string):string{
 const ext=EXT.get(mime);   // a Map: 'constructor' / '__proto__' are not mimes
 if(!ext)throw new ObjectStoreError('invalid_path',`unsupported mime ${mime}`);
 return ext;
}
export function blobPath(sha256:string,mime:string):string{
 if(!SHA.test(sha256))throw new ObjectStoreError('invalid_path',`not a sha256: ${sha256.slice(0,80)}`);
 return `blobs/${sha256}.${extOfMime(mime)}`;
}
export function pagesJsonPath(contentSha:string,pagesSha:string):string{
 if(!SHA.test(contentSha)||!SHA.test(pagesSha))throw new ObjectStoreError('invalid_path','not a sha256');
 return `extractions/${contentSha}/${pagesSha}.pages.json`;
}
export const isStorePath=(path:string):boolean=>PATH.test(path);
const checkPath=(path:string)=>{if(!isStorePath(path))throw new ObjectStoreError('invalid_path',path.slice(0,120));};
const sha256Hex=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** Path, mime and bytes must agree before anything is written: the path names the bytes (content addressing)
 *  and its extension names the mime. extractions/ paths carry the pages.json hash and are application/json. */
function checkPut(path:string,bytes:Uint8Array,mime:DocMime):void{
 checkPath(path);
 const ext=extOfMime(mime);                                   // unsupported mime → invalid_path
 const blob=/^blobs\/([0-9a-f]{64})\.(\w+)$/.exec(path);
 if(blob){
  if(blob[2]!==ext)throw new ObjectStoreError('invalid_path',`mime ${mime} does not match ${path.slice(-8)}`);
  if(sha256Hex(bytes)!==blob[1])throw new ObjectStoreError('invalid_path','bytes do not hash to the blob path');
 }else{
  if(mime!=='application/json')throw new ObjectStoreError('invalid_path','pages.json must be application/json');
  const pages=/\/([0-9a-f]{64})\.pages\.json$/.exec(path);
  if(!pages||sha256Hex(bytes)!==pages[1])throw new ObjectStoreError('invalid_path','bytes do not hash to the pages.json path');
 }
}
const checkExpiry=(s:number)=>{if(!Number.isInteger(s)||s<1||s>MAX_SIGNED_SECONDS)throw new ObjectStoreError('signed_url_failed',`invalid expiry ${s}`);};

export interface StorageErrorLike{message?:string;statusCode?:string|number;status?:number;error?:string}
function bucketNotFound(e:StorageErrorLike):boolean{return /bucket not found/i.test(`${e.message??''} ${e.error??''}`);}
export function isDuplicateError(e:StorageErrorLike):boolean{
 return String(e.statusCode??'')==='409'||e.status===409||/already exists|duplicate/i.test(`${e.message??''} ${e.error??''}`);
}
/** Status codes decide first; the message pattern is only a fallback when neither is present. A missing bucket is
 *  a configuration fault, never "the object is absent". */
export function isNotFoundError(e:StorageErrorLike):boolean{
 if(bucketNotFound(e))return false;
 const sc=e.statusCode===undefined||e.statusCode===''?undefined:String(e.statusCode);
 if(sc!==undefined||e.status!==undefined)return sc==='404'||e.status===404;
 return /not.?found/i.test(`${e.message??''} ${e.error??''}`);
}

export function supabaseObjectStore(client:SupabaseClient,bucket:string=DOCS_BUCKET):ObjectStore{
 const b=()=>client.storage.from(bucket);
 return {
  async put(path,bytes,mime:DocMime){
   checkPut(path,bytes,mime);
   if(bytes.byteLength>MAX_OBJECT_BYTES)throw new ObjectStoreError('object_put_failed','object exceeds the bucket size limit');
   const {error}=await b().upload(path,bytes,{contentType:mime,upsert:false});
   if(!error)return 'created';
   if(isDuplicateError(error as StorageErrorLike))return 'exists';
   throw new ObjectStoreError('object_put_failed',(error as StorageErrorLike).message);
  },
  async get(path){
   checkPath(path);
   const {data,error}=await b().download(path);
   if(error){
    if(isNotFoundError(error as StorageErrorLike))throw new ObjectStoreError('object_not_found',path);
    throw new ObjectStoreError('object_get_failed',(error as StorageErrorLike).message);
   }
   return new Uint8Array(await data.arrayBuffer());
  },
  async head(path){
   checkPath(path);
   const {data,error}=await b().info(path);
   if(error){
    if(isNotFoundError(error as StorageErrorLike))return null;
    throw new ObjectStoreError('object_get_failed',(error as StorageErrorLike).message);
   }
   const size=Number(data.size);
   if(!Number.isSafeInteger(size)||size<0)throw new ObjectStoreError('object_get_failed','invalid object size');
   return {bytes:size};
  },
  async signedUrl(path,expiresSeconds){
   checkPath(path);checkExpiry(expiresSeconds);
   const {data,error}=await b().createSignedUrl(path,expiresSeconds);
   if(error&&isNotFoundError(error as StorageErrorLike))throw new ObjectStoreError('object_not_found',path);
   if(error||!data?.signedUrl)throw new ObjectStoreError('signed_url_failed',(error as StorageErrorLike|null)?.message??'no url');
   return data.signedUrl;
  },
 };
}

export interface MemoryObject{bytes:Uint8Array;mime:string}
/** In-memory store for unit tests. failPut lets a test make chosen uploads fail (object_put_failed). */
export function memoryObjectStore(opts:{failPut?:(path:string)=>boolean}={}):ObjectStore&{objects():Map<string,MemoryObject>}{
 const objects=new Map<string,MemoryObject>();
 return {
  objects:()=>objects,
  async put(path,bytes,mime:DocMime){
   checkPut(path,bytes,mime);
   if(bytes.byteLength>MAX_OBJECT_BYTES)throw new ObjectStoreError('object_put_failed','object exceeds the bucket size limit');
   if(opts.failPut?.(path))throw new ObjectStoreError('object_put_failed',`injected failure for ${path}`);
   if(objects.has(path))return 'exists';
   objects.set(path,{bytes:new Uint8Array(bytes),mime});   // a copy: later mutation of the caller's buffer cannot rewrite evidence
   return 'created';
  },
  async get(path){
   checkPath(path);
   const o=objects.get(path);if(!o)throw new ObjectStoreError('object_not_found',path);
   return new Uint8Array(o.bytes);
  },
  async head(path){checkPath(path);const o=objects.get(path);return o?{bytes:o.bytes.byteLength}:null;},
  async signedUrl(path,expiresSeconds){
   checkPath(path);checkExpiry(expiresSeconds);
   if(!objects.has(path))throw new ObjectStoreError('object_not_found',path);
   return `memory://${DOCS_BUCKET}/${path}?expires=${expiresSeconds}`;
  },
 };
}
