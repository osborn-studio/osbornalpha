// src/lib/dq/raw-dir-store.ts
// RawStore backed by a local directory (content-addressed files named by the RawStore path rules, never overwritten)
// and the script-side store selection shared by record-ixbrl-fixture.ts and select-us-sample.ts. Scripts only.
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {RawStoreError,memoryRawStore,prepare,rawMetaPath,supabaseRawStore} from './raw-store';
import type {RawStore} from './raw-store';

/** Content-addressed files in a directory, named by the RawStore rules; written directly (no in-memory copies), existing files are kept. */
export function dirRawStore(dir:string):RawStore{
 return {
  sha256Of:memoryRawStore().sha256Of,
  async put(item,budget){
   if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
   const {sha256,path,meta}=prepare(item);
   const full=join(dir,path);
   mkdirSync(dirname(full),{recursive:true});
   let status:'stored'|'exists'='stored';
   try{writeFileSync(full,item.bytes,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')status='exists';else throw e;}
   try{writeFileSync(rawMetaPath(full),meta,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
   return {sha256,path,status};
  },
 };
}

/** --raw-dir <dir> → directory store; else the Supabase store when configured; else refuse. */
export async function rawStoreFor(rawDir:string):Promise<RawStore>{
 if(rawDir)return dirRawStore(rawDir);
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {getAdminSupabase}=await import('../supabase/admin');
  return supabaseRawStore(getAdminSupabase());
 }
 throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}
