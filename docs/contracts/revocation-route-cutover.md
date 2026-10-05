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

## Bounded registered list candidate

`listRegisteredCandidates` now selects a fixed owner-scoped page (1–100, default20) ordered by `(created_at DESC,id DESC)`, resolves its references and validates every stored row inside the batch guard. No inaccessible row is silently omitted: any selected-row failure denies the entire page. Empty selected pages return empty without asserting feed health. A full page returns a microsecond-precision keyset cursor and may lead to one final empty page. Display `created_at` is not a cursor. HTTP GET still uses the legacy list; no route/flag switch occurred.

One verified Claude Opus5.5 review found cursor coercion, insufficient later-row/selection evidence and a conditional duplicate-hash concern. Cursors now require exactly two string fields on a plain object, canonical six-digit UTC timestamps and UUIDs. The existing migration20260922090000_research_s4.sql already enforces unique(user_id,payload_hash); a duplicate insert test asserts the exact unique constraint. No unnecessary deduplication or schema change was added.

Separate isolated list acceptance uses two actually registered/imported synthetic candidates on different feeds. It covers microsecond cursor values/pagination, another owner's empty view, absent mapping, later-row stored-source mismatch (no partial success), stale/tombstone/pruned later feed, and selected-page isolation from an unhealthy later page. Holding the later candidate row lock for six seconds crosses freshness after the earlier row was collected; the final HTTP response is unavailable with no candidate array. Final fixes host-verified. CI includes the new opt-in local-database smoke. Actual authenticated route adoption, UI behavior for failed pages, operational authority/roles, scale optimization and remaining S6/ledger/anchor coverage remain open.


## Import HTTP prerequisite (routes still unchanged)

S4 maps coded `invalid_revocation_candidate` to422 and `export_watermark_ahead` to503. A caught-up feed that is still behind the independently approved export watermark is unresolved availability, not confirmed revocation. No automatic retry or Retry-After is introduced. Errors must survive the protected transaction's final freshness check before these business codes can be disclosed. S4/S6 also sanitize null/undefined thrown values to500 instead of throwing again in the error handler.

Two isolated Claude Opus5.5 reviews examined this prerequisite. Initial conditional concerns about recovery markers, stored-reference unwrapping and canonical watermark validation were resolved by supplying those dependencies; actual DB-to-HTTP coverage was added. The second review found an unsafe-integer fixture failed during client-side canonicalization, before exercising import. Split safe-number schema rejection from hand-crafted unsafe raw JSON parser rejection. Final corrections are host-verified, not third-party re-reviewed. This does not constitute authenticated HTTP-route acceptance.

The observations UI currently loads `/candidates` once and polls selected status every10seconds; it neither consumes a cursor nor handles the new denial/unavailable codes by clearing protected content. Before switching routes, add bounded pagination and fail-closed visible content behavior, preserve unsent user judgment, and prevent a late request from redisplaying protected data after a denial. Test authenticated local handlers and UI races. S6/ledger/anchor paths remain separate open work.


## Protected UI response ordering (candidate, no HTTP cutover)

The observations view now invalidates old response generations on selection, unmount and access/availability failure. It clears cards, citation and history, pauses polling until explicit recovery, and keeps the user's pre-view text and mounted decision draft. The decision form cannot submit until material is available again. List requests use an independent sequence; failure is shown separately from successful empty results. Citation requests use a latest-selection sequence.

A pending decision retains its complete original body (request key, expected revision, card/label/exposure IDs) until success or a definitive rejection. Refreshing or re-revealing cannot silently change an unresolved retry's body. Draft edits and candidate changes are blocked while that attempt is unresolved; protected content can still be revalidated. A successful write followed by a failed refresh reports saved-with-refresh-failure. Uncertain delivery reports unresolved without claiming a commit. This is in-memory recovery, not a durable pending-write queue across reloads.

Two verified Claude Opus5.5 reviews identified lost write acknowledgements/drafts, conflated list failure, unstable retry identity and a weak delayed-citation assertion. Addressed those findings and added real-browser synthetic-HTTP tests: denied status during a citation/write, preserved draft, disabled blocked submission, full-body replay after newer revision/exposure, saved acknowledgement despite list failure, and explicit response completion before absence assertions. UI tests mock HTTP; they do not attest database authorization or route cutover. Final corrections host-verified, not third-party re-reviewed.

Open: bounded pagination; real authenticated route adoption; deeper response-shape validation beyond required top-level containers; durable unresolved-write recovery; S6 evaluation-panel request policy; server-side repeat-exposure semantics review; broader browser selection/unmount races. The UI marks re-viewing and suppresses a new independence checkbox declaration after exposure in this mounted view. It cannot establish human independence or reset server history. No production flags changed.


## Local collection route adoption (GET and POST)

The candidate collection GET now authenticates the actual request and uses the bounded registered list. It accepts only unique limit/createdAt/id parameters, enforces a2048-character URL limit, and keeps six-digit cursor timestamps intact. POST now requires prior trusted registration via importRegisteredCandidate, so a UI upload cannot create a new unregistered row that immediately breaks GET. Existing legacy rows are not backfilled from their uploaded metadata. They remain blocked until independently verified provisioning or a future authorized archival workflow.

The UI follows nextCursor without accumulating old pages, retries the exact attempted cursor, and can return to page one even when a later page fails. Decisions refresh the current page; new imports start at page one. Research options load separately with their own visible failure/retry and disable decision submission while unavailable. Paging is live keyset traversal, not a frozen snapshot; concurrent inserts may only be seen on returning to page one. Candidate IDs are generated with randomUUID by the import path; privileged legacy imports may need validation before adoption.

One verified Opus5.5 audit identified POST/list mismatch and navigation/option/cursor issues; those were fixed and tested. Its terminal-denial product blocker remains a release gate: a retained revoked or unverifiable row denies its entire selected page. We deliberately do not reveal a placeholder ID, skip a denied row, delete its audit evidence or manufacture authority to make a list succeed. An owner-authorized archive/index policy with independent metadata authorization must be implemented and audited before enabling this as a production browsing experience. Production remains hard-disabled. Returning to an earlier healthy page is recovery for navigation, not a fix for a blocked first page.

Evidence now calls the actual exported Next GET/POST handlers with signed synthetic local agent cookies and a disposable PostgreSQL database: absent cookie, wrong Host, cross-site denial, unregistered POST rejection, successful POST→GET, duplicate import, strict query cases, microsecond cursor, missing map and stale-feed503. This is actual authenticated handler execution, not a deployed Next network/auth test. Browser tests use mocked synthetic HTTP and cover next-page failure/retry, failed-page escape, options failure independence and previous response/write races. Per-candidate S4 routes and S6/ledger/anchor adoption remain incomplete; this is not end-to-end mandatory revocation.


## Local candidate item route adoption

Status, reveal, decision, citation and history handlers now call their registered adapters after the existing request/session checks. Citation requires exactly one cardId and index0–7; missing, empty, duplicate, extra and noncanonical query values fail422 rather than silently coercing missing index to0. All S4 candidate collection/item routes are now wired; this does not cover S6/ledger/anchor alternate paths.

One verified Claude Opus5.5 audit accepted the rewiring but requested stronger evidence. Added actual handler acceptance for different-owner signed cookies, forged/expired/future/overlong/wrong-purpose/wrong-kind tokens, no-write denial snapshots, a409 revision conflict and slow-trigger post-entry reveal/decision rollback. Production configuration tests use a valid production candidate with ALPHA_S4_ENABLED unset or1: all five real handlers return503 not_configured before Pool.connect or Client.connect. They use synthetic configuration and spies, no production network. The lower transaction validates actor UUID; local session malformed-JSON/UUID status normalization remains separate hardening work.

The fixture invokes exported Next functions with explicit params; it is not a live Next middleware/router/network acceptance test. Browser tests from the preceding batch remain HTTP-mocked. Final additions host-verified, not third-party re-reviewed. Terminal-row browsing recovery, operational provisioning and remaining alternate paths are still release blockers. No production activation, migration or backfill occurs.


## Local acceptance credential parsing

Local agent cookies now enforce a4096-character maximum, canonical base64url payload/signature, constant-time HMAC before parsing, valid UUID, safe integer timestamps and a positive lifetime of at most one hour. Signed malformed JSON/UTF-8/claims consistently return401 before transaction work. This is local synthetic-acceptance authentication; the production hard-disable is unchanged.

One verified Opus5.5 review requested non-vacuous duplicate, canonical-bit and size-boundary evidence and questioned Buffer UTF-8 handling. Existing parseStrict uses fatal TextDecoder for Buffer input (json.js:27–31); no duplicate decoder was added. Tests now use otherwise-valid duplicate claims, invalid UTF-8 within an otherwise-valid JSON string, unchanged decoded signature bytes with noncanonical trailing bits, a re-signed noncanonical payload, an accepted exact4096-character credential and an otherwise-valid oversized one. Actual isolated signed-session item-handler tests also pass. Final added tests host-verified, not third-party re-reviewed.

Next S6 work must resolve an observation's candidate inside one clean owner transaction, apply stored registration plus source/version validation, and preserve evaluator-session scope/expiry checks before and after protected work. Do not wrap each nested observationFor call with a new clean transaction: market/input/commit paths reuse the existing transaction and may already have written. Aggregate arm/ledger queries and filesystem anchor writes still require separate treatment.


## Registered observation report candidate

A new registeredObservationTransaction resolves an owner's Observation record to its candidate within the existing owner-locked transaction, then uses stored registration and source/version validation before report work. registeredObservationReport shares existing report logic and protects its exposure insert with final freshness checks. It currently supports report display only: passing replayId returns not_configured before work. HTTP remains unchanged; this adapter is not a complete S6 cutover or evaluator-session authorization boundary.

One verified Opus5.5 audit requested direct identity-corruption evidence, a genuinely provisioned other-owner test and replay market-scope enforcement. Added the report to stored manifest/source-version mutation tests; provisioned other-owner and nonexistent-observation cases both return not_found without writes. Positive evidence verifies the report exposure's candidate, origin, subjects and empty artifact list. A fresh six-second report succeeds; the same delayed exposure under expiring freshness rolls back with exact revocation_stale. Existing transaction() takes the owner advisory lock before invoking this resolver, so the lock claim is supported by db.ts.

Replay is intentionally unavailable on this new registered adapter until frozen market IDs are bound to the expected observation before marketFor reads another candidate and positive/corrupt/slow replay acceptance exists. Legacy replay behavior is unchanged and is still an open route-adoption risk. The code does not claim to have fixed replay, evaluator store/commit, market freeze, arm/ledger aggregation or filesystem anchor behavior. Production remains hard-disabled; ALPHA_S6_ENABLED is set only inside the disposable synthetic test process. Final corrections host-verified, not third-party re-reviewed.
