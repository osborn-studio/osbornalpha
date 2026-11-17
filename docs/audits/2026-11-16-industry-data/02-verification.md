# Industry data — production verification of US SIC aggregates (2026-11-17 UTC)

Scope: the US SIC aggregates of PR #241 (spec amendment A1, §19) in production (`stock-monitor`,
osbornalpha.com). All times UTC. Reads were made with read-only SQL through the Supabase Management API and with
logged-out HTTP requests. Nothing licence-gated was loaded; no Vercel environment flag was changed.

## 1. Result

| Done criterion | State |
|---|---|
| `industry_metric_runs` / `industry_metrics` non-empty | **met** — 2 runs (generation 2 `active`, generation 1 `superseded`), 9,324 metric rows per run |
| fresh `dq_freshness` row for the aggregate job | **met** — `industry.agg.sic` `fresh` (§5) |
| US industry pages show aggregates from a published run | **met** — public API serves the active run, replay reproduces, signed-in page sample passes (§8) |
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

1. **Signed-in page sample — taken, passes (2026-11-17).** Taken by the commander session in the owner's signed-in
   Chrome on the active run (generation 2). UI locale English; the zh locale was not sampled.
   1. `/intel/industries?scheme=sic` renders: scheme "SIC · US (SEC)", snapshot-constituents notice, facts as of
      2026-11-17, run 2026-11-17 05:36 gen 2 fresh, method `industry-agg-us/1.0`, Reconstruction badge,
      "444 industries · 3 period ends", columns FY2023 / FY2024 / FY2025. Revenue (bn USD):

      | SIC | FY2023 | FY2024 | FY2025 |
      |---|---|---|---|
      | 5331 | 878.31 | 929.94 | 985.22 |
      | 5961 | Low coverage 4/6 | Low coverage 4/6 | 764.16 |
      | 6282 | 15.63 | 20.99 | 22.89 |
      | 3577 | 16.93 | 18.47 | 20.78 |
      | 7389 | 270.10 | 309.93 | 344.16 |
      | 7372 | Low coverage 51/69 | Low coverage 53/69 | Low coverage 53/69 |

      The FY2025 column matches §7 for all five value cells and for 7372.
   2. Source drawer on 5331 FY2025 opens: RETAIL-VARIETY STORES · Revenue · 2025-12-31 · 985.22 bn USD; period
      2025-01-01 → 2025-12-31 · 12M; method `industry-agg-us/1.0` · `facts-derive/1.0`; history class
      Reconstruction; code version `851f512`; manifest `604f…ea8e`; coverage 6 / 7 (1 missing concept, 0
      unresolved); the replay section says "reproduced".
   3. `&view=table`: 5331 — 7 (0) members, FY2025, 985.22 bn USD, 6/7, YoY +5.9 %; 7372 — 69 (0), FY2025,
      Low coverage 53/69.
   4. `/intel/industries/sic/5331` renders without error: 7 members, latest inclusion 2026-11-11, series tabs with
      chart and table, FY2025 985.22 bn USD 6/7.

   **Copy defects seen in the sample (not fixed here).** Read-only check of the source:
   - The SIC pages show a notice saying "SW membership availability is assumed at the inclusion date …". The
     message `notices.reconstruction` (`messages/{en,zh}/industries.json`) was written for SW2021 and is rendered
     for every run with `historyClass === 'reconstruction'`, whatever the scheme
     (`src/app/(app)/intel/industries/page.tsx:81`, `…/[scheme]/[code]/page.tsx:60`). US runs are always
     `reconstruction`, so the Shenwan wording appears on every SIC page, in both locales, next to the correct
     `snapshotConstituents` notice. Fix: render `reconstruction` only when the run has no `membershipOn` (SW2021),
     or add a SIC variant of the body; the snapshot notice already states the US basis.
   - The drawer formula for revenue reads "Σ revenue (quarterly: q_single_revenue)" (`formulas.revenue_sum`); the
     quarterly clause is the CN method and does not apply to the 12M-only US run. Fix: a scheme-specific formula
     string for SIC.
2. **Cron path — exercised, passes (2026-11-17 15:06).** See §10.
3. **Playwright `sic` spec** was written but never run against a live stack.

## 9. Follow-ups

- ~~Lock `20261130090000`~~ — done in #253; `20261201090000`–`20261203090000` in #258.
- ~~Make the aggregate run fit the cron budget~~ — done, §10.
- ~~Re-run `aggregate-sic` after the remaining issuers have synced~~ — generation 5 (§10) read 743 of 811 members;
  the weekly cron picks up the rest.
- Point-in-time SIC from EDGAR filing headers, to replace the snapshot-constituent reconstruction.

## 10. Cron path in production (2026-11-17)

The route `/api/cron/industry-sync?job=aggregate-sic` (budget 240 s, API statement limit 8 s) was invoked by hand
three times. Each call is one HTTP request with the cron secret; nothing else was changed.

| Call (UTC) | Live commit | Result | Route time |
|---|---|---|---|
| 12:51 | `851f5121` | failed after 27 s in the facts read: `canceling statement due to statement timeout` | 32 s |
| 13:45 | `d08fedac` (#253, `read_facts_batch`) | failed after 19 s in the facts read: same statement timeout | 23 s |
| 15:06 | `9d46dbeb` (#256, `read_facts_batch_slice`) | **success, run published** | **43 s** |

Causes, measured read-only on production:

- `851f5121`: 811 per-issuer `read_facts` calls, 16 at a time; mean 237 ms and max 7.2 s per call through the API.
- `d08fedac`: one statement per 40 issuers, but still the full disclosure history (160,046 rows, about 126 MB of
  JSON): 3.3–4.2 s per chunk, later chunks over 8 s.
- `9d46dbeb`: only the rows the method consumes (current, `12M`, `period_end` in 2022–2025): 7,718 rows.
  For all 811 issuers these rows are equal to the full `read_facts` envelope filtered the same way.

The two failed calls published nothing; generation 2 stayed active. They left `dq_freshness` `industry.agg.sic` at
`error` (two consecutive failures) from 13:46 until the successful run at 15:07.

**The successful run** — batch `70a59967-4403-4c02-a490-25b55eaa0d54`, run
`8c4d26bb-a4b2-49b5-a09d-a2c812d31669`, generation 5, `code_version` `9d46dbeb…` (this is also the evidence of the
live commit; deployment `stock-monitor-2j7la3h6o`), activated 15:07:24. Receipt: status success, 0 errors,
1,332 groups, 3,662 cells with a value, 5,662 missing with a reason, 0 manifest mismatches, 0 truncated reads.

| Phase | Time | Largest single statement (`pg_stat_statements`) |
|---|---|---|
| members | 1.9 s | — |
| facts read (`read_facts_batch_slice`, 21 calls) | 10.3 s | 1.59 s (mean 0.90 s) |
| filings | 2.8 s | — |
| compute | 0.3 s | — |
| manifest uploads (600 registrations) | 17.4 s | 0.51 s |
| staging (19 calls) | 7.8 s | 0.44 s |
| activation | 1.6 s | 1.55 s |
| **total** | **42.3 s** of 240 s | 1.59 s of 8 s |

The phases after the facts read ran in-region for the first time in this call.

Checks after the run:

- `dq_freshness` `industry.agg.sic`: `fresh`, `last_ok_at` 15:07:25, `consecutive_errors` 0.
- `replay-check --scheme sic --sample 50` on generation 5: 50 of 50 reproduced, seed `2026-W47`, 0 mismatches.
- Generation 5 against generation 2 (9,324 cells each): 129 cells differ; every one of them has at least one member
  whose facts `state_rev` changed between the runs; 0 cells differ with unchanged inputs.
- Public API (logged out): `runId` `8c4d26bb-…`, generation 5, `freshness: fresh`.
- Members with a successful facts sync: 743 of 811 (was 730 for generation 2).

Industries passing both display thresholds for revenue (thresholds unchanged):

| Bucket | Generation 2 | Generation 5 |
|---|---|---|
| FY2023 | 13 | 15 |
| FY2024 | 11 | 14 |
| FY2025 | 9 | 13 |

Migrations applied to production for this, each after a passing rehearsal and with its history row:
`20261201090000_facts_read_batch` (before the `d08fedac` deploy) and `20261203090000_facts_read_batch_slice`
(before the `9d46dbeb` deploy; the broker research migrations `20261202090000/091000/092000` were applied in the
same pass, in order).

Not covered: the scheduled trigger itself. The first scheduled run is Sunday 2026-11-22 04:30; it calls the same
route with the same secret. The signed-in page sample of §8 was taken on generation 2 and was not repeated on
generation 5.
