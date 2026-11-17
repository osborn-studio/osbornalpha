# Industry data — why the tables are empty (read-only diagnosis, 2026-11-16)

Scope: production Supabase `stock-monitor`, code at `origin/main` 68701c48. Everything below was read with
read-only SQL through the Supabase Management API, from the repository, and from the two licence pages named in §4.
Nothing was written to production for this diagnosis.

## 1. What production holds today

| Object | Rows | Note |
|---|---|---|
| `industry_classifications` | 444 | all `sic` / `sec-current`, level 1 (flat four-digit codes) |
| `issuer_industry_memberships` | 811 | all `sic`, `status='ok'`, 811 issuers in 200 codes, `valid_from` 2026-11-08 … 2026-11-14 (= observation day) |
| `industry_sync_scope` | 814 | SIC refresh leases |
| `industry_source_memberships` | 0 | SW2021 import evidence |
| `industry_security_delistings`, `security_marks` | 0 / 0 | Tushare `stock_basic` D pass, `daily_basic` |
| `industry_metric_runs`, `industry_metrics`, `industry_manifests` | 0 / 0 / 0 | aggregation |
| `industry_official_valuations`, `industry_observation_receipts` | 0 / 0 | `sw_daily`, marks/official receipts |
| `industry_valuation_runs`, `industry_valuations`, `industry_valuation_pairs` | 0 / 0 / 0 | I-3 |
| `industry_dataset_licenses` | 4 | `scheme:sic:sec-current` = `public`; the three Tushare-relayed datasets = `internal` ("owner decision A pending") |
| `dq_freshness` | — | `industry.sic.classifications` and `industry.sic.memberships` fresh (2026-11-16 02:00 UTC); no `industry.agg.*`, `industry.sw2021.*`, `industry.marks` row exists |

Inputs that already exist:

- US facts: 1,050,818 `ok` rows for 577 issuers; annual (`12M`) USD `revenue` for 533 issuers, `net_income_parent` 547,
  `gross_profit` 318, `cost_of_revenue` 435, `equity_parent` 550. Fiscal years ending in calendar 2025: 494 issuers with
  annual revenue (2024: 506, 2023: 512, 2022: 517). 352 of them end on 12-31; the rest are spread over other dates
  (52/53-week and non-calendar fiscal years).
- `fact_sync_scope`: 814 US rows, 577 with `last_success_at`, 237 never succeeded. No CN row at all.
- SIC members whose issuer has facts: 577 of 811.
- CN: `security_universe_memberships` has 5,579 active `a_stock` tickers, but `issuer_securities` has 3 A-share rows
  (the bootstrap of PR #214). `facts.cn` freshness is `fresh` with `idle:true, attempted:0` — the CN worker runs and
  finds nothing in scope.

SIC member distribution: 86 codes have 1 member, 42 have 2, 23 have 3, 12 have 4, **37 codes have 5 or more**
(largest: 7372 with 69, 2834 with 56, 3674 with 42).

## 2. Chain per empty table

"Engineering" = can be fixed now inside the mandate. "Owner" = needs a decision listed in §5.

| Table | Filled by | Gate in code | Input present? | Blocker | Class |
|---|---|---|---|---|---|
| `industry_metric_runs`, `industry_metrics`, `industry_manifests` (US) | nothing — `runIndustryAggregation` accepts only `sw2021`, reads `readFacts(…,'CN')`, sums `CNY`; spec §1.2 / §4.1 make SIC "navigation only, not aggregated" | — | **yes** (SIC memberships public; EDGAR facts) | spec exclusion + no US method. The activation function also requires members to be valid on each `period_end`, and SIC rows start on their observation day (2026-11), so no past period has members | **Engineering** (spec amendment first; §3) |
| same three (CN / SW2021) | `aggregate` job (`sync.ts --job aggregate --apply`) | `FACTS_CN_ENABLED=1`; not in `vercel.json`; run-level readiness gate ≥ 95 % of the industry facts universe with `last_success_at` | **no** — 0 source memberships, 3 A-share issuers, 0 CN scope rows, 0 CN facts | every upstream step below | **Owner** A + E + CN publication |
| `industry_source_memberships` (+ SW rows of `industry_classifications`, `issuer_industry_memberships`) | `memberships-sw` (classifications → source → resolve) | `TUSHARE_TOKEN` (present locally and in Vercel); script only | upstream reachable; resolution needs A-share issuers (3 of ~5,579) | data is Tushare-relayed SW Research data; licence status `internal`, not cleared (§4) — production load is not covered by the mandate until A is decided. `load-a-share` must run first for the resolve step to produce memberships | **Owner** A (then engineering: two runbook commands) |
| `industry_security_delistings` | `load-a-share` (`stock_basic` D pass) | `TUSHARE_TOKEN` | upstream reachable | same licence question (Tushare `stock_basic`); the full-universe load has never run in production, only the 3-ticker bootstrap | **Owner** A |
| `security_marks`, `industry_observation_receipts` (kind `marks`) | `marks --apply --trade-date …` | `TUSHARE_TOKEN`; script only; trade dates explicit (`trade_cal` deferred with I-3) | upstream reachable; rows are only useful to I-3 | `marks:tushare-daily_basic` is `internal`; no consumer until H is decided | **Owner** A, then H |
| `industry_official_valuations`, receipts (kind `official`) | `official` job | hard-coded `deferred_i3` | — | I-3 not implemented; comparator undecided | **Owner** H (+ A, C) |
| `industry_valuation_runs`, `industry_valuations`, `industry_valuation_pairs` | `valuation` job | hard-coded `deferred_i3` | no (needs marks, official values, CN facts, SW memberships) | H: `pe_ttm_sw` comparator not chosen; PB basis off 1.1–4.4 %, bank PE formula off ~17 %; publication gate needs ≥ 24 pairs / ≥ 90 % coverage / ≥ 95 % within 1 % per series and the evidence is 2 industries × 5 days | **Owner** H, C |

Not a table but the same symptom: the industry page for `scheme=sic` renders the classification list with member counts
(the "before aggregates" fallback of PR #179) because there is no active run for any scheme.

## 3. Engineering — fixable now

1. **US SIC aggregates.** Inputs are public and present. Needs, in this order: a spec amendment (the spec forbids it
   today), a small migration (the activation completeness rule is hard-wired to the CN quarterly grid, membership is
   checked at each `period_end`, and `net_margin` is not an allowed metric), a US method with its own version and config
   hash, a job with a real dry run, the cron entry with `dq_freshness`, and the page reading the active run.
   The honest limit: SEC publishes only the current SIC code, and the loaded history starts on the observation day.
   So the US run uses **constituents as of the run date** applied to the last completed fiscal-year buckets, is labelled
   `reconstruction` with the snapshot date on the page, and covers a short window. It must not be described as
   historical membership. A point-in-time upgrade exists (the SIC printed in each EDGAR filing header at acceptance) and
   is left as follow-up.
2. **Dry run for `aggregate`.** Today `--job aggregate` without `--apply` answers `dry_run_unsupported`, so there is
   no way to show what a run would publish. Fix: compute everything, write nothing.
3. **Freshness for the aggregate job.** `recordAttempt('industry.agg.<scheme>', weekly)` exists in the runner; no row
   exists only because no run ever started.
4. **US facts coverage (root cause found 2026-11-17, fixed in a separate PR).** 235 of 814 US scope issuers have
   `last_status='failed'`; 232 of them fail every sync with `parse_error`. Cause: the SEC `companyfacts` API returns
   the top-level `cik` as a number for older registrants (`"cik":320193`) and as a zero-padded string for newer ones
   (`"cik":"0001991792"`); `decodeCompanyFacts` accepts only the number. Until that fix is deployed and the facts
   worker has re-synced them, US coverage is 577 / 811 members and the largest industries sit below the 0.8 display
   threshold (7372: 43 of 69 members with data). The cells show this as "low coverage"; they do not hide it and the
   threshold is not lowered to make numbers appear.

## 4. Licence terms read on 2026-11-16

- **Tushare 服务协议** (`https://tushare.pro/document/1?doc_id=405`), section 二「服务获取及使用」:
  item (1) of the prohibited conduct list forbids opening the service "以营利、经营等非个人使用的目的";
  clause 5 grants "一项个人的、不可转让的、非商业用途的、可撤销的、有期限及非排他性的许可 … 仅可为非商业目的使用，
  并仅可用作个人查看使用". Section 五 clause 2: data supplied by third parties is the third party's, and "其使用、收费等
  问题由第三方解释".
  **Reading:** the standard Tushare account licence does not permit showing Tushare-relayed data on a public or
  commercial site. This covers all three `internal` datasets, and — outside this module — any CN fact that reaches
  the site through Tushare.
- **Tushare 用户协议** (`doc_id=409`): no redistribution grant; account is personal ("您的账号仅限您本人使用").
- **SW Research** (`https://www.swsresearch.com/institute_sw/allIndex/releasedIndex`): the page carries only
  "版权所有 上海申银万国证券研究所有限公司 / Copyright © SWS Research Co.,Ltd." No licence or redistribution terms
  are linked from the page. **Reading:** no published permission; classification, constituents and index valuations
  are all-rights-reserved until SW Research (or a licensed vendor contract) says otherwise in writing.
- **SEC** (`scheme:sic:sec-current`, EDGAR facts): public primary data; already `public`.

## 5. Owner decisions that gate the rest

| Decision | Gates | Status |
|---|---|---|
| **A** — rights to store and show SW2021 classification/constituents, Tushare `daily_basic` marks, `sw_daily` official values | every SW/CN table above | open; terms in §4 do not allow public display under the standard account |
| **E** — A-share facts universe (`FACTS_CN_INDUSTRY_UNIVERSE=1`) | CN `fact_sync_scope` rows → CN facts → readiness gate | open |
| **CN publication** — `FACTS_CN_ENABLED=1` for `aggregate`, CN gold transcription (48 pending templates), and whether Tushare-sourced CN facts may be public at all | CN aggregates | open |
| **H** — valuation comparator (`pe_ttm_sw` vs no official anchor) | I-3: official, valuation runs, pairs, published valuations | open (options in `docs/audits/2026-11-07-industry-closeout.md`) |
| **C** — valuation / restricted series publication | published valuations | open; default "not published" |

The checklist with the exact confirmation and the command that follows each decision is in
`03-owner-checklist.md` (same folder).

## 6. Split

- Engineering, done in this change set: US SIC aggregates end to end (amendment, migration, method, job, dry run,
  cron + freshness, page), dry run for the CN job.
- Owner: A, E, CN publication, H, C. Nothing in those chains is run against production by this work.
