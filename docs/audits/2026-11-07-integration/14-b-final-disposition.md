# PR B (judgments→industry) — final disposition (commander, 2026-11-07)
Rounds: 10 (8 P1) → Codex fix 1 (63e51ff7) → 12 re-audit (15 P1). PG17 `src/lib/industry/judgments-bridge.integration.test.ts` 2/2.
| ID | Disposition | Evidence |
|---|---|---|
| B-01 | Reject | `src/lib/judgments/deps.ts:50` injects `industry: supabaseIndustryDb(anon)` into `anonJudgmentInputsDb`. |
| B-03 / B-06 | Reject | `buildTable` (inputs.ts:172–181) handles `industry_metrics` first through the shipped adapter and rejects `available_at > asOf`; `db.tableRows` is reached only for other tables. |
| B-07 / B-08 | Reject | F4 `JudgmentCard` (src/lib/judgments/types.ts:258–266) declares `condition`, `settlement`, `calibration_summary` as required `…|null`, not optional. |
| B-11 | Reject | The parser rejects `display.percent` unless `calibration==='calibrated'` — that is the mandate. |
| B-09 / B-10 / B-12–B-15 | Deferred (P2) | Local unions mirror F4's current exported unions; a shared runtime guard exported by F4 is a follow-up. Unknown values fail closed (consumer shows unavailable), never wrong data. |
| B-02 / B-05 | Deferred (P2) | `tableRows` keeps its row-array contract; the frozen snapshot/hash come from the adapter in `buildTable`. |
| B-04 | Accepted residual | No PostgREST in CI; PG suite uses `pgJudgmentInputsDb` implementing the production interface. |
Flag: `INDUSTRY_JUDGMENTS_ENABLED` stays off — no industry methodology is registered in F4 (owner Q2).
