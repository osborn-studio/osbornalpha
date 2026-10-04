# PA revocation feed v1 — candidate wire contract

Status: isolated protocol implementation only. No PA endpoint, durable inbox, scheduled consumer, database migration, production role or release is included. This does not satisfy I1.9/I1.10 end-to-end acceptance.

PA is the authority for the feed, owner/workspace scope, sequence and publication watermark. The consumer receives a trusted Ed25519 public key and trusted initial feed identity/scope/checkpoint from operator configuration. The key is never selected from incoming data. Dedicated scoped transport authentication, key distribution/rotation and producer commit ordering remain required work.

Each signature is 128 lowercase hexadecimal characters over the exact UTF-8 JSON transport bytes. The body is at most 64 KiB, at most 100 events, rejects unknown fields, and has these fields:

- `protocol_version`: `pa-revocation/v1`; `feed_id`: UUID for the configured feed epoch.
- `owner_scope`: `user_id` UUID and `workspace_id` UUID or null. An Alpha local owner mapping must remain separate from upstream scope.
- `from_seq`: exclusive persisted cursor; `through_seq`: last event in this page; `latest_seq`: authoritative committed head at publication. All are canonical decimal strings within signed PostgreSQL bigint range, never JavaScript numbers.
- `published_at`: canonical UTC millisecond ISO timestamp. More than 60 seconds old, more than five seconds ahead, or earlier than the previous checkpoint is rejected. These are candidate thresholds, not a measured production SLO.
- `events`: `revocation_id`, `monotonic_seq`, `source_id`, `grant_id`, `grant_version`, `effective_at`. IDs are UUIDs. Grant version is a positive signed 32-bit integer. Effective time is canonical UTC and cannot be later than publication. No article body or free text is permitted.

Sequences must be contiguous, through-from equals event count, latest cannot regress, and an empty page is accepted only at the known tip. Page-local duplicate revocation IDs are rejected. `caughtUp` means this page reached the declared head at verification time, not an enduring permission to process or display restricted content.

## Persistence and producer requirements

The returned checkpoint is only a plan, never committed by this module. Future consumer code must atomically insert inbox IDs, revoke matching source/grant/version bindings and advance the cursor under an owner lock. Global duplicate-ID consistency, crash/replay recovery, feed rollback/epoch changes and mapping to pre-existing bindings require database-level tests. A redelivered older page is rejected; after a successful transaction the consumer requests from the committed cursor. Failures must never advance it.

The producer must allocate per-scope sequence positions without commit-order holes and publish events plus head in a consistent snapshot. It must not replace the actual authoritative publication watermark with the time an old response was fetched. Revocations should be published when effective; scheduled future revocations require another protocol, not silent early application.

Every protected write/display must recheck durable freshness and grant expiry. A successful HTTP fetch or previously true caughtUp must not override an expired watermark. The independent polling process, its narrow role, inbox schema, fail-closed read/write integration, and measured propagation bound remain unimplemented.

## Verification

Synthetic Ed25519 keys only. Contract tests cover exact-byte signatures, owner/workspace/feed isolation, pagination, stale/future/regressing watermarks, bigint precision, missing sequence positions, duplicate IDs, replay, malformed timestamps, unknown text and input bounds. These are contract tests, not live authenticated producer or database transaction evidence.

## Audit clarifications

The signing key must be dedicated to this protocol/feed; no cross-protocol reuse. Signature domain includes the required protocol literal in the signed JSON. Numeric grant_version means a JSON number with an integer value, including equivalent JSON number spellings. The existing ProcessingGrant schema has no version counter: producer implementation must define and persist that mapping before any operational feed is emitted; do not invent version 1 for existing grants.

Multiple committed heads may legitimately share a millisecond timestamp; latest_seq provides ordering and must not regress. Heartbeat replay within the validity window is allowed but never refreshes published_at. The five-second forward clock allowance means the tolerated age can reach 65 seconds relative to a consumer's initial receipt clock; 60 seconds is not yet a certified end-to-end upper bound. Production acceptance must measure clock skew and end-to-end lag and tighten thresholds if the agreed bound is 60 seconds.

Claude CLI claude-opus-5-5 reviewed the initial validator, 28 tests and contract; no blocking findings. Follow-up adds five boundary tests (33 total), including duplicate JSON keys, full/oversized byte limits, sequence maximum and unchanged heartbeat time. Follow-up tests and these clarifications are host-verified, not separately audited.

## Per-operation freshness guard

`assertRevocationFresh(checkpoint, expected, nowMs)` rechecks the persisted watermark at each protected operation, requiring exact configured feed epoch, user/workspace scope, caught-up cursor and unexpired publication time. `expected` is trusted operation configuration, never request-supplied claims. Missing state, pending pages, invalid times and scope mismatches fail closed. This guard is not yet connected to request/database paths; it is not current production protection or a substitute for grant expiry and authorization.

The guard adds 20 tests, bringing this directory to 53 tests. A separate Opus5.5 audit found missing explicit expected-scope comparison; fixed with epoch/user/workspace checks and four regression cases. The final fix is host-verified, not independently re-reviewed. Persistence must later distinguish committed checkpoints from uncommitted page plans.
