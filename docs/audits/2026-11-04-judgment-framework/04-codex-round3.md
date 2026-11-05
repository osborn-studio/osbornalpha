Read-only review; no files changed or tests run. Section references below refer to the third-draft F4 spec unless stated otherwise. “RESOLVED” means resolved in the design, not verified in implementation.

| Round-2 finding | Status | Assessment |
|---|---|---|
| G01 | RESOLVED | §§8.1–8.5 gate the displayed raw probability on raw holdout ECE and Brier skill. |
| G02 | RESOLVED | §§11.1–12.1 consistently define a same-reference-period nowcast revision test using the same classifier; upstream interface changes remain explicit dependencies. |
| G03 | RESOLVED | §§3.5, 6.2 require public-path constructors and snapshot verification; settlement evidence follows the same admission rule. |
| G04 | RESOLVED | §7.4 defaults adjustment capabilities to unverified and requires recorded verification before use. |
| G05 | RESOLVED | §7.5 explicitly changes `accounted()` and normalizes omitted `deferred` to zero. |
| G06 | PARTIAL | §5.6 fixes public RPC authorization and envelopes, but revokes all service-role privileges without restoring SELECT on judgments/settlements; §§5.7, 6.2 still require those reads. |
| G07 | RESOLVED | §5.5 permits score-specific `evaluated` and separates other kinds’ states. |
| G08 | DECLINED-ACCEPTABLE | §3.4 explicitly substitutes `first_observed` and discloses scheduling dependence; it no longer promises first release. |
| G09 | RESOLVED | §§5.4, 7.2 define availability-based cutoff eligibility and terminal handling of expired inconsistencies. |
| G10 | PARTIAL | Fencing and concurrency outcomes are specified, but §5.6 checks persisted `request_key` without any storage field/table in §§5.3–5.4; durable idempotent replay remains unspecified. |
| G11 | RESOLVED | §5.6 removes direct writes and makes registration/queue and settlement/queue changes transactional RPC operations. |
| G12 | PARTIAL | §7.6 fixes price overrides; `choose_fact` still freezes only candidate IDs/key/value, without the complete derivation inputs and availability evidence needed to construct and replay `Resolved` without rereading. |
| G13 | RESOLVED | §§3.3, 7.3, 12.2 specify full keys, reject truncation, remove nonexistent status checks, and require cutoff derivation. |
| G14 | RESOLVED | §3.4 adds method-level target resolution, calendar months, and frozen multi-quarter extrapolation. |
| G15 | RESOLVED | §§3.4, 6.2 remove the one-day backfill allowance and explicitly exclude already-mature or available labels. |
| G16 | RESOLVED | §§5.7, 7.3–7.4 require frozen-source range reads, pagination, exact base matching, and benchmark date alignment. |
| G17 | RESOLVED | §8.2 replaces connected components with deterministic non-overlapping selection. |
| G18 | RESOLVED | §§8.1–8.4 apply selection to inference and holdout separation, add majority-class comparison and interval width checks; non-overlap itself is not proof of statistical independence. |
| G19 | PARTIAL | Cohort evidence and expiry are added, but invalidation is unsafe (new defect N2); a report computed across a concurrent withdrawal can also publish after that withdrawal invalidated only the previously latest report. |
| G20 | PARTIAL | §4.1’s dependency lint excludes shared modules inside `src/lib/judgments/`; §§3.5, 12.2 still require external fact reads for replay, and §7.3 does not freeze complete fact derivation rows. |
| G21 | PARTIAL | §6.2 now compares producer and kind, but explicitly excludes `settle_after/by` as runtime metadata although §3.4 derives them from fixed semantic inputs; persisted deadlines are never compared or revalidated. |
| G22 | PARTIAL | Registration-time filtering is fixed; historical method state is not reconstructible (N3), and history/cohort RPC signatures still lack historical cutoff arguments. |
| G23 | PARTIAL | §9.4 checks both lifecycles and parameters, but equal parameters do not establish equal events: a thesis predicate `return > 10%` can still be paired with sign-based up/down scenarios. |
| G24 | RESOLVED | §11.2 supplies pending-fill serialization, withdrawal priority, private replay, and the security-market join. |
| G25 | PARTIAL | §7.1 scans superseded snapshots, but §§6.4, 11.1 pass only subject/as-of to `produce/gather`; there is no binding to the scanned snapshot ID, so two snapshots with the same region/date cannot reliably be recovered separately. |
| G26 | PARTIAL | Deadlines and recovery improve, but §8.3 resumes only between whole method/scope units; one oversized cohort can repeatedly exhaust the budget without making progress. |
| G27 | PARTIAL | Origin and close-only requirements improve; the new publication gate is bypassable through direct table access (N1). |
| G28 | RESOLVED | §§8.1, 11.1 define percentage-point margins and explicitly require the upstream unit correction. |
| G29 | RESOLVED | §§7.3, 11.1 remove the second axis classifier and inherit the upstream classifier’s mixed-frequency and coverage rules. |
| G30 | RESOLVED | §§3.3, 4.3, 18.1 explicitly classify asset-pair support as unimplemented. |
| G31 | RESOLVED | §11.2 correctly limits the ID claim to domain separation, with session-based authorization. |
| G32 | RESOLVED | §§5.3, 14.3, 15 consistently use settled-only outcomes and the corrected sequence numbers. |

New blockers introduced by the third draft:

| Severity | Section | Issue | Fix |
|---|---|---|---|
| **P1 — N1** | §§3.5, 4.1, 5.6, 10 | **The new publication gate protects cards but publishes the underlying evidence.** Unconfirmed-license inputs may be registered under `publishable=false`, while anon receives SELECT with `USING (true)` on judgments, settlements, and calibrations. Direct table reads expose those frozen inputs and evidence regardless of the card filter; `calibration_cohort` also lacks that filter. This defeats the draft’s explicit publication prerequisite. | Enforce publication eligibility at the database read boundary, including settlements, calibration samples, and referenced judgments; provide separate privileged internal reads. |
| **P1 — N2** | §§5.6–5.7, 8.3, 9.1 | **The new invalidation store is incompatible with landed freshness behavior.** `recordAttempt()` replaces `detail` wholesale with `input.detail ?? {}` ([freshness.ts:48](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/src/lib/dq/freshness.ts:48)). A heartbeat or cursor update can erase `invalidated[]`, restoring a withdrawn sample’s old calibrated report. Moreover, the stipulated anon read path cannot read service-only `dq_freshness`. | Store a durable per-method invalidation revision with atomic updates; bind reports to that revision and reject stale publication. Expose only the validity result through an authorized read interface. |
| **P1 — N3** | §§5.1, 10 | **Historical method lookup uses a mutable timestamp as version history.** Resynchronizing an existing method updates `synced_at`; an earlier `as_known` query then excludes a method that existed at that time. Previous `status/publishable` values are overwritten as well. The resulting historical public page is deterministically wrong after a routine sync. | Separate immutable creation time from sync time and append method-state events; resolve historical state at the requested cutoff, while applying current publication restrictions separately. |

External-semantics uncertainty remains explicit: this review does **not** establish provider adjustment correctness, historical range completeness, source licensing, hosted PostgREST limits, Vercel duration entitlement, or migration-owner privileges. Those require the specified implementation/deployment evidence; none of N1–N3 depends on assuming those external behaviors.

**Verdict: Not ready for an implementation plan: fix N1–N3 and close the remaining permission, idempotency, replay-evidence, deadline-consistency, historical-read, event-binding, snapshot-binding, and calibration-resumption gaps identified in the PARTIAL rows.**