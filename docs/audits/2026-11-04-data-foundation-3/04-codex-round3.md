Read-only review completed; no files changed or tests executed. References below are to plan 3 unless otherwise identified. “Round-2 findings” means **M1–M28**; remaining defects from those findings stay in the first table.

| Finding | Status | Assessment |
|---|---|---|
| M1 | RESOLVED | §3 limits legacy backfills to column introduction and requires replay after new evidence is written. |
| M2 | RESOLVED | §§3.1, 4.2.1, 7.1 establish a shared payload schema, SQL validation, and amendment path. |
| M3 | RESOLVED | §§3.1, 4.2.1 require issuer binding, active targets, operation/type validation, and exactly one mutation; legacy claims are non-executable. |
| M4 | RESOLVED | §§4.2.1, 4.3.3 make SEC-form claims evidence-only until a reviewer supplies the security and effective date. |
| M5 | RESOLVED | §4.2.1 adds guarded corrections and operation/target-aware deduplication. |
| M6 | RESOLVED | §§3.1–3.2, 4.2.1 specify fixed search paths, static branches, required attachment sources, and atomic sanitized provenance. |
| M7 | RESOLVED | §4.1.2 groups missing-composite results by venue FIGI and treats multiple groups as ambiguous. |
| M8 | PARTIAL | §§3.2, 4.6 protect rule evaluation with `p_expected_rev` and define administrative runs; explicit item/candidate/filing/batch issuer-and-market binding remains unspecified. |
| M9 | RESOLVED | §§3.2, 4.6 persist adoption identifiers and pending materialization inside the transaction, with recovery and explicit dispatch. |
| M10 | RESOLVED | §3.2 preserves single-issuer behavior and confines conflict suppression to cross-issuer `ok` rows. |
| M11 | PARTIAL | §§3.1–3.2 add shared locks, but do not close the landed direct topology-write path or cover referrer repointing; see R3 below. |
| M12 | RESOLVED | §§3.2, 4.4 define vector backfill, the compatibility wrapper, adapter methods, target materialization, and read-time staleness detection. |
| M13 | PARTIAL | §§3.2, 4.4 add atomic resolution and durable exclusions; locks cover payload issuers, not necessarily every current lineage member or the target, so the final lineage-wide survivor check is not fully protected. |
| M14 | PARTIAL | §5.4 improves announcement/report-type binding, but still uses `read_facts`; plan 2 §4.6 filters to active generations even with `history:true`, so it is not the requested unrestricted evidence reader. |
| M15 | PARTIAL | §§5.3–5.4 fix DB-status dependence and CN completeness; US expectations still come from the same companyfacts adapter being evaluated, so adapter omissions can shrink expectations while the four-key minimum passes. |
| M16 | RESOLVED | §5.3 stores natural keys and resolves environment-local fact IDs, with explicit missing outcomes. |
| M17 | RESOLVED | §3.1 separates numeric from text/date operands and preserves existing rows as legacy outcomes. |
| M18 | PARTIAL | §§5.2–5.4 improve parser rejection and exact arithmetic; rounding-to-nearest remains assumed, and excluding deeper uncertainty does not establish that assumption for automatic quarantine. |
| M19 | PARTIAL | §§3.2, 5.6 add restoration and retry work, but both hashes are updated together by the runner: equality does not detect an input/version change before the next run; restoration also introduces R1 below. |
| M20 | PARTIAL | §§3.1, 5.5 persist cycles and leases, but lack atomic enforcement of one running cycle per pair and ownership checks when completing reclaimed work. |
| M21 | PARTIAL | Weekly cadence and outcome counters improve; cycle success can still contradict failed results (R2), and §6.2 requires a single full-range run even when the budget requires continuation. |
| M22 | RESOLVED | §§3.1, 6.1 separate deadline knowledge from disclosure state and add metadata. |
| M23 | RESOLVED | §6.1 requires published ingestion, distinguishes unavailable upstream data, and includes historical-page lookup. |
| M24 | PARTIAL | §6.1 fixes SRC-only and estimated-period treatment, but the new 15-month retrospective window still treats today’s category as historical evidence without establishing its effective period. |
| M25 | PARTIAL | §4.3.4 improves acquisition checks and recovery, but two observed absences plus submissions absence still do not establish `first_missing_as_of` as the effective ownership boundary or identify the replacement class. |
| M26 | RESOLVED | §§1.1, 10, 13 make denominators, conditional examples, and owner handling of unmet coverage explicit. |
| M27 | RESOLVED | §§3.1, 4.3.2, 5.4, 13 add retained evidence, copied window inputs, PDF storage, upload-failure handling, role tests, and an explicit export-authorization decision. |
| M28 | RESOLVED | §§3.1, 6.2, 7 add issuer/market profile keys, both market schedules, and no-rule rows in the API. |

The following are **new blocking failure paths introduced by the third-draft fixes**, rather than repetitions of the outstanding findings above.

| Severity | Section | Issue | Fix |
|---|---|---|---|
| **P1 — R1** | §§3.2, 5.6: `restore_reconciled`, added promotion eligibility | **Restoration blocks itself.** The function requires an open reconciliation item, then promotes under rules that expressly reject facts referenced by an open `reconcile_mismatch`, and only afterward resolves the item. Thus even a passing reconciliation cannot restore its fact; an accepted item can accompany zero restored rows. Plan 2 §4.5 explicitly resolves the item **before** checking promotion eligibility to avoid this problem. | Under the same transaction and locks, validate the current passing evidence, resolve this item, then promote while retaining all other quarantine checks; return explicit promoted/skipped results. |
| **P1 — R2** | §5.5: cursor completion and freshness | **A cycle containing only missing/unsupported results can report success.** Such results increment batch `failed`, but are normal result rows, not exceptions. The cursor becomes `done`; all-done cursors yield `complete`, which records `ok:true`. The new cycle summary therefore contradicts the failed comparison results and can advertise successful reconciliation when no comparison succeeded. | Persist comparison-failure counts separately from execution/retry state; derive cycle outcome from all member results, and prohibit success freshness for incomplete comparisons. |
| **P1 — R3** | §§3.1–3.2, 4.4: `set_merge`; plan 1 merge lifecycle | **The replacement merge API cannot perform required referrer repointing.** After A→B, merging B→C requires repointing A first: the landed `issuers_merge_target_active` trigger rejects retiring B while A references it. But `set_merge(A,C)` updates only `status='active'`, so merged A is untouched; it also lacks a one-row assertion. Retaining direct SQL repointing bypasses the newly promised topology-lock/revision protocol. | Provide transactional referrer repointing under locks for all affected old/new lineages, bump affected revisions, enforce affected-row counts, and prevent topology writes from bypassing that protocol. Test A→B followed by B→C. |

R3 is grounded in the landed [merge trigger](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/supabase/migrations/20261105091000_issuers.sql:48), which explicitly requires referrers to be repointed before retiring their target.

**External-semantics uncertainty:** This review does not independently establish current OpenFIGI/HKEX/GLEIF response shapes or coverage, Tushare announcement-link and rounding semantics, SEC category effectivity, company-specific ownership dates, or fiscal-calendar matching accuracy; §14’s verification tasks remain open, and owner approval cannot substitute for evidence of those facts.

**Verdict: not ready for an implementation plan—blocking items remain in restoration/current-evidence validation, lineage topology and conflict locking, candidate scope binding, evidence-reader and expected-key completeness, cycle success accounting, and unsupported historical deadline/ownership assertions, alongside R1–R3 above.**