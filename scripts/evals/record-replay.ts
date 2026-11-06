/**
 * Record replay expectations (spec §5.3.1, §5.3.2, §5.3.3, §14).
 *
 *   npx tsx scripts/evals/record-replay.ts --mode frozen|live --case <id> [--case <id> ...] [--supersede <ledger_id>] [--file <path>] [--ledger <path>]
 *
 * Append-only (replay/record.ts::applyRecording): a draft case (expected null) is recorded; a recorded
 * case whose projection hash is unchanged stays untouched; a changed one is refused
 * (replay_rerecord_refused, exit 2) unless --supersede (exactly one --case) names an approved ledger entry
 * for this case and mode with before_hash = stored hash and after_hash = new hash.
 * frozen: needs S4_TEST_STATE (a freshly migrated local database — run through .claude/scratch/db-run.ts);
 * the draft setup is sealed with replay/setup.ts::sealSetupFromPaths, the database is built once per setup_sha256
 * with buildFrozenDb (a fresh isolated database per setup, dropped on exit), and the projection is read over that database (projections/facts.ts::projectRequest).
 * live: production over the anon client (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, e.g.
 * node --env-file=.env.local --import tsx …), recording fact_state_rev after the projection.
 * Refuses a dirty checkout (EvalError dirty_tree, exit 2 — evaluator_code_version must name committed code; Codex plan
 * round 1 P1-7): commit the code and the drafts first, then record, then commit the recording.
 * The file is written once, only after every requested case succeeded. Prints "<action> <case_id> <hash>".
 * Exit 0 ok, 2 refused or bad arguments, 1 any other failure.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {Pool} from 'pg';
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {EvalError,exitCodeOfError} from '../../src/lib/evals/errors';
import {projectRequest,projectWithRev,resolveFactsSubject} from '../../src/lib/evals/projections/facts';
import type {ProjectionDeps} from '../../src/lib/evals/projections/facts';
import {isDraft,parseReplayFile,serializeReplayFile} from '../../src/lib/evals/replay/fixture';
import type {DraftReplayCase,FrozenReplayCase,ReplayCase,ReplayFile,ReplayMode,SealedSetup} from '../../src/lib/evals/replay/fixture';
import {loadRecorders} from '../../src/lib/evals/gold/load';
import {loadLedger} from '../../src/lib/evals/replay/ledger';
import {applyRecording} from '../../src/lib/evals/replay/record';
import {buildFrozenDb,sealSetupFromPaths,setupSha256} from '../../src/lib/evals/replay/setup';
import type {FrozenSetup,FrozenSetupPathsDraft} from '../../src/lib/evals/replay/setup';
import type {Projection} from '../../src/lib/evals/types';
import {evaluatorVersion} from '../../src/lib/evals/version';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

class UsageError extends Error{}
const USAGE='usage: record-replay.ts --mode frozen|live --case <id> [--case <id> ...] [--supersede <ledger_id>] [--file <path>] [--ledger <path>]';

interface Args{mode:ReplayMode;cases:string[];supersede?:string;file:string;ledger:string}
function parseArgs(argv:string[]):Args{
 let mode:string|undefined,supersede:string|undefined,file:string|undefined,ledger:string|undefined;const cases:string[]=[];
 for(let i=0;i<argv.length;i+=2){
  const x=argv[i],v=argv[i+1];
  if(v===undefined||v.startsWith('--'))throw new UsageError(USAGE);
  if(x==='--mode')mode=v;else if(x==='--case')cases.push(v);else if(x==='--supersede')supersede=v;else if(x==='--file')file=v;else if(x==='--ledger')ledger=v;else throw new UsageError(USAGE);
 }
 if(mode!=='frozen'&&mode!=='live')throw new UsageError(USAGE);
 if(cases.length===0||new Set(cases).size!==cases.length)throw new UsageError(USAGE);
 if(supersede!==undefined&&cases.length!==1)throw new UsageError('--supersede takes exactly one --case');
 return {mode,cases,supersede,file:file??`src/lib/evals/fixtures/replay/facts.${mode}.json`,ledger:ledger??'src/lib/evals/fixtures/replay/explanations.json'};
}
const readJson=(path:string):unknown=>{
 try{return JSON.parse(readFileSync(path,'utf8'));}
 catch(e){throw new EvalError('gold_invalid',`${path}: unreadable (${e instanceof Error?e.message:String(e)})`,{file:path});}
};

interface Env{project(c:ReplayCase|DraftReplayCase):Promise<{projection:Projection;setup?:SealedSetup;stateRev?:number|null}>;close():Promise<void>}

function frozenEnv():Env{
 const state=process.env.S4_TEST_STATE;
 if(!state)throw new UsageError('--mode frozen needs S4_TEST_STATE: run through .claude/scratch/db-run.ts');
 const pool=new Pool({connectionString:JSON.parse(readFileSync(state,'utf8')).adminUrl});
 const built=new Map<string,ProjectionDeps>();
 const worlds:{close():Promise<void>}[]=[];   // isolated databases (replay/setup.ts, R2-2)
 return {
  async project(c){
   const setup:FrozenSetup=isDraft(c)?sealSetupFromPaths(c.setup as unknown as FrozenSetupPathsDraft):(c as FrozenReplayCase).setup as unknown as FrozenSetup;
   // P1-6: every case's setup is recomputed before the cache lookup (a recorded case may not carry a stale hash)
   if(setupSha256(setup)!==setup.setup_sha256)throw new EvalError('gold_invalid',`case ${c.case_id}: setup_mismatch (setup_sha256 does not match the setup)`,{case_id:c.case_id,mismatch:'setup_sha256'});
   let deps=built.get(setup.setup_sha256);
   if(!deps){
    const r=await buildFrozenDb(pool,setup);
    if(!r.ok)throw new EvalError('gold_invalid',`case ${c.case_id}: setup_mismatch (${r.mismatch})`,{case_id:c.case_id,mismatch:r.mismatch});
    worlds.push(r.world);
    const tables=r.world.tables;
    deps={db:r.world.db,resolve:(s,t)=>resolveFactsSubject(tables,s,t)};
    built.set(setup.setup_sha256,deps);
   }
   return {projection:await projectRequest(deps,c.request,setup.today),setup:setup as unknown as SealedSetup};
  },
  close:async()=>{for(const w of worlds)await w.close().catch(()=>{});await pool.end();},
 };
}

function liveEnv():Env{
 const sb=getAnonSupabase();
 const tables=supabaseTableClient(sb);
 const deps:ProjectionDeps={db:supabaseFactsDb(sb),resolve:(s,t)=>resolveFactsSubject(tables,s,t)};
 const today=new Date().toISOString().slice(0,10);
 return {
  async project(c){
   // projectWithRev binds the recorded state_rev to the projection that was read (ProjectionError(subject_unresolved) when the issuer is unknown)
   const {projection,stateRev}=await projectWithRev(deps,c.request,today);
   return {projection,stateRev};
  },
  close:async()=>{},
 };
}

async function main(argv:string[]):Promise<void>{
 const a=parseArgs(argv);
 const v=evaluatorVersion();
 const file=parseReplayFile(readJson(a.file),{allowDrafts:true,file:a.file});
 if(file.mode!==a.mode)throw new EvalError('gold_invalid',`${a.file} is a ${file.mode} file`,{file:a.file});
 for(const id of a.cases)if(!file.cases.some(c=>c.case_id===id))throw new EvalError('gold_invalid',`${a.file}: unknown case ${id}`,{file:a.file,case_id:id});
 const ledger=loadLedger(a.ledger,{recorders:loadRecorders().recorders,module:file.module});
 const env=a.mode==='frozen'?frozenEnv():liveEnv();
 let cur:ReplayFile=file;
 const lines:string[]=[];
 try{
  if(v.dirty)throw new EvalError('dirty_tree','record-replay needs a clean checkout: commit the code and drafts first (git status --porcelain --untracked-files=normal is not empty)');
  for(const id of a.cases){
   const c=cur.cases.find(x=>x.case_id===id)!;
   const got=await env.project(c);
   const r=applyRecording(cur,{case_id:id,projection:got.projection,setup:got.setup,code_version:v.sha,at:new Date().toISOString(),state_rev:got.stateRev},{supersede:a.supersede,ledger});
   cur=r.file;lines.push(`${r.action} ${id} ${r.projection_hash}`);
  }
 }finally{await env.close();}
 writeFileSync(a.file,serializeReplayFile(cur));
 for(const l of lines)console.log(l);
}

main(process.argv.slice(2)).catch(e=>{
 if(e instanceof UsageError){console.error(e.message);process.exitCode=2;return;}
 if(e instanceof EvalError){console.error(`${e.code}: ${e.message}`);process.exitCode=exitCodeOfError(e);return;}
 console.error(e instanceof Error?e.message:String(e));process.exitCode=1;
});
