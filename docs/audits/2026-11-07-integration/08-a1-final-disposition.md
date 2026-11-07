# PR A1 (judgments→macro, macro consumer side) — final disposition (commander, 2026-11-07)

Rounds: 03 (7 findings) → Codex fixes 1–2 → 05 re-audit (9) → Codex fixes 3–6 (incl. PG17 failures found by the commander: date parsing, PostgREST spawn timeout, running-vs-unprovable test, cross-suite interference) → 07 final.
PG17: read-api-asof + macro + strategy suites 77/77 three consecutive runs.

Final-round P1s checked against landed code:
| ID | Disposition | Evidence |
|---|---|---|
| A1-R3-02 / 03 | Reject | `selectEligibleHistoryAsOf` (src/lib/macro/db.ts) sorts by version desc and keeps the first row per period whose own receipt AND every ancestor are terminal with finished_at ≤ cutoff — i.e. filter-then-select. |
| A1-R3-04 / 05 | Reject | `ingest_batches_running_iff_unfinished` forbids a terminal batch with NULL finished_at in PostgreSQL, so the unprovable path cannot be seeded in PG; it is unit-tested in db.test.ts. Running batches are excluded, not errors. |
| A1-R3-01 | Accepted residual | CI has no PostgREST; the PG17 suite drives the production selector over real SQL rows; PostgREST query shape is unit-tested with a fake client. |
| A1-R3-11 | Reject | read-api-asof.integration.test.ts is in criticalSuites (scripts/ci/research-checks.ts, round 1). |
| P2s (06–10) | Deferred to PR A2 | Bounded per-period scans and memory-db terminal-without-timestamp; none changes public data while MACRO_JUDGMENTS_ENABLED is off. |

Residual (documented in code): `ingest_batches.finished_at` is not frozen by a trigger after terminal status; a migration for that belongs to the macro owner.
Flag: `MACRO_JUDGMENTS_ENABLED` stays off — F4 is not on main; enabling also needs `macro_regime@v1` publishable (owner Q1).
