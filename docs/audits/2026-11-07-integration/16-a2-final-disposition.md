# PR A2 (judgments→macro, F4 side) — final disposition (commander, 2026-11-07)
Rounds: 09 (11 P1) → Codex fixes 1–5 (PG17 failures found by the commander: pg Date parsing, publish seeding, late-receipt date, stored-evidence metadata, replay-window refs) → 15 re-audit. PG17 `src/lib/judgments/integration/macro-bridge.integration.test.ts` 1/1.
| ID | Disposition | Evidence |
|---|---|---|
| A2-01/03/07/11 | Accepted residual | CI has no PostgREST/Next server. The suite uses pg-backed implementations of the same `MacroDb`/`JudgmentInputsDb`/judgments-DB interfaces; eligibility goes through the production `selectEligibleHistoryAsOf`; the real `GET /api/judgments/[id]` handler runs over F4's PG port. |
| A2-04 | Reject | The test runs the macro_regime@v1 definition object with only id/publishable overridden and asserts equal formula hashes after normalising the id — the classification/resolution code is identical. |
| A2-09 | Reject | Stored evidence ⊇ resolver evidence, plus `observed_at` = settle `now` and `label_available_at` ≤ cutoff asserted explicitly (settleOne adds those two fields). |
| A2-10 | Reject | The late vintage is finalized after the cutoff (macro_finalize_batch = greatest(p_finished_at, started_at)); stored US_CPI_YOY refs for 2026-09-30 are all vintage 1 and a later cutoff returns vintage 2. |
| A2-02/05/06/08 | Deferred (P2) | Dependency-factory wiring and a DB unique key for (methodology, snapshot) are F4-owner follow-ups; default-off gate is unit-tested in deps tests. |
`src/lib/macro/macro.integration.test.ts` now holds F4's claim advisory lock for the suite, so it cannot interleave with the bridge suite's committed publish.
Flag: `MACRO_JUDGMENTS_ENABLED` stays off — `macro_regime@v1` is publishable=false pending the licence (owner Q1).
