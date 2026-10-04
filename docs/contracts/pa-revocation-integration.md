# Revocation integration constraints from existing PA code

Implementation checkpoint, 2026-10-04. This is an execution note, not a deployed interface.

PA currently stores one mutable row per `(user_id, grant_id)` in `pa_bridge_grant`. `ProcessingGrant` has no version counter. The current `pa_bridge_event` replacement is in migration `20260922120000_pa_reader_bridge.sql` (not only the original bridge migration). Rights changes update all grant policies for the source, then upsert the selected grant. Scope sequence also includes ordinary reading events. Therefore neither the current grant row nor filtered outbox positions can directly satisfy the new versioned contiguous revocation feed.

Next producer implementation must:

1. Add explicit grant-version snapshots and a separate per-scope revocation head/event sequence. Reuse the existing owner advisory lock order; allocate committed positions transactionally, not via a sequence that leaves rollback holes.
2. Preserve all affected prior grant versions on rights changes. Revoke all relevant source versions on source withdrawal and all relevant scope versions on scope revoke. An idempotent replay must not add another position.
3. Define an explicit cutover epoch. A newly recorded current snapshot is evidence only from cutover onward, not reconstructed historical consent. Legacy Alpha bindings with unknown version remain ineligible for production processing until explicitly rebound/reimported against a recorded snapshot.
4. Return head and bounded page from one consistent database snapshot with server publication time. Signing uses only that snapshot; a transport service must not forge a new heartbeat over stale cached state. Feed reading uses a narrow scoped identity, not a generic service-role endpoint.
5. Add export metadata associating source/grant/version with the exact signed candidate; preserve the existing additive schema/extension rules. Verify producer and consumer agree before release.

Next consumer implementation must add a trusted feed registration, narrow revocation-only role, owner-serialized inbox/cursor transaction, duplicate-ID consistency and rollback tests. Its transaction must revoke matching bindings before committing its new cursor. Ordinary S4 runtime credentials must not acquire revocation grants. `assertRevocationFresh` must use committed trusted checkpoints selected for the binding's exact scope, and grant-expiry checks remain separate.

Acceptance must exercise rollback between inbox and binding mutation, duplicate delivery after commit, missing pages, concurrent workers, scope separation, unknown legacy versions, and stale heartbeat rejection on actual write and display paths. The current pure verifier and freshness guard do not provide these database or runtime guarantees.
