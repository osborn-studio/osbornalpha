// src/lib/evals/cli/run-replay.ts
// run.ts --kind replay_consistency (spec §5.3, §7.1; integration step of Task 11). ci = frozen: every recorded case of
// src/lib/evals/fixtures/replay/<module>.frozen.json (or --set) is replayed over a database built from ITS sealed setup
// (replay/setup.ts::buildFrozenDb on the S4_TEST_STATE database — a frozen replay without one is refused, like
// record-replay.ts), one build per RECOMPUTED setup_sha256: every case's setup is recomputed first
// (groupSealedSetups, Codex plan round 1 P1-6); a case whose setup does not hash to its declared value is
// read_error(setup_mismatch) without any build. report = live: <module>.live.json over production — anon (unprivileged:
// a difference without a ledger hit is unexplained_diff(no_hints)) or, with --write-db, service_role (privileged hints,
// dq_eval_* store). The ledger is fixtures/replay/explanations.json. Every case gets exactly one CaseReport (--case /
// --limit: the rest skipped(subset) → incomplete); summary via replaySummaryContext; one report whose set block names
// the replay file (replay files are not gold sets: set_id 'replay/<file>', version 1, sha256 = the file bytes, format
// 'f6', thresholds REPLAY_THRESHOLDS). --http (the route smoke, §5.3.2) is not built in this phase → kind_not_enabled.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {getAdminSupabase} from '../../supabase/admin';
import {getAnonSupabase} from '../../supabase/anon';
import {privilegedFactsReader} from '../adapters/facts';
import {supabaseRawStorage} from '../adapters/provenance';
import {EvalError} from '../errors';
import {loadRecorders} from '../gold/load';
import {evaluateReplay,replaySetOf,replaySummaryContext} from '../kinds/replay';
import type {ProjectFn,ReplayContext,SetupCheck} from '../kinds/replay';
import {projectRequest,projectWithRev,resolveFactsSubject} from '../projections/facts';
import type {ProjectionDeps} from '../projections/facts';
import {parseReplayFile,recordedCases} from '../replay/fixture';
import type {FrozenReplayCase,LiveReplayCase,ReplayCase,ReplayMode} from '../replay/fixture';
import {parseLedger} from '../replay/ledger';
import {buildFrozenDb,groupSealedSetups} from '../replay/setup';
import type {FrozenSetup} from '../replay/setup';
import {buildReport} from '../report';
import {evalStore} from '../store';
import type {EvalStore} from '../store';
import {exitCodeOf,summarize} from '../summary';
import type {CaseReport,EvalEnv,EvalModule,Hint,ReplayRequest,ReportEnvironment} from '../types';
import {LANDED_PARSERS,hostOf} from './deps';
import type {KindRunner} from './run-cli';

export const LEDGER_PATH='src/lib/evals/fixtures/replay/explanations.json';
export const replayFileOf=(module:EvalModule,mode:ReplayMode)=>`src/lib/evals/fixtures/replay/${module}.${mode}.json`;


/** What the replay runner reads through; the default opens real databases, tests inject one. */
export interface ReplayBackend{
 /** frozen: build (or reuse) the database of one sealed setup; check = the setup verdict for kinds/replay.ts. */
 frozen?(setup:FrozenSetup):Promise<{check:SetupCheck;project:ProjectFn}>;
 /** live: the projection, the issuer's current fact_state_rev, and (privileged only) hints. */
 project?:ProjectFn;stateRev?:(c:LiveReplayCase)=>Promise<number|null>;hints?:(request:ReplayRequest,since:string)=>Promise<Hint[]>;
 environment:ReportEnvironment;store:EvalStore|null;close():Promise<void>;
}
export type ReplayBackendFactory=(mode:ReplayMode,privileged:boolean,env:Record<string,string|undefined>)=>Promise<ReplayBackend>;

const none:ReportEnvironment={db_host:null,app_origin:null,db_state_rev:null};
export const defaultReplayBackend:ReplayBackendFactory=async(mode,privileged,env)=>{
 if(mode==='frozen'){
  const state=env.S4_TEST_STATE;
  if(!state)throw new EvalError('kind_not_enabled','replay frozen needs S4_TEST_STATE (a freshly migrated local database)',{reason:'no_test_database'});
  const adminUrl=(JSON.parse(readFileSync(state,'utf8')) as {adminUrl:string}).adminUrl;
  const pool=new Pool({connectionString:adminUrl});
  const builds=new Map<string,{check:SetupCheck;project:ProjectFn}>();
  const worlds:{close():Promise<void>}[]=[];   // each build is an isolated database (replay/setup.ts, R2-2), dropped on close
  return {environment:{...none,db_host:hostOf(adminUrl)},store:null,close:async()=>{for(const w of worlds)await w.close().catch(()=>{});await pool.end();},
   async frozen(setup){
    const hit=builds.get(setup.setup_sha256);if(hit)return hit;
    const b=await buildFrozenDb(pool,setup);
    if(b.ok)worlds.push(b.world);
    const out:{check:SetupCheck;project:ProjectFn}=b.ok
     ?{check:{ok:true,setupSha256:b.world.setup.setup_sha256},project:r=>projectRequest({db:b.world.db,resolve:(s,t)=>resolveFactsSubject(b.world.tables,s,t)},r,setup.today)}
     :{check:{ok:false,mismatch:[b.mismatch]},project:async()=>{throw new Error('setup not built');}};
    builds.set(setup.setup_sha256,out);return out;
   }};
 }
 const sb=privileged?getAdminSupabase():getAnonSupabase();
 const tables=supabaseTableClient(sb),db=supabaseFactsDb(sb);
 const deps:ProjectionDeps={db,resolve:(s,t)=>resolveFactsSubject(tables,s,t)};
 const today=new Date().toISOString().slice(0,10);
 const rpc=sb as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
 return {environment:{...none,db_host:hostOf(env.NEXT_PUBLIC_SUPABASE_URL)},store:privileged?evalStore(tables):null,close:async()=>{},
  project:r=>projectWithRev(deps,r,today),   // the projection and the state_rev it was read at (live ledger tuple)
  stateRev:async c=>{
   const ref=await deps.resolve(c.request.issuer,today);if(!ref)return null;
   const {data,error}=await rpc.rpc('fact_state_rev',{p_issuer:ref.issuerId,p_market:ref.market});
   if(error)throw new Error(`fact_state_rev_failed: ${error.message??''}`);
   return Number(data);
  },
  ...(privileged?{hints:privilegedFactsReader({db,tables,stateRev:async()=>null,storage:supabaseRawStorage(sb),parsers:LANDED_PARSERS}).hints}:{})};
};

const subsetSkip=(c:ReplayCase):CaseReport=>({case_id:c.case_id,required:true,outcome:{result:'skipped',reason:'subset'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});

export function replayRunner(factory:ReplayBackendFactory=defaultReplayBackend,env:Record<string,string|undefined>=process.env):KindRunner{
 return async(args,deps)=>{
  if(args.http)throw new EvalError('kind_not_enabled','the --http route smoke is not built in this phase (spec §5.3.2, §0 R5-9)',{kind:args.kind});
  const mode:ReplayMode=args.mode==='ci'?'frozen':'live';
  const path=args.set??replayFileOf(args.module,mode);
  let bytes:Uint8Array;
  try{bytes=deps.readFile(path);}catch(e){throw new EvalError('gold_invalid',`${path}: unreadable (${e instanceof Error?e.message:String(e)})`,{file:path});}
  const file=parseReplayFile(JSON.parse(new TextDecoder().decode(bytes)),{allowDrafts:false,file:path});
  if(file.mode!==mode)throw new EvalError('gold_invalid',`${path} is a ${file.mode} file; --mode ${args.mode} replays ${mode}`,{file:path});
  const all=recordedCases(file);
  const unknown=args.caseIds.filter(id=>!all.some(c=>c.case_id===id));
  if(unknown.length>0)throw new EvalError('gold_invalid','unknown case_id in --case',{case_ids:unknown});
  let chosen=all.filter(c=>args.caseIds.length===0||args.caseIds.includes(c.case_id));
  if(args.limit!==undefined)chosen=chosen.slice(0,args.limit);
  const subset=args.caseIds.length>0||args.limit!==undefined;
  const ledger=parseLedger(JSON.parse(new TextDecoder().decode(deps.readFile(LEDGER_PATH))),{recorders:loadRecorders().recorders,module:args.module});
  const v=deps.version();
  if(!/^[0-9a-f]{40}$/.test(v.sha))throw new EvalError('code_version_missing','evaluator code version must be a 40-hex commit',{value:v.sha});
  if(args.mode==='report'&&v.dirty)throw new EvalError('dirty_tree','report runs need a clean working tree');
  const evalEnv:EvalEnv={today:deps.now().toISOString().slice(0,10),now:()=>deps.now(),evaluatorCodeVersion:v.sha,dirty:v.dirty};
  const backend=await factory(mode,args.writeDb,env);
  const run={store:backend.store,close:()=>backend.close()};
  try{
   const startedAt=evalEnv.now().toISOString();
   const reports:CaseReport[]=[];
   if(mode==='frozen'){
    const {groups,mismatched}=groupSealedSetups(chosen as FrozenReplayCase[]);
    for(const m of mismatched)reports.push(...await evaluateReplay([m.case],async()=>{throw new Error('setup not built');},ledger,{mode,evaluatorCodeVersion:v.sha,checkSetup:async()=>({ok:false,mismatch:[m.mismatch]})}));
    for(const group of groups){
     const built=await backend.frozen!(group.setup);
     reports.push(...await evaluateReplay(group.cases,built.project,ledger,{mode,evaluatorCodeVersion:v.sha,checkSetup:async()=>built.check}));
    }
   }else{
    const ctx:ReplayContext={mode,evaluatorCodeVersion:v.sha,...(backend.stateRev?{stateRev:backend.stateRev}:{}),...(backend.hints?{hints:backend.hints}:{})};
    reports.push(...await evaluateReplay(chosen,backend.project!,ledger,ctx));
   }
   const byId=new Map(reports.map(r=>[r.case_id,r]));
   const cases=all.map(c=>byId.get(c.case_id)??subsetSkip(c));
   const summary=summarize(cases,replaySummaryContext(subset));
   const report=buildReport({runId:randomUUID(),kind:'replay_consistency',mode:args.mode,privileged:args.writeDb,set:replaySetOf(path,bytes,args.module),env:evalEnv,
    environment:backend.environment,startedAt,finishedAt:evalEnv.now().toISOString(),verified:{artifacts:false,sources:false},summary,cases});
   return {outcome:{report,exitCode:exitCodeOf(summary.gate)},run};
  }catch(e){await backend.close().catch(()=>{});throw e;}
 };
}
export const runReplay:KindRunner=replayRunner();
