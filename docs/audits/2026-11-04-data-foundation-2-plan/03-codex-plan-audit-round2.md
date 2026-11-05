**Not ready yet: 20 round-1 findings are resolved; 4 are partial.** “Resolved” below means the proposed implementation addresses the finding—not that its PostgreSQL/runtime gates have been executed.

| # | Status | Draft-2 assessment — task/step |
|---|---|---|
| 1 | RESOLVED | T1 S4: explicit comparison covers immutable base columns and excludes generated `value_text`. |
| 2 | RESOLVED | T1 S4: membership is rebuilt after scope/item locking; T1 S1 adds the concurrent-merge regression case. |
| 3 | RESOLVED | T1 S4; T2 S5: promotion now blocks on open disputes matching K/date, independently of membership. |
| 4 | RESOLVED | T4 S4; T10 S4; T12 S8: concept catalogue parameters consistently accept readonly arrays. |
| 5 | **PARTIAL** | T10 S1: corrected callable signatures still leave the self-referencing `fetch` initializer with **TS7022/TS7024**, blocking T10 S10. Give the mock or callback an explicit type. |
| 6 | RESOLVED | T2 S4: unused ESLint suppression removed. |
| 7 | RESOLVED | T2 S4–5; T3 S4: complete-set reads paginate or remove implicit limits; ordering and formula filtering are retained. |
| 8 | RESOLVED | T13 S3: annual matching rejects `半年` titles; negative tests added. |
| 9 | RESOLVED | T8 S6: parser quarantine processing precedes the empty-result return. |
| 10 | RESOLVED | T1 S4; T2 S5: staged anchor runs now prevent zero-member resolution. |
| 11 | RESOLVED | T8 S6: publication tracking prevents materialization/abort failures from abandoning published runs. |
| 12 | RESOLVED | T8 S6; T17 S3: coverage and parser skip summaries reach receipts; the new regression test has a separate defect below. |
| 13 | **PARTIAL** | T8 S6: direct selection and missing-scope construction work, but `issuerIds.slice(0, opts.limit)` silently drops remaining explicitly requested issuers without outcomes. Reject excess input or report/process every requested issuer. |
| 14 | RESOLVED | T7 S1/S3: non-OK rows no longer participate in sequences/current selection. |
| 15 | RESOLVED | T11 S2: revised fixture remains active and subsequent runs use `activeGen`. |
| 16 | RESOLVED | T13 S7: the conflict uses a distinct type-4 filing; same-filing deduplication is tested separately. |
| 17 | RESOLVED | T8 S2; T12 S6; T15 S1; T16 S1: all four fixture/assertion corrections are present. |
| 18 | RESOLVED | T10 S6/S8–9: revision selection checks exact dates and base value. |
| 19 | **PARTIAL** | T11 S1–2; T18 S5: zero-human-assertion success is prevented by default, but two recorded US entries with `ready:false` still pass without the required matrix; see additional matrix defect below. |
| 20 | RESOLVED | Execution-order table; T15 S5; T11 S2: integration work moved out of T15, eliminating the circular dependency. |
| 21 | **PARTIAL** | T8 S6: ordinary thrown requests increment attempts, but cancellation **during** an already-started request still bypasses persistence; T8 S2 explicitly tests that exception despite describing cancellation before the request. |
| 22 | RESOLVED | T14 S3; T17 S3: exported landed validity predicate includes future-ended ownership. |
| 23 | RESOLVED | T14 S1: the memory database clock is frozen consistently with due-query dates. |
| 24 | RESOLVED | T18 S2, runbook §8.10: helper functions precede table drops; remaining objects are inventoried. |

Two new defects in the specified draft-2 changes:

| ID | Severity | Task/step | Defect and correction |
|---|---|---|---|
| N1 | **P1** | **T8 S2; gate S8** | The new `coverageCn` mock returns heterogeneous `years` objects. TypeScript infers optional keys with `undefined`, incompatible with `Record<string, number>`, producing **TS2322**. Explicitly annotate the callback return as `CoverageEntry[]` or type the fixture array. [Code location](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:4598) |
| N2 | **P2** | **T11 S2; T18 S5** | Even with `ready:true`, the new matrix check counts distinct periods and concepts **independently per issuer**. Five concepts in period A plus one in period B passes, although neither period has six concepts. Validate at least six concepts **within each of at least two periods**, for each required issuer. [Code location](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6383) |

For remaining **#19**, extending `CIK`/`FIX` as instructed also needs an ingestion change: T11 S2 provisions every listed issuer, but replay calls ingest only AAPL/MSFT; additional US golden issuers therefore have no facts to assert. The completion gate must require `ready:true`, ingest every asserted fixture-backed issuer, and enforce the per-period matrix.

I found no additional definite defect in the explicit trigger comparison, locked membership rebuild, K/date blocking, `fact_item_members` permissions, `pageAll` mechanics, reordered module dependencies, or `isCurrentSecurity` export.

Verification was read-only: an in-memory TypeScript overlay incorporating the planned landed-file additions confirmed both compiler failures; PostgreSQL, full Vitest, and recorded-fixture execution were not run.

**Verdict: not ready for execution by implementer agents until the two compiler failures, explicit-issuer omission, incomplete golden completion/replay/matrix gates, and started-request attempt-accounting exception are corrected.**