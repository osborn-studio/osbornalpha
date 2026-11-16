# WP-D PR-2 (Fed liquidity) implementation log

Codex gpt-6-sol implements, mmx (MiniMax-M3) audits each task, Opus/Sonnet commander fixes P1/P2.

| Task | Commit | mmx verdict | Disposition |
|---|---|---|---|
| 6 FRED fixtures + parser regressions | fcfe3b34 | fix required (P1 fixture-list invariant; P2 hash/first-last assertions; P3 CLI validation) | Accepted all four: staged-codes allow-list in the invariant, manifest hash/URL/status assertions, first+last point derived from fixture bytes, CLI argument validation (exit 2). |
| 7 firstPeriod-aware backfill | 7e02d868 | P1 "backfillComplete only checks a single row in range" | Rejected as pre-existing and intended: the check (any eligible row from the series start through `fredBackfillDoneBy`) is the T7-2 design of #109; the new code only moves its bounds with `firstPeriod`. A partial older history still triggers a full-window refetch whenever the oldest chunk is missing. |
| 8 usd_mn / usd_bn profiles + weekly/LPR derive tests | 911c1e3c | fix required (2×P2) | Rejected both: (1) mmx mis-indexed the fixture values — October's last Wednesday is 2026-10-28 = 6700008 (index 8), November 4 is 6700009; the test expects the Oct 28 value with Nov 4 as witness. (2) `available_at = max(inputs)` including the first later-month observation (completion witness) is the documented `derive.ts` rule (a month is complete only once a later observation exists); not changed by WP-D. |

Gate (after merging main `68701c48`): typecheck, lint, macro/cron/judgments suites 1862 passed / 167 skipped; no changed file is in `v2-closure.txt` (the 33 files hashed by macro_regime@v2 after #132).
