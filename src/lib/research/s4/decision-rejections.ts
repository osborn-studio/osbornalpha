// Decision outcomes the server has settled: the frozen draft is released so the user can correct the
// input and submit a new decision. Anything else (unresolved submission, transport failure, unknown
// error) keeps the draft and its request key so a retry replays the identical submission.
export const DEFINITIVE_DECISION_REJECTIONS = Object.freeze([
  'revision_conflict', 'idempotency_conflict', 'scope_denied', 'policy_blocked', 'revocation_access_denied',
  'invalid_schema', 'security_unresolved', 'exposure_required', 'observation_scope_conflict',
] as const);

export function resetsDecisionDraft(code: unknown): boolean {
  return typeof code === 'string' && (DEFINITIVE_DECISION_REJECTIONS as readonly string[]).includes(code);
}
