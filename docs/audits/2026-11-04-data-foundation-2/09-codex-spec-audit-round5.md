Read-only review; no files changed. “RESOLVED” means resolved in the [fifth-draft design](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md), not implementation-verified.

| # | status | note |
|---|---|---|
| R4-1 | RESOLVED | §4.5 marks runs abandoned before deleting facts and rejects abandonment of published runs. |
| R4-2 | RESOLVED | §§4.1/4.5 defer published-row changes until publication; abandonment leaves those rows unchanged. |
| R4-3 | PARTIAL | §5.3 preserves contested-group membership, but abandoned dispositions leave a recovery hole; R5-1 below. |
| R4-4 | PARTIAL | §§4.5/7.3 enforce publication, generation and durable selection eligibility; resolution before publication still lacks a complete lifecycle, R5-3. |
| R4-5 | RESOLVED | §§4.6/6.1/8 use a scalar envelope and reject truncated internal input. |
| R4-6 | PARTIAL | §§4.5/8 correctly serialize revision increments and replacement checks; exposing that revision through the public invoker conflicts with §4.7, R5-2. |
| R4-7 | RESOLVED | §§4.5/4.7 provide lease-independent reconciliation and explicit, bounded linking permissions. |
| N14 | RESOLVED | §8 excludes the previously demonstrated revised/unrevised operand pair; “unrevised” remains an observed-history test, subject to source completeness. |

Only new defects in the fifth-draft mechanisms:

**R5-1 · P1 — Abandonment loses the disposition needed by the persistent contested group.**  
**§§4.5, 5.3, 6.1 steps 7–8, 7.1.** Publish A=10; stage conflicting B=20, create the open conflict item, and record A’s pending disposition; abandon B’s run. A correctly remains `ok`, but the conflict item remains open. On retry, B receives a new fact ID and enters §5.3 branch 1: quarantine B and merge its ID. That branch does not recreate A’s disposition. Publication therefore leaves A publicly selected despite a published conflicting B and an unresolved group, contradicting the promised fallback to an earlier date. **Fix:** when publishing a contested group, account for every still-`ok` member, including dispositions originating in abandoned runs; test this exact retry sequence.

**R5-2 · P1 — Public `read_facts` cannot read its new revision token under the specified permissions.**  
**§§4.6–4.7, 9, 11.2.** The function is `security invoker`, called by `anon`, and now reads `fact_sync_scope.state_rev`; §4.7 makes that table service-role-only. Granting function execution does not grant access to its underlying tables: invoker functions execute with caller privileges. [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createfunction.html) Thus the stated public read contract and permission test cannot both pass as specified. **Fix:** provide a narrowly authorized revision accessor or separate public revision projection, preserving the single snapshot and keeping scheduling/private scope fields inaccessible.

**R5-3 · P2 — Resolving a conflict before its pending dispositions execute can strand the chosen fact.**  
**§§4.5, 6.1 steps 7–8, 7.3.** After creating the conflict item but before publishing B, an administrator can accept existing A. Persisting `chosen_fact_ids=[A]` succeeds; promotion skips A because it is already `ok`. Publication subsequently executes the pending disposition and quarantines A. The resolution hook may already be `done`, so its retry path does not restore the chosen row. The landed resolver in `src/lib/dq/quarantine.ts` has no run-publication gate. **Fix:** defer resolution while contributing runs are staged, or reconcile persisted decisions atomically during publication and schedule the required promotion/materialization.

External semantics remain unverified: Tushare revision retention, announcement dates and pagination, and cninfo correction-document identity still require recorded provider checks. In particular, no observed value change does not prove complete, economically compatible history; this uncertainty is not a new deterministic P1 finding.

**Final verdict: not ready for an implementation plan—the blocking items are R5-1 and R5-2; owner decisions A/B/C remain pending.**