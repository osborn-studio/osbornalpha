// src/lib/evals/run-gold-set.ts
// The single entry of an official_reconciliation run (spec §5.1, §3.2, §7.1, §14). Refusals first, before any read
// (assertRunnable, also called by the CLI before it opens a connection); then the subset rule (--case / --limit:
// every other case skipped(subset), execution.subset = true → incomplete); kinds/official.ts over the chosen cases;
// the §3.2 reduction with summary.gold taken from the set (§0 R5-1: format, ready, pending count, cases with
// provenance gaps); evidence_class 'truth'; summary.reconciliations_truncated from store.ts::caseRowsTruncated (§6.1 100-row
// display cap); report.ts::buildReport. In memory only: the CLI writes the report files and
// the dq_eval_* rows afterwards (§6.3). The exit code is summary.ts::exitCodeOf(gate) for every path.
import {randomUUID} from 'node:crypto';
import {EvalError} from './errors';
import {evaluateOfficial} from './kinds/official';
import {buildReport} from './report';
import {caseRowsTruncated} from './store';
import {exitCodeOf,goldBlockOf,isCorrectnessOutcome,summarize} from './summary';
import type {CaseReport,EvalEnv,EvalMode,GoldCase,GoldSet,ModuleReader,ReportEnvironment,RunOutcome} from './types';

export interface RunGoldSetOptions{set:GoldSet;mode:EvalMode;reader:ModuleReader;env:EvalEnv;environment:ReportEnvironment;runId?:string;caseIds?:string[];limit?:number;verify?:{artifacts:boolean;sources:boolean};fetchSource?:(url:string)=>Promise<Uint8Array>}

const SHA40=/^[0-9a-f]{40}$/;
const OFFICIAL_MODULES:ReadonlySet<string>=new Set(['facts','metrics']);

/** §14 pre-run refusals (exit 2). Order: kind/module, artifact class, synthetic in report, code version, dirty report. */
export function assertRunnable(set:GoldSet,mode:EvalMode,env:EvalEnv):void{
 if(!OFFICIAL_MODULES.has(set.module))throw new EvalError('kind_not_enabled',`official_reconciliation has no reader for module ${set.module}`,{module:set.module});
 if(set.artifact_class==='restricted'){
  if(mode==='ci')throw new EvalError('restricted_in_ci','restricted sets never run in ci (spec §4.5)',{set_id:set.set_id});
  throw new EvalError('kind_not_enabled','restricted artifacts are not enabled (spec §16 D8)',{set_id:set.set_id});
 }
 if(mode==='report'&&set.cases.some(c=>c.provenance_kind==='synthetic'))throw new EvalError('synthetic_in_report','synthetic gold never runs in report mode',{set_id:set.set_id});
 if(!SHA40.test(env.evaluatorCodeVersion))throw new EvalError('code_version_missing','evaluator code version must be a 40-hex commit',{value:env.evaluatorCodeVersion});
 if(mode==='report'&&env.dirty)throw new EvalError('dirty_tree','report runs need a clean working tree');
}

/** report.provenance.verified from the checks actually completed (Codex plan round 1 P1-8), never from the requested flags:
 *  sources = requested and EVERY evaluated case (any correctness outcome) has provenance.source_verified === true;
 *  artifacts = requested, privileged, and every evaluated case except expected_absent resolved to raw objects: a fact case via
 *  provenance.ok with object_path; a derived-metric case (detail.inputs = FactProvenance.input_chains, Codex plan round 2
 *  R2-3) via provenance.ok and a NON-EMPTY input chain list whose every chain is ok with an object_path. No evaluated case → false. */
export function artifactVerified(c:CaseReport):boolean{
 if(c.provenance?.ok!==true)return false;
 const inputs=c.detail.inputs;
 if(inputs!==undefined)return Array.isArray(inputs)&&inputs.length>0&&inputs.every(i=>typeof i==='object'&&i!==null&&(i as {ok?:unknown}).ok===true
  &&typeof (i as {object_path?:unknown}).object_path==='string'&&((i as {object_path:string}).object_path).length>0);
 return typeof c.provenance.object_path==='string';
}
export function verifiedOf(cases:CaseReport[],verify:{artifacts:boolean;sources:boolean},privileged:boolean):{artifacts:boolean;sources:boolean}{
 const evaluated=cases.filter(c=>isCorrectnessOutcome(c.outcome));
 if(evaluated.length===0)return {artifacts:false,sources:false};
 const sources=verify.sources&&evaluated.every(c=>c.provenance?.source_verified===true);
 const nonAbsent=evaluated.filter(c=>c.outcome.result!=='expected_absent');
 const artifacts=verify.artifacts&&privileged&&nonAbsent.length>0&&nonAbsent.every(artifactVerified);
 return {artifacts,sources};
}

/** Ids of the cases to evaluate: --case filter (unknown id → gold_invalid), then the first `limit` in file order. */
export function selectCases(set:GoldSet,caseIds?:string[],limit?:number):Set<string>{
 if(limit!==undefined&&(!Number.isInteger(limit)||limit<1))throw new RangeError('limit must be a positive integer');
 const known=new Set(set.cases.map(c=>c.case_id));
 const unknown=(caseIds??[]).filter(id=>!known.has(id));
 if(unknown.length>0)throw new EvalError('gold_invalid','unknown case_id in --case',{case_ids:unknown});
 let picked=set.cases.filter(c=>caseIds===undefined||caseIds.includes(c.case_id));
 if(limit!==undefined)picked=picked.slice(0,limit);
 return new Set(picked.map(c=>c.case_id));
}

const notRun=(c:GoldCase,tolerance:string):CaseReport=>({case_id:c.case_id,required:c.required,outcome:{result:'skipped',reason:c.retracted?'retracted':'subset'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance,provenance:null,detail:{}});

export async function runGoldSet(o:RunGoldSetOptions):Promise<RunOutcome>{
 const {set,mode,reader,env}=o;
 assertRunnable(set,mode,env);
 if(reader.module!=='facts')throw new EvalError('kind_not_enabled',`reader module ${reader.module} cannot evaluate ${set.module}`,{module:reader.module});
 const verify=o.verify??{artifacts:false,sources:false};
 const privileged=reader.privileged===true;
 const subset=o.caseIds!==undefined||o.limit!==undefined;
 const chosen=selectCases(set,o.caseIds,o.limit);
 const tolerance=set.tolerance.rel;
 const startedAt=env.now().toISOString();
 const evaluated=await evaluateOfficial(set.cases.filter(c=>chosen.has(c.case_id)),reader,{env,privileged,verify,tolerance,...(o.fetchSource?{fetchSource:o.fetchSource}:{})});
 const byId=new Map(evaluated.map(r=>[r.case_id,r]));
 const cases=set.cases.map(c=>byId.get(c.case_id)??notRun(c,tolerance));
 const runId=o.runId??randomUUID();
 const summary=summarize(cases,{thresholds:set.thresholds,gold:goldBlockOf(set),subset,evidenceClass:'truth',
  reconciliationsTruncated:caseRowsTruncated({run_id:runId,kind:'official_reconciliation',artifact_class:set.artifact_class,cases})});
 const environment:ReportEnvironment={...o.environment,db_state_rev:o.environment.db_state_rev??await reader.stateRev()};
 const finishedAt=env.now().toISOString();
 const report=buildReport({runId,kind:'official_reconciliation',mode,privileged,set,env,startedAt,finishedAt,environment,
  verified:verifiedOf(cases,verify,privileged),summary,cases});
 return {report,exitCode:exitCodeOf(summary.gate)};
}
