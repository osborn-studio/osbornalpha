// src/lib/dq/raw-dir-store.ts
// RawStore backed by a local directory (content-addressed files named by the RawStore path rules, never overwritten)
// and the script-side store selection shared by record-ixbrl-fixture.ts and select-us-sample.ts. Scripts only.
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {memoryRawStore,supabaseRawStore} from './raw-store';
import type {RawStore} from './raw-store';

/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
export function dirRawStore(dir:string):RawStore{
 const mem=memoryRawStore();
 return {
  sha256Of:mem.sha256Of,
  async put(item,budget){
   const r=await mem.put(item,budget);
   for(const [p,bytes] of mem.objects){
    const full=join(dir,p);
    if(existsSync(full))continue;
    mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,bytes,{flag:'wx'});
   }
   return r;
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
