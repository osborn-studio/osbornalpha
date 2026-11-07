# A2 audit disposition (MiniMax `mmx` + Opus calibration review)

MiniMax: 22 items (6 P1, 16 P2). Opus checked each against the migration and the real-PostgreSQL run (34/34, `test:migrations` PASS).

| ID | Verdict | Reason |
|---|---|---|
| A2-01 | rejected | approval stores the SQL-computed disclosure digest; blocker 15 recomputes it under lock — this is the design (plan P-R1-04) |
| A2-02 | rejected (false positive) | SQL literal `broker-claim/1` is asserted equal to `CLAIM_METHODOLOGY_VERSION` in the integration test |
| A2-03, A2-04 | rejected (false positive) | conflict-group members share `(target_key, field, occurrence)`; confirm/correct/absent reject every live sibling of that identity |
| A2-05 | rejected (false positive) | currency/price fields are required only when an effective non-absent `target_price` exists (spec §5.1) |
| A2-06 | P3, not fixed | `updated_at` handled by report guard semantics; cosmetic |
| A2-07 | rejected | `absent` path rejects the row and inserts the human absent row under the same identity check |
| **A2-08** | **accepted, fixed** | `broker_extract_commit` now raises `stale_parse_run` when the run's parse run is not current; test added |
| A2-09 | rejected | candidate rows are produced and typed by B1/B3/C5 under one lease; SQL casts reject malformed values |
| A2-10 | rejected (false positive) | `valid_from` is `not null` in A1 |
| A2-11..A2-13, A2-17, A2-18 | rejected | event id duplication is by spec §10.2 (consumer dedupe); receipt match by `rules_input_hash` is spec §4.4 #12; rules hash scope is the plan's agreed superset; snapshot artifact hash null for human rows is correct; `field_ids` lists the target's evidence |
| A2-14..A2-16 | rejected | conflicting report-level values block publication via #17; absent rating counts as effective; horizon may be absent (§5.1) |
| A2-19..A2-21 | rejected | hook raises on missing report / params (`hook_params_required`) and runs inside one transaction (tested) |
| A2-22 | rejected | lease takeover / `lease_lost` covered by integration tests |
