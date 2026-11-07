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
import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
import type {ReconcileDeps} from './run';
import {CYCLE_PAIR_IDS} from './types';
import type {CyclePairId,PairContext} from './types';

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

/** CN pairs run only with FACTS_CN_ENABLED=1 (no Tushare token / unverified gold: spec T15). Shared by the cron route and the script. */
export const cnPairEnabled=(pair:string,env:Record<string,string|undefined>=process.env):boolean=>!pair.startsWith('cn.')||env.FACTS_CN_ENABLED==='1';

export const RECONCILE_USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';
export type ReconcileArgs={pair:CyclePairId;apply:boolean;tickers:string[]}|{exit:2;message:string};
/** Argument parsing and gates of scripts/dq/reconcile.ts (pure): bad arguments, unknown / unregistered pair, and --apply of a cn.* pair without FACTS_CN_ENABLED=1 (checked before any production deps exist; a dry run needs no gate). */
export function parseReconcileArgs(argv:readonly string[],env:Record<string,string|undefined>=process.env,registry:Partial<Record<CyclePairId,unknown>>=RECONCILE_PAIRS):ReconcileArgs{
 let pair='',apply=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--pair'&&v){pair=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--apply')apply=true;
  else return {exit:2,message:RECONCILE_USAGE};
 }
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair))return {exit:2,message:RECONCILE_USAGE};
 if(apply&&!cnPairEnabled(pair,env))return {exit:2,message:'cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1'};
 if(!registry[pair as CyclePairId])return {exit:2,message:`${RECONCILE_USAGE}\nregistered: ${Object.keys(registry).join(', ')}`};
 return {pair:pair as CyclePairId,apply,tickers};
}

export interface ProductionReconcileOptions{deadline:Date|null;codeVersion:string;admin?:SupabaseClient}
export function productionReconcileDeps(opts:ProductionReconcileOptions):ReconcileDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseFactsDb(sb),tables:supabaseTableClient(sb),raw:supabaseRawStore(sb),fetch:globalThis.fetch.bind(globalThis),
  readRepoFile:readRepoFileFromDisk,now:()=>new Date(),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
