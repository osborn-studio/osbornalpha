// src/lib/evals/types.ts
// Shared contract of the F6 evaluation framework (spec 2026-11-04-evals-and-gold-sets-design.md, draft 6).
// Every task uses these names verbatim. Layers: reader (adapters/*) → kind (kinds/*, pure) → summarize (summary.ts).
import type {Duration,Market} from '../facts/types';

export type EvalKind='official_reconciliation'|'dual_source'|'replay_consistency'|'reference_regression'|'extraction_gold'|'judgment_calibration';
export type EvalModule='facts'|'metrics'|'macro'|'industry'|'company'|'foreign_research';
export type EvalMode='ci'|'report';
export type ArtifactClass='public'|'restricted';
export type EvidenceClass='truth'|'comparison'|'adapter_check';
export type Gate='pass'|'fail'|'incomplete';
export type EvalRunStatus='running'|'passed'|'failed'|'incomplete'|'error';
export type ProvenanceKind='transcribed'|'synthetic';
export type GoldFormat='f6'|'legacy_plan2';
export type ExitCode=0|1|2|3;
export type Scale='1'|'1000'|'1000000'|'1000000000';

/** §4.3. Maps to facts unit strings via gold/schema.ts::unitOfSpec: currency→'USD', shares→'shares', per_share→'USD/share', ratio→'pure'. */
export type UnitSpec={kind:'currency';currency:string}|{kind:'shares'}|{kind:'per_share';currency:string}|{kind:'ratio'}|{kind:'index'}|{kind:'count'}|{kind:'percent_points'};
export interface DocumentId{kind:'edgar_accession'|'cninfo_announcement'|'file_sha256'|'official_release';value:string}
/** period_start: null = instant; ABSENT (undefined) = unconstrained, allowed only in legacy_plan2 sets. */
export interface FactTarget{type:'fact';concept:string;period_start?:string|null;period_end:string;duration:Duration;consolidation:'consolidated';unit:UnitSpec}
export interface MetricTarget{type:'metric';metric:string;period_start:string;period_end:string;duration:string;basis:string;input_unit:string;formula_version:string;unit:UnitSpec}
export type CaseTarget=FactTarget|MetricTarget;
export interface Subject{market:Market;cik?:string;ticker?:string}
export interface CaseSource{document_type:string;document_id?:DocumentId;url:string;sha256?:string;available_date?:string;locator?:Record<string,string|number>}
export interface GoldCase{
 case_id:string;subject:Subject;target:CaseTarget;expect:'present'|'missing';
 printed?:{text:string;unit_label:string;scale:Scale};canonical?:{value:string};
 binding:'document'|'current';
 /** binding='current': the asOf to read at. f6 = source.available_date; legacy = entry.as_of ?? null (null → env.today). */
 as_of:string|null;
 source:CaseSource;provenance_kind:ProvenanceKind;
 recorded_by:string;recorded_at:string|null;reviewed_by:string|null;reviewed_at:string|null;
 retracted:null|{at:string;by:string;reason:string};notes:string;
 required:boolean;
 /** legacy_plan2 only: entry still '<pending>' (no value / no recorder). */
 pending:boolean;
 /** legacy_plan2 only: required F6 provenance fields this entry lacks (e.g. 'source.sha256','source.locator','reviewed_by'). Empty for f6. */
 provenance_gaps:string[];
}
export interface Thresholds{max_fail:number;min_coverage_optional:string}
export interface GoldHistoryEntry{version:number;changed_at:string;changed_by:string;reason:string;fields:string[]}
export interface GoldSet{
 schema_version:1;format:GoldFormat;set_id:string;version:number;module:EvalModule;artifact_class:ArtifactClass;
 module_implementers:string[];tolerance:{rel:string};thresholds:Thresholds;optional_cases:string[];history:GoldHistoryEntry[];
 /** §4.6 second reviewer (Codex plan round 1 P2-3): f6 header field, required; true ⇒ every case has reviewed_by ≠ recorded_by;
  *  set ids starting 'facts/plan3' (the 30-company set) must set it. legacy_plan2: false. */
 review_required:boolean;
 cases:GoldCase[];
 /** legacy_plan2: the file's `ready`; f6: always true. */
 ready:boolean;
 /** repo-relative path and sha256 of the file BYTES as loaded. */
 path:string;sha256:string;
}
export interface Recorder{id:string;role:string;modules:EvalModule[];added_at:string;approved_by:string}
export interface RecordersFile{version:number;recorders:Recorder[]}
export interface GoldLock{files:{path:string;sha256:string;version:number;format:GoldFormat}[]}

/** One row as read by a module reader (facts row, or a derived metric). value_text is the lossless decimal string. */
export interface ReadRow{
 value_text:string;unit:string;period_start:string|null;period_end:string;duration:string;consolidation:string;available_date:string;
 fact_id?:string;filing_id?:string;source_ref?:string;mapping_gen?:number;mapping_version?:string;raw_hash?:string;run_id?:string;status?:string;
 metric?:{metric:string;formula_version:string;basis:string;input_unit:string;based_on_rev:number;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string}[]};
}
export type ReadErrorReason='subject_unresolved'|'filing_not_found'|'filing_not_linked'|'filing_ambiguous'|'truncated'|'formula_version_mismatch'|'projection_join_missing'|'setup_mismatch'|'read_failed';
export interface ReadResult{rows:ReadRow[];truncated:boolean;stateRev:number|null;error?:ReadErrorReason}
export interface SubjectRef{issuerId:string;market:Market}
export interface ReplayRequest{issuer:Subject;concepts:string[];asOf:string;durations?:string[];metrics?:string[]}
export interface ProjectionRow{[k:string]:string|number|boolean|null|ProjectionRow[]}
export interface Projection{module:EvalModule;rows:ProjectionRow[]}
export interface Hint{kind:'late_fact'|'quarantine_resolved'|'mapping_gen_raised';ref:string;at:string}
/** inputs (integration decision 3): optional per-input chains for derived rows; the facts reader carries its richer chains as adapters/provenance.ts::FactProvenance.input_chains instead. */
export interface ProvenanceCheck{ok:boolean;missing:string[];reason?:string;producer_code_version?:string;object_path?:string;locator?:string;source_verified?:boolean|'skipped';inputs?:{fact_id:string;check:ProvenanceCheck}[]}

export interface ModuleReader{
 module:EvalModule;privileged:false|true;
 resolveSubject(subject:Subject,today:string):Promise<SubjectRef|null>;
 /** Rows of the filing identified by documentId whose period/consolidation match target; NOT filtered by unit. */
 readDocumentBound(ref:SubjectRef,target:CaseTarget,documentId:DocumentId,today:string):Promise<ReadResult>;
 /** Current rows at asOf matching target's key (facts) or the derived metric (metrics); NOT filtered by unit. */
 readCurrent(ref:SubjectRef,target:CaseTarget,asOf:string):Promise<ReadResult>;
 project(request:ReplayRequest,today:string):Promise<Projection>;
 /** state_rev is per issuer (fact_state_rev(issuer, market)); there is no global counter. The injected deps.stateRev() value when it
  *  answers non-null, else the largest read_facts envelope state_rev this reader saw during the run; null when it read nothing.
  *  runGoldSet copies it into environment.db_state_rev when the caller passed null. */
 stateRev():Promise<number|null>;
}
export interface PrivilegedReader extends ModuleReader{
 privileged:true;
 readNonVisible(ref:SubjectRef,target:CaseTarget,documentId:DocumentId|null,asOf:string):Promise<'quarantined'|'superseded_generation'|null>;
 resolveProvenance(ref:SubjectRef,row:ReadRow,opts:{artifacts:boolean}):Promise<ProvenanceCheck>;
 hints(request:ReplayRequest,since:string):Promise<Hint[]>;
}

/** §3.3 case results. Reduction lives in summary.ts only. */
export type CaseOutcome=
 |{result:'pass'}|{result:'expected_absent'}
 |{result:'fail';reason:'value'|'ambiguous'|'unexpected_value'}
 |{result:'unit_mismatch'}
 |{result:'provenance_incomplete';reason:string}
 |{result:'missing'}
 |{result:'not_visible';reason:'quarantined'|'superseded_generation'}
 |{result:'skipped';reason:'retracted'|'subset'|'zero_support'|'unavailable'|'ineligible'|'pending'}
 |{result:'read_error';reason:ReadErrorReason}
 |{result:'identical'}
 |{result:'explained_diff';ledger_ids:string[]}
 |{result:'data_drift';ledger_ids:string[];hints:Hint[]}
 |{result:'unexplained_diff';reason:'diff'|'no_hints'|'partial_ledger'|'ledger_self_approved'}
 |{result:'within'}|{result:'beyond_explained';ledger_ids:string[]}|{result:'beyond_unexplained'};
export interface CaseReport{
 case_id:string;required:boolean;outcome:CaseOutcome;
 /** system value (left) and gold/expected value (right), decimal strings; null when absent. */
 left:string|null;right:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 provenance:ProvenanceCheck|null;detail:Record<string,unknown>;
}
export interface Summary{
 population:number;required:number;
 correctness:{pass:number;fail:number;unit_mismatch:number;provenance_incomplete:number;unexplained_diff:number};
 /** evaluated_optional: §3.2 rule 3 numerator (CCR-1), so gateOf can decide from the summary alone. */
 coverage:{evaluated:number;evaluated_optional:number;missing_required:number;missing_optional:number;not_visible:number;skipped:number};
 execution:{read_error:number;truncated:number;subset:boolean};
 thresholds:Thresholds;
 gold:{format:GoldFormat;ready:boolean;pending:number;provenance_gaps:number};
 gate:Gate;evidence_class:EvidenceClass;
 reconciliations_truncated:boolean;
}
export interface SummaryContext{thresholds:Thresholds;gold:Summary['gold'];subset:boolean;evidenceClass:EvidenceClass;reconciliationsTruncated?:boolean}

export interface EvalEnv{today:string;now():Date;evaluatorCodeVersion:string;dirty:boolean}
export interface ReportEnvironment{db_host:string|null;app_origin:string|null;db_state_rev:number|null}
export interface EvalReport{
 schema_version:1;run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set:{id:string;version:number;sha256:string;format:GoldFormat;path:string};
 evaluator_code_version:string;dirty:boolean;started_at:string;finished_at:string;
 environment:ReportEnvironment;thresholds:Thresholds;
 provenance:{verified:{artifacts:boolean;sources:boolean}};
 summary:Summary;cases:CaseReport[];
}
export interface RunOutcome{report:EvalReport;exitCode:ExitCode}
/** One finding of an evidence validator (validate.ts --expert/--audit/--manifest, Task 12; carried in validate/cli.ts CheckResult.findings). `where` names the file/field/case and never contains secrets. */
export interface ValidatorFinding{code:string;where:string;message:string}

/** Row shapes of the F6 tables (Task 5 migration). Decimal columns are TEXT. */
export interface EvalRunRow{
 run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set_id:string;set_version:number;set_sha256:string;evaluator_code_version:string;started_at:string;finished_at:string|null;
 status:EvalRunStatus;summary:Summary|Record<string,never>;report_ref:string;report_sha256:string;triggered_by:'manual'|'script'|'ci';
}
export type CaseResultKind='fail'|'unit_mismatch'|'provenance_incomplete'|'missing'|'not_visible'|'read_error'|'unexplained_diff';
export interface EvalCaseResultRow{eval_run_id:string;case_id:string;result:CaseResultKind;reason:string|null;left_text:string|null;right_text:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;detail:Record<string,unknown>}
