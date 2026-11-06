// src/lib/evals/report.ts
// Run reports (spec §6.1, §7.2, §4.5). buildReport assembles the EvalReport from a finished in-memory run;
// renderMarkdown is deterministic (fixed section order, cases sorted by case_id, only the report's own
// fields — no clock, no environment lookups), so two renders are byte-identical. The cases table lists
// non-pass cases only; reference_regression never renders cases[] values (sentinel rule, §5.4), only the
// summary counts. Paths: ci → reports/evals/<run_id>.json (no .md); report → docs/evals/<YYYY-MM-DD of
// started_at>/<module>-<kind>-<run_id first 8>.{json,md}. Restricted artifacts: restricted_in_ci in ci,
// kind_not_enabled in report (no private bucket this phase, §16 D8). writeReportFiles writes
// canonicalJson(report)+'\n' and returns the sha256 of exactly those bytes; it never overwrites.
// The environment block must carry no credentials (db_host is a bare host[:port], app_origin an origin).
import {randomBytes} from 'node:crypto';
import {closeSync,existsSync,linkSync,mkdirSync,openSync,unlinkSync,writeSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {canonicalJson,sha256Hex} from './canonical-json';
import {EvalError} from './errors';
import {isPassOutcome} from './summary';
import type {CaseReport,EvalKind,EvalMode,EvalReport,EvalEnv,GoldSet,ReportEnvironment,Summary} from './types';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{40}$/;
const HOST=/^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;
const byCaseId=(a:CaseReport,b:CaseReport)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0;

/** Throws EvalError('report_write_failed') when db_host / app_origin could carry a credential. */
export function assertEnvironmentClean(e:ReportEnvironment):void{
 const bad=(field:string)=>new EvalError('report_write_failed',`environment.${field} must not carry credentials`,{reason:'environment_credentials',field});
 if(e.db_host!==null&&!HOST.test(e.db_host))throw bad('db_host');
 if(e.app_origin!==null){
  let u:URL;
  try{u=new URL(e.app_origin);}catch{throw bad('app_origin');}
  if(u.username!==''||u.password!==''||u.origin!==e.app_origin||!/^https?:$/.test(u.protocol))throw bad('app_origin');
 }
 if(e.db_state_rev!==null&&!Number.isSafeInteger(e.db_state_rev))throw bad('db_state_rev');
}

export interface BuildReportInput{
 runId:string;kind:EvalKind;mode:EvalMode;privileged:boolean;set:GoldSet;env:EvalEnv;environment:ReportEnvironment;
 startedAt:string;finishedAt:string;verified:{artifacts:boolean;sources:boolean};summary:Summary;cases:CaseReport[];
}
export function buildReport(i:BuildReportInput):EvalReport{
 if(!UUID.test(i.runId))throw new EvalError('report_write_failed','run_id must be a uuid',{reason:'run_id'});
 if(!SHA.test(i.env.evaluatorCodeVersion))throw new EvalError('code_version_missing','evaluator_code_version must be 40 hex');
 assertEnvironmentClean(i.environment);
 if(canonicalJson(i.summary.thresholds)!==canonicalJson(i.set.thresholds))throw new EvalError('report_write_failed','summary thresholds differ from the set',{reason:'thresholds'});
 return {
  schema_version:1,run_id:i.runId,kind:i.kind,module:i.set.module,mode:i.mode,privileged:i.privileged,artifact_class:i.set.artifact_class,
  set:{id:i.set.set_id,version:i.set.version,sha256:i.set.sha256,format:i.set.format,path:i.set.path},
  evaluator_code_version:i.env.evaluatorCodeVersion,dirty:i.env.dirty,started_at:i.startedAt,finished_at:i.finishedAt,
  environment:{db_host:i.environment.db_host,app_origin:i.environment.app_origin,db_state_rev:i.environment.db_state_rev},
  thresholds:i.set.thresholds,provenance:{verified:{artifacts:i.verified.artifacts,sources:i.verified.sources}},
  summary:i.summary,cases:[...i.cases].sort(byCaseId),
 };
}

const cell=(v:unknown)=>v===null||v===undefined||v===''?'—':String(v).replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/\r\n|\r|\n/g,' ');
const row=(xs:unknown[])=>`| ${xs.map(cell).join(' | ')} |`;
function reasonOf(c:CaseReport):string{
 const o=c.outcome as {reason?:string;ledger_ids?:string[]};
 return o.reason??(o.ledger_ids&&o.ledger_ids.length>0?o.ledger_ids.join(','):'');
}

export function renderMarkdown(r:EvalReport):string{
 const s=r.summary;
 const out:string[]=[
  `# Eval report: ${r.kind} · ${r.module} · ${r.set.id} v${r.set.version}`,'',
  '| field | value |','|---|---|',
  row(['run_id',r.run_id]),row(['mode',r.mode]),row(['privileged',r.privileged]),row(['artifact_class',r.artifact_class]),
  row(['set',`${r.set.id} v${r.set.version} (${r.set.format})`]),row(['set path',r.set.path]),row(['set sha256',r.set.sha256]),
  row(['evaluator_code_version',r.evaluator_code_version]),row(['dirty',r.dirty]),row(['started_at',r.started_at]),row(['finished_at',r.finished_at]),
  row(['db_host',r.environment.db_host]),row(['app_origin',r.environment.app_origin]),row(['db_state_rev',r.environment.db_state_rev]),
  row(['verified artifacts',r.provenance.verified.artifacts]),row(['verified sources',r.provenance.verified.sources]),'',
  '## Gate','',`**${s.gate}** · evidence_class \`${s.evidence_class}\``,'',
  '## Summary','',
  '| population | required |','|---|---|',row([s.population,s.required]),'',
  '### Correctness','','| pass | fail | unit_mismatch | provenance_incomplete | unexplained_diff |','|---|---|---|---|---|',
  row([s.correctness.pass,s.correctness.fail,s.correctness.unit_mismatch,s.correctness.provenance_incomplete,s.correctness.unexplained_diff]),'',
  '### Coverage','','| evaluated | evaluated_optional | missing_required | missing_optional | not_visible | skipped |','|---|---|---|---|---|---|',
  row([s.coverage.evaluated,s.coverage.evaluated_optional,s.coverage.missing_required,s.coverage.missing_optional,s.coverage.not_visible,s.coverage.skipped]),'',
  '### Execution','','| read_error | truncated | subset |','|---|---|---|',row([s.execution.read_error,s.execution.truncated,s.execution.subset]),'',
  '### Thresholds','','| max_fail | min_coverage_optional |','|---|---|',row([s.thresholds.max_fail,s.thresholds.min_coverage_optional]),'',
  '### Gold','','| format | ready | pending | provenance_gaps |','|---|---|---|---|',row([s.gold.format,s.gold.ready,s.gold.pending,s.gold.provenance_gaps]),'',
  `reconciliations_truncated: ${s.reconciliations_truncated}`,'',
 ];
 if(r.kind==='reference_regression'){
  out.push('## Cases','','Case values are not rendered for reference_regression (spec §5.4); see the summary counts above.','');
 }else{
  const nonPass=r.cases.filter(c=>!isPassOutcome(c.outcome)).sort(byCaseId);
  out.push(`## Non-pass cases (${nonPass.length} of ${r.cases.length})`,'');
  if(nonPass.length===0)out.push('None.','');
  else out.push('| case_id | required | result | reason | left | right | abs_diff | rel_diff | tolerance |','|---|---|---|---|---|---|---|---|---|',
   ...nonPass.map(c=>row([c.case_id,c.required,c.outcome.result,reasonOf(c),c.left,c.right,c.abs_diff,c.rel_diff,c.tolerance])),'');
 }
 return out.join('\n');
}

export function reportPaths(r:EvalReport,root?:string):{json:string;md:string|null}{
 if(!UUID.test(r.run_id))throw new EvalError('report_write_failed','run_id must be a uuid',{reason:'run_id'});
 if(r.artifact_class==='restricted'){
  if(r.mode==='ci')throw new EvalError('restricted_in_ci','restricted sets do not run in ci (spec §4.5)');
  throw new EvalError('kind_not_enabled','restricted reports need the eval-restricted bucket, not created this phase (spec §16 D8)');
 }
 let rel:{json:string;md:string|null};
 if(r.mode==='ci')rel={json:`reports/evals/${r.run_id}.json`,md:null};
 else{
  const date=r.started_at.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new EvalError('report_write_failed','started_at must start with YYYY-MM-DD',{reason:'started_at'});
  const base=`docs/evals/${date}/${r.module}-${r.kind}-${r.run_id.slice(0,8)}`;
  rel={json:`${base}.json`,md:`${base}.md`};
 }
 return root===undefined?rel:{json:join(root,rel.json),md:rel.md===null?null:join(root,rel.md)};
}

export interface WriteOps{link?:(existing:string,target:string)=>void;write?:(fd:number,data:string|Buffer)=>void}

/** Writes the report (and its .md in report mode); returns repo-relative paths and the sha256 of the JSON bytes written.
 *  Never overwrites: each file is written whole to a temp file, then published with link() (fails with EEXIST);
 *  if a later publish fails, files published by this attempt are removed. Pre-existing files are never touched. */
export function writeReportFiles(r:EvalReport,root:string=process.cwd(),ops:WriteOps={}):{json:string;md:string|null;sha256:string}{
 assertEnvironmentClean(r.environment);
 const rel=reportPaths(r);
 const link=ops.link??linkSync;
 const write=ops.write??((fd:number,d:string|Buffer)=>{writeSync(fd,d);});
 const bytes=Buffer.from(`${canonicalJson(r)}\n`,'utf8');
 const targets:{path:string;data:string|Buffer}[]=[{path:rel.json,data:bytes}];
 if(rel.md!==null)targets.push({path:rel.md,data:renderMarkdown(r)});
 const fail=(path:string,e:unknown)=>new EvalError('report_write_failed',`${path}: ${(e as NodeJS.ErrnoException).code??(e as Error).message}`,{path});
 for(const t of targets)if(existsSync(join(root,t.path)))throw new EvalError('report_write_failed',`${t.path}: EEXIST`,{path:t.path});
 const temps:string[]=[],published:string[]=[];
 const cleanup=()=>{for(const f of [...published,...temps]){try{unlinkSync(f);}catch{/* best effort */}}};
 try{
  for(const t of targets){
   const abs=join(root,t.path),tmp=`${abs}.tmp-${randomBytes(6).toString('hex')}`;
   let fd:number|null=null;
   try{
    mkdirSync(dirname(abs),{recursive:true});
    fd=openSync(tmp,'wx');temps.push(tmp);
    write(fd,t.data);
   }catch(e){throw fail(t.path,e);}
   finally{if(fd!==null){try{closeSync(fd);}catch{/* best effort */}}}
  }
  targets.forEach((t,i)=>{
   const abs=join(root,t.path);
   try{link(temps[i],abs);published.push(abs);}catch(e){throw fail(t.path,e);}
  });
 }catch(e){cleanup();throw e;}
 for(const f of temps){try{unlinkSync(f);}catch{/* best effort */}}
 return {json:rel.json,md:rel.md,sha256:sha256Hex(bytes)};
}
