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


## Registered replay candidate

Registered replay is now implemented in the candidate adapter; S6 HTTP still uses legacy entrypoints. Replay passes its expected observation into marketFor, which filters the market SQL before any observation/candidate authorization. This also hardens shared legacy replay. Frozen markets reassigned to a different cancelled observation are rejected as hash_mismatch without consulting that observation's policy.

One verified Opus5.5 audit requested an independent commit record, complete exposure accounting and real cross-observation replay evidence. Replay now requires exactly one matching evaluation.append ControlEvent for the authorized candidate/observation, validates its payload hash and compares input/result digests and revision with the evaluation receipt. A consistently rehashed forged evaluation row is rejected against that unchanged event. This does not attest a database whose privileged administrator rewrites both the event and evaluation or external anchors; that broader integrity boundary remains separate.

Replay exposure records include the evaluation and all disclosed frozen market IDs. Synthetic acceptance uses actual freeze/prepare/evaluation commit APIs, positive replay, exact exposure contents, same-owner second-observation evaluation ID and other-owner rejection, reassigned market, tampered result and consistently rehashed evaluation. A fresh delayed replay succeeds; expiring freshness after its real exposure insert rolls back. Cancelled observations remain non-replayable under existing observationFor policy. Fixture setup uses legacy evaluator APIs only to create synthetic evidence, not as proof that those APIs enforce registration.

Final audit corrections are host-verified, not third-party re-reviewed. Operational credentials, terminal-row index/archive policy, evaluator store/prepare/commit and market route adoption, ledger/arm/anchor paths and real served-router/browser acceptance remain open. No production switch or dormant real-market capability was enabled.

## Registered evaluator preparation candidate

prepareRegisteredEvaluation and prepareRegisteredInput now reuse one clean registered observation transaction. Input preparation binds every frozen market to that observation before touching its candidate. These are evaluator-internal adapters for an already authenticated actor: input preparation returns full material without a display ExposureEvent, so it must not be returned directly by a browser/export route. HTTP and machine-token store/commit remain unchanged.

The first verified Opus5.5 review found cross-candidate information-set reads. Shared legacy/registered input construction now binds the Observation payload candidate to its stored column, constrains InputSnapshot and typed card/label/exposure/thesis queries to that candidate, and requires the snapshot source version to equal the candidate source version. A second verified review found no confirmed blocker for this bounded internal scope. Synthetic acceptance covers an independently revoked/unmapped second candidate, reassigned snapshot/card/label/exposure rows, mismatched Observation candidate, incorrect record kind, and an existing alternate source version with internally consistent hashes. This second candidate is operator-provisioned solely for denial testing, not a claim of complete trusted import registration. Optional thesis refs are included when the fixture contains them.

Registration/source corruption and stale-feed cases exercise both adapters; provisioned other-owner requests fail without business writes. Real frozen synthetic input matches the legacy valid result. Existing full DB regressions/typecheck/lint/build pass after shared logic changes. Final alternate-source fixture enhancement is host-verified after the second audit.

Audit residuals: replay engine already recomputes digest(input.observation) against observation_sha256 (evaluator engine observation.js). Broader coordinated database/ledger rewrite remains outside this proof. Non-replay report receipt/event correspondence and preparation market-ID exposure accounting remain follow-up integrity/product work. Before S6 HTTP adoption, implement registered evaluator store/commit with machine session pre-lock/after-lock/post-work checks; distinguish internal preparation from browser disclosure. Operational provisioning, archive/index recovery, ledger/arm/anchor routes and live served-router acceptance remain open. Production stays hard-disabled.

## Evaluator session completion boundary

createS6Store retains session validation before and after the owner lock and now rechecks after DB-only work, before returning success. Work runs inside a savepoint: on SQL/business failure it rolls back that work, rechecks the session, then preserves the original error only if still authorized. Expired sessions suppress results/errors and the outer transaction rolls back. This is session hardening, not registered evaluator-store adoption.

Opus5.5 identified a test-order dependency and aborted-transaction recheck masking SQL errors; both fixed. Its third concern assumed session mutation had no owner lock: migrations20260922100000 and20260922102000 already install a blocking owner advisory-lock trigger for insert/update/delete. No new privilege or migration is needed. Local tests bound a concurrent revoker with100ms lock_timeout and verify55P03 under the held owner lock. The first attempted contention assertion incorrectly expected the separate REL owner_busy_retry policy; its run was stopped and evidence preserved before correcting the fixture.

Synthetic integration verifies a complete delayed evaluation rolls back on expiry (counts and observation revision unchanged), a fresh session retains the original outbox SQL error, an expired session suppresses that error, and refreshing the fixture credential allows the identical delayed commit. Final corrections are host-verified, not third-party re-reviewed. The1s session lifetime/2s delay fixture intentionally fails if it never reaches work; slow-runner timing remains a test limitation. Full registered read/market/commit and HTTP migration remain next.

## Registered evaluator store candidate

createRegisteredS6Store composes observation/market reads and evaluation commits with stored registration within the existing clean owner transaction. Market lookup resolves only its owner's observation ID before authorization; actual material reads bind that observation. Session checks retain pre-lock/in-lock/post-work validation. Savepoint rollback discards protected work on denial and the store always rethrows; this store does not expose a caller-owned transaction or claim that the outer transaction remains poisoned after savepoint recovery. Existing HTTP continues selecting createS6Store.

Opus5.5 found insufficient commit-specific rollback/isolation evidence and an idempotency lookup outside the authorized observation. Registered lookup is now observation-scoped. A collision with another observation's globally unique key fails at the database constraint and is sanitized by the guard, rather than returning its receipt or inspecting its body. Tests cover duplicate receipt, same-observation idempotency conflict, revision conflict, reassignment into a separately denied/unmapped candidate and restoration, invalid token, stale and source-identity denial. Delayed real evaluation insert tests verify feed/session expiry discards evaluation rows, ControlEvents/outbox and all observation-state fields, followed by a fresh delayed success. A shortened grant fixture failed earlier trust policy checks and is retained as failed evidence; this does not prove late grant expiry for the store.

Remaining release evidence explicitly includes a separately trusted registered second candidate/market, a consistently approved short-lived grant, registered consumer/commit contention, and actual Next S6 route/cache-control acceptance. The full existing DB suite covers legacy evaluator HTTP behavior but is not live Next router acceptance. Existing guard unknown-error sanitization differs from legacy errors and remains documented in the error contract. Final corrections host verified after audit; production ACLs, feed operations and HTTP adoption remain unimplemented.

## Two independently registered evaluator candidates

The local list acceptance now creates two approved packs, signed feeds, registrations and imported candidates, each with an actual agent Observation and two frozen synthetic markets. It verifies four distinct market IDs and stored evaluation input membership. Signed revocation of one feed is tested in the consumer's unmodified state (binding_revoked), then separately after an operator-reset fixture (grant_version_revoked). Both market reads, observation reads and duplicate commit of the denied candidate fail while the other candidate succeeds. Unaffected binding/feed/mapping rows are identical; complete evaluation/state/record/outbox/market snapshots remain unchanged by denied reads/retries.

Opus5.5 requested stronger collision controls, full market evidence and unmodified consumer-state acceptance; all were added. Both healthy/healthy and healthy/revoked cross-observation key collisions fail without returning a foreign receipt, then the same input with a fresh key commits. Database catalog and an actual23505 insertion prove the user/idempotency unique constraint. The application deliberately sanitizes the underlying error, so its exact SQL exception is not exposed to the test caller; positive controls establish that the input itself is valid. Global key uniqueness still permits distinguishing collision failure from success; no full key-existence indistinguishability claim is made.

Final fixture typing/outbox ordering fixes are host-verified after the audit. These are internal tokenless adapter tests, complementing earlier token tests. Late approved grant expiry, consumer-versus-commit contention, operational roles and S6 HTTP/UI acceptance remain open.

## Registered commit before consumer: database lock evidence

The two-candidate fixture now pauses a real registered evaluation insert behind a synthetic PostgreSQL advisory gate. It identifies that runtime backend's granted owner lock by the exact hash key, then observes an ungranted consumer lock on the same key. Releasing the gate permits evaluation commit before the consumer applies its signed page. Acceptance checks the evaluation, ControlEvent, observation revision, feed cursor and inbox; registered replay of that specific newly committed evaluation is denied after consumer revocation without exposure writes. No promise-resolution timing is used as a substitute for database serialization.

Opus5.5 requested protected setup/cleanup, stronger lock identity and the reverse ordering. Setup is inside cleanup protection; admin query/connection timeouts, a bounded settlement deadline and independent gate release/trigger removal limit hangs. Final local acceptance/typecheck/lint pass after host fixes. Snapshot equality before gate release establishes visibility only; the actual wait graph is the contention evidence.

The reverse case (consumer holds owner lock before a previously prepared commit queues) remains explicitly unverified for this registered store. Do not mark all consumer/commit contention complete. Late grant expiry also remains open: changing only binding.trustedConfig fails pack.js rights/grant equality before work, so a future fixture must issue and approve a consistently short-lived pack rather than mutate one copy. No production or route changes are part of this test batch.

## Consumer-first registered commit handoff

The reverse ordering is now exercised with the second real registered candidate: an inbox trigger pauses the signed consumer after it obtains the owner lock, then a previously prepared registered commit queues on that exact key. The fixture observes the consumer's granted owner lock, the runtime waiter and the still-blocked consumer, releases the inbox gate, and requires binding_revoked with complete business snapshots unchanged. Feed cursor/inbox/revoked state confirm the signed consumer actually completed. Both directions now have local deterministic lock-graph evidence; this is not production concurrency acceptance.

Opus5.5 found that revoking the second candidate invalidated the later pruning assertion, cleanup could mask assertion errors, and wait budgets approached the consumer statement timeout. Pruning now runs first. Shared cleanup attempts rollback/client release, pending settlement and trigger removal, preserving the body failure before cleanup errors. Three-second wait budgets sit below the30s admin query timeout, and consumer wait state is checked before release. Final synthetic acceptance/typecheck/lint pass after host corrections. No new migration, production flag or HTTP cutover.

Next remaining registered-store release evidence is a consistently issued/approved short-lived grant crossing expiry during actual commit. Session-scoped concurrency variations and production role provisioning remain separate; do not infer them from this internal tokenless fixture.

## Consistently approved grant expiry during commit

Two fresh synthetic packs receive their grant configuration before source/candidate builders run:60s for the slow success control and8s for the expiry case. Each is independently approved, registered, imported and used to create an agent observation with frozen markets. Both use the same9s insert delay. The imported grant deadline, trusted binding deadline, payload digest and approved manifest hash are checked for consistency. The test adds the revocation-reference extension before local operator approval, as existing registration fixtures do; it does not claim a production exporter or signed pack transport. Only revocation pages are signed here.

Opus5.5 found that elapsed time alone could hide a late business error and that snapshots were incomplete. Four synthetic non-transactional sequence witnesses now prove the evaluation insert, observation-state update, ControlEvent insert and outbox insert all executed in each case. The expiring case then returns exact grant_expired with every business row unchanged; the fresh case checks persisted evaluation/state/event/outbox. Complete binding/feed/mapping/inbox/candidate rows remain unchanged. Insert-time minimum remaining validity rejects setup overruns explicitly. The8s setup window can still fail on a sufficiently slow runner rather than silently weaken acceptance.

Final task passes isolated acceptance,typecheck/lint; final witness additions are host verified after the audit. The review's concern about post-build grant mutation does not apply: the grant is supplied before both builders, and the separate manifest extension is approved before binding insertion/import, never altered during the commit. Production transport/provisioning and S6 route/UI disclosure remain separate gates. Synthetic witness functions/sequences/triggers exist only in the disposable database and are removed after use.

## S6 browser read/replay dispatch

The observations POST route now dispatches only read/replay through registeredObservationReport. Actual exported Next handlers with signed local agent cookies are tested against disposable PostgreSQL for success/no-store/exposure, request authentication/origin denials, provisioned foreign-owner404, stale503, tombstone403 and malformed stored registration422/503/409 without writes. Production tests use valid production configuration, proper S6 POST bodies for all four actions, both S6-enabled states and both S4-enabled states; no Pool/Client connection is allowed. This is exported-handler acceptance, not a served Next router/browser test.

Opus5.5 found S6 lacked invalid_revocation_candidate/export_watermark_ahead status mappings. S6 now maps those to422/503 consistently with S4, and actual read/replay mutation tests assert bodies and no-store. Production request fixtures were strengthened accordingly.

The endpoint remains mixed-policy: prepare/evaluate still use legacy adapters. Characterization shows prepare and an exact evaluation retry still return200 under stale feed and a retained tombstone with its binding reset, even while read/replay deny. The test verifies no new business writes for that exact retry; it does not claim a new evaluation is guarded. This is an explicit remaining release blocker, not endpoint-wide revocation protection. Machine evaluator routes and other S6 helpers are also separate. Production remains hard-disabled. Next adopt registered evaluate/internal input and define exposure accounting for browser prepare, then cover served-router and UI behavior.

## S6 browser evaluate dispatch

The evaluate action now uses prepareRegisteredInput internally and createRegisteredS6Store for the authoritative commit. Only the receipt is returned; the full prepared material stays server-side. The store recomputes input and rechecks registration in its own owner transaction, so earlier preparation is not authorization to commit. Prepare metadata remains explicitly legacy pending exposure policy; machine routes remain separate.

Actual exported-handler acceptance covers a fresh delayed commit, exact duplicate,409 revision conflict, fresh and duplicate stale/tombstone attempts, and a feed that becomes stale during the real evaluation insert. The late503 rolls back evaluation/ledger counts and complete observation state; fresh delayed control succeeds. The cross-observation global key collision is deliberately sanitized503 revocation_check_unavailable (not500 or a foreign receipt); underlying global uniqueness and fresh-key controls are covered by the two-candidate fixture. No full key-existence indistinguishability claim is made.

Opus5.5 requested commit-stage route denial and collision evidence; both added. Its savepoint concern remains a documented composition boundary: the store owns the outer transaction, rolls back all protected work and always rethrows; it does not expose a callback that may catch and commit. Removing the savepoint would break expiry/error reauthorization after SQL failure, which has independent acceptance. An actual handler inter-transaction revocation injection for both fresh/duplicate requests remains follow-up evidence; existing registered-store consumer-first handoff does not substitute for a route-level timing test. Final additions host verified after audit. Production and prepare/machine/UI release gates remain unchanged.

## Browser preparation disclosure

prepare now uses a dedicated registered display adapter. It returns only asOf/revision/marketIds after validating the observation policy and each currently selected, observation-bound frozen market, and appends one ExposureEvent for the observation and returned market IDs in the same guarded transaction. Synthetic/V2/real-market policy is shared with input construction. The internal preparation helper is explicitly marked unsuitable for browser responses. All four actions on this observation endpoint now use registered access; machine routes and other S6 surfaces remain separate.

Opus5.5 identified real-policy parity, market validation evidence and weak exposure assertions. Added synthetic corruption tests for policy-blocked real-shaped observations, snapshot/raw/evidence digest changes and invalid evidence kinds with no-write denial. Exposure assertions bind exact displayed_at to returned asOf, enforce one event, verify revision, period, actor, source and artifact IDs, and shadow=false for the synthetic fixture. Fresh delayed prepare succeeds; stale during exposure returns503 and rolls back its ledger writes. Final fixes host verified.

Preparation lists the current market inventory, not a historical replay contract. Zero or fewer markets can legitimately precede freezing; it does not require two or compare against historical evaluation market IDs. A moved/absent market therefore leaves the current set, while replay and explicit evaluation inputs retain strict expected-observation checks. This distinction is intentional and is not historical completeness validation. Shadow-positive and served-router/UI cases remain separate acceptance work; no real-market flag is activated.


### 2026-10-05 synthetic CI clock correction

Linux run37284210835 at923dda1 failed registration acceptance with sanitized
`revocation_apply_failed` near the signed consumer handoff. Found event fixture
construction taking publication time before a separate effective-time read; a
millisecond rollover violates `effective_at <= published_at`. This is a probable
cause, not forensic proof of that run. Registration and both list handoffs now
share one database-sourced instant. Production verifier and freshness windows are
unchanged. Signed unit cases prove equality acceptance, later-event rejection
even when both timestamps are past, and isolated uppercase UUID rejection.
Opus5.5 challenged attribution and fixture coverage; disposition records both
corrections and remaining limits. Local and Linux validation are tracked in the
central osstack progress rather than treating a previous head as current green.


### Registered evaluator disclosure adapter (transport adoption pending)

`createRegisteredEvaluatorStore` requires a nonempty session and machine actor;
readObservation/readMarketSnapshot append ExposureEvent, audit and outbox in the
same registered owner transaction as the read. The exposure identifies exactly
the returned artifact, source subject and a non-bearer session digest. Repeated
reads append repeated exposures. The existing internal registered store remains
without disclosure writes. Purpose scopes remain owner-wide; machine identity
must never be treated as a human judgment. Owner-scoped market ID resolution is
trusted metadata lookup and does not promise existence indistinguishability.

Late feed/session expiry rolls the entire disclosure back. Savepoint recovery
is private to the store's outer transaction, always rethrows, and enables session
reauthorization after SQL errors. This is not a transaction sandbox for untrusted
callbacks. `evaluatorRpc` still uses the legacy adapter: transport acceptance,
bearer owner binding, production-route gating and shadow-positive tests remain
separate release gates; this addition enables no production capability.
