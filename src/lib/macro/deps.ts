// src/lib/macro/deps.ts
// Production wiring for the macro write paths (spec §4.4): MacroDb over Supabase (writes through the
// service-role client's RPCs, reads through the anon client so RLS applies), the private macro-raw
// evidence store, the DQ TableClient, the global fetch and the real clock. Used by
// /api/cron/macro-sync and /api/macro/ingest; tests mock this module and inject memory doubles.
import {getAdminSupabase} from '../supabase/admin';
import {getAnonSupabase} from '../supabase/anon';
import {supabaseTableClient} from '../db/table-client';
import {supabaseMacroDb} from './db';
import {supabaseEvidenceStore} from './evidence';
import type {IngestDeps} from './ingest';

export interface MacroDeps extends IngestDeps{fetch:typeof fetch;sleep:(ms:number)=>Promise<void>}

export function productionMacroDeps(opts:{codeVersion:string}):MacroDeps{
 const admin=getAdminSupabase();
 return {
  db:supabaseMacroDb({admin,anon:getAnonSupabase()}),
  evidence:supabaseEvidenceStore(admin),
  tables:supabaseTableClient(admin),
  codeVersion:opts.codeVersion,
  now:()=>new Date(),
  fetch:(input,init)=>globalThis.fetch(input,init),
  sleep:(ms)=>new Promise<void>(r=>setTimeout(r,ms)),
 };
}
