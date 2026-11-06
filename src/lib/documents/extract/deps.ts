// src/lib/documents/extract/deps.ts
// Production wiring of ExtractDeps (spec §7.3) shared by /api/cron/documents-extract,
// POST /api/admin/documents/[id]/reprocess and scripts/documents/extract.ts: service-role
// DocumentsDb / TableClient / ObjectStore (bucket disclosure-docs) and the real extractors, each run in a
// worker thread with a hard deadline (extract/isolate.ts).
// codeVersion comes from the caller (src/lib/facts/deps.ts::resolveCodeVersion); null = refuse to apply.
import {getAdminSupabase} from '../../supabase/admin';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseDocumentsDb} from '../db';
import {supabaseObjectStore} from '../object-store';
import {existsSync} from 'node:fs';
import {extractInWorker,workerEntry} from './isolate';
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
export function productionExtractDeps(opts:ExtractDepsOptions):ExtractDeps{
 const sb=opts.admin??getAdminSupabase();
 return {db:supabaseDocumentsDb(sb),tables:supabaseTableClient(sb),store:supabaseObjectStore(sb),extractPdf:viaWorker('pdf'),extractHtml:async(bytes,budget)=>(await viaWorker('html')(bytes,budget)).pages,
  preflight:()=>existsSync(workerEntry())?null:'worker_missing',   // R5-P2-1: checked before any claim
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion};
}
