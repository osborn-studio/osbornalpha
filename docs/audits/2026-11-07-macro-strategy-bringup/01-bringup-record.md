# Macro strategy production bring-up record (2026-11-07)

Executed by the commander session on the owner's authorization ("这些所有的步骤我充分授权给你"). Runbook: `docs/runbooks/macro-strategy.md` §8 and `docs/runbooks/macro-sync.md` §13.4. No secret value was printed or written to disk; the ingest secret lives in Vercel (sensitive) and the owner's login keychain (`osbornalpha-macro-ingest`).

## §8.1 prerequisites

| item | state |
|---|---|
| 1, 2 migrations `20261114090000`, `20261115090000` | applied earlier by prod-bringup (history rows present) |
| 3 `MACRO_INGEST_SECRET` | added to Vercel production (sensitive) |
| 4 `CRON_SECRET` | present |
| 5 `VERCEL_GIT_COMMIT_SHA` | first deploy of `458389e5` was made **without** `--env VERCEL_GIT_COMMIT_SHA` (stale copy of §8.3 in the operator's notes); ingest answered `503 code_version_unavailable`. Redeployed `458389e5` with `--env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)` from a detached `origin/main` worktree; aliased to osbornalpha.com. The runbook on main already states the `--env` requirement (§8.1 item 5, §8.3). |
| 6 CN snapshot | AKShare backfill from the owner's Mac: batch `99140099-0f60-4b41-a0ee-0a800c3f5ef2`, status success, fetched 4044 / inserted 4044 / quarantined 0 / failed 0 (native 3603, derived 441); CN snapshot `95ff2df8-d94b-4cff-9ca8-86f4bca03d3a` rev 1 published (23 observations, regime classified, uncovered_weight 50). `macro.akshare` fresh, `failed_series []`. |
| 7 Fed target series | `US_FED_TARGET_D` n=3272 last 2008-12-15; `UPPER_D`/`LOWER_D` n=6535 last 2026-11-06 |

Dry run before the real run (owner's terminal and the commander's, identical): 8 series ok (CPI evidence 3 / claims 129, PPI 1/129, PMI 1/130, GDP 1/43, M2 1/129, EXPORT 1/129, CGB_10Y 11/2711, USDCNY 1/203). Offline tests: 25 passed.

launchd daily job installed (`studio.osborn.alpha.macro-collect`, 05:00 UTC = 21:00 local, plist lint OK) and kickstarted once: exit 0, batch `37ab460a-e376-4eb5-8e24-43e875343066` success, 738 fetched / 738 duplicates / 0 inserted, CN snapshot rev 2 published (idempotent re-run).

## §8.2 data checks

Active snapshots: US `693b2539-…` rev 2 as_of 2026-11-07, CN `95ff2df8-…` rev 1 → rev 2 after the daily run; catalog `macro-catalog/30bcaa2a33c5` on both. Open macro quarantine: 0. P3 tables before the first review: 0 manifests, 0 reviews. Flags: `MACRO_STRATEGY_ENABLED` present (set in §8.3), `MACRO_JUDGMENTS_ENABLED` absent.

## §8.3 flag

`MACRO_STRATEGY_ENABLED=1` added to Vercel production, then the redeploy above.

## §8.4 review cron

Preview (`?preview=1`): HTTP 200, `ok: true`, `preview: true`, server-selected month `2026-10`; receipts US and CN both `outcome: preview`, `status: insufficient`, 64-hex manifest hashes (`5e3930011466…`, `adb9c7e03dea…`). `insufficient` is the expected data gap: both snapshots were first generated on 2026-11-07, so no snapshot existed at the October cutoff (runbook §3). The November review will be produced by the 3rd-of-month cron.

Real run, one unit at a time: US → `advanced`, generation 1, result `9249bafe-b316-4ff1-a03b-8b476bd36486`; CN → `advanced`, generation 1, result `721dc839-9489-433e-968f-ac9ab2d246f0`; rerun US → `replayed`.

## §8.5 smoke checks (owner's logged-in Chrome session, www.osbornalpha.com)

Fact routes, all HTTP 200 and never 503: transmission US/CN, policy-response window=3, cycle-table boundary=event_day, reviews US/CN. `judgment_status` = `disabled`; manifest `ba915ede-f881-46ab-b20c-26956fefd6a1` fetch 200; deviations → 404 `judgments_disabled` (expected). Pages `/intel/macro/transmission`, `/intel/macro/history`, `/intel/macro/review`, `/intel/macro/US_UNRATE` all 200 and none shows the "未就绪" state; `/intel/macro` shows the Transmission / History / Review tabs and the header note "The judgment layer is off by default"; `document.body.innerText.match(/象限|得分|margin|概率|置信度/)` is `null`.

### Latency (runbook §2 step 7 targets: p95 < 500 ms first, < 100 ms repeat)

| route | first call (browser, default cache) | repeat (default cache) | `cache: no-store` |
|---|---|---|---|
| transmission US | 1221 ms | 5 ms | 3594 ms |
| transmission CN | 929 ms | 32 ms | — |
| policy-response window=3 | 4416 ms | 6 ms | — |
| cycle-table event_day | 10923 ms | 12 ms | 28125 ms |
| reviews US / CN | 861 / 788 ms | 4 / 2 ms | — |

The repeat target is met only through the browser/edge cache; uncached calls miss the 500 ms target, and cycle-table takes 10–28 s per uncached call (two `no-store` runs timed out the 45 s DevTools evaluation). Per the runbook ("build the LRU only if missed") this is a **follow-up code task**: server-side memoisation keyed by `(state_rev, manifest inputs)` for transmission / policy-response / cycle-table, plus a look at the cycle-table query itself. Not blocking go-live: the pages render and the results are cached after the first visit.

## Flag state after bring-up

`MACRO_STRATEGY_ENABLED=1`; `MACRO_JUDGMENTS_ENABLED` unset (judgment layer off until F4 PR #117 merges and the owner turns it on). The 美林时钟-style quadrant (象限) view is part of that judgment layer by design (macro-workbench spec §178, P3+P4 spec §103/§465): the strategy pages show only facts, the static four-quadrant playbook framework, transmission, history and review.
