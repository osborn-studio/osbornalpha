// src/lib/facts/deps.ts
// Production wiring of SyncDeps (spec §6.1) shared by /api/cron/facts-sync and scripts/facts/*:
// Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), the cninfo
// linker (which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass:
// it hands over the FilingRow only), and step 9b (SEC acceptance times through sec-submissions.ts). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
// only — `git rev-parse HEAD` with "-dirty" when the tree has changes (sync.ts::resolveCodeVersion,
// which this delegates to); null means "refuse to apply".
import {getAdminSupabase} from '../supabase/admin';
import {selectAll,supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {supabaseFactsDb} from './db';
import {supabaseSnapshotStore} from './snapshot-store';
import {supabaseRawStore} from '../dq/raw-store';
import {fetchSubmissions} from '../entities/identifiers/sec-submissions';
import {enrichAcceptance} from './providers/sec-acceptance';
import {fetchCompanyFacts,parseCompanyFacts} from './providers/edgar-companyfacts';
import {coverageSummary,fetchTushareStatements,parseTushareStatements} from './providers/tushare-statements';
import {linkCninfoFiling} from './providers/cninfo-link';
import type {LinkIssuer} from './providers/cninfo-link';
import {chooseCnTicker} from './scope';
import {resolveCodeVersion as resolveFromEnvOrGit} from './sync';
import type {SyncDeps} from './sync';
import type {Budget,FactsDb,FilingRow} from './types';

/** allowGit=false (Vercel): only a full VERCEL_GIT_COMMIT_SHA counts; allowGit=true (scripts): env, then git HEAD (+ -dirty). */
export function resolveCodeVersion(opts:{allowGit:boolean}):string|null{
 return opts.allowGit?resolveFromEnvOrGit(process.env):resolveFromEnvOrGit(process.env,()=>{throw new Error('git_not_allowed');});
}

/** ts_code of the issuer's A-share by the scope's own selection (primary A, else the sole current A-share, B shares excluded, ambiguous/none → ''), and its cninfo_org_id. */
async function cnIssuer(tables:TableClient,issuerId:string,today:string):Promise<LinkIssuer>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 const current=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker')).filter(r=>isCurrentSecurity(r,today));
 const c=chooseCnTicker(current);
 return {ts_code:'ticker' in c?c.ticker:'',cninfo_org_id:typeof issuer?.cninfo_org_id==='string'?issuer.cninfo_org_id:null};
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
  if(!/^\d{6}\.(SH|SZ)$/.test(issuer.ts_code))return 'unlinkable';   // no usable A-share listing (none, ambiguous, BJ): no request is possible, no attempt consumed
  const key=filing.source_ref.split(':').slice(0,2).join(':');
  return linkCninfoFiling({form_type:filing.form_type,fiscal_year:filing.fiscal_year,period_end:filing.period_end,available_date:filing.available_date,corrected:filing.source_ref.split(':')[2]==='1'&&corrected.has(key)},issuer,{budget:b,fetch:opts.fetch,userAgent:opts.userAgent,minIntervalMs:opts.minIntervalMs});
 };
}

export interface ProductionDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>}
export function productionSyncDeps(opts:ProductionDepsOptions):SyncDeps{
 const sb=opts.admin??getAdminSupabase();
 const tables=supabaseTableClient(sb);
 const db=supabaseFactsDb(sb);
 return {
  db,tables,storage:supabaseSnapshotStore(sb),
  fetchUs:(cik10,b)=>fetchCompanyFacts(cik10,b),
  fetchCn:(tsCode,sinceYear,b)=>fetchTushareStatements(tsCode,sinceYear,b),
  parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
  parseCn:(snapshots,o)=>parseTushareStatements(snapshots,{sinceYear:o.sinceYear}),
  coverageCn:coverageSummary,   // → coverage_summary in the batch receipt
  linkCn:cninfoLinker(tables,db),
  // 9b: one submissions fetch per published US issuer, with the files[] pages back to the earliest pending
  // filing (coverFrom, plan audit R3); raw bytes into reconcile-raw. sec.filing_date_vs_submissions
  // results are recorded once plan-3 Part D adds recordDateMismatch (record.ts) here.
  enrichAcceptance:(issuer,cik10,b)=>enrichAcceptance({db,submissions:(c,bb,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw:supabaseRawStore(sb),budget:bb},{coverFrom})},{issuerId:issuer,cik10},b),
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,
 };
}
