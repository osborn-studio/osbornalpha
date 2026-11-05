// src/lib/facts/deps.ts
// Production wiring of SyncDeps (spec §6.1) shared by /api/cron/facts-sync and scripts/facts/*:
// Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), and the cninfo
// linker, which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass
// (it hands over the FilingRow only). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
// only — `git rev-parse HEAD` with "-dirty" when the tree has changes (sync.ts::resolveCodeVersion,
// which this delegates to); null means "refuse to apply".
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {supabaseFactsDb} from './db';
import {supabaseSnapshotStore} from './snapshot-store';
import {fetchCompanyFacts,parseCompanyFacts} from './providers/edgar-companyfacts';
import {coverageSummary,fetchTushareStatements,parseTushareStatements} from './providers/tushare-statements';
import {linkCninfoFiling} from './providers/cninfo-link';
import type {LinkIssuer} from './providers/cninfo-link';
import {reconcileScope} from './scope';
import {resolveCodeVersion as resolveFromEnvOrGit} from './sync';
import type {SyncDeps} from './sync';
import type {Budget,FactsDb,FilingRow} from './types';

/** allowGit=false (Vercel): only a full VERCEL_GIT_COMMIT_SHA counts; allowGit=true (scripts): env, then git HEAD (+ -dirty). */
export function resolveCodeVersion(opts:{allowGit:boolean}):string|null{
 return opts.allowGit?resolveFromEnvOrGit(process.env):resolveFromEnvOrGit(process.env,()=>{throw new Error('git_not_allowed');});
}

const CN_TICKER=/\.(SH|SZ|BJ)$/;
/** ts_code (primary A-share listing current at `today` by the landed validity predicate) and cninfo_org_id of an issuer; '' ts_code → the linker answers 'none'. */
async function cnIssuer(tables:TableClient,issuerId:string,today:string):Promise<LinkIssuer>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 const securities=(await tables.select('issuer_securities',{issuer_id:issuerId,is_primary:true},{limit:50})).filter(r=>isCurrentSecurity(r,today));
 const ts=securities.map(s=>String(s.ticker).toUpperCase()).filter(t=>CN_TICKER.test(t)).sort()[0]??'';
 return {ts_code:ts,cninfo_org_id:typeof issuer?.cninfo_org_id==='string'?issuer.cninfo_org_id:null};
}
/** A type-1 filing is "corrected" when a type-5 filing exists for the same ts_code:end_date (spec §6.3: match 更正 titles). */
const correctedKeys=(filings:FilingRow[])=>new Set(filings.filter(f=>f.source_ref.split(':')[2]==='5').map(f=>f.source_ref.split(':').slice(0,2).join(':')));

export interface LinkerOptions{fetch?:typeof fetch;userAgent?:string;minIntervalMs?:number;today?:string}
export function cninfoLinker(tables:TableClient,db:Pick<FactsDb,'filingsOfIssuer'>,opts:LinkerOptions={}):NonNullable<SyncDeps['linkCn']>{
 const cache=new Map<string,Promise<{issuer:LinkIssuer;corrected:Set<string>}>>();
 const context=(issuerId:string)=>{
  let p=cache.get(issuerId);
  if(!p){
   p=Promise.all([cnIssuer(tables,issuerId,opts.today??new Date().toISOString().slice(0,10)),db.filingsOfIssuer(issuerId,'CN',{})]).then(([issuer,filings])=>({issuer,corrected:correctedKeys(filings)}));
   cache.set(issuerId,p);
   p.catch(()=>{if(cache.get(issuerId)===p)cache.delete(issuerId);});   // a failed lookup is not cached
  }
  return p;
 };
 return async(filing:FilingRow,b:Budget)=>{
  const {issuer,corrected}=await context(filing.issuer_id);
  const key=filing.source_ref.split(':').slice(0,2).join(':');
  return linkCninfoFiling({form_type:filing.form_type,fiscal_year:filing.fiscal_year,period_end:filing.period_end,available_date:filing.available_date,corrected:filing.source_ref.split(':')[2]==='1'&&corrected.has(key)},issuer,{budget:b,fetch:opts.fetch,userAgent:opts.userAgent,minIntervalMs:opts.minIntervalMs});
 };
}

/**
 * Concurrency guard for scope retirement (Task 14 follow-up). reconcile_fact_sync_scope retires every
 * scope row that is absent from the sources as read ONCE; a run holding a stale snapshot could retire
 * an issuer another run just added. PostgREST has no advisory lock, so the guard narrows the window
 * instead: before any retirement (priority 0 row) is applied, the sources are read a second time and
 * only issuers absent from BOTH reads are retired. Upserts of desired rows pass through unchanged.
 * It does not make concurrent reconciles of one market fully safe — the cron runs every 4 h with a
 * 300 s cap, and scripts must not run `--apply` for a market while its cron may be running.
 */
export function guardedReconcileDb(db:FactsDb,tables:TableClient):FactsDb{
 const guarded=Object.create(db) as FactsDb;
 guarded.reconcileScope=async(market,rows)=>{
  if(!rows.some(r=>r.priority===0))return db.reconcileScope(market,rows);
  let second:typeof rows=[];
  await reconcileScope({tables,db:{scopeAll:m=>db.scopeAll(m),reconcileScope:async(_m,r)=>{second=r;return 0;}}},market);
  const confirmed=new Set(second.filter(r=>r.priority===0).map(r=>r.issuer_id));
  return db.reconcileScope(market,rows.filter(r=>r.priority>0||confirmed.has(r.issuer_id)));
 };
 return guarded;
}

export interface ProductionDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date}
export function productionSyncDeps(opts:ProductionDepsOptions):SyncDeps{
 const sb=getAdminSupabase();
 const tables=supabaseTableClient(sb);
 const db=guardedReconcileDb(supabaseFactsDb(sb),tables);
 return {
  db,tables,storage:supabaseSnapshotStore(sb),
  fetchUs:(cik10,b)=>fetchCompanyFacts(cik10,b),
  fetchCn:(tsCode,sinceYear,b)=>fetchTushareStatements(tsCode,sinceYear,b),
  parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
  parseCn:(snapshots,o)=>parseTushareStatements(snapshots,{sinceYear:o.sinceYear}),
  coverageCn:coverageSummary,   // → coverage_summary in the batch receipt
  linkCn:cninfoLinker(tables,db),
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,
 };
}
