## Round-3 status

**P** = `docs/superpowers/plans/2026-11-06-macro-workbench.md` at `36e612c`.

| id | fixed? | gap |
|---|---|---|
| P1-1 | partial | SQL now fences the actual freshness/finalization effects and checks tokens before terminal state; cadence windows match `computeFreshness` (P:2430–2519). The new memory implementation lacks equivalent atomicity; see P2-1 below. |
| P1-2 | fixed | Service-only grants, admin `regimeOf`, and flag-gated snapshot reads agree (P:2628–2633, 4392, 10393–10421). |
| P2-1 | fixed | `native_usable` excludes rejected redeliveries and controls both collection paths’ derivation/publication/freshness gates (P:6140–6143, 6716–6734, 9005–9028). |
| P2-2 | fixed | Replay receipt statistics come from the persisted snapshot and regime (P:9969–9977). |
| P2-3 | fixed | Closed-item handling checks exact membership and terminal disposition under the item lock (P:2168–2180); concurrent acceptance/rejection cases are included. |
| P2-4 | partial | Fatal cron aborts explicitly finalize `failed`, fixing publication eligibility. The promised actual counts can still be lost; see P2-2 below. |

## Findings

No new P1 blockers found.

| id | severity | task/step | defect with evidence | prescribed fix |
|---|---|---|---|---|
| P2-1 | P2 | Task 3 Step 3 — memory adapter | **The new memory side-effect methods do not model SQL fencing atomically.** `recordFreshness` validates the token, then awaits unfenced `recordAttempt` before updating progress (P:4654–4665; landed `src/lib/dq/freshness.ts:39–49`). `finalizeBatch` likewise yields between validation and mutation (P:4644–4652). Reproduced by pausing A’s freshness upsert: B rotates the token and finishes, the next collection records an error, then A resumes successfully and overwrites that newer row—resetting its error count from 1 to 0. This is a test-double defect; the SQL implementation holds the run lock correctly. | Add macro-owned serialization matching the SQL run lock, covering token rotation/takeover, finish steps, finalization, and freshness through completion of their awaited mutations. Add barriers testing both an operation already holding the lock and an obsolete operation entering afterward. Keep `src/lib/dq/*` unchanged. |
| P2-2 | P2 | Tasks 6/7 Step 3 — fatal-abort accounting | **Failure finalization can persist an empty or incomplete receipt despite committed writes.** Cron assigns `counts=native` only after the entire native loop; derivation counts arrive only on successful return (P:6707–6728). Inside orchestration, committed outcomes accumulate in a local context that is discarded when linking throws (P:6139–6151, 6244–6247). Reproduced: first retrieval inserts two observations, second retrieval aborts during linking; HTTP 500 and batch `failed`, but all six stored counters are zero. A derivation abort similarly loses completed derived outcomes. | Update aggregate counts after every completed native receipt, and propagate partial counts/errors from an aborted `ingestEvidence` or `deriveAndWrite` call—e.g. on `IngestAbort`. Merge them exactly once before forced failure finalization. Test both native-loop and derivation aborts after real committed writes. |

## Verdict

**not ready**

Two bounded P2 corrections remain: memory/SQL concurrency parity and accurate fatal-abort receipts. The production fencing, judgment permissions, rejected-only gate, replay statistics, and quarantine closure fixes otherwise address round 3. Verification was read-only: 77 extracted cases passed in an in-memory harness, alongside targeted reproductions and TypeScript checks. PostgreSQL migration execution and the full repository suite were not run.