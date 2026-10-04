# Revocation route cutover inventory (candidate, not release approval)

Baseline: Alpha 2235ad8, inspected 2026-10-04. The registered adapters are tested but **no HTTP handler calls them yet**. Production database mode remains hard-denied by s4Pool. This inventory records remaining integration scope, not a security attestation of arbitrary dynamic imports.

| Surface | Current implementation | Required cutover work |
|---|---|---|
| `/api/research/s4/candidates` POST | `importCandidate` | Switch to registered import only after scoped role/reference provisioning; no upload-derived authority fallback. |
| Same route GET | `listCandidates` | Define multi-candidate transaction semantics before replacement. Current loop filters legacy permission errors. |
| S4 candidate status/reveal/decisions/citation/history | Legacy functions in read/cards/decisions | Registered counterparts exist; cut over together with entry/list paths and test actual HTTP authentication and errors. |
| S4 options | `researchOptions` | Does not read a candidate; retain authenticated owner restrictions. |
| `/api/research/s6/observations/[id]` | report + prepare/evaluate/commit | Observation IDs must resolve to protected candidate scope before row locks/writes; preserve owner/session checks and revision checks. |
| `/api/evaluator/v1/observations/[id]`, market snapshots, evaluation results | `evaluatorRpc` → createS6Store | Machine authentication is not grant freshness. Recheck token after owner lock; guard source/market reads and commits. |
| S6 market/market-handoff/report/REL fixture helpers | `observationFor` / `candidateFor` | Still legacy candidate gates. Inventory internal/CLI calls too; keep dormant/real-market switches off. |
| S4 judgment/label/decision/outcome/replay ledger | `ledger.ts` | Source/thesis/judgment IDs do not all identify a single candidate. Define provenance eligibility and batch handling; do not arbitrarily assign a grant. |
| Arm reporting | `loadArmRows` | Aggregates many observations, catches per-row failures. Preserve “unavailable” versus revoked; never catch poisoned-transaction errors and continue as if healthy. |
| Anchor worker/backup acceptance | `drainOutbox` | Filesystem writes cannot be rolled back by DB guard. Define durable receipt/recovery and revocation semantics before adapting; do not wrap external IO in the DB-only callback. |

## Multi-candidate list decision to implement

Use a single owner transaction and a batch-aware before/after guard rather than nesting the existing single-use clean-transaction helper. Select only a bounded candidate page, resolve all references inside the owner lock, and check the full returned set immediately before return/commit. A stale/unavailable feed must produce an explicit unavailable response, not an apparently empty successful list. Permanently inaccessible candidates may be omitted only by an explicit tested rule; a DB error must abort the whole operation. No saved partial rows or cached results may escape after the post-check fails. Offset/cursor pagination and revoked-row omission must be specified together so hidden items do not cause repeated or skipped pages.

The existing helper poisons an unchanged transaction on denial. Repeated calls on one client, savepoint recovery, nested pool transactions and silently swallowing errors are not valid list implementations. A batch primitive must preserve clean entry and owner-lock order and deduplicate repeated feed checks without trusting caller-supplied reference identities.

## Error and retry boundary

S4/S6 now have a shared HTTP mapping for candidate guard errors: `binding_revoked`, `grant_expired` and `grant_version_revoked` return a sanitized 403; missing binding, invalid grant configuration, stale/missing/failed verification return a sanitized 503. Transaction-contract violations return sanitized 500. Only the branded internal RevocationAccessDenied class is recognized; matching an error message alone is insufficient. Both disable caching and omit database details and internal causes. No automatic retries, polling process or Retry-After policy is enabled by this change. Existing conflict, authentication and generic error handling remains intact. Additional new semantic codes (e.g. invalid_revocation_candidate/export_watermark_ahead) still need explicit API contract treatment before route cutover.

## Release checks still open

- Authenticated PA export metadata acquisition, trusted registration provisioning, scoped read/write roles and immutable feed identity.
- All route/internal/CLI paths above covered; legacy endpoints cannot serve as a freshness bypass, including same-key replay after a reset binding flag.
- Real local HTTP owner/session and multi-candidate tests, Linux CI, reviewed migrations/permissions and backout plan.
- Existing production backup, login, integration metadata, independent receipt and canary gates. No local test authorizes deployment or enables a dormant capability.

## Audit disposition

One verified Claude CLI claude-opus-5-5 review found mixed missing/revoked and invalid/expired causes, incomplete handler evidence and misclassified transaction bugs. The guard now distinguishes these causes, both handlers use a branded error, and transaction misuse maps to 500. Table-driven tests exercise both real handlers, legacy authentication/conflict/input/not-found behavior, unknown errors, cause sanitization and message collisions. The isolated PostgreSQL suite also runs actual missing-registration, stale, revoked and business-integrity failures through S4 HTTP; no mocked guard is used for those assertions. Final changes are host-verified.

The inventory is a manual source snapshot, not a mechanically enforced import boundary. It intentionally records inspection evidence and proposed batch semantics; neither the inventory nor an HTTP 503 establishes operational readiness or authorizes retries. A later cutover must verify the inventory against its actual commit and test real authenticated routes.

## Bounded batch primitive (list handler still pending)

`withRegisteredCandidatesInTransaction` now owns one clean READ COMMITTED transaction boundary for 1–100 distinct payload hashes. The resolver executes under the owner lock. Items are cloned, validated and frozen; trusted work receives that authorized set and must restrict its reads to those keys. Empty batches are denied without running work. A future empty list handler must return its empty page without invoking business work, and must not filter unavailable references into an empty “success”.

Every item is checked before/after work; a final common database-clock sweep covers deadlines of earlier items that may expire during slower later checks. Single-item adapters use the same primitive. Coded business errors also undergo the final checks before disclosure, so an expired request cannot disclose a conflict code in place of a protected result. Failed checks poison the unchanged transaction. All cooperating S4 writers already take the owner lock; privileged bypass remains outside the guarantee. This is a trusted DB callback contract, not a SQL sandbox or an implemented list endpoint.

One verified Opus5.5 review requested binding work to the authorized set, denying empty/malformed batches, rechecking failed work before disclosing domain errors, and stronger batch evidence. Implemented those changes. Tests cover exactly100 and overflow, empty/malformed/duplicate input, copied frozen items, denied second binding, a delayed later read crossing the first item's deadline, and post-work expiry with both successful and coded-error callbacks followed by catch-and-COMMIT rollback. The 100-item test uses disposable synthetic operator bindings, not real approvals. Coverage scans are still per item; production-scale query optimization and actual list pagination/omission semantics remain open. Final fixes host-verified.

Remaining batch evidence to add with list integration: heterogeneous feeds with a later tombstone/coverage gap, transaction races on the actual selected list, and pagination under omitted/denied rows. The current two-item acceptance uses one feed, with independent binding identities; it must not be presented as heterogeneous-feed list acceptance. The audit's additional coverage suggestions are tracked here rather than counted as completed.
