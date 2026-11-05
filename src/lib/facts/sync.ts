// src/lib/facts/sync.ts
// Sync core (spec §6.1, §10). One ingest_batches row per call; per due issuer: lease → run →
// fetch → snapshot → parse → read + plan → stage → quarantine → publish → link (CN) →
// materialize → release. Every write goes through the injected FactsDb (lease-checked SQL
// functions); a lease_lost stops the issuer without any further database call; budget
// exhaustion abandons the in-flight run. Pure helpers (plan, rules) decide, this file sequences.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {RULES_VERSION} from '../dq/rules';
import {FactsDbError} from './types';
import type {Budget,FactCandidate,FactsDb,FilingInsert,FilingRow,Market,ParseResult,RawSnapshot,ScopeRow,Source} from './types';
import {FACT_CONCEPTS,MAPPING_GEN,MAPPING_VERSION} from './concepts';
import {SyncError} from './errors';
import {ambiguousKey,keyComponents} from './keys';
import {planFactWrites} from './plan';
import {evaluateFactRules,mergeWarnings,summarizeWarnings} from './rules';
import {snapshotPath} from './snapshot-store';
import type {SnapshotStore} from './snapshot-store';
import {reconcileScope,scopeRowFor} from './scope';
import type {ScopeInputRow} from './scope';
import {FORMULA_VERSION,materialize} from './derive';

/** Shape of providers/tushare-statements.ts::coverageSummary entries (the adapter is injected, never imported here). */
export interface CoverageEntry{api:string;report_type:number;years:Record<string,number>}
export interface SyncDeps{
 db:FactsDb;tables:TableClient;storage:SnapshotStore;
 fetchUs:(cik10:string,b:Budget)=>Promise<RawSnapshot>;
 fetchCn:(tsCode:string,sinceYear:number,b:Budget)=>Promise<RawSnapshot[]>;
 /** Adapters (Part C): parseCompanyFacts / parseTushareStatements wired by the route and scripts. */
 parseUs:(snapshot:RawSnapshot,opts:{sinceYear:number})=>ParseResult;
 parseCn:(snapshots:RawSnapshot[],opts:{sinceYear:number})=>ParseResult;
 linkCn?:(filing:FilingRow,b:Budget)=>Promise<{document_ref:string;document_url:string}|'none'|'ambiguous'>;
 /** CN coverage summary (§6.3 coverage_summary), wired by deps.ts to coverageSummary (round-1 #12). */
 coverageCn?:(parsed:ParseResult)=>CoverageEntry[];
 now:()=>Date;deadline:Date|null;codeVersion:string|null;
}
/**
 * issuerIds given (scripts, replay tests): those issuers run directly — no reconcileScope first,
 * next_due_at ignored. Their scope rows are read by id; a missing row is computed from the issuer
 * tables (scopeRowFor): seeded through reconcileScope with reasons ['explicit'] when applying,
 * constructed read-only for a dry run. An issuer whose fetch_key cannot be derived is reported as
 * outcome 'failed' / code 'scope_unresolved' — never silently skipped (round-1 #13). `limit` applies
 * to the scheduled path only: every explicitly requested issuer is processed (round-2 #13).
 */
export interface SyncOptions{market:Market;limit:number;issuerIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy;sinceYear?:number;mappingGen?:number}
/** 'planned' is the dry-run outcome of an issuer that fetched, parsed and planned without writing. */
export type IssuerOutcomeKind='published'|'planned'|'failed'|'skipped';
export interface IssuerOutcome{issuerId:string;fetchKey:string;runId:string|null;outcome:IssuerOutcomeKind;code?:string;counts:BatchCounts;errors:BatchError[];warnings:Map<string,string[]>;snapshotSha256:string[]}
export interface SyncDetail{attempted:number;published:number;failed:number;skipped:number;idle:boolean}
/** detail is the same object recorded on dq_freshness (spec §6.1) so cron receipts and the runbook read one shape. */
export interface SyncReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];issuers:IssuerOutcome[];idle:boolean;detail:SyncDetail}

const DAY=86_400_000;
export const LEASE_TTL_S=600;
export const MIN_ISSUER_MS=90_000;
export const NEXT_DUE_OK_MS=7*DAY;
export const NEXT_DUE_FAIL_MS=1*DAY;
export const MAX_LINK_ATTEMPTS=5;
export const LINKABLE_FORMS=new Set(['annual','semiannual','q1','q3','restatement']);
const COUNTERS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
const ALL_CONCEPTS=FACT_CONCEPTS.map(c=>c.id);
const isoDate=(d:Date)=>d.toISOString().slice(0,10);
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const dbCode=(e:unknown)=>e instanceof FactsDbError?e.code:null;
const datasetOf=(m:Market)=>m==='US'?'facts.us':'facts.cn';
const sourceOf=(m:Market):Source=>m==='US'?'edgar':'tushare';
const summary=(key:string,reason:string):BatchError=>({code:'skipped_summary',key,message:JSON.stringify({[reason]:1})});
const MAX_SKIP_REASONS=20;
/** One skipped_summary(parser) per issuer: the adapter's skip counters, top MAX_SKIP_REASONS by count, the rest folded into `_more` (round-1 #12). */
const skippedSummary=(issuer:string,skipped:{reason:string;n:number}[]):BatchError=>{
 const sorted=[...skipped].sort((a,b)=>b.n-a.n||a.reason.localeCompare(b.reason));
 const body:Record<string,number>=Object.fromEntries(sorted.slice(0,MAX_SKIP_REASONS).map(s=>[s.reason,s.n]));
 if(sorted.length>MAX_SKIP_REASONS)body._more=sorted.slice(MAX_SKIP_REASONS).reduce((n,s)=>n+s.n,0);
 return {code:'skipped_summary',key:`${issuer}:parser`,message:JSON.stringify(body)};
};
/** `<api>:rt<n>` → `<first year>-<last year>:<distinct end dates>`; compact enough for the 500-char batch error message cap. */
const compactCoverage=(entries:CoverageEntry[]):string=>JSON.stringify(Object.fromEntries(entries.map(e=>{const ys=Object.keys(e.years).sort();return [`${e.api}:rt${e.report_type}`,`${ys[0]??''}-${ys.at(-1)??''}:${Object.values(e.years).reduce((n,v)=>n+v,0)}`];})));

/** Remaining time and an abort signal that fires at the deadline; no deadline means unlimited. */
export function makeBudget(deadline:Date|null,now:()=>Date=()=>new Date()):Budget{
 if(deadline===null)return {remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal};
 const remainingMs=()=>Math.max(0,deadline.getTime()-now().getTime());
 return {remainingMs,signal:AbortSignal.timeout(remainingMs())};
}

/** VERCEL_GIT_COMMIT_SHA, else `git rev-parse HEAD` with -dirty when the tree has changes; null when neither is available. */
export function resolveCodeVersion(env:Record<string,string|undefined>=process.env,exec:(cmd:string,args:string[])=>string=(c,a)=>execFileSync(c,a,{encoding:'utf8',stdio:['ignore','pipe','ignore']})):string|null{
 const sha=env.VERCEL_GIT_COMMIT_SHA;
 if(sha!==undefined&&/^[0-9a-f]{40}$/.test(sha))return sha;
 try{
  const head=exec('git',['rev-parse','HEAD']).trim();
  if(!/^[0-9a-f]{40}$/.test(head))return null;
  return exec('git',['status','--porcelain']).trim().length>0?`${head}-dirty`:head;
 }catch{return null;}
}

interface Staged{parsed:ParseResult;filingIds:Map<string,string>;filingRows:Map<string,FilingRow>}
interface Fetched{parsed:ParseResult;sha256s:string[]}
const keyOfCandidate=(c:FactCandidate)=>({concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit});
/** missing_available_date natural key (spec §7.1 `<issuer>:<ts_code>:<end_date>:<report_type>`; EDGAR rows carry accn/tag in those slots). */
const missingDateKey=(issuer:string,fetchKey:string,r:Record<string,unknown>)=>[issuer,fetchKey,String(r.end_date??r.accn??''),String(r.report_type??r.tag??'')].join(':');

async function fetchAndParse(deps:SyncDeps,market:Market,issuer:string,fetchKey:string,sinceYear:number,budget:Budget,store:boolean):Promise<Fetched>{
 const snapshots:RawSnapshot[]=market==='US'?[await deps.fetchUs(fetchKey,budget)]:await deps.fetchCn(fetchKey,sinceYear,budget);
 if(store)for(const s of snapshots)await deps.storage.put(s,snapshotPath(sourceOf(market),issuer,s.sha256),budget);
 const sha256s=snapshots.map(s=>s.sha256);
 try{return {parsed:market==='US'?deps.parseUs(snapshots[0],{sinceYear}):deps.parseCn(snapshots,{sinceYear}),sha256s};}
 catch(e){throw new SyncError('parse_error',e instanceof Error?e.message.slice(0,200):'unknown');}
}

export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:ScopeRow;market:Market;sinceYear:number;mappingGen?:number;budget:Budget}):Promise<IssuerOutcome>{
 const {db,tables}=deps;const {scope,market,sinceYear,budget}=input;const issuer=scope.issuer_id;const gen=input.mappingGen??MAPPING_GEN;const dataset=datasetOf(market);
 const out:IssuerOutcome={issuerId:issuer,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
 const skip=(reason:string)=>{out.code=reason;out.errors.push(summary(issuer,reason));return out;};
 const [issuerRow]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 if(issuerRow?.status==='merged')return skip('issuer_merged');
 if(!await db.claimLease(issuer,market,batchId,LEASE_TTL_S))return skip('leased');
 let leaseHeld=true;let runId:string|null=null;let fetched=0;let publishedRun=false;
 const fail=(code:string,message?:string)=>{out.outcome='failed';out.code=code;out.errors.push(message===undefined?{code,key:issuer}:{code,key:issuer,message});out.counts.failed+=Math.max(1,fetched);return out;};
 // Only a run that is still staged can be abandoned: once publishRun committed the run is immutable
 // (abandon would raise run_published and mask the real failure) and its facts stay (round-1 #11).
 const abandon=async()=>{if(runId===null||!leaseHeld||publishedRun)return;try{await db.abandonRun(runId);}catch(e){if(dbCode(e)!=='lease_lost')throw e;leaseHeld=false;}};
 const release=async(outcome:'success'|'failed')=>{
  if(!leaseHeld)return;
  const next=new Date(deps.now().getTime()+(outcome==='success'?NEXT_DUE_OK_MS:NEXT_DUE_FAIL_MS)).toISOString();
  try{await db.releaseLease(issuer,market,batchId,outcome,next);}catch(e){if(dbCode(e)!=='lease_lost')throw e;leaseHeld=false;}
 };
 // Failure AFTER publication (link, materialize, release): the run stays published and the issuer
 // outcome stays 'published'; the original failure is recorded under its own code and the lease is
 // released as failed so the issuer returns in a day for the post-publish work (round-1 #11).
 const afterPublish=async(code:string,e:unknown)=>{out.errors.push({code,key:issuer,message:errMsg(e)});await release('failed');return out;};
 try{
  runId=await db.beginRun(issuer,market,batchId,gen);out.runId=runId;
  const {parsed,sha256s}=await fetchAndParse(deps,market,issuer,scope.fetch_key,sinceYear,budget,true);
  out.snapshotSha256=sha256s;
  fetched=parsed.candidates.length;out.counts.fetched=fetched;
  const park=(reasonCode:string,naturalKey:string,payload:Record<string,unknown>)=>quarantine(tables,{dataset,table:'financial_facts',naturalKey,reasonCode,batchId,payload:{...payload,run_id:runId}});
  // Parser leftovers come FIRST (round-1 #9): they need no filing row, and an input whose rows all
  // lack an available date must still leave its missing_available_date evidence behind even though
  // the empty-result branch below publishes an empty run. Parser-level ambiguity: the adapter's
  // `key` is its own grouping string (it knows no issuer); the §7.1 natural key is rendered here
  // from the first candidate and the parser key kept in the payload.
  let parserParked=0;
  for(const a of parsed.ambiguous){const c0=a.candidates[0];await park('ambiguous_value',ambiguousKey(issuer,market,keyOfCandidate(c0),c0.filingRef,gen),{key:keyComponents(issuer,market,keyOfCandidate(c0)),parser_key:a.key,candidates:a.candidates});parserParked+=a.candidates.length;}
  for(const c of parsed.oddDuration){await park('odd_duration',ambiguousKey(issuer,market,keyOfCandidate(c),c.filingRef,gen),{key:keyComponents(issuer,market,keyOfCandidate(c)),candidate:c});parserParked++;}
  for(const r of parsed.missingAvailableDate){await park('missing_available_date',missingDateKey(issuer,scope.fetch_key,r),{row:r});parserParked++;}
  out.counts.quarantined+=parserParked;
  // Adapter summaries → the batch info channel (round-1 #12): skip counters always, CN coverage when wired.
  if(parsed.skipped.length>0)out.errors.push(skippedSummary(issuer,parsed.skipped));
  if(market==='CN'&&deps.coverageCn)out.errors.push({code:'coverage_summary',key:issuer,message:compactCoverage(deps.coverageCn(parsed))});
  if(parsed.filings.length===0&&parsed.candidates.length===0){
   await db.publishRun(runId,[]);publishedRun=true;await release('success');out.outcome='published';return skip('no_rows');
  }
  const staged=await stageFilings(db,runId,issuer,market,parsed);
  const filingCandidates=parsed.filings.map(f=>({...f,availableDate:staged.filingRows.get(staged.filingIds.get(f.sourceRef)??'')!.available_date}));
  const read=await db.readFacts(issuer,market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
  if(read.truncated){await abandon();await release('failed');return fail('read_truncated');}
  const open=await db.openConflicts(issuer,market);
  const plan=planFactWrites({existing:read.rows,openConflicts:open,candidates:parsed.candidates,filingCandidates,filings:staged.filingIds,issuerId:issuer,market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
  if(plan.inserts.length>0)await db.stageFacts(runId,plan.inserts);
  for(const a of plan.ambiguous)await park('ambiguous_value',a.naturalKey,{key:a.key,candidates:a.candidates});
  for(const c of plan.conflicts){
   const itemId=await park('same_day_conflict',c.naturalKey,{key:c.key,fact_ids:[...c.newFactIds,...c.existingOkFactIds],values:c.values});
   await db.quarantineFacts(runId,c.newFactIds,itemId);
  }
  for(const j of plan.contestedJoins)await db.quarantineFacts(runId,j.factIds,j.itemId);
  const parked=new Set(plan.quarantinedFactIds);
  const sourceRefOf=new Map([...staged.filingRows.values()].map(f=>[f.filing_id,f.source_ref]));
  const rules=evaluateFactRules({newRows:plan.inserts.filter(r=>!parked.has(r.fact_id)),okRows:read.rows.filter(r=>r.status==='ok'),sourceRefOf,issuerId:issuer,market,mappingGen:gen});
  for(const rq of rules.quarantine){
   const itemId=await park(rq.reason,rq.naturalKey,{key:rq.key,fact_ids:rq.factIds,rule:rq.rule,detail:rq.detail});
   await db.quarantineFacts(runId,rq.factIds,itemId);
   for(const id of rq.factIds)plan.outcomes.set(id,'quarantined');
  }
  out.warnings=rules.warnings;
  for(const o of plan.outcomes.values())out.counts[o]++;
  out.counts.duplicates=plan.counts.duplicates;
  out.counts.quarantined+=plan.ambiguous.reduce((n,a)=>n+a.candidates.length,0);
  const manifest=parsed.filings.map(f=>staged.filingIds.get(f.sourceRef)!);
  try{await db.publishRun(runId,manifest);}
  catch(e){if(dbCode(e)!=='mapping_gen_regression')throw e;await abandon();await release('failed');return fail('mapping_gen_regression');}
  publishedRun=true;
  out.outcome='published';
  if(market==='CN'&&deps.linkCn)await linkFilings(deps,issuer,market,budget,out);
  try{await materialize(db,issuer,market);}
  catch(e){const code=dbCode(e);if(code!=='stale_computation'&&code!=='read_truncated')throw e;out.errors.push({code,key:issuer,message:errMsg(e)});}
  await release('success');
  return out;
 }catch(e){
  if(dbCode(e)==='lease_lost'){leaseHeld=false;if(publishedRun){out.errors.push({code:'lease_lost',key:issuer});return out;}return fail('lease_lost');}
  if(budget.signal.aborted||(e instanceof Error&&e.name==='AbortError')){
   if(publishedRun)return afterPublish('deadline_hit',e);
   await abandon();await release('failed');
   out.outcome='failed';out.code='deadline_hit';out.errors.push({code:'deadline_hit',key:issuer});return out;
  }
  if(publishedRun)return afterPublish(e instanceof SyncError?e.code:dbCode(e)??'unknown',e);
  await abandon();await release('failed');
  return fail(e instanceof SyncError?e.code:'unknown',e instanceof SyncError?undefined:errMsg(e));
 }
}

/** Stages this run's filings (existing source_refs keep their id) and returns the issuer's filing rows by id. */
async function stageFilings(db:FactsDb,runId:string,issuer:string,market:Market,parsed:ParseResult):Promise<Staged>{
 const known=new Map((await db.filingsOfIssuer(issuer,market,{})).map(f=>[f.source_ref,f.filing_id]));
 const rows:FilingInsert[]=parsed.filings.map(f=>({...f,filing_id:known.get(f.sourceRef)??randomUUID(),issuer_id:issuer}));
 const filingIds=await db.stageFilings(runId,rows);
 const filingRows=new Map((await db.filingsOfIssuer(issuer,market,{})).map(f=>[f.filing_id,f]));
 for(const f of parsed.filings){
  const id=filingIds.get(f.sourceRef);
  if(id===undefined||!filingRows.has(id))throw new SyncError('parse_error',`filing_not_staged:${f.sourceRef}`);
 }
 return {parsed,filingIds,filingRows};
}

async function linkFilings(deps:SyncDeps,issuer:string,market:Market,budget:Budget,out:IssuerOutcome):Promise<void>{
 const pending=(await deps.db.filingsOfIssuer(issuer,market,{unlinkedOnly:true})).filter(f=>f.link_attempts<MAX_LINK_ATTEMPTS&&f.origin!=='bse'&&LINKABLE_FORMS.has(f.form_type));
 let failed=0;
 for(const f of pending){
  // Cancellation BEFORE a request starts is not an attempt: link_attempts stays untouched (round-1 #21).
  if(budget.signal.aborted||budget.remainingMs()<MIN_ISSUER_MS/3)break;
  let patch:{document_ref?:string;document_url?:string;link_attempts:number}={link_attempts:f.link_attempts+1};
  let cut=false;
  try{
   const r=await deps.linkCn!(f,budget);
   if(typeof r!=='string')patch={...r,link_attempts:f.link_attempts+1};
  }catch(e){
   if(dbCode(e)==='lease_lost')throw e;
   failed++;                                             // transport/HTTP failure OR a request cut by the budget: a started request is an attempt (§6.3; round-2 #21)
   cut=budget.signal.aborted;
  }
  await deps.db.updateFilingLink(f.filing_id,patch);     // none / ambiguous / success / thrown / cut — every STARTED request is persisted
  if(cut)break;                                          // no budget left for the next request
 }
 if(failed>0)out.errors.push({code:'skipped_summary',key:`${issuer}:cninfo_link`,message:JSON.stringify({link_failed:failed})});
}

type Selected={scope:ScopeRow}|{unresolved:string};
const unresolvedOutcome=(issuerId:string):IssuerOutcome=>({issuerId,fetchKey:'',runId:null,outcome:'failed',code:'scope_unresolved',counts:{...emptyCounts(),failed:1},errors:[{code:'scope_unresolved',key:issuerId}],warnings:new Map(),snapshotSha256:[]});
/**
 * Scheduled path: the due rows. Explicit issuers (round-1 #13): their scope rows by id, in the
 * order given; a missing row is computed from the issuer tables (scopeRowFor) — seeded through
 * reconcileScope when applying (reasons ['explicit'], priority SCOPE_PRIORITY; the next cron
 * reconcile retires it to priority 0 unless a source lists the issuer), constructed read-only for
 * a dry run — and an issuer whose fetch_key cannot be derived is reported, never silently dropped.
 */
async function selectScopes(deps:SyncDeps,opts:SyncOptions):Promise<Selected[]>{
 if(opts.issuerIds===undefined)return (await deps.db.scopeDue(opts.market,deps.now().toISOString(),opts.limit)).map(scope=>({scope}));
 // Every explicitly requested issuer gets an outcome: `limit` bounds the scheduled path only and is
 // never used to silently drop requested ids (round-2 #13).
 const ids=[...new Set(opts.issuerIds)];
 const have=new Map((await deps.db.scopeRows(opts.market,ids)).map(s=>[s.issuer_id,s]));
 const today=isoDate(deps.now());const seed:ScopeInputRow[]=[];
 for(const id of ids){
  if(have.has(id))continue;
  const row=await scopeRowFor(deps.tables,opts.market,id,{today});
  if(row===null)continue;
  if(opts.dryRun)have.set(id,{...row,market:opts.market,next_due_at:deps.now().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  else seed.push(row);
 }
 if(seed.length>0){
  await deps.db.reconcileScope(opts.market,seed);
  for(const s of await deps.db.scopeRows(opts.market,seed.map(r=>r.issuer_id)))have.set(s.issuer_id,s);
 }
 return ids.map(id=>{const scope=have.get(id);return scope?{scope}:{unresolved:id};});
}

/** Dry run: fetch, parse and plan against the current rows, write nothing (no batch, lease, snapshot or run). Planned issuers report outcome 'planned'. */
async function dryRun(deps:SyncDeps,opts:SyncOptions,sinceYear:number,gen:number,budget:Budget):Promise<SyncReceipt> {
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];
 const selected=await selectScopes(deps,opts);
 let failed=0;
 for(const sel of selected){
  if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
  const scope=sel.scope;
  const out:IssuerOutcome={issuerId:scope.issuer_id,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
  try{
   const {parsed,sha256s}=await fetchAndParse(deps,opts.market,scope.issuer_id,scope.fetch_key,sinceYear,budget,false);
   out.snapshotSha256=sha256s;
   const known=new Map((await deps.db.filingsOfIssuer(scope.issuer_id,opts.market,{})).map(f=>[f.source_ref,f.filing_id]));
   const filings=new Map(parsed.filings.map(f=>[f.sourceRef,known.get(f.sourceRef)??randomUUID()]));
   const read=await deps.db.readFacts(scope.issuer_id,opts.market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
   const plan=planFactWrites({existing:read.rows,openConflicts:await deps.db.openConflicts(scope.issuer_id,opts.market),candidates:parsed.candidates,filingCandidates:parsed.filings,filings,issuerId:scope.issuer_id,market:opts.market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
   Object.assign(out.counts,{fetched:parsed.candidates.length,...plan.counts});out.outcome='planned';
  }catch(e){failed++;out.outcome='failed';out.code=e instanceof SyncError?e.code:'unknown';out.errors.push({code:out.code,key:scope.issuer_id,message:errMsg(e)});}
  issuers.push(out);for(const k of COUNTERS)counts[k]+=out.counts[k];errors.push(...out.errors);
 }
 const idle=selected.length===0;
 return {batchId:null,status:'dry_run',counts,errors,issuers,idle,detail:{attempted:selected.length,published:0,failed,skipped:0,idle}};
}

export async function runFactsSync(deps:SyncDeps,opts:SyncOptions):Promise<SyncReceipt>{
 const {market}=opts;const dataset=datasetOf(market);
 const sinceYear=opts.sinceYear??deps.now().getUTCFullYear()-10;const gen=opts.mappingGen??MAPPING_GEN;
 const budget=makeBudget(deps.deadline,deps.now);
 if(opts.dryRun)return dryRun(deps,opts,sinceYear,gen,budget);
 if(deps.codeVersion===null||deps.codeVersion==='')throw new SyncError('code_version_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'facts-sync',dataset,toolVersions:{mapping_gen:String(gen),rules:RULES_VERSION,formula:FORMULA_VERSION,source:sourceOf(market)},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];const warnings=new Map<string,string[]>();
 let attempted=0,published=0,failed=0,skipped=0,quota=false,idle=false;
 try{
  // Scheduled path (cron): reconcile the scope first (spec §6.1). Explicit issuers (scripts, replay
  // tests) skip it: their scope rows were put there by the caller and must not be retired by sources
  // the caller does not control.
  if(opts.issuerIds===undefined)await reconcileScope({db:deps.db,tables:deps.tables},market);
  const selected=await selectScopes(deps,opts);
  idle=selected.length===0;
  for(let i=0;i<selected.length;i++){
   const sel=selected[i];
   if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);attempted++;failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
   const scope=sel.scope;
   if(quota){skipped++;errors.push(summary(scope.issuer_id,'quota_exhausted'));continue;}
   if(budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:selected.length-i})});break;}
   attempted++;
   const r=await syncIssuerFacts(deps,batchId,{scope,market,sinceYear,mappingGen:gen,budget});
   issuers.push(r);for(const k of COUNTERS)counts[k]+=r.counts[k];errors.push(...r.errors);mergeWarnings(warnings,r.warnings);
   if(r.outcome==='published')published++;else if(r.outcome==='failed')failed++;else skipped++;
   if(r.code==='quota_exhausted')quota=true;
  }
  errors.push(...summarizeWarnings(warnings));
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  const ok=idle||published>=Math.max(1,Math.ceil(attempted/2));
  const detail:SyncDetail={attempted,published,failed,skipped,idle};
  await recordAttempt(deps.tables,dataset,{ok,cadence:'daily',now:deps.now(),detail:{...detail}});
  return {batchId,status,counts,errors,issuers,idle,detail};
 }catch(e){
  // Infrastructure failure outside an issuer: close the receipt so no running batch dangles, then rethrow.
  errors.push({code:'unknown',message:errMsg(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; runbook SQL marks it failed */}
  try{await recordAttempt(deps.tables,dataset,{ok:false,cadence:'daily',now:deps.now(),detail:{attempted,published,failed,skipped,idle,error:errMsg(e)}});}catch{/* same */}
  throw e;
 }
}
