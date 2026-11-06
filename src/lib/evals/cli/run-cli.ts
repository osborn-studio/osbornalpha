// src/lib/evals/cli/run-cli.ts
// scripts/evals/run.ts logic (spec §7.1 flags, §3.2 exit codes, §6.3 order, §14). parse flags → the kind's runner
// (dispatch table; a kind without a runner in this build → kind_not_enabled, exit 2) → report files (report.ts) →
// with --write-db, persistRun (store.ts) → one JSON receipt line on stdout. Exit codes: the gate's (pass 0, fail 1,
// incomplete 3); 2 for usage errors and refusals (errors.ts REFUSAL_CODES, raised before any connection opens);
// 1 for report / store failures. --resume <run_id> re-enters §6.3 steps 3–4 from the stored row and the report
// file it names (persistRun checks the sha256). Later tasks add their kinds to KIND_RUNNERS.
import {readFileSync} from 'node:fs';
import {isAbsolute,relative,resolve} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {EvalError,exitCodeOfError} from '../errors';
import {checkLock,loadGoldSet} from '../gold/load';
import {assertKindEnabled} from '../kinds/registry';
import {writeReportFiles} from '../report';
import {assertRunnable,runGoldSet} from '../run-gold-set';
import {persistRun} from '../store';
import {exitCodeOf} from '../summary';
import type {EvalEnv,EvalKind,EvalMode,EvalModule,EvalReport,ExitCode,GoldLock,GoldSet,RunOutcome} from '../types';
import {evaluatorVersion} from '../version';
import {buildRunDeps} from './deps';
import {runReplay} from './run-replay';
import type {RunDeps} from './deps';

export const USAGE='usage: run.ts --kind <kind> --module <module> [--set <path>] [--pair <id>] --mode ci|report [--write-db [--verify-artifacts] [--verify-sources]] [--out <dir>] [--limit N] [--case <id>]... [--resume <run_id>] [--http]';
export const GOLD_LOCK='src/lib/evals/fixtures/gold/lock.json';
const KINDS:readonly EvalKind[]=['official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration'];
const MODULES:readonly EvalModule[]=['facts','metrics','macro','industry','company','foreign_research'];

export class UsageError extends Error{constructor(message:string){super(message);this.name='UsageError';}}
export interface RunArgs{kind:EvalKind;module:EvalModule;set?:string;pair?:string;mode:EvalMode;writeDb:boolean;verifyArtifacts:boolean;verifySources:boolean;out?:string;limit?:number;caseIds:string[];resume?:string;http:boolean}

export function parseRunArgs(argv:string[]):RunArgs{
 let kind:string|undefined,moduleArg:string|undefined,mode:string|undefined,limit:string|undefined,set:string|undefined,pair:string|undefined,out:string|undefined,resume:string|undefined;
 let writeDb=false,verifyArtifacts=false,verifySources=false,http=false;const caseIds:string[]=[];
 const value=(i:number,flag:string)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))throw new UsageError(`${flag} needs a value`);return v;};
 for(let i=0;i<argv.length;i++){
  const f=argv[i];
  switch(f){
   case '--kind':kind=value(i++,f);break;
   case '--module':moduleArg=value(i++,f);break;
   case '--set':set=value(i++,f);break;
   case '--pair':pair=value(i++,f);break;
   case '--mode':mode=value(i++,f);break;
   case '--out':out=value(i++,f);break;
   case '--limit':limit=value(i++,f);break;
   case '--case':caseIds.push(value(i++,f));break;
   case '--resume':resume=value(i++,f);break;
   case '--write-db':writeDb=true;break;
   case '--verify-artifacts':verifyArtifacts=true;break;
   case '--verify-sources':verifySources=true;break;
   case '--http':http=true;break;
   default:throw new UsageError(`unknown argument ${f}`);
  }
 }
 if(!KINDS.includes(kind as EvalKind))throw new UsageError(`--kind must be one of ${KINDS.join('|')}`);
 if(!MODULES.includes(moduleArg as EvalModule))throw new UsageError(`--module must be one of ${MODULES.join('|')}`);
 if(mode!=='ci'&&mode!=='report')throw new UsageError('--mode must be ci or report');
 if(writeDb&&mode!=='report')throw new UsageError('--write-db needs --mode report (ci never writes the tables)');
 if((verifyArtifacts||verifySources)&&!writeDb)throw new UsageError('--verify-artifacts / --verify-sources need --write-db (a privileged run)');
 if(resume!==undefined&&!writeDb)throw new UsageError('--resume needs --write-db');
 if(resume!==undefined&&(caseIds.length>0||limit!==undefined))throw new UsageError('--resume takes no --case / --limit');
 if(http&&kind!=='replay_consistency')throw new UsageError('--http is the replay live smoke only');
 if(pair!==undefined&&kind!=='dual_source')throw new UsageError('--pair is for dual_source only');
 if(kind==='official_reconciliation'&&set===undefined&&resume===undefined)throw new UsageError('--set is required for official_reconciliation');
 if(limit!==undefined&&!/^[1-9]\d*$/.test(limit))throw new UsageError('--limit must be a positive integer');
 return {kind:kind as EvalKind,module:moduleArg as EvalModule,mode,writeDb,verifyArtifacts,verifySources,caseIds,http,
  ...(set!==undefined?{set}:{}),...(pair!==undefined?{pair}:{}),...(out!==undefined?{out}:{}),...(limit!==undefined?{limit:Number(limit)}:{}),...(resume!==undefined?{resume}:{})};
}

export interface CliIo{stdout(line:string):void;stderr(line:string):void}
export interface CliDeps{
 buildDeps(mode:EvalMode,privileged:boolean):Promise<RunDeps>;
 loadSet(path:string):GoldSet;loadLock():GoldLock;
 version():{sha:string;dirty:boolean};now():Date;
 writeReport(r:EvalReport,root?:string):{json:string;md:string|null;sha256:string};
 persist:typeof persistRun;readFile(path:string):Uint8Array;
}
export function defaultCliDeps():CliDeps{
 return {buildDeps:(m,p)=>buildRunDeps(m,p),loadSet:p=>loadGoldSet(p),loadLock:()=>JSON.parse(readFileSync(GOLD_LOCK,'utf8')) as GoldLock,
  version:()=>evaluatorVersion(),now:()=>new Date(),writeReport:(r,root)=>writeReportFiles(r,root),persist:persistRun,readFile:p=>new Uint8Array(readFileSync(p))};
}

/** run: only store and close are used after the runner returns (replay runners have no ModuleReader). */
export type KindRunner=(args:RunArgs,deps:CliDeps)=>Promise<{outcome:RunOutcome;run:Pick<RunDeps,'store'|'close'>}>;
/** official_reconciliation: set + lock + module + refusals BEFORE any connection; then deps and runGoldSet. */
export const runOfficial:KindRunner=async(args,deps)=>{
 const set=deps.loadSet(args.set!);
 checkLock(set,deps.loadLock());
 if(set.module!==args.module)throw new EvalError('gold_invalid',`--module ${args.module} but ${set.path} is module ${set.module}`,{module:set.module});
 const v=deps.version();
 const env:EvalEnv={today:deps.now().toISOString().slice(0,10),now:()=>deps.now(),evaluatorCodeVersion:v.sha,dirty:v.dirty};
 assertRunnable(set,args.mode,env);
 const run=await deps.buildDeps(args.mode,args.writeDb);
 try{
  const outcome=await runGoldSet({set,mode:args.mode,reader:run.reader,env,environment:run.environment,
   ...(args.caseIds.length>0?{caseIds:args.caseIds}:{}),...(args.limit!==undefined?{limit:args.limit}:{}),
   verify:{artifacts:args.verifyArtifacts,sources:args.verifySources},...(run.fetchSource?{fetchSource:run.fetchSource}:{})});
  return {outcome,run};
 }catch(e){await run.close().catch(()=>{});throw e;}
};
/** Runner per kind. Task 11 adds replay_consistency; dual_source, reference_regression, extraction_gold and judgment_calibration stay absent —
 *  kinds/registry.ts (Task 14) is the one enablement table and records why; its test asserts these keys equal the enabled kinds. */
export const KIND_RUNNERS:Partial<Record<EvalKind,KindRunner>>={official_reconciliation:runOfficial,replay_consistency:runReplay};

const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,500);
/** The stored report_ref / receipt path: writeReportFiles returns paths relative to its root (--out, default the cwd). A path inside the
 *  repository (cwd) is stored repo-relative; one outside it is stored absolute, so --resume reads the same file from any root. */
export const refOf=(path:string,root:string|undefined):string=>{
 const abs=resolve(root??process.cwd(),path);
 const rel=relative(process.cwd(),abs);
 return rel===''||rel.startsWith('..')||isAbsolute(rel)?abs.split('\\').join('/'):rel.split('\\').join('/');
};
const receipt=(r:EvalReport,files:{json:string;md:string|null;sha256:string},db:'written'|'skipped',exitCode:ExitCode)=>JSON.stringify({
 run_id:r.run_id,kind:r.kind,module:r.module,mode:r.mode,privileged:r.privileged,set:r.set.id,set_version:r.set.version,gate:r.summary.gate,exit_code:exitCode,
 population:r.summary.population,report:files.json,report_md:files.md,report_sha256:files.sha256,db});

async function resumeRun(runId:string,args:RunArgs,io:CliIo,deps:CliDeps):Promise<ExitCode>{
 const run=await deps.buildDeps('report',true);
 try{
  if(!run.store)throw new EvalError('store_write_failed','no store in this mode');
  const row=await run.store.getRun(runId);
  if(!row)throw new EvalError('resume_mismatch',`no dq_eval_runs row ${runId}`,{run_id:runId});
  if(row.kind!==args.kind||row.module!==args.module)throw new EvalError('resume_mismatch',`run ${runId} is ${row.kind}/${row.module}, not ${args.kind}/${args.module}`,{run_id:runId});
  const bytes=deps.readFile(row.report_ref);
  const report=JSON.parse(new TextDecoder().decode(bytes)) as EvalReport;
  if(report.run_id!==row.run_id)throw new EvalError('resume_mismatch','the report file names another run',{run_id:runId});
  const files={json:row.report_ref,md:null,sha256:sha256Hex(bytes)};
  await deps.persist(run.store,report,{ref:row.report_ref,sha256:files.sha256},{triggeredBy:'script',resume:true});
  const exitCode=exitCodeOf(report.summary.gate);
  io.stdout(receipt(report,files,'written',exitCode));
  return exitCode;
 }finally{await run.close().catch(()=>{});}
}

export async function runCli(argv:string[],io:CliIo,deps:CliDeps=defaultCliDeps()):Promise<ExitCode>{
 let args:RunArgs;
 try{args=parseRunArgs(argv);}
 catch(e){if(e instanceof UsageError){io.stderr(`${e.message}\n${USAGE}`);return 2;}throw e;}
 let run:Pick<RunDeps,'store'|'close'>|null=null;
 try{
  if(args.resume!==undefined)return await resumeRun(args.resume,args,io,deps);
  assertKindEnabled(args.kind);          // kinds/registry.ts is the one enablement table (Task 14)
  const runner=KIND_RUNNERS[args.kind];
  if(!runner)throw new EvalError('kind_not_enabled',`kind ${args.kind} is not enabled in this build`,{kind:args.kind});
  const started=await runner(args,deps);
  run=started.run;
  const {report,exitCode}=started.outcome;
  let files:{json:string;md:string|null;sha256:string};
  try{const w=deps.writeReport(report,args.out);files={json:refOf(w.json,args.out),md:w.md===null?null:refOf(w.md,args.out),sha256:w.sha256};}catch(e){throw new EvalError('report_write_failed',message(e));}
  // a subset run (--case / --limit) is never persisted: it would put a partial population in dq_eval_runs
  const persisted=args.writeDb&&!report.summary.execution.subset;
  if(persisted){
   if(!run.store)throw new EvalError('store_write_failed','no store in this mode');
   await deps.persist(run.store,report,{ref:files.json,sha256:files.sha256},{triggeredBy:'script'});
  }
  io.stdout(receipt(report,files,persisted?'written':'skipped',exitCode));
  return exitCode;
 }catch(e){
  if(e instanceof EvalError){io.stderr(JSON.stringify({error:e.code,message:e.message,detail:e.detail}));return exitCodeOfError(e);}
  io.stderr(JSON.stringify({error:'unexpected',message:message(e)}));
  return 1;
 }finally{if(run)await run.close().catch(()=>{});}
}
