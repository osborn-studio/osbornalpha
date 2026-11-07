// src/lib/evals/errors.ts
// Pre-run refusals and fatal store errors (spec §14). Exit code 2 = refused before running; 1 = store/report failure.
export type EvalErrorCode='gold_invalid'|'gold_lock_mismatch'|'gold_diff_violation'|'code_version_missing'|'dirty_tree'|'synthetic_in_report'|'restricted_in_ci'|'kind_not_enabled'|'report_write_failed'|'store_write_failed'|'store_conflict'|'store_partial'|'reference_result_schema'|'reference_write_attempt'|'replay_rerecord_refused'|'resume_mismatch'|'redact_violation'|'manifest_invalid'|'expert_invalid'|'audit_invalid';
export const REFUSAL_CODES:ReadonlySet<EvalErrorCode>=new Set(['gold_invalid','gold_lock_mismatch','gold_diff_violation','code_version_missing','dirty_tree','synthetic_in_report','restricted_in_ci','kind_not_enabled','replay_rerecord_refused','resume_mismatch']);
export class EvalError extends Error{constructor(public readonly code:EvalErrorCode,message?:string,public readonly detail:Record<string,unknown>={}){super(message??code);this.name='EvalError';}}
export const exitCodeOfError=(e:EvalError):1|2=>REFUSAL_CODES.has(e.code)?2:1;
