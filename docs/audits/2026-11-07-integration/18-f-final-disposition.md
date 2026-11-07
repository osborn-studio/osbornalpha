# PR F (F6 eval hooks for F3/F4) — disposition (commander, 2026-11-07)
Audit 17 (MiniMax-M3). PG17 `src/lib/evals/f3-hook.integration.test.ts` 1/1 before and after the fix round.
| ID | Disposition |
|---|---|
| F6-16/17/18 | Reject — the suite passes on real PG17, so production SQL accepts the seeded citation shape; adapter and unit fake now follow F3's CandidateRow shape exactly. |
| F6-01 | Fixed — missing page created with real rows (no read override). |
| F6-02/03/10 | Fixed — superseded only by a visible later version of the same (issuer, source, source_ref) lineage, mirroring F3. |
| F6-05 | Fixed — pagination guard (cursor must advance) → read_error. |
| F6-07/08 | Fixed — F3's own usable-candidate / current-extraction predicates. |
| F6-09 | Checked — bbox convention cited from F3 code; conversion tested. |
| F6-14/15 | Fixed — test names every registry methodology and asserts none is a calibrated probability; F4 adapter returns `unavailable` (never throws, never fabricates p). |
| P2 rest | Fixed where small (identity, cursor, citation validity). |
Kinds `extraction_gold` and `judgment_calibration` stay disabled in KIND_REGISTRY (D8 gold licence; F4 has no probability methodology / thresholds).
