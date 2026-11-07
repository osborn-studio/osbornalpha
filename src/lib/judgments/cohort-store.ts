// src/lib/judgments/cohort-store.ts
// Calibration cohort objects (spec §8.3, bucket judgments-calibration). Two kinds of path, both
// immutable: per-attempt partial pages `partial/<unit>/<generation>/<start_after|start>.<attempt>.json`
// (a fresh attempt uuid per upload, so a retried page never collides with an orphan; S01) and
// content-addressed final cohorts `cohorts/<cohort_sha256>.json`. put() always uses upsert:false:
// an existing path answers 'exists' and is never overwritten. get() answers null for a missing object.
import type {SupabaseClient} from '@supabase/supabase-js';

export const COHORT_BUCKET='judgments-calibration';
export interface CohortStore{
 put(path:string,bytes:Uint8Array,opts:{upsert:false}):Promise<'stored'|'exists'>;
 get(path:string):Promise<Uint8Array|null>;
 remove(path:string):Promise<void>;
}
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UNIT='[a-z][a-z0-9_]{1,63}@v[1-9][0-9]{0,3}\\.(all|market\\.[A-Z]{1,3}|subject_type\\.[a-z_]{1,32})';
const PATH=new RegExp(`^(partial/${UNIT}/${UUID}/(start|${UUID})\\.${UUID}\\.json|cohorts/[0-9a-f]{64}\\.json)$`);
export const isCohortPath=(path:string)=>PATH.test(path);
const assertPath=(path:string)=>{if(!PATH.test(path))throw new Error(`cohort_path_invalid:${path.slice(0,120)}`);};

interface StorageError{message:string;statusCode?:string|number;status?:number}
const statusOf=(e:StorageError)=>String(e.statusCode??e.status??'');
const isExists=(e:StorageError)=>statusOf(e)==='409'||/already exists|duplicate/i.test(e.message);
const isMissing=(e:StorageError)=>statusOf(e)==='404'||/not.?found|does not exist/i.test(e.message);

export function supabaseCohortStore(admin:SupabaseClient):CohortStore{
 const bucket=()=>admin.storage.from(COHORT_BUCKET);
 return {
  async put(path,bytes,opts){
   assertPath(path);
   if(opts.upsert!==false)throw new Error('cohort_upsert_forbidden');
   const {error}=await bucket().upload(path,bytes,{contentType:'application/json',upsert:false});
   if(!error)return 'stored';
   if(isExists(error as StorageError))return 'exists';
   throw new Error(`cohort_upload_failed:${(error as StorageError).message}`);
  },
  async get(path){
   assertPath(path);
   const {data,error}=await bucket().download(path);
   if(error){if(isMissing(error as StorageError))return null;throw new Error(`cohort_download_failed:${(error as StorageError).message}`);}
   return new Uint8Array(await (data as Blob).arrayBuffer());
  },
  async remove(path){
   assertPath(path);
   const {error}=await bucket().remove([path]);
   if(error)throw new Error(`cohort_remove_failed:${(error as StorageError).message}`);
  },
 };
}

/** In-memory store for unit and integration tests; bytes are copied in and out. */
export function memoryCohortStore():CohortStore&{objects:Map<string,Uint8Array>}{
 const objects=new Map<string,Uint8Array>();
 return {
  objects,
  async put(path,bytes,opts){
   assertPath(path);
   if(opts.upsert!==false)throw new Error('cohort_upsert_forbidden');
   if(objects.has(path))return 'exists';
   objects.set(path,new Uint8Array(bytes));return 'stored';
  },
  async get(path){assertPath(path);const v=objects.get(path);return v?new Uint8Array(v):null;},
  async remove(path){assertPath(path);objects.delete(path);},
 };
}
