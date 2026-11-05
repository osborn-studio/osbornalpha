Read-only static review; no PostgreSQL or full test execution.

| Residual | Status | Assessment |
|---|---|---|
| #5 | **RESOLVED** | Task 10, Step 1: independent `attempts` counter removes the self-referencing mock initializer. |
| #13 | **RESOLVED** | Task 8, Steps 2/6: explicit selection no longer slices by `limit`; regression assertion covers two requested issuers with `limit:1`. |
| #19 | **PARTIAL** | Task 11, Step 2: readiness and expanded replay are enforced, but newly added fixture issuers are not fully provisioned; see N3. |
| #21 | **RESOLVED** | Task 8, Steps 2/6: an interrupted, already-started request persists its attempt; insufficient budget before starting does not. |
| N1 | **RESOLVED** | Task 8, Step 2: explicit `CoverageEntry[]` annotation removes incompatible inferred optional keys. |
| N2 | **RESOLVED** | Task 11, Step 2; Task 13, Step 7: matrix checks count concepts within each period, requiring two qualifying periods per issuer. |

**New draft-3 defect:**

**N3 — P1: expanded US replay can fail during setup.** Task 11, Step 2 derives fixtures and ingestion from expanded `CIK`, but `beforeAll` still inserts only AAPL/MSFT into `stocks_universe`. Following Task 18, Step 2, runbook §8.11-6 to add a recorded US issuer whose ticker is absent from that table makes the subsequent `issuer_securities` insert fail its [foreign key](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/supabase/migrations/20261105091000_issuers.sql:72); `ON CONFLICT DO NOTHING` does not suppress FK violations. Seed `stocks_universe` from every `CIK` entry before inserting securities so Task 11, Step 5 can pass with the expanded golden set.

**Verdict: not ready for execution by implementer agents until Task 11, Step 2 provisions `stocks_universe` for every added fixture issuer.**