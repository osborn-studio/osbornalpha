// src/lib/dq/reconcile/deps.ts
// Production wiring of ReconcileDeps (plan 3 Task 14c) shared by /api/cron/reconcile and
// scripts/dq/reconcile.ts: Supabase FactsDb / TableClient / RawStore (bucket reconcile-raw), the global
// fetch (the pairs pace SEC themselves), and readRepoFileFromDisk, which reads ONLY JSON files under the two
// gold fixture directories (the sample and gold manifests; next.config.mjs traces them into the cron
// function). Anything else — absolute paths, '..', other directories or extensions — is refused.
import {readFile} from 'node:fs/promises';
import {join,normalize} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {getAdminSupabase} from '../../supabase/admin';
import {supabaseRawStore} from '../raw-store';
import type {Row} from '../../db/table-client';
import {makeBudget} from '../../facts/sync';
import type {InputsHashNow} from '../facts-resolver';
import {inputsHashNow} from './pairs';
import type {ReconcileDeps} from './run';
import type {PairContext} from './types';

export const REPO_FILE_PREFIXES:readonly string[]=['src/lib/dq/fixtures/gold/','src/lib/facts/fixtures/gold/'];
export async function readRepoFileFromDisk(path:string):Promise<Uint8Array>{
 const n=normalize(path).replace(/\\/g,'/');
 if(path.startsWith('/')||n!==path||n.includes('..')||!n.endsWith('.json')||!REPO_FILE_PREFIXES.some(p=>n.startsWith(p)))throw new Error('repo_file_not_allowed');
 return new Uint8Array(await readFile(join(process.cwd(),n)));
}

/** Data gaps of pairs.ts::inputsHashNow that mean "cannot restore now" (→ {unavailable:'inputs_unavailable'} → 409 not_passing / restorable=false), not a bug. */
const RESTORE_GAP_CODES:readonly string[]=['pair_not_registered','left_fact_missing','no_latest_result'];
/**
 * The CURRENT inputs hash of a reconcile_mismatch item (spec §5.6), injected into the quarantine route
 * (resolveFactsItem.inputsHashNow, Task 11) and the admin dashboard's server-computed `restorable` (Task 19a).
 */
export function restoreInputsHashNow(admin?:SupabaseClient):InputsHashNow{
 const sb=admin??getAdminSupabase();
 const now=()=>new Date();
 const ctx:PairContext={db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),now,budget:makeBudget(null,now),
  fetch:globalThis.fetch.bind(globalThis),readRepoFile:readRepoFileFromDisk};
 return async(item:Row)=>{
  try{return await inputsHashNow(ctx,item);}
  catch(e){
   // the pair's CURRENT right evidence cannot be obtained now (plan audit P2): restore stays disabled
   if(e instanceof Error&&e.message==='current_evidence_unavailable')return {unavailable:'current_evidence_unavailable'};
   if(e instanceof Error&&RESTORE_GAP_CODES.includes(e.message))return {unavailable:'inputs_unavailable'};
   throw e;
  }
 };
}

export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),fetch:globalThis.fetch.bind(globalThis),
  readRepoFile:readRepoFileFromDisk,now:()=>new Date(),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
