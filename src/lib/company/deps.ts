// src/lib/company/deps.ts
// Production wiring (plan Task 8). Digest: every dependency service_role (company_digest_state,
// issuer_events, company_fact_evidence and fact_sync_scope are not readable by anon, §0 #64).
// The read-route wiring (ReadDeps / productionReadDeps / productionEventGateDeps) is appended by
// Task 9 Step 1 — this task creates only the digest side.
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../db/table-client';
import {supabaseFactsDb} from '../facts/db';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseCompanyDb} from './db';
import type {DigestDeps} from './digest';
import {supabaseSnapshotObjectStore} from './evidence-index';
import {readSnapshot} from './snapshot-read';

export interface ProductionDigestOptions{deadline:Date|null;codeVersion:string|null;admin?:SupabaseClient;now?:()=>Date}
export function productionDigestDeps(opts:ProductionDigestOptions):DigestDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseCompanyDb(sb),tables:supabaseTableClient(sb),readSnapshot:(i,m,o)=>readSnapshot(sb,i,m,o),facts:supabaseFactsDb(sb),
  reader:supabaseSnapshotObjectStore(sb),now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
