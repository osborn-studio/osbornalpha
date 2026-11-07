// src/lib/documents/deps.ts
// Production wiring of the document pipeline (spec §6.1, §6.3). productionDocumentsDeps builds one
// PoliteHttp per run with the source's request gap (edgar 120 ms, cninfo 500 ms, hkexnews 1000 ms)
// shared by the list adapter and the document downloads, plus the Supabase DocumentsDb / TableClient /
// ObjectStore. documentsCodeVersion delegates to the facts rule (src/lib/facts/sync.ts::resolveCodeVersion):
// cron routes accept only a full VERCEL_GIT_COMMIT_SHA (allowGit false); scripts may fall back to
// `git rev-parse HEAD` (+ -dirty). null = refuse to apply. Sync wiring only: extraction wiring is
// extract/deps.ts (Task 10), candidates wiring is candidates/run.ts::supabaseCandidatesDeps (Task 15).
import {createClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {resolveCodeVersion} from '../facts/deps';
import type {Database} from '../supabase/database.types';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseDocumentsDb} from './db';
import {supabaseObjectStore} from './object-store';
import {CNINFO_INTERVAL_MS,cninfoAdapter} from './sources/cninfo';
import {EDGAR_DOC_FORMS,EDGAR_INTERVAL_MS,edgarAdapter} from './sources/edgar';
import {HKEX_INTERVAL_MS,hkexnewsAdapter} from './sources/hkexnews';
import {BUDGET_RESERVE_MS,HOST_POLICY,politeHttp} from './sources/shared';
import type {SourceAdapter} from './sources/shared';
import type {SyncDeps} from './sync';
import {reconcileDocumentScope} from './scope';
import type {DocScopeInput,DocScopeRow,DocumentsDb,ListedSource} from './types';

/** Same rule as the facts routes (src/lib/facts/deps.ts::resolveCodeVersion): allowGit false = a full VERCEL_GIT_COMMIT_SHA only. */
export function documentsCodeVersion(opts:{allowGit:boolean}={allowGit:false}):string|null{return resolveCodeVersion(opts);}

/** Per-request cap on every Supabase call (PostgREST rpc/select and storage) of a cron run. */
export const REQUEST_CAP_MS=30_000;
/**
 * fetch wrapper for the cron admin client: each request aborts at min(cap, time left before the deadline
 * minus the cleanup reserve), so a stalled upload or rpc cannot outlive the run and block lease release,
 * batch completion and freshness. The rejection is a TimeoutError (a network-level failure to supabase-js,
 * i.e. a transient error for the sync core). No time left → rejects without calling the transport.
 */
export function deadlineFetch(base:typeof fetch,deadline:Date,opts:{capMs?:number;reserveMs?:number;now?:()=>number}={}):typeof fetch{
 const cap=opts.capMs??REQUEST_CAP_MS,reserve=opts.reserveMs??BUDGET_RESERVE_MS,now=opts.now??Date.now;
 return async(input,init)=>{
  const ms=Math.min(cap,deadline.getTime()-now()-reserve);
  if(ms<=0)throw Object.assign(new Error('request_deadline'),{name:'TimeoutError'});
  const ctl=new AbortController();
  const timeout=()=>Object.assign(new Error('request_timeout'),{name:'TimeoutError'});
  const timer=setTimeout(()=>ctl.abort(timeout()),ms);
  const outer=init?.signal;
  const onAbort=()=>ctl.abort(outer?.reason);
  const cleanup=()=>{clearTimeout(timer);outer?.removeEventListener('abort',onAbort);};
  if(outer){if(outer.aborted)ctl.abort(outer.reason);else outer.addEventListener('abort',onAbort,{once:true});}
  let res:Response;
  try{res=await base(input,{...init,signal:ctl.signal});}
  catch(e){cleanup();if(ctl.signal.aborted&&!(outer?.aborted))throw timeout();throw e;}
  // T10 recheck N3: the abort stays armed until the BODY is consumed (supabase-js reads it after fetch resolves);
  // a body that stalls past the deadline errors the stream instead of hanging the SDK call
  if(!res.body){cleanup();return res;}
  const reader=res.body.getReader();
  const stream=new ReadableStream<Uint8Array>({
   start(c){
    ctl.signal.addEventListener('abort',()=>{reader.cancel().catch(()=>{});try{c.error(outer?.aborted?outer.reason:timeout());}catch{/* already closed */}},{once:true});
   },
   async pull(c){
    try{const r=await reader.read();if(r.done){cleanup();c.close();}else c.enqueue(r.value);}
    catch(e){cleanup();try{c.error(ctl.signal.aborted&&!(outer?.aborted)?timeout():e);}catch{/* already errored by the abort */}}
   },
   cancel(reason){cleanup();return reader.cancel(reason);},
  });
  return new Response(stream,{status:res.status,statusText:res.statusText,headers:res.headers});
 };
}

/** Service-role client whose every request is bounded by the run deadline (cron path). */
export function deadlineAdminSupabase(deadline:Date,baseFetch:typeof fetch=fetch):ReturnType<typeof getAdminSupabase>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) not configured — admin client unavailable');
 return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:deadlineFetch(baseFetch,deadline)}});
}

/**
 * Dry-run parity (T8-01): the issuers a scheduled --apply would process, computed without writing.
 * Runs the real reconcileDocumentScope against a db whose reconcileScope only records the rows, overlays
 * them on the stored scope (a new row is due now, a retired one has priority 0) and applies scopeDue's
 * filter and order (due, next_due_at asc, priority desc, issuer_id asc) and the limit.
 */
export async function planScheduledIssuers(deps:{tables:TableClient;db:Pick<DocumentsDb,'scopeAll'|'scopeRows'|'reconcileScope'>},source:ListedSource,opts:{limit:number;now:Date}):Promise<string[]>{
 const planned:DocScopeInput[]=[];
 const planning={scopeAll:deps.db.scopeAll,scopeRows:deps.db.scopeRows,reconcileScope:async(_s:ListedSource,rows:DocScopeInput[])=>{planned.push(...rows);return rows.length;}};
 await reconcileDocumentScope({tables:deps.tables,db:planning},source,{today:opts.now.toISOString().slice(0,10)});
 const at=opts.now.toISOString();
 const view=new Map<string,Pick<DocScopeRow,'issuer_id'|'priority'|'next_due_at'>>();
 for(const r of await deps.db.scopeAll(source))view.set(r.issuer_id,r);
 for(const p of planned){const old=view.get(p.issuer_id);view.set(p.issuer_id,{issuer_id:p.issuer_id,priority:p.priority,next_due_at:old?.next_due_at??at});}
 return [...view.values()].filter(r=>r.priority>0&&Date.parse(r.next_due_at)<=opts.now.getTime())
  .sort((x,y)=>Date.parse(x.next_due_at)-Date.parse(y.next_due_at)||y.priority-x.priority||(x.issuer_id<y.issuer_id?-1:x.issuer_id>y.issuer_id?1:0))
  .slice(0,opts.limit).map(r=>r.issuer_id);
}

export const SOURCE_INTERVAL_MS:Record<ListedSource,number>={edgar:EDGAR_INTERVAL_MS,cninfo:CNINFO_INTERVAL_MS,hkexnews:HKEX_INTERVAL_MS};
export interface DocumentsDepsOptions{
 deadline:Date|null;codeVersion:string|null;now?:()=>Date;
 /** Reuse an existing admin client (scripts hold one). */
 admin?:ReturnType<typeof getAdminSupabase>;
 /** edgar: forms added to EDGAR_DOC_FORMS (script --forms). */
 extraForms?:string[];
 /** cninfo/hkexnews: store every announcement, not only periodic reports (script --all-announcements, owner decision B). */
 allAnnouncements?:boolean;
 fetch?:typeof fetch;userAgent?:string;
}
export function productionDocumentsDeps(source:ListedSource,opts:DocumentsDepsOptions):SyncDeps{
 const sb=opts.admin??(opts.deadline?deadlineAdminSupabase(opts.deadline):getAdminSupabase());
 const http=politeHttp({...HOST_POLICY[source],minIntervalMs:SOURCE_INTERVAL_MS[source],fetch:opts.fetch,userAgent:opts.userAgent});
 const adapter:SourceAdapter=source==='edgar'?edgarAdapter({http,forms:[...new Set([...EDGAR_DOC_FORMS,...(opts.extraForms??[])])]})
  :source==='cninfo'?cninfoAdapter({http,allAnnouncements:opts.allAnnouncements}):hkexnewsAdapter({http,allAnnouncements:opts.allAnnouncements});
 return {db:supabaseDocumentsDb(sb),tables:supabaseTableClient(sb),store:supabaseObjectStore(sb),adapter,fetchBytes:http.fetchBytes,
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,userAgent:http.userAgentFor(`https://${HOST_POLICY[source].allowedHosts[0]}/`)};
}
