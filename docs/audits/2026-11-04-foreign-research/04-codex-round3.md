Static, read-only review; no files changed or tests run. Section references below are to the third-draft foreign-research spec unless otherwise identified. “RESOLVED” means resolved in the design, not verified in implementation.

**1. Round-2 findings**

| Finding | Status | Assessment |
|---|---|---|
| FR2-01 | RESOLVED | §§4, 4.11, 4.13 inline the licence predicate and prohibit view calls to restricted functions; implement citation value selection inline too. |
| FR2-02 | RESOLVED | §4.4 separates draft edits from the locked publication transition and rejects simultaneous content changes. |
| FR2-03 | PARTIAL | §§4.8, 6.3 bind receipts to evidence hashes and hide drift, but the hash excludes rule inputs such as resolution overrides, institution bindings and selected mappings; changing those can reuse a passing receipt. Require a hash of **all rule inputs**, and acquire the parent lock before child mutations. |
| FR2-04 | PARTIAL | §4.11 gates report views, but explicitly exposes institution/scale views as “full table,” contradicting the requirement that **all** public views return zero rows while disabled. Gate those views too. |
| FR2-05 | RESOLVED | §§4.4–4.5, 6.3 permit incomplete drafts and distinguish candidate from effective targets. |
| FR2-06 | RESOLVED | §4.6 binds human spans to parse artifacts and explicitly exempts absence attestations from verbatim validation. |
| FR2-07 | PARTIAL | §§4.6, 5.3 add typed payloads and currency evidence, but `corrected_* ?? value_*` still cannot represent an intentional null correction; omitted versus cleared components need distinct semantics. |
| FR2-08 | RESOLVED | §§4.5, 5.4 distinguish issuer count from security count and provide provisional target keys. |
| FR2-09 | RESOLVED | §4.4 excludes `review_not_approved` from review eligibility. |
| FR2-10 | RESOLVED | §§4.1, 4.3, 6.2 require current confirmed processing authorization and record its version. |
| FR2-11 | PARTIAL | §§4.4(15), 4.11 check original titles only when no rewrite exists; `title_public`, translations and title citation values remain escape paths. Changing an analyst’s `public_display` also does not invalidate previously approved prose. Check every exposed text surface against current disclosure inputs. |
| FR2-12 | RESOLVED | §6.1 eliminates the destructive shared-object deletion race by deleting only intent-owned staging objects; general commit recovery remains incomplete, as noted below. |
| FR2-13 | PARTIAL | §§4.2, 6.2 add reparse transitions and takeover fencing, but finalization checks only token equality—not expiry—and candidate insertion/materialization are not explicitly fenced. An expired worker can still mutate report data. |
| FR2-14 | PARTIAL | §4.8 snapshots report/field/target values, but retains only snippet/summary IDs; those rows can change after unpublish. Snapshot their content and provenance, or make their versions immutable. |
| FR2-15 | PARTIAL | §6.3 fixes SQL/TypeScript/F4 execution boundaries. §7.3 still uses destructive compensation: loser B overwrites winner A’s override, then deletes B’s row, losing A’s accepted override while potentially retaining B’s materialization. Resolve quarantine, persist overrides and materialize in one database transaction. |
| FR2-16 | PARTIAL | §§10.2, 11.2 add lifecycle events, but target-view row existence does not establish target-price permission—the row remains with null target values. Eligibility must require the current publication and permitted target disclosure; see also new outbox defect below. |
| FR2-17 | RESOLVED | §§4.9, 4.11 correctly exclude referenced predecessors and allow audited validity closure. |
| FR2-18 | PARTIAL | §10.3 fixes the unsupported classification and retains both series; aligned-date, missing-series, zero-divisor and rounding behavior remain undefined. |
| FR2-19 | RESOLVED | §§12.4, 14 move evaluation support earlier and separate synthetic testing/private preview from production gold eligibility. |
| FR2-20 | PARTIAL | §6.2 fixes parse outcomes, but rule quarantine alone still yields `success` in landed `batchStatusFromCounts`, contrary to §13’s `partial`; explicitly supply a non-information error and initialize all six counters. |
| FR2-21 | PARTIAL | §§6.2, 8.3, 15 add owners and budgets, but failed verification never advances its cursor and can starve later documents. The accepted freshness rationale is inaccurate: landed `recordAttempt` also maintains error streaks and last-success state, which concurrent writes can lose. F3/F4 contract signoff remains undefined. |
| FR2-22 | RESOLVED | §§7.1, 8.3, 12.1, 14 consistently use R1–R10 and FR-5 for verification. |

The following **inherited blockers in round 2’s Table A** also remain; they are not new third-draft findings:

| Finding | Status | Remaining blocker |
|---|---|---|
| FR-04 | DECLINED-NOT-ACCEPTABLE | §§4.4(13), 4.10 omit extraction implementation identity and approved corpus identity from eligibility. The disposition’s assertion that the five-tuple determines behavior is unsupported: typed conversion, chunk merging and ticker parsing can change independently. Bind receipts to a behavior digest and approved corpus version; unrelated deployments need not force reevaluation. |
| FR-14 | PARTIAL | §10.3 still labels a report uploaded after the baseline close on the same exchange date non-retrospective. Compare availability with the actual baseline observation time. |
| FR-15 | PARTIAL | §6.1 cannot resume an intent stranded in `validating`; after `move`, its staging object is gone, yet retry requires that object and the `open→validating` transition. Define durable promotion checkpoints and recovery. |
| FR-25 | PARTIAL | §6.4’s number-plus-keyword test still accepts “B’s target is 100” using A’s target of 100, or a sentence containing both a supported target and unsupported revenue of 100. Bind each numeric assertion to its target, metric, unit and evidence. |

**2. New blocking defects introduced by the third draft**

| Severity | Section | Issue | Fix |
|---|---|---|---|
| P1 — FR3-01 | §§4.4(14), 4.7, 6.3(4) | **Summary hashes have incompatible definitions.** Approval requires `input_hash = effective_hash ‖ artifact_hash`; publication compares it with `effective_hash` alone. A correctly approved summary therefore blocks publication, and unchanged materialization can demote it. | Define one canonical summary-input digest and use it consistently for generation, approval, invalidation and publication. |
| P1 — FR3-02 | §6.2; §§4.6, 5.2 | **The new chunk merge discards distinct evidence.** “Same field, highest confidence” conflates different targets and analyst occurrences, and silently chooses between conflicting values. This can produce incomplete or wrongly associated public metadata despite apparently successful extraction. | Merge by stable target/field/occurrence identity; retain competing evidence and require explicit conflict resolution rather than confidence-based replacement. |
| P1 — FR3-03 | §§10.2, 11.2 | **Register and retract reuse an endpoint-wide idempotency key.** Registration uses `broker_target_price:${publication_id}:${target_key}`; retraction sends that same key, while the consumer deduplicates by `idempotency_key`. A conforming consumer can treat retraction as the already-accepted registration, leaving the claim active. | Separate stable claim identity from unique event identity; deduplicate by event ID and define per-claim ordering/version checks, including retract-before-register delivery. |

**External-semantics uncertainty:** No live Storage, F3, F4, provider or deployment checks were performed. Storage move/overwrite behavior, parser determinism, adjustment coverage and deployed limits remain unverified. The sibling F4 spec §11.2 explicitly defers sell-side registration pending visibility/ownership support; the proposed claims endpoint is therefore a requested integration contract, not an established capability.

**Verdict:** Not ready for an implementation plan: blocking gaps remain in publication/input validity, disclosure and claim eligibility, evidence preservation, atomic quarantine resolution, upload recovery, evaluation identity, numeric grounding and availability classification, plus FR3-01–03.