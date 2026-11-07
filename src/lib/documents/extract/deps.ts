// src/lib/documents/extract/deps.ts
// Production wiring of ExtractDeps (spec §7.3) shared by /api/cron/documents-extract,
// POST /api/admin/documents/[id]/reprocess and scripts/documents/extract.ts: service-role
// DocumentsDb / TableClient / ObjectStore (bucket disclosure-docs) and the real extractors, each run in a
// worker thread with a hard deadline (extract/isolate.ts).
// codeVersion comes from the caller (src/lib/facts/deps.ts::resolveCodeVersion); null = refuse to apply.
import {createClient} from '@supabase/supabase-js';
import {getAdminSupabase} from '../../supabase/admin';
import type {Database} from '../../supabase/database.types';
import {deadlineFetch} from '../deps';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseDocumentsDb} from '../db';
import {supabaseObjectStore} from '../object-store';
import {extractInWorker,workerPreflight} from './isolate';
import {pdfjsAssets} from './pdf';
import type {ExtractBudget} from './pdf';
import {MAX_PDF_PAGES} from './run';
import type {ExtractDeps} from './run';

/** Codex plan round 3 (R1-P2-7 final): pdf.js and the HTML parser block the event loop, so they run in a
 *  worker thread; the main thread keeps the lease heartbeat and terminates the worker at the hard deadline
 *  (extract_timeout) or when the heartbeat aborts (lease_lost). The worker's own soft budget is 5 s shorter. */
export const WORKER_SOFT_MARGIN_MS=5_000;
const viaWorker=(kind:'pdf'|'html')=>(bytes:Uint8Array,budget:ExtractBudget)=>{
 const hardMs=budget.remainingMs();
 return extractInWorker({kind,bytes,maxPages:budget.maxPages??MAX_PDF_PAGES,softMs:Math.max(hardMs-WORKER_SOFT_MARGIN_MS,1),assets:pdfjsAssets()},{hardMs,...(budget.signal?{signal:budget.signal}:{})});
};
export interface ExtractDepsOptions{deadline:Date|null;codeVersion:string|null;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>}
/** Finalization (batch row, freshness) may run until this long after the run deadline (the function limit is 60 s further out). */
export const FINALIZE_GRACE_MS=30_000;
/** Service-role client with every request capped (and, when given a deadline, aborted by it): the work client stops 5 s before the
 *  deadline so run.ts' own reserve stays usable; the finalize client may run FINALIZE_GRACE_MS past it. */
function boundedAdmin(deadline:Date,reserveMs:number,graceMs:number){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) not configured — admin client unavailable');
 return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:deadlineFetch(fetch,new Date(deadline.getTime()+graceMs),{reserveMs})}});
}
export function productionExtractDeps(opts:ExtractDepsOptions):ExtractDeps{
 // T10 review: with a deadline (the cron) no storage or rpc call can outlive the run; scripts/admin hold their own client and run.ts bounds each call itself
 const bounded=!opts.admin&&opts.deadline!==null;
 const sb=opts.admin??(bounded?boundedAdmin(opts.deadline!,5_000,0):getAdminSupabase());
 const fin=bounded?boundedAdmin(opts.deadline!,0,FINALIZE_GRACE_MS):sb;
 return {db:supabaseDocumentsDb(sb),tables:supabaseTableClient(fin),store:supabaseObjectStore(sb),extractPdf:viaWorker('pdf'),extractHtml:async(bytes,budget)=>(await viaWorker('html')(bytes,budget)).pages,
  preflight:()=>workerPreflight(),   // R5-P2-1: worker_missing / worker_stale, checked before any claim (no attempt consumed)
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
