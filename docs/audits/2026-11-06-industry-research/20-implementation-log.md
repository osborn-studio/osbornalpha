# Industry research — implementation log

Plan: `docs/superpowers/plans/2026-11-06-industry-research.md` (Codex plan rounds 1–4 in `06`, `08`, `10`, `12`; round 4 "ready for execution", commit 477dca74).
Per task: Sonnet 5.5 implementer → Opus 5.5 review (spec, then quality) → Codex `review --commit` + adversarial `exec` challenge (gpt-6-astra, medium) → fixes batched (fix batches 1–10, each Codex-reviewed) → re-check.

## Tasks

| Task | Commit | Opus review | Codex review / challenge | Fixed in |
|---|---|---|---|---|
| 1 migration one | 51862ec5 | PASS (3 minor) | none / no P1-P2 | batch 1 (probe swallowed errors) |
| 2 migration two | 37ca630d | PASS (4 minor) | P1 GC snapshot race, P2 unlocked source validation / P1×3 null-manifest publish, dependency cardinality≠set, caller-labelled `within`; P2×2 out-of-grid dates, method gate | batch 1 |
| 3 contract + memory/supabase | cc499a02 | Important: dup staging keys; 4 minor | P2 judgment-ref prune / P2×3 atomic quarantine, stocks_universe FK, dup keys | batch 1 |
| 4 pg adapter | 15f3040a | PASS (2 minor) | none | — |
| 5 Tushare adapters + A-share load | 83a16f31 | PASS (4 minor) | P2 failed-fetch receipt / P2×3 row width, raw page evidence, listing evidence | batch 2 |
| 6 facts scope | 34126ebf | PASS (4 minor) | P2×2 / P2×3 keyset paging, history exhaustion, future windows | batches 2, 4 |
| 7 SW classifications + source records | 9aaf16b2 | 3 Important (batch lifecycle, ambiguous→partial, cross-L1 continuity) | P2×3 / P2×5 | batch 3 |
| 8 memberships + resolution | d38f78e1 | Important: delisted ts_codes unresolved forever → spec K4 (fe9b95ee) | P2×2 / P1 predecessor quarantine, P2×2 | batches 3, 8 |
| 9 SEC SIC | cd23cc1f | PASS (NVDA fiscalYearEnd 0131 verified live; 3 minor) | P2×3 / P2×3 | batches 4, 5 |
| 10 method + aggregate | 8c3e2200 | PASS (5 minor) | none / no P1-P2 | — |
| 11 manifests + replay | 1192045d | PASS (4 minor) | none / no P1-P2 | batch 4 |
| 12 run orchestration | 3e0f63dc | PASS (3 minor) | P1 filtered run supersedes full level, P2 truncation lost / P2 readiness denominator | batch 5 |
| 13 marks | 06f7c513 | PASS (5 minor) | P2×3 / P2×2 | batches 4, 6 |
| 14 offline integration (critical) | 35a01aea | Important: recompute not exercised on pg | P1 readiness universe not isolated on shared test DB | batch 9 |
| 15 read models + public routes | 5f3e7684 | PASS (4 minor) | none / P2×3 single-cell replay, input-precise filter, evidence diff | batch 6 |
| 16 jobs, admin/cron routes, scripts | e1857567 | PASS (3 minor) | P1 SIC weekly cron cannot cover scope / P2×2 delisting evidence, audit atomicity | batches 7, 8 |
| 17 i18n + components | 708e97c6 | 2 Important a11y (labels hide numbers, modal focus) | P2×2 series thresholds, drawer focus | batch 7 |
| 18 list page | 77db32e3 | PASS (6 minor) | P2×2 YoY thresholds, drill-down 404 at that commit (resolved by Task 19) | batch 7 |
| 19 detail/constituents/judgment area | d3b30852 | Important: `include_abstained=1` | none / P2×2 stale judgment state, inputs/settlement | batch 9 |
| 20 E2E + runbook + §18 | 8bf7f23d | (covered by final review) | none / P2×2 fixture guard, runbook withdrawal | batch 10 |

## Fix batches

| Batch | Commit | Scope | Codex review of the batch |
|---|---|---|---|
| 1 | 92902b9f | Tasks 1–3 | P2 memory multi-quarantine rollback → batch 3 |
| 2 | 46e6ffb2 | Tasks 5–6 | P2 keyset lower server cap → batch 4 |
| 3 | ff95636b | Tasks 7–8 + K4 delistings table | P1 apply after failed delisting persist, P2 missing dates on resolved → batch 8 |
| 4 | f5dbf597 | Tasks 9, 11, 13, keyset | P2×2 marks retry classes, outcome accounting → batch 6 |
| 5 | db02fd6d | Task 12 P1 + minors | none |
| 6 | 00761c33 | Tasks 13, 15 | none |
| 7 | b07df204 | Tasks 16–18 UI + SIC daily cron | P2 methods link 404 → batch 10 |
| 8 | c523e136 | Task 16 + batch 3 findings | none |
| 9 | 43bf8574 | Tasks 14, 19 | none |
| 10 | f3cb36c7 | batch 7 / Task 20 findings, deviation list | none |
| 11 | dd3ec810 | final review: coordination markers, plan-2 `keysetAll` restored, industry keyset helper, schedule docs | see `.claude/scratch` note in PR |

Incidents: one session restart interrupted the plan integrator (resumed from transcript); one network outage killed four agents (resumed; no partial edits were lost because none had been written).

## Final review and gate (2026-11-06)

Final whole-branch Opus review: READY; two Important coordination findings fixed in batch 11.

Full gate at f3cb36c7 (before batch 11): `npm test` 340 files / 3261 passed; `npm run typecheck`, `npm run lint`, `npm run build` clean; `npm run test:db` 366 files / 3556 passed, 2 skipped, criticalSuites 27, criticalPassed 296, criticalSkipped 0, migrations 52; `npm run test:migrations` PASS. After batch 11: industry/facts/components unit tests 689 passed, typecheck/lint clean, db-one (issuers, industry sync, facts integration) 60/60. E2E fixture mode 6/6 (batch 10).
