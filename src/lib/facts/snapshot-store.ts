// src/lib/facts/snapshot-store.ts
// Raw snapshot evidence (spec §4.7, bucket disclosure-raw). put() stores the exact response bytes
// at {source}/{issuer_id}/{sha256}.json and a {sha256}.meta.json sidecar (never a token) with
// upsert:false, so identical bytes re-fetched later answer 'exists' and evidence is never
// rewritten. A failed upload is snapshot_upload_failed and the caller abandons the run. The
// budget's abort signal cuts the wait (the HTTP request itself is not cancellable in storage-js).
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Budget,RawSnapshot,Source} from './types';
import {SyncError} from './errors';

export const SNAPSHOT_BUCKET='disclosure-raw';
export interface SnapshotStore{put(snapshot:RawSnapshot,path:string,budget:Budget):Promise<'stored'|'exists'>}
export const snapshotPath=(source:Source,issuerId:string,sha256:string):string=>`${source}/${issuerId}/${sha256}.json`;
export const metaPath=(path:string):string=>path.replace(/\.json$/,'.meta.json');
const PATH=/^(edgar|tushare)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{64}\.json$/;
/** The bytes must be the ones the declared hash names, else the evidence path would lie (round-3 #8). */
const verify=(s:RawSnapshot)=>{if(createHash('sha256').update(s.bytes).digest('hex')!==s.sha256)throw new SyncError('snapshot_hash_mismatch');};
const metaOf=(s:RawSnapshot)=>JSON.stringify({...s.meta,sha256:s.sha256,bytes:s.bytes.byteLength});

interface UploadError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:UploadError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);

function withinBudget<T>(p:Promise<T>,budget:Budget):Promise<T>{
 if(budget.signal.aborted)return Promise.reject(new SyncError('snapshot_upload_failed','budget_exhausted'));
 return new Promise<T>((resolve,reject)=>{
  const onAbort=()=>reject(new SyncError('snapshot_upload_failed','budget_exhausted'));
  budget.signal.addEventListener('abort',onAbort,{once:true});
  p.then(v=>{budget.signal.removeEventListener('abort',onAbort);resolve(v);},e=>{budget.signal.removeEventListener('abort',onAbort);reject(e);});
 });
}

export function supabaseSnapshotStore(admin:SupabaseClient):SnapshotStore{
 const bucket=()=>admin.storage.from(SNAPSHOT_BUCKET);
 const upload=async(path:string,body:Uint8Array|string,budget:Budget):Promise<'stored'|'exists'>=>{
  const {error}=await withinBudget(bucket().upload(path,body,{contentType:'application/json',upsert:false}),budget);
  if(!error)return 'stored';
  if(isExists(error as UploadError))return 'exists';
  throw new SyncError('snapshot_upload_failed',(error as UploadError).message);
 };
 return {
  async put(snapshot,path,budget){
   verify(snapshot);
   if(!PATH.test(path))throw new SyncError('snapshot_upload_failed',`invalid_path:${path.slice(0,80)}`);
   const result=await upload(path,snapshot.bytes,budget);
   await upload(metaPath(path),metaOf(snapshot),budget);
   return result;
  },
 };
}

export function memorySnapshotStore():SnapshotStore&{objects:Map<string,string|Uint8Array>;read(path:string):string|Uint8Array|undefined}{
 const objects=new Map<string,string|Uint8Array>();
 return {
  objects,
  read(path){const v=objects.get(path);return v instanceof Uint8Array?new Uint8Array(v):v;},   // copies out, too
  async put(snapshot,path,budget){
   verify(snapshot);
   if(!PATH.test(path))throw new SyncError('snapshot_upload_failed',`invalid_path:${path.slice(0,80)}`);
   if(budget.signal.aborted)throw new SyncError('snapshot_upload_failed','budget_exhausted');
   if(objects.has(path))return 'exists';
   // a copy: later mutation of the caller's buffer cannot rewrite evidence
   objects.set(path,new Uint8Array(snapshot.bytes));objects.set(metaPath(path),metaOf(snapshot));
   return 'stored';
  },
 };
}
