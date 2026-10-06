# Alert receipt affected-row acknowledgement — local candidate, 2026-10-06

## Behavior

After dispatch, UPDATE delivery filtered by the inserted run ID now SELECTs id with single(). Success requires no returned error and exactly the expected ID. Missing/wrong IDs, returned DB errors or thrown client/transport exceptions become the fixed service alert delivery status unavailable error. Storage acknowledgement is checked before delivery completeness. Healthy first runs also require acknowledgement. Duplicate-conflict paths retain stored evaluation and never update, repair or resend.

This confirms the reported affected row, not the exact delivery JSON, human receipt, backup persistence or recovery guarantees. A failed/unknown acknowledgement does not prove rollback: the DB might have committed before the response was lost. A later retry reads stored state; unresolved receipt throws without resend, while an already stored successful receipt follows the existing successful dedup path. Never infer that every failed acknowledgement leaves delivery empty.

## Verification and audit

Initial finite osstack task_bf310c54 passed. Strict Claude CLI claude-opus-5-5 audit task_c25c5acc reviewed immutable source/synthetic input with no tools/MCP. Accepted3 findings: catch thrown acknowledgement exceptions generically, assert no updates on conflict paths, and strengthen healthy payload/target and failed-storage-before-failed-delivery tests. The audit also mentioned raw insert/read client exceptions; those pre-existing paths remain outside this acknowledgement change and callers still have generic route failure handling. No broader module exception privacy guarantee is claimed.

Final task_0d5ee5ff passes eight observability/alert-route suites, typecheck/lint/diff with0 verifier issues;33 service tests. All channels and DB calls mocked; no provider/production DB/alerts. Final fixes host verified, not second-reviewed. Evidence /Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-alert-receipt-ack-20261006-1954/disposition.md.

## Remaining gates

Actual PostgREST UPDATE RETURNING/role/RLS behavior needs isolated integration acceptance before production. No live DB calls or schema changes. Outbox, operator reconciliation, unknown-response recovery, deletion ledger, production login/release and ordinary24h evidence remain open. This batch closes the missing affected-row acknowledgement code guard, not overall reliable delivery. No push or Actions. Next: isolated Next/runtime evidence and consolidated regression/build before a grouped push.
