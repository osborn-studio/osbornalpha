// src/lib/evals/validate/manifest.ts
// Module release-evidence manifest validator (spec §10; Codex plan round 1 P1-2, P1-3, P1-4, P2-2, P2-3). Two commits:
// release_commit (the code and release INPUTS — lock.json, gold sets, replay / reference fixtures — are read there) and
// evidence_commit (the committed EVIDENCE — report copies, expert records, audit directories — is read there with
// `git show <evidence_commit>:<path>`); evidence_commit must equal release_commit or descend from it
// (`git merge-base --is-ancestor`). Paths must be repo-relative (no absolute path, no '..', no backslash); the working
// tree is never read. Every item is re-opened and re-derived:
//  - official_reconciliation / replay_live / dual_source: the dq_eval_runs row (service-role getRun) must exist, report
//    bytes sha256 = row.report_sha256, mode 'report', privileged true, evidence_class 'truth' (dual_source 'adapter_check'
//    is rejected), official additionally provenance.verified {artifacts, sources}.
//  - replay_frozen: mode 'ci'; the committed copy's sha256 = manifest report_sha256; ci_run_url names a run of THIS repo
//    (owner/repo = the origin remote); with --online the GitHub API must report conclusion 'success' and head_sha =
//    release_commit; offline the check is not performed, which is a BLOCKING finding manifest_ci_unverified (Codex plan
//    round 2 R2-1: an unperformed mandatory check never passes); ci_check 'manual' (the digest comparison against the
//    CI job summary stays a human step, §10).
//  - reference_regression: mode 'report', privileged FALSE, evidence_class 'comparison'.
//  - expert_sampling: §8 validator in release mode against the official run's gold set, evaluated_run_id = official run_id.
//  - model_audit: §9 validator in release mode over the directory at evidence_commit.
// Population (P1-2): reduce.ts::reduceForKind over the AUTHENTICATED fixture — gold sets from lock.json at release_commit
// (lock sha256 = report.set.sha256), replay / reference fixtures by their bytes at release_commit — derives membership,
// required / retracted flags, thresholds, the gold block and the evidence class; missing / extra / misclassified cases
// are findings, the stored summary must equal the re-derived one and its gate must be pass. The report's own
// thresholds / gold / subset are never trusted. Common: evaluator_code_version = release_commit and dirty=false;
// gold-set kinds: format 'f6', no synthetic case, review_required sets fully reviewed (P2-3); scope.markets = the set's
// subject markets; scope.data_state_rev_min ≤ official environment.db_state_rev; dq_freshness '<module>.<market>'
// recomputed AT prepared_at with dq/freshness.ts::computeFreshness from the stored cadence, last_ok_at and
// consecutive_errors (never the stored status; P1-4) must be 'fresh'. No DB access (getRun/freshness absent) fails the
// manifest. Non-waivable: official, replay_frozen, model_audit, expert_sampling; waivable via not_applicable:
// dual_source, reference_regression, replay_live; `waivers` may only waive gold_approval.
import type {PairRegistration} from '../kinds/dual-source';
import {F6_PAIRS,pairRegistration} from '../kinds/pairs';
import {computeFreshness} from '../../dq/freshness';
import type {Cadence} from '../../dq/freshness';
import {canonicalJson,sha256Hex} from '../canonical-json';
import {parseReferenceSamples} from '../kinds/reference';
import {reduceForKind} from '../reduce';
import type {ReductionFixture} from '../reduce';
import {parseReplayFile} from '../replay/fixture';
import {caseRowsTruncated} from '../store';
import type {EvalKind,EvalReport,EvalRunRow,GoldLock,GoldSet} from '../types';
import {validateAuditDir} from './audit';
import type {AuditDeps} from './audit';
import {validateExpertRecord} from './expert';
import {GIT_SHA,ISO_DATE,ISO_TS,UUID,finding,isObject} from './finding';
import type {ValidatorFinding} from './finding';

export interface FreshnessRow{expected_cadence:string;last_ok_at:string|null;consecutive_errors:number}
export interface ManifestDeps{
 /** `git show <commit>:<path>` bytes; null when the path does not exist at that commit. */
 readAt(commit:string,path:string):Uint8Array|null;
 /** lock.json as committed at `commit`. */
 lockAt(commit:string):GoldLock;
 /** gold/load.ts::parseGoldBytes over the bytes (and recorders.json) committed at `commit`. */
 loadSetAt(commit:string,path:string):GoldSet;
 /** `git merge-base --is-ancestor ancestor descendant` (true when equal). */
 isAncestor(ancestor:string,descendant:string):boolean;
 /** 'owner/repo' of the origin remote, lowercase; null when unknown. */
 originRepo():string|null;
 /** --online: GET repos/<owner>/<repo>/actions/runs/<id> (gh api); undefined = offline. */
 ciRun?:(owner:string,repo:string,runId:string)=>Promise<{conclusion:string|null;head_sha:string}|null>;
 /** Service-role EvalStore.getRun; undefined = no database access. */
 getRun?:(runId:string)=>Promise<EvalRunRow|null>;
 /** the dq_freshness row of a dataset ('facts.us'); undefined = no database access. */
 freshness?:(dataset:string)=>Promise<FreshnessRow|null>;
 audit?:Omit<AuditDeps,'readFile'|'release'>;
 /** F6 pair registrations (kinds/pairs.ts F6_PAIRS by default); a dual_source report's set.id is its pair id. */
 pairs?:readonly PairRegistration[];
 /** validator clock (prepared_at must not be in the future); default new Date(). */
 now?:()=>Date;
}
export interface ManifestOptions{
 /** notices: diagnostics only (the offline CI identity is ALSO a blocking finding, R2-1). */
 notices?:ValidatorFinding[];
}
type Item='official_reconciliation'|'replay_frozen'|'replay_live'|'dual_source'|'reference_regression'|'expert_sampling'|'model_audit';
const ITEMS:Item[]=['official_reconciliation','replay_frozen','replay_live','dual_source','reference_regression','expert_sampling','model_audit'];
const WAIVABLE=new Set<Item>(['dual_source','reference_regression','replay_live']);
const RUN_KIND:Record<'official_reconciliation'|'replay_live'|'dual_source'|'reference_regression',EvalKind>={official_reconciliation:'official_reconciliation',replay_live:'replay_consistency',dual_source:'dual_source',reference_regression:'reference_regression'};
export const CI_RUN=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?$/;
const CADENCES:readonly string[]=['daily','monthly','quarterly','event'];
/** ISO timestamp / date that is a real calendar instant (Date.parse alone rolls 02-30 over to 03-02). */
const ts=(v:unknown)=>{
 if(typeof v!=='string'||!(ISO_TS.test(v)||ISO_DATE.test(v))||!Number.isFinite(Date.parse(v)))return false;
 const [y,mo,d]=v.slice(0,10).split('-').map(Number);
 const c=new Date(Date.UTC(y,mo-1,d));
 return c.getUTCFullYear()===y&&c.getUTCMonth()===mo-1&&c.getUTCDate()===d;
};
const str=(v:unknown)=>typeof v==='string'&&v.length>0;
/** Repo-relative POSIX path: no absolute path, drive letter, backslash, '.' / '..' or empty segment. */
export const isRepoPath=(p:unknown):p is string=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!/^[A-Za-z]:/.test(p)&&!p.includes('\\')&&p.split('/').every(s=>s!==''&&s!=='.'&&s!=='..');

function manifestShape(m:unknown):string|null{
 if(!isObject(m))return 'manifest';
 if(m.schema_version!==1)return 'schema_version';
 if(!str(m.module))return 'module';
 if(typeof m.release_commit!=='string'||!GIT_SHA.test(m.release_commit))return 'release_commit';
 if(typeof m.evidence_commit!=='string'||!GIT_SHA.test(m.evidence_commit))return 'evidence_commit';
 if(!str(m.prepared_by))return 'prepared_by';
 if(!ts(m.prepared_at))return 'prepared_at';
 const s=m.scope;
 if(!isObject(s)||!Array.isArray(s.markets)||s.markets.length===0||!s.markets.every(str)||!Array.isArray(s.universes)||!s.universes.every(str)||typeof s.data_state_rev_min!=='string'||!/^\d+$/.test(s.data_state_rev_min))return 'scope';
 if(m.gold_approval!=='enforced'&&m.gold_approval!=='process')return 'gold_approval';
 if(!isObject(m.evidence))return 'evidence';
 if(m.waivers!==undefined&&!Array.isArray(m.waivers))return 'waivers';
 return null;
}
const naValid=(na:unknown)=>isObject(na)&&str(na.reason)&&na.approved_by==='owner'&&ts(na.at);
function parseReport(bytes:Uint8Array):EvalReport|null{
 try{
  const r=JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if(!isObject(r)||r.schema_version!==1||!str(r.run_id)||!isObject(r.set)||!isObject(r.summary)||!Array.isArray(r.cases)||!isObject(r.thresholds))return null;
  return r as unknown as EvalReport;
 }catch{return null;}
}

export async function validateManifest(raw:unknown,deps:ManifestDeps,where='manifest',opts:ManifestOptions={}):Promise<ValidatorFinding[]>{
 const bad=manifestShape(raw);
 if(bad)return [finding('manifest_invalid',`${where}#${bad}`,`invalid or missing field: ${bad}`)];
 const m=raw as {module:string;release_commit:string;evidence_commit:string;prepared_at:string;scope:{markets:string[];universes:string[];data_state_rev_min:string};gold_approval:'enforced'|'process';evidence:Record<string,unknown>;waivers?:unknown[]};
 const out:ValidatorFinding[]=[];
 const at=(item:string)=>`${where}#evidence.${item}`;
 const REL=m.release_commit,EVI=m.evidence_commit;
 if(!deps.isAncestor(REL,EVI))out.push(finding('manifest_evidence_commit',`${where}#evidence_commit`,'evidence_commit must equal release_commit or descend from it'));
 /** committed evidence bytes at evidence_commit; null + finding on a bad path or a missing file */
 const evidenceBytes=(item:string,path:unknown):Uint8Array|null=>{
  if(!isRepoPath(path)){out.push(finding('manifest_path',at(item),'paths must be repo-relative without .. segments'));return null;}
  const b=deps.readAt(EVI,path);
  if(!b)out.push(finding('manifest_report_missing',at(item),`${path} is not committed at evidence_commit`));
  return b;
 };
 const prepared=Date.parse(m.prepared_at);
 const now=(deps.now?.()??new Date()).getTime();
 if(prepared>now)out.push(finding('manifest_prepared_future',`${where}#prepared_at`,'prepared_at is in the future'));
 /** every referenced run must have finished before the manifest was prepared */
 const preparedAfter=(item:string,finishedAt:string)=>{
  const t=Date.parse(finishedAt);
  if(!Number.isFinite(t)||t>prepared)out.push(finding('manifest_prepared_before_run',at(item),`run finished_at ${finishedAt} is after prepared_at`));
 };
 const waivers=m.waivers??[];
 for(const [i,w] of waivers.entries()){
  if(!isObject(w)||w.item!=='gold_approval')out.push(finding('manifest_waiver_not_allowed',`${where}#waivers[${i}]`,'only gold_approval can be waived; other items use not_applicable'));
  else if(!naValid(w))out.push(finding('manifest_waiver_invalid',`${where}#waivers[${i}]`,'waiver needs reason, approved_by "owner" and at'));
 }
 if(m.gold_approval==='process'&&!waivers.some(w=>isObject(w)&&w.item==='gold_approval'&&naValid(w)))
  out.push(finding('manifest_gold_approval',`${where}#gold_approval`,"gold_approval 'process' requires a gold_approval waiver"));
 if(!deps.getRun)out.push(finding('manifest_no_db',where,'no service-role database access: run-backed evidence cannot be authenticated'));
 if(!deps.freshness)out.push(finding('manifest_no_db',`${where}#freshness`,'no database access: dq_freshness cannot be read'));
 let lock:GoldLock|null=null;
 try{lock=deps.lockAt(REL);}catch(e){out.push(finding('manifest_lock',`${where}#release_commit`,`lock.json unreadable at release_commit: ${(e as Error).message}`));}

 /** The authenticated fixture of a report (P1-2): gold sets via the lock at release_commit, other fixtures by their bytes there. */
 const fixtureOf=(item:string,r:EvalReport,kind:EvalKind):{fixture:ReductionFixture;set:GoldSet|null}|null=>{
  const p=r.set?.path;
  if(!isRepoPath(p)){out.push(finding('manifest_path',at(item),'report.set.path must be repo-relative'));return null;}
  if(kind==='official_reconciliation'||kind==='dual_source'){
   const locked=lock?.files.find(f=>f.path===p);
   if(!locked||locked.sha256!==r.set.sha256){out.push(finding('manifest_lock',at(item),`set ${p} is not in lock.json at release_commit with sha256 ${r.set.sha256}`));return null;}
   let set:GoldSet;
   try{set=deps.loadSetAt(REL,p);}catch(e){out.push(finding('manifest_set_unreadable',at(item),(e as Error).message));return null;}
   if(set.sha256!==r.set.sha256)out.push(finding('manifest_lock',at(item),'set bytes at release_commit differ from report.set.sha256'));
   if(set.module!==m.module)out.push(finding('manifest_module',at(item),`gold set module ${set.module}, manifest module ${m.module}`));
   if(set.format!=='f6'||r.set.format!=='f6')out.push(finding('manifest_legacy_set',at(item),'legacy_plan2 sets are never release evidence'));
   if(set.cases.some(c=>c.provenance_kind==='synthetic'))out.push(finding('manifest_synthetic',at(item),'gold set contains synthetic cases'));
   if(set.review_required&&set.cases.some(c=>c.retracted===null&&(c.reviewed_by===null||c.reviewed_by===c.recorded_by)))
    out.push(finding('manifest_review_missing',at(item),'review_required set has cases without a second reviewer'));
   return {fixture:{kind,set},set};
  }
  const bytes=deps.readAt(REL,p);
  if(!bytes||sha256Hex(bytes)!==r.set.sha256){out.push(finding('manifest_fixture',at(item),`fixture ${p} at release_commit does not hash to report.set.sha256 ${r.set.sha256}`));return null;}
  try{
   const json=JSON.parse(new TextDecoder().decode(bytes)) as unknown;
   if(kind==='replay_consistency'){
    const file=parseReplayFile(json,{allowDrafts:false,file:p});
    const want=item==='replay_frozen'?'frozen':'live';
    if(file.mode!==want||file.module!==m.module){out.push(finding('manifest_fixture',at(item),`fixture ${p} is a ${file.mode} ${file.module} replay file; ${item} needs a ${want} ${m.module} file`));return null;}
    return {fixture:{kind,file},set:null};
   }
   if(kind==='reference_regression')return {fixture:{kind,samples:parseReferenceSamples(json)},set:null};
  }catch(e){out.push(finding('manifest_fixture',at(item),`fixture ${p} unparsable: ${(e as Error).message}`));return null;}
  out.push(finding('manifest_kind',at(item),`no fixture rule for kind ${kind}`));return null;
 };
 /** Shared report checks; returns the gold set for gold-set kinds. */
 const checkReport=(item:string,r:EvalReport,expectKind:EvalKind):GoldSet|null=>{
  if(r.kind!==expectKind)out.push(finding('manifest_kind',at(item),`report kind ${r.kind}, expected ${expectKind}`));
  if(r.module!==m.module)out.push(finding('manifest_module',at(item),`report module ${r.module}`));
  if(r.evaluator_code_version!==REL)out.push(finding('manifest_code_version',at(item),'evaluator_code_version differs from release_commit'));
  if(r.dirty!==false)out.push(finding('manifest_dirty',at(item),'report was produced from a dirty tree'));
  const fx=fixtureOf(item,r,expectKind);
  if(!fx)return null;
  let registration:PairRegistration|undefined;
  if(expectKind==='dual_source'){
   registration=pairRegistration(r.set.id,deps.pairs??F6_PAIRS);
   if(!registration){out.push(finding('manifest_invalid',at(item),`pair ${r.set.id} is not registered in F6 (kinds/pairs.ts)`));return null;}
  }
  const red=reduceForKind(expectKind,r.cases,fx.fixture,{...(registration?{registration}:{}),reconciliationsTruncated:caseRowsTruncated(r)});
  for(const p of red.problems)out.push(finding('manifest_population',at(item),p));
  if(canonicalJson(red.summary)!==canonicalJson(r.summary))out.push(finding('manifest_summary_mismatch',at(item),'stored summary differs from the one re-derived from the authenticated fixture'));
  if(red.summary.gate!=='pass')out.push(finding('manifest_gate',at(item),`re-derived gate ${red.summary.gate}`));
  return fx.set;
 };
 /** Run-backed evidence (official, live, dual_source, reference). */
 const runBacked=async(item:keyof typeof RUN_KIND,ev:Record<string,unknown>):Promise<{report:EvalReport;set:GoldSet|null}|null>=>{
  if(typeof ev.run_id!=='string'||!UUID.test(ev.run_id)){out.push(finding('manifest_invalid',at(item),'run_id must be a uuid'));return null;}
  if(!deps.getRun)return null;
  const row=await deps.getRun(ev.run_id);
  if(!row){out.push(finding('manifest_run_missing',at(item),`dq_eval_runs has no row ${ev.run_id}`));return null;}
  const path=typeof ev.report==='string'?ev.report:row.report_ref;
  if(typeof ev.report==='string'&&ev.report!==row.report_ref)out.push(finding('manifest_report_ref',at(item),'report path differs from dq_eval_runs.report_ref'));
  const bytes=evidenceBytes(item,path);
  if(!bytes)return null;
  if(sha256Hex(bytes)!==row.report_sha256)out.push(finding('manifest_report_sha',at(item),'report sha256 differs from dq_eval_runs.report_sha256'));
  const r=parseReport(bytes);
  if(!r){out.push(finding('manifest_report_invalid',at(item),`${path} is not an F6 report`));return null;}
  if(r.run_id!==ev.run_id)out.push(finding('manifest_report_run',at(item),'report run_id differs'));
  if(row.mode!=='report'||r.mode!=='report')out.push(finding('manifest_mode',at(item),`mode ${r.mode}/${row.mode}; release evidence needs mode 'report'`));
  const wantPriv=item!=='reference_regression';
  if(row.privileged!==wantPriv||r.privileged!==wantPriv)out.push(finding('manifest_privileged',at(item),`privileged must be ${wantPriv}`));
  if(row.finished_at===null)out.push(finding('manifest_run_unfinished',at(item),'dq_eval_runs.finished_at is null'));
  else preparedAfter(item,row.finished_at);
  if(row.status!=='passed')out.push(finding('manifest_run_status',at(item),`dq_eval_runs.status ${row.status}`));
  if(row.evaluator_code_version!==REL)out.push(finding('manifest_code_version',at(item),'dq_eval_runs.evaluator_code_version differs from release_commit'));
  if(row.set_sha256!==r.set.sha256||row.kind!==r.kind)out.push(finding('manifest_report_run',at(item),'dq_eval_runs row and report disagree on kind/set'));
  const cls=r.summary.evidence_class;
  if(item==='dual_source'){
   // the class is the F6 registration's, never the report's: unregistered → invalid (only not_applicable is acceptable); same_feed → adapter check
   const reg=pairRegistration(r.set.id,deps.pairs??F6_PAIRS);
   if(!reg){out.push(finding('manifest_invalid',at(item),`pair ${r.set.id} is not registered in F6 (kinds/pairs.ts); use not_applicable`));return null;}
   if(reg.independence==='same_feed')out.push(finding('manifest_adapter_check',at(item),'same_feed dual-source runs are adapter checks, not evidence'));
  }
  else if(item==='reference_regression'){if(cls!=='comparison')out.push(finding('manifest_evidence_class',at(item),`evidence_class ${cls}, expected comparison`));}
  else if(cls!=='truth')out.push(finding('manifest_evidence_class',at(item),`evidence_class ${cls}, expected truth`));
  if(item==='official_reconciliation'&&(r.provenance?.verified?.artifacts!==true||r.provenance?.verified?.sources!==true))
   out.push(finding('manifest_unverified',at(item),'official run lacks verified artifacts and sources'));
  return {report:r,set:checkReport(item,r,RUN_KIND[item])};
 };

 let official:{report:EvalReport;set:GoldSet|null}|null=null;
 for(const item of ITEMS){
  const ev=m.evidence[item];
  if(ev===undefined){out.push(finding('manifest_evidence_missing',at(item),'missing'));continue;}
  if(!isObject(ev)){out.push(finding('manifest_invalid',at(item),'must be an object'));continue;}
  if('not_applicable' in ev){
   if(Object.keys(ev).length>1){out.push(finding('manifest_invalid',at(item),'not_applicable cannot be combined with run evidence'));continue;}
   if(!WAIVABLE.has(item))out.push(finding('manifest_non_waivable',at(item),`${item} cannot be not_applicable`));
   else if(!naValid(ev.not_applicable))out.push(finding('manifest_waiver_invalid',at(item),'not_applicable needs reason, approved_by "owner" and at'));
   continue;
  }
  if(item==='official_reconciliation'||item==='replay_live'||item==='dual_source'||item==='reference_regression'){
   const res=await runBacked(item,ev);
   if(item==='official_reconciliation')official=res;
   continue;
  }
  if(item==='replay_frozen'){
   const ci=typeof ev.ci_run_url==='string'?CI_RUN.exec(ev.ci_run_url):null;
   if(!ci)out.push(finding('manifest_ci_run',at(item),'ci_run_url must be a GitHub Actions run URL'));
   else{
    const origin=deps.originRepo();
    if(origin===null||`${ci[1]}/${ci[2]}`.toLowerCase()!==origin)out.push(finding('manifest_ci_repo',at(item),`ci_run_url is not a run of the origin repository (${origin??'unknown'})`));
    else if(deps.ciRun){
     const run=await deps.ciRun(ci[1],ci[2],ci[3]);
     if(!run||run.conclusion!=='success'||run.head_sha!==REL)out.push(finding('manifest_ci_run',at(item),`CI run ${ci[3]}: conclusion ${run?.conclusion??'unknown'}, head_sha ${run?.head_sha??'unknown'}; needs success at release_commit`));
    }else{
     const f=finding('manifest_ci_unverified',at(item),'CI run conclusion and head_sha were not checked: run validate.ts --manifest <file> --online');
     out.push(f);opts.notices?.push(f);
    }
   }
   if(ev.ci_check!=='manual')out.push(finding('manifest_ci_run',at(item),"ci_check must be 'manual' (the digest comparison with the CI job summary is a human step)"));
   if(typeof ev.report_sha256!=='string'){out.push(finding('manifest_invalid',at(item),'report and report_sha256 required'));continue;}
   const bytes=evidenceBytes(item,ev.report);
   if(!bytes)continue;
   if(sha256Hex(bytes)!==ev.report_sha256)out.push(finding('manifest_report_sha',at(item),'committed copy sha256 differs from report_sha256'));
   const r=parseReport(bytes);
   if(!r){out.push(finding('manifest_report_invalid',at(item),`${String(ev.report)} is not an F6 report`));continue;}
   if(r.mode!=='ci')out.push(finding('manifest_mode',at(item),"frozen replay evidence is a mode 'ci' run"));
   if(typeof r.finished_at!=='string')out.push(finding('manifest_run_unfinished',at(item),'report has no finished_at'));else preparedAfter(item,r.finished_at);
   if(r.summary.evidence_class!=='truth')out.push(finding('manifest_evidence_class',at(item),`evidence_class ${r.summary.evidence_class}`));
   checkReport(item,r,'replay_consistency');
   continue;
  }
  if(item==='expert_sampling'){
   const bytes=evidenceBytes(item,ev.file);
   if(!bytes)continue;
   let rec:unknown;
   try{rec=JSON.parse(new TextDecoder().decode(bytes));}catch{out.push(finding('expert_invalid',at(item),'not JSON'));continue;}
   const runId=isObject(rec)&&isObject(rec.population)?rec.population.evaluated_run_id:undefined;
   const officialId=(m.evidence.official_reconciliation as {run_id?:unknown}|undefined)?.run_id;
   if(runId!==officialId)out.push(finding('manifest_expert_run',at(item),'population.evaluated_run_id must equal the official_reconciliation run_id'));
   out.push(...validateExpertRecord(rec,official?.set??null,{release:true,where:at(item)}));
   const evRev=isObject(rec)&&isObject(rec.population)?rec.population.db_state_rev:undefined;
   const offRev=official?.report.environment?.db_state_rev;
   if(official&&evRev!==undefined&&String(offRev)!==evRev)out.push(finding('manifest_expert_run',at(item),`population.db_state_rev ${String(evRev)} differs from the official report's db_state_rev ${String(offRev)}`));
   continue;
  }
  if(!isRepoPath(ev.dir)){out.push(finding('manifest_path',at(item),'dir must be repo-relative without .. segments'));continue;}
  out.push(...validateAuditDir(ev.dir,{...deps.audit,release:true,readFile:p=>deps.readAt(EVI,p)}));
 }
 if(official?.set){
  const markets=[...new Set(official.set.cases.map(c=>c.subject.market))].sort();
  if(canonicalJson(markets)!==canonicalJson([...new Set(m.scope.markets)].sort())||new Set(m.scope.markets).size!==m.scope.markets.length)
   out.push(finding('manifest_scope_markets',`${where}#scope.markets`,`set markets are ${markets.join(',')}`));
 }
 if(official){
  const rev=official.report.environment?.db_state_rev;
  if(typeof rev!=='number'||BigInt(m.scope.data_state_rev_min)>BigInt(rev))out.push(finding('manifest_state_rev',`${where}#scope.data_state_rev_min`,`official db_state_rev ${String(rev)} is below data_state_rev_min`));
 }
 if(deps.freshness)for(const market of new Set(m.scope.markets)){
  const dataset=`${m.module}.${market.toLowerCase()}`;
  const f=await deps.freshness(dataset);
  if(f?.last_ok_at&&Date.parse(f.last_ok_at)>prepared){out.push(finding('manifest_freshness_unverifiable',`${where}#scope.markets.${market}`,`dq_freshness ${dataset} last_ok_at is after prepared_at: historical freshness cannot be established`));continue;}
  const status=!f?'absent':!CADENCES.includes(f.expected_cadence)?'error'
   :computeFreshness({cadence:f.expected_cadence as Cadence,lastOkAt:f.last_ok_at?new Date(f.last_ok_at):null,consecutiveErrors:Number(f.consecutive_errors??0),now:new Date(prepared)});
  if(status!=='fresh')out.push(finding('manifest_stale',`${where}#scope.markets.${market}`,`dq_freshness ${dataset} recomputed at prepared_at is ${status}`));
 }
 return out;
}
