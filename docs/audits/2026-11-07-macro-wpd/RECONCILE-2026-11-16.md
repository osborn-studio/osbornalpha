# WP-D reconcile with main — 2026-11-16

> Superseded on 2026-11-17 by `FINAL-STATE-2026-11-17.md`: the Fed series shipped display-only with no catalog bump, v3 was built and reverted, and the China rows stay missing. This file is kept as the record of the reconcile.

Main `68701c48` (PR #226). Production per the commander: catalog `macro-catalog/30bcaa2a33c5`, `macro_regime@v2` (formula hash `dc26a628…`, closure narrowed by #132) registered and publishable, 22 judgments, `MACRO_JUDGMENTS_ENABLED` on. Both WP-D branches were merged with / rebuilt on this main (details at the end). Nothing here deploys or touches production.

## 1. Two changes to the plan that come out of the reconcile

**R1 — rights gate (new, from #182).** `docs/research/macro-data-sources-2026-11-08.md` records that CFETS (chinamoney) requires written authorization for copying and for "electronic scraping systems" (legal declaration §1; I re-read the live declaration today: 未经交易中心书面授权 … 通过硬拷贝或电子抓取系统获取本网站的内容 … 视为侵权), and that PBOC's legal notice leaves commercial redistribution of its statistics uncleared. The 2026-11-07 plan set both new sources to `rights:'official_open'` and `status:'active'`. That was wrong. Consequences:

- `CN_LPR_1Y`, new `CN_LPR_5Y` and their quote event sources, and `CN_AFRE_STOCK_YOY` enter the catalog as **`restricted`** (rights `third_party`, bilingual reason naming the missing authorization), never `active`, until the owner records the written authorization under runbook §9 step 1. Restricted rows are not collectable (`collectableOf` requires `active`), so no collector, cron or test ever fetches them.
- Disclosure: during the 2026-11-07 session of this task (before #182 existed) I called the chinamoney `LprHis` JSON endpoint repeatedly (probes of the window rules plus eight recorded yearly windows, 2019–2026), and fetched twelve PBOC stock-table HTM files. Those raw bytes are **not** in any commit and not pushed; the branch was rebuilt so they are absent from history. They stay in local scratch only (sha256 list in `docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md` D0 and below). No code path or test added by WP-D will call chinamoney. I made no further calls today except reading the public legal-declaration page.
- Repo fixtures follow main's precedent (`pbc-afre-stock-offline-contract.md`): minimal factual excerpts with a synthetic envelope, original-byte sha256 recorded in a manifest, never saved publisher pages.

**R2 — the "exactly once" catalog bump.** Every status flip of a restricted row (runbook §9 step 2) changes `CATALOG_VERSION` and therefore forces another F4 method version. To keep the bump single, PR-3 is built so the LPR/AFRE rows can go `active` in the same PR if the owner's authorization evidence exists when it merges; otherwise it ships them `restricted` and a later activation is a v4. Merge gate for PR-3 is an owner/commander decision (see §4). The 22 live v2 judgments settle void (`catalog_version_mismatch`) once the catalog version changes; that is the user-visible cost of the bump.

## 2. Per series: main vs this work vs left to activation

Legend: ✔ done and merged on main · ◐ on a WP-D branch · ✘ not done.

| Series | On main | WP-D branch adds | Left before it can be `active` |
|---|---|---|---|
| **LPR 1Y** (`CN_LPR_1Y`, monthly) | catalog row `missing` (weight 10, `catalog.ts:97`); #182 research: official history exists, CFETS authorization required, start 2019-08-20 | ◐ PR-1: quote parser for the recorded response shape (offline, synthetic envelope), `CN_LPR_1Y_Q` quote events + `deriveRateQuoteEvents`, dormant collector branch, plan task text | ✘ **owner: CFETS written authorization (O-LPR)**; ✘ catalog rows (PR-3); ✘ `parserFor` wiring (PR-3); ✘ real-byte evidence replay (needs authorization); quarantine = existing `policy_rate` profile (−5…30 %, rel. jump 3) already covers it |
| **LPR 5Y** (`CN_LPR_5Y`, weight 0) | not in catalog | ◐ same parser/events (field `5Y`); `---` before 2019-08-20 handled | same as 1Y; new id, never overwrites 1Y; weight 0 so it cannot change a score |
| **MLF 1Y** | catalog `missing`; #182: multiple-price awards since 2025-03, no unified rate | ◐ D0 adds: PBOC publishes only a monthly 操作表 with **balance** (亿元), no rate column, announcements are prose | ✘ nothing to implement: stays `missing`, reason rewritten in PR-3; **owner O-MLF**: want `CN_MLF_BALANCE` (a different quantity) or not; never carry forward a last rate |
| **社融存量同比** (`CN_AFRE_STOCK_YOY`, weight 20) | ✔ offline article parser `src/lib/macro/parsers/pbc-afre-stock.ts` v4 (#185/#198/#210): three allowlisted articles (2025-07 = 9, 2025-08 = 8.8, 2026-09 = 7.1), fixtures `parsers/fixtures/pbc-afre-stock-*.html`, contract `docs/research/pbc-afre-stock-offline-contract.md`; parser is deliberately not an ingest parser (no `ParsedPoint`, no Locator) and not in `parserFor` | ◐ PR-1: **table parser** for the PBOC 社会融资规模存量统计表 (official 增速（%） column, `html_cell` locator, charset by declaration) covering 2015-01…2026-09 from one file per year; trimmed fixtures; a test that the table's 2025-07 / 2025-08 / 2026-09 values equal main's article values (cross-check, no duplication of the article grammar) | ✘ **owner: PBOC use clearance (O-AFRE)**; ✘ authorized collector (dormant branch in PR-1); ✘ durable evidence (bucket already accepts `text/html`); ✘ catalog row + `parserFor` (PR-3); ✘ revision handling: `revisable`, new file name each month → new version via existing `macro_write_observations`; quarantine = existing `liquidity_yoy` profile (−50…100) |
| **WALCL** | nothing | ◐ PR-2 (pushed `85fc1c39`): recorded FRED CSV fixture + manifest, parser regressions (every period_end a Wednesday), `fredCosdFor(…, firstPeriod)`, `fredBackfillDoneBy`, cron backfill check, `usd_mn` quality profile, weekly `month_end` derive tests | ✘ types (`weekly`) + catalog rows `US_WALCL_W`/`US_WALCL` (PR-3); ✘ migration for `native_frequency` CHECK; ✘ weekly release-timeliness branch; rights: Board H.4.1, FRED tag "Public Domain: Citation Requested"; #182's FRED-terms caveat applies identically to the ten FRED series already live, flagged for the parent, not a new blocker |
| **RRPONTSYD** | nothing | ◐ PR-2: fixture (sparse daily: empty = no operation = no point), `usd_bn` profile | catalog rows `US_RRPONTSYD_D`/`US_RRPONTSYD` (PR-3); NY Fed source; daily amount, `immutable` |
| **WTREGEN** | nothing | ◐ PR-2: fixture, week-average semantics tested as Wednesday-dated | catalog rows (PR-3); `revisable` |
| **Asset memo** | no memo; #182 covers restricted equity indices (S&P/Nasdaq/CSI) rights and the Fed G.17 IPMAN idea only | ✘ not started (PR-3 task 13) | write `docs/research/macro-asset-coverage-2026-11-07.md`; builds on #182's index-rights findings, adds HK/gold/copper/bond total return |

Not on main and not mine: `method_manifest`, transmission v2, clock `acceptedVersions` (macro-p5).

## 3. What changed in the migration and hash assumptions

- Latest migration on main is `20261124110000_company_digest_retry_selection.sql` (`20261121090000` is taken by `macro_manifest_json_transport`, `20261123110000` and `20261124110000` are company). The WP-D catalog migration will be **`20261125090000_macro_wpd_catalog.sql`** (re-check main right before PR-3). The migration lock on main ends at `20261120093000`; the three later files are not in the lock yet (merger appends), so WP-D appends only its own entry.
- `macro_regime@v2` hashed set after #132 (recomputed with `importClosure` today, 33 files incl. deps and `docs/methodologies/macro_regime/v2.md`; list in `v2-closure.txt`): `catalog.ts`, `types.ts`, `regime.ts`, `regime-selection.ts`, `decimal.ts`, `judgment-contract.ts` and the judgments modules. **No longer hashed:** `snapshots.ts`, `freshness.ts`, `db.ts`, `read-api.ts`, `dq/freshness.ts`. So PR-2 and PR-1 stay clear of the set (gate: no changed file ∈ `v2-closure.txt`; clean on the Fed branch), and PR-3 may edit `snapshots.ts`/`freshness.ts` freely (they must keep delegating selection to `regime-selection.ts`).
- v3 closure narrowing (`macro-inputs.ts` extraction) is **dropped**: #132 already narrowed the deps; PR-3 only needs a v3 module that pins the new catalog literal and re-registers. The v2 → v3 change is therefore exactly the catalog.
- v2 retirement: v2 cannot stay in `REGISTRY` after a catalog change (its hash includes `catalog.ts`; `sync-methodologies` would report `formula_hash_drift` and refuse everything), so retire it with a SQL update + `judgment_methodology_events` row in the PR-3 migration, as P5 spec §5.7 described. The exact table/trigger contract will be checked on `20261116090000_judgments.sql` before the migration is written.

## 4. Decisions for the owner / commander

1. **O-LPR** — obtain CFETS written authorization for machine access and product use, or confirm LPR stays dormant. Alternative to evaluate (not done): PBOC publishes each monthly LPR announcement as prose under 货币政策 › 利率政策 › LPR; its rights would fall under the PBOC notice.
2. **O-AFRE** — PBOC use clearance for the monthly stock table / report (attribution is allowed for media; commercial redistribution is not cleared).
3. **PR-3 timing** — merge only (a) after O-LPR/O-AFRE are settled so one bump activates everything, or (b) now with those rows `restricted` and accept a later v4. Recommendation: (a) if the answers are expected within the same week; otherwise (b), because the Fed liquidity series are display-only and nothing urgent depends on them.
4. **O-MLF**, **O-US-IDX**, **O-CSI300**, **O-HK**, **O-COMMOD** as in the plan.

## 5. Branch state

- `claude/macro-wpd-fed` — merged `origin/main` (no rebase), typecheck/lint clean, 1862 macro/cron/judgments tests pass, pushed (`85fc1c39`), PR not opened yet.
- `claude/macro-wpd-cn` — rebuilt from `origin/main` (the old local-only branch held the raw CFETS/PBOC payloads in its history; it was never pushed). Contains the plan, plan-audit records and this document.
- Raw evidence kept only on the local SSD, outside any repository: `/Volumes/AIMATE_WORK/tmp/osbornalpha-wpd-raw-evidence/cn-http-2026-11-07/` (restored 2026-11-16 from the unpushed local commit after the session scratch was wiped; all 20 sha256 match the manifest) (LPR `CN_LPR_Q-2019…2026.json`, AFRE `CN_AFRE_STOCK-2015…2026.htm`, manifest with sha256s, recorder script).
