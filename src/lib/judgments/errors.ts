// src/lib/judgments/errors.ts
// Judgment-layer error codes (spec §13 plus the plan's codes). Every failure inside src/lib/judgments
// throws JudgmentError; SQL functions raise with the same code as the message head and db.ts maps
// them back (toJudgmentError). Codes that are only batch information (pending_summary, …) live in
// src/lib/dq/batches.ts INFO_CODES, not here.
export const JUDGMENT_ERROR_CODES=[
 'methodology_unavailable','methodology_mismatch','unknown_methodology','formula_hash_drift',
 'subject_missing','subject_inactive','subject_type_not_public',
 'input_not_allowed','input_snapshot_mismatch','input_not_public','input_origin_unknown','input_hash_mismatch','lookahead',
 'idempotency_conflict','duplicate_key','invalid_claim','invalid_condition','code_version_missing','settle_window_mismatch',
 'unsupported_formula_version','metric_not_reproducible','market_unsupported','target_unresolvable','macro_unavailable','read_truncated',
 'input_unavailable','snapshot_unclassified','binding_not_referenced','override_mismatch',
 'lease_lost','request_key_conflict','settlement_sequence','unknown_judgment','stale_revision','job_state_conflict','item_not_open','resolution_not_applicable',
 'invalid_parameter','unknown',
] as const;
export type JudgmentErrorCode=typeof JUDGMENT_ERROR_CODES[number];
export class JudgmentError extends Error{
 constructor(public readonly code:JudgmentErrorCode,message?:string,public readonly detail?:Record<string,unknown>){super(message??code);this.name='JudgmentError';}
}
export const isJudgmentError=(e:unknown,code?:JudgmentErrorCode):e is JudgmentError=>e instanceof JudgmentError&&(code===undefined||e.code===code);
