Audited `8cf3215` read-only, limited to R1–R3 and the specified diff. SQL interleavings were inspected, not executed.

**R verification**

| Item | Status | Verification |
|---|---|---|
| R1 | RESOLVED | Merge acquires the cycle advisory lock before scope/issuer locks (`plan:9508–9515`). New regression covers nonempty cycles in both orders (`10412–10444`). |
| R2 | RESOLVED | Setter locks the security row and atomically merges one provenance key; apply uses the RPC (`2431–2455`, `5421–5432`). Concurrent writes and claim-resolution interleavings are covered. |
| R3 | RESOLVED | Pending dates determine `coverFrom`; production and script entry points forward it, including Task 14c. Mismatch evidence retains the historical page/hash (`13738–13770`, `13831`, `13918`, `16781`). |

**Findings**

| # | Severity | Task/Step | Finding | Prescribed fix |
|---|---|---|---|---|
| V1 | P2 | Task 12 Step 1, acceptance test | New assertion `submissions.mock.calls[1][2]` (`plan:13588`) cannot typecheck: `submissions` is declared as `vi.fn(async()=>snap)`, so each recorded call has tuple type `[]`. Reproduced with installed TypeScript 5.9.3: **TS2493**, no element at index `2`. This blocks the required typecheck. | Give the mock its three parameter types, e.g. `vi.fn(async (_c:string, _b:Budget, _coverFrom:string)=>snap)`, then rerun typecheck. |

Verdict: not ready — the new coverFrom test introduces a confirmed TypeScript compile blocker