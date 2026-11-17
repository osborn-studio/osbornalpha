# Industry data — production verification of US SIC aggregates (2026-11-17 UTC)

Scope: the US SIC aggregates of PR #241 (spec amendment A1, §19) in production (`stock-monitor`,
osbornalpha.com). All times UTC. Reads were made with read-only SQL through the Supabase Management API and with
logged-out HTTP requests. Nothing licence-gated was loaded; no Vercel environment flag was changed.

## 1. Result

| Done criterion | State |
|---|---|
| `industry_metric_runs` / `industry_metrics` non-empty | **met** — 2 runs (generation 2 `active`, generation 1 `superseded`), 9,324 metric rows per run |
| fresh `dq_freshness` row for the aggregate job | **met** — `industry.agg.sic` `fresh` (§5) |
| US industry pages show aggregates from a published run | **met on the data path** (public API serves the active run, replay reproduces); **signed-in page sample OPEN** (§8) |
| owner checklist for A / H | delivered in `03-owner-checklist.md` |

## 2. Migration

- `supabase/migrations/20261130090000_industry_us_aggregates.sql`, sha256
  `0a3032da550de00eea19baf79ee62a05d71273c8c4b660c487a297d4abb781ba`.
- Rehearsal (`npm run test:migrations`, local PG17) before applying:
  `PASS: fresh schema equals seeded upgrade; existing rows preserved; both local clusters stopped.`
- Applied to production in one transaction together with its history row
  (`supabase_migrations.schema_migrations`: version `20261130090000`, name `industry_us_aggregates`).
- Not yet listed in `supabase/migrations.lock.json` (follow-up, §9).

## 3. Deploy

- Live commit `851f5121d10428687a4c081d0c6da8f10da8a72f` (exact `origin/main` at the time; contains #241 and #239),
  deployment `stock-monitor-meya5mzw6`, aliased to osbornalpha.com about 03:48. Deployed by the
  fix-macro-manifest session, which also applied `20261126110000`; no second deploy was made for this work.
- Both loads below ran by script from a clean detached checkout of the same commit (`codeVersion` in the receipts).

## 4. Loads

Command (runbook `docs/runbooks/industry-research.md`, US SIC section):
`node --env-file=<prod.env> --import tsx scripts/industry/sync.ts --job aggregate-sic --apply`

| | First load | Re-run after the facts catch-up |
|---|---|---|
| batch | `bed77798-0d6f-4972-a2f0-2182f0f51cb3` | `829e60c6-e7d9-4b94-bb59-3d76cf257b6c` |
| run | `d6262547-f026-4b2c-8155-90469ce6c6d8` (generation 1, now `superseded`) | `3295af08-d8d3-439c-bb94-ea47738d9128` (generation 2, `active`) |
| activated | 04:00:06 | 05:36:33 |
| receipt status | success, 0 errors | success, 0 errors |
| groups | 1,332 (444 codes × FY2023–FY2025) | 1,332 |
| cells with a value / missing with a reason | 3,152 / 6,172 | 3,641 / 5,683 |
| manifest mismatches / truncated reads | 0 / 0 | 0 / 0 |
| members with a successful facts sync | 577 of 811 | 730 of 811 |
| wall time | 916 s (fact reads 453 s, manifest uploads 420 s) | 1,085 s (fact reads 590 s, manifest uploads 443 s) |

Both runs: `method_version` `industry-agg-us/1.0`, `history_class` `reconstruction`, `facts_as_of` =
`membership_on` = 2026-11-17, config hash
`9b6270977e8dd66f36bdffd8f1ed7bed6129d04fd8a7389348c41c6ec644351c`.

Between the two loads the US facts worker was run by script for the issuers that had failed with the string-`cik`
bug fixed in #239 (`scripts/facts/sync.ts --market US --apply`, two passes): `fact_sync_scope` US rows with
`last_status='success'` went 577 → 712 → 732 of 815. 81 are still `failed`; none of them was due for retry
(back-off ends by 2026-11-18 04:49) and the scheduled facts worker picks them up. One issuer answers
`no_companyfacts` at the SEC.

## 5. Tables and freshness (after the re-run)

| Object | Rows |
|---|---|
| `industry_metric_runs` | 2 (1 `active`, 1 `superseded`) |
| `industry_metrics` | 18,648 (9,324 per run; active run 3,641 `ok`) |
| `industry_manifests` | 990 (content-addressed, shared across runs) |

`dq_freshness` row `industry.agg.sic`: `fresh`, `last_ok_at` 2026-11-17 05:36:34 (first load: 04:00:08).

The commander session confirmed the first load independently at about 04:10 with read-only SQL: 1 run, 9,324
metric rows, 600 manifests, `industry.agg.sic` fresh with `last_ok` 04:00:08.

## 6. Replay

- `scripts/industry/replay-check.ts --scheme sic --sample 50` on the first run: 50 of 50 reproduced, seed `2026-W47`,
  0 mismatches. Result on the active run: §7.
- Public API, logged out, active run:
  `GET /api/industries/sic/7389/replay?runId=3295af08-…&metric=revenue_sum&duration=12M&periodEnd=2025-12-31` →
  `state: ok, reproduced: true`; same for `6211`. First run: `3577` → `reproduced: true`.

## 7. What the public API shows

`GET /api/industries?scheme=sic&metric=revenue_sum&duration=12M` (logged out, HTTP 200): `kind: aggregate`,
`header.runId` `3295af08-…`, `generation` 2, `membershipOn` 2026-11-17, `historyClass` `reconstruction`,
`codeVersion` `851f5121…`.

Display state per fiscal-year bucket (444 codes each). A value is shown only when the industry has at least 5
members **and** at least 80 % of them have data; the thresholds were not changed.

| Bucket | Run | value shown | low coverage | too few members | missing |
|---|---|---|---|---|---|
| FY2023 | first | 5 | 31 | 114 | 294 |
| FY2023 | re-run | **13** | 24 | 141 | 266 |
| FY2024 | first | 4 | 32 | 117 | 291 |
| FY2024 | re-run | **11** | 26 | 144 | 263 |
| FY2025 | first | 4 | 32 | 115 | 293 |
| FY2025 | re-run | **9** | 28 | 141 | 266 |

FY2025 revenue cells that pass both thresholds on the active run (USD, members with data / members):

| SIC | Revenue | n |
|---|---|---|
| 3577 | 20,775,884,818 | 5 / 5 |
| 4833 | 32,419,000,000 | 4 / 5 |
| 5331 | 985,216,826,000 | 6 / 7 |
| 5500 | 23,378,105,738 | 4 / 5 |
| 5961 | 764,163,760,000 | 5 / 6 |
| 6200 | 171,341,213,187 | 12 / 13 |
| 6211 | 76,027,988,068 | 11 / 12 |
| 6282 | 22,886,547,000 | 10 / 10 |
| 7389 | 344,162,819,966 | 27 / 32 |

The largest industry, 7372, is still below the threshold (53 of 69 members with FY2025 data, 77 %) and shows
"low coverage" with its counts. Most of the 444 codes have fewer than five loaded members and never show a value;
that is a property of the loaded issuer universe (811 issuers), not of the run.

Final reads (replay check on the active run, freshness row, logged-out page status):

- `replay-check --scheme sic --sample 50` on run `3295af08-…`: 50 of 50 reproduced, seed `2026-W47`, 0 mismatches.
- `dq_freshness` `industry.agg.sic`: `fresh`, `last_ok_at` = `last_attempt_at` = 2026-11-17 05:36:34,
  `consecutive_errors` 0.
- `GET https://osbornalpha.com/intel/industries?scheme=sic` logged out: 307 to `/login?next=…`.

## 8. Open

1. **Signed-in page sample — OPEN.** The pages require a session (logged out they redirect to `/login`), and the
   owner's Chrome was not available. To check, signed in:
   1. `https://osbornalpha.com/intel/industries?scheme=sic` — heatmap with columns FY2023–FY2025, the snapshot notice
      (constituents as of 2026-11-17, not historical membership), the reconstruction badge; values for the nine codes
      in §7; 7372 shown as low coverage 53/69; small industries shown as too few members (n < 5).
   2. Click 5331 FY2025 → source drawer with `reproduced` and the input facts (6 of 7 members).
   3. `https://osbornalpha.com/intel/industries?scheme=sic&view=table` — same cells as a table.
   4. `https://osbornalpha.com/intel/industries/sic/5331` — detail page with the aggregate series and constituents.
2. **Cron path not exercised.** `/api/cron/industry-sync?job=aggregate-sic` first fires on Sunday 2026-11-22 04:30.
   From this machine the job takes 15–18 minutes; the route has a 240 s budget and answers
   `time_budget_exceeded` without publishing when it runs out. In-region runtime is unmeasured. If the cron run
   fails, the active run stays, freshness turns stale after its weekly cadence, and the script load above is the
   fallback.
3. **Playwright `sic` spec** was written but never run against a live stack.

## 9. Follow-ups

- Add `20261130090000_industry_us_aggregates.sql` to `supabase/migrations.lock.json` (order with the other unlocked
  migrations).
- Make the aggregate run fit the cron budget: batched fact reads and manifest uploads account for about 95 % of the
  wall time.
- Re-run `aggregate-sic` after the remaining 81 issuers have synced.
- Point-in-time SIC from EDGAR filing headers, to replace the snapshot-constituent reconstruction.
