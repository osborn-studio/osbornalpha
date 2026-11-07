// src/lib/judgments/deps.ts
// Production wiring of the judgment layer (plan F4 Task 14) shared by /api/cron/judgments-settle,
// scripts/judgments/settle.ts and the /api/admin/dq/quarantine judgments branch: the anon client for public reads
// (RLS on: public RPCs and the inputs db), the service-role client for RPC writes and the dq tables, the inputs db
// over anon reads + the frozen-source K-line reader. MacroReadApi uses the real macro workbench when
// MACRO_JUDGMENTS_ENABLED is 1/true, otherwise unavailableMacroReadApi (info macro_unavailable). code_version = VERCEL_GIT_COMMIT_SHA (40 hex); scripts may fall back to
// `git rev-parse HEAD` (+ "-dirty"); null means "refuse to apply".
import {execFileSync} from 'node:child_process';
import {supabaseTableClient} from '../db/table-client';
import type {TriggeredBy} from '../dq/batches';
import {getAdminSupabase} from '../supabase/admin';
import {getAnonSupabase} from '../supabase/anon';
import {supabaseJudgmentsDb} from './db';
import {anonJudgmentInputsDb} from './inputs-db';
import {MacroUnavailable,unavailableMacroReadApi} from './macro-api';
import {supabaseMacroDb} from '../macro/db';
import {macroJudgmentsEnabled} from '../macro/flags';
import {macroReadApi,MacroUnavailable as UpstreamMacroUnavailable} from '../macro/read-api';
import type {SettleDeps} from './settle';
import type {JudgmentsDb,MacroReadApi} from './types';

type Exec=(cmd:string,args:string[])=>string;
const gitExec:Exec=(c,a)=>execFileSync(c,a,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const SHA_RE=/^[0-9a-f]{40}$/;

export function resolveCodeVersion(opts:{allowGit:boolean;env?:Record<string,string|undefined>;exec?:Exec}):string|null{
 const sha=(opts.env??process.env).VERCEL_GIT_COMMIT_SHA;
 if(sha!==undefined&&SHA_RE.test(sha))return sha;
 if(!opts.allowGit)return null;
 const exec=opts.exec??gitExec;
 try{
  const head=exec('git',['rev-parse','HEAD']).trim();
  if(!SHA_RE.test(head))return null;
  return exec('git',['status','--porcelain']).trim().length>0?`${head}-dirty`:head;
 }catch{return null;}
}

/** JudgmentsDb for admin routes: writes through service-role RPCs, public reads through anon (contract note). */
export function adminJudgmentsDb(admin:ReturnType<typeof getAdminSupabase>=getAdminSupabase()):JudgmentsDb{
 return supabaseJudgmentsDb({anon:getAnonSupabase(),admin});
}

export interface ProductionJudgmentDepsOptions{codeVersion:string;actor:'cron'|'script';triggeredBy:TriggeredBy;signal?:AbortSignal;admin?:ReturnType<typeof getAdminSupabase>}
export function productionJudgmentDeps(o:ProductionJudgmentDepsOptions):SettleDeps{
 const admin=o.admin??getAdminSupabase(),anon=getAnonSupabase();
 const enabled=macroJudgmentsEnabled();
 const macro=enabled?adaptMacroApi(macroReadApi(supabaseMacroDb({admin,anon}),{judgments:true})):unavailableMacroReadApi();
 return {
  db:supabaseJudgmentsDb({anon,admin}),
  inputsDb:anonJudgmentInputsDb({anon,macro}),
  tables:supabaseTableClient(admin),
  codeVersion:o.codeVersion,actor:o.actor,triggeredBy:o.triggeredBy,
  ...(o.signal?{signal:o.signal}:{}),
 };
}

/** The upstream module owns a distinct error class. Normalize only that signal; transient errors still propagate. */
function adaptMacroApi(api:MacroReadApi):MacroReadApi{
 const read=async<T>(f:()=>Promise<T>):Promise<T>=>{
  try{return await f();}catch(e){if(e instanceof UpstreamMacroUnavailable)throw new MacroUnavailable(e.code);throw e;}
 };
 return {
  observation:id=>read(()=>api.observation(id)),
  snapshot:id=>read(()=>api.snapshot(id)),
  snapshotsSince:(marker,limit)=>read(()=>api.snapshotsSince(marker,limit)),
  seriesCatalog:region=>read(()=>api.seriesCatalog(region)),
  classifyAsOf:(region,period,cutoff,version)=>read(()=>api.classifyAsOf(region,period,cutoff,version)),
 };
}
