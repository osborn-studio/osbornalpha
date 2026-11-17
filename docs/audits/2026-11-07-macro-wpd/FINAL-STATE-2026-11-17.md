# WP-D final state — 2026-11-17

This is the closing record of the macro workbench data-gap work package (WP-D). Where it conflicts with the plan (`docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md`), `RECONCILE-2026-11-16.md` or the research notes, this document wins.

Main at the time of writing: `851f5121`. The method in force is `macro_regime@v2`, pinned to catalog `macro-catalog/30bcaa2a33c5`. WP-D did not change the hashed catalog.

## 1. Outcome per series

| Series | Final state on main | Reason |
|---|---|---|
| Fed total assets (`US_WALCL_W`, `US_WALCL`) | **Shipped**, display only (weight 0) | #227 fixtures and FRED backfill rules; #233 display registry |
| Overnight reverse repo (`US_RRPONTSYD_D`, `US_RRPONTSYD`) | **Shipped**, display only (weight 0) | same |
| Treasury General Account (`US_WTREGEN_W`, `US_WTREGEN`) | **Shipped**, display only (weight 0) | same |
| `CN_LPR_1Y` (weight 10) | **Missing** (catalog row unchanged) | A redistributable official source was found (BIS) and implemented, then not shipped by owner decision on 2026-11-17. See §2 |
| `CN_LPR_5Y` | **Dropped**, no catalog row | Published only by CFETS and PBOC; BIS carries the 1-year tenor only |
| LPR quote-date events (`CN_LPR_1Y_Q`) | **Dropped**, no catalog row | No redistributable source gives real quote dates (BIS stamps changes on the 20th even when the quote was deferred) |
| `CN_AFRE_STOCK_YOY` (weight 20) | **Missing** (catalog row unchanged) | PBOC is the only publisher of the monthly stock growth rate and its notice does not grant reuse; the gov.cn relay forbids commercial republication; NBS has no monthly series; BIS credit statistics are a different quantity |
| `CN_MLF_1Y` (weight 10) | **Missing** (catalog row unchanged) | No single MLF rate exists since March 2025 (multiple-price awards); earlier rates are prose on pbc.gov.cn under the same PBOC notice |

Missing rows stay in the regime denominator. Nothing is interpolated, carried forward or replaced by a proxy.

The three catalog rows still carry their pre-WP-D reason texts (`src/lib/macro/catalog.ts:97-99`). They are accurate but less specific than the reasons above. Rewriting them changes `CATALOG_VERSION` and therefore forces a new method version, so it is left for the next catalog change.

## 2. LPR 1Y via BIS — researched, built, not shipped

- Research: `docs/research/macro-cn-redistributable-sources-2026-11-16.md`. BIS central bank policy rates (`WS_CBPOL`, key `M.CN`) is the 1-year LPR from 2019-08-20, monthly end of period, under terms that allow use with citation.
- Implementation: PR #236 (merge commit `57f041a2`) added the BIS provider and parser, a recorded fixture, the catalog change to `macro-catalog/b91aad6b17f3`, `macro_regime@v3` and the `retire_methodology` function.
- Owner decision 2026-11-17: do not ship v3. PR #238 (merge commit `40c88f94`) reverted #236. Main is v2 only.
- Production was never moved to v3 by this work package: I did not apply migration `20261128090000_macro_wpd_v3.sql`, register v3 or request BIS from production. When I last read the production registry (2026-11-17, read only, before the revert) it held `macro_regime` v1 and v2 only and the migration was absent.
- The work is parked on branch `claude/macro-wpd-catalog-v3` (head `acf2d976`). No PR is open, and none should be opened unless the owner asks.

If the owner later wants it back:

1. Git treats the branch's commits as already merged, so re-land by reverting the revert (`40c88f94`) on a new branch, not by re-opening the old branch.
2. Give the migration a new timestamp. `20261129090000` and `20261130090000` are now on main, so `20261128090000` would sort before applied migrations.
3. Recompute the catalog version and the v3 formula hash on the main of that day. Both recorded values (`b91aad6b17f3`, `f5d2d6cb…`) were computed against an older main.
4. Refresh the BIS fixture and re-read the BIS terms at https://data.bis.org/help/legal.
5. The owner confirms the BIS "no additional charge" condition (O-BIS), and the `licenses.json` evidence text is updated in the same change.
6. Accept the cost: live v2 judgments settle void (`catalog_version_mismatch`) and calibration restarts for v3.

## 3. What WP-D left on main

- **#227** — FRED fixtures for WALCL, RRPONTSYD, WTREGEN; `fredCosdFor(…, firstPeriod)`; `fredBackfillDoneBy`; `usd_mn` / `usd_bn` quality profiles.
- **#228** — offline parsers `parsers/chinamoney.ts` and `parsers/pboc-afre.ts`, excerpt fixtures under `fixtures/cn-http/`, dormant collector branches in `scripts/macro/collect.py`, `deriveRateQuoteEvents`. None of this is reachable: no catalog row points at it and no code or test requests chinamoney or pbc.gov.cn. It is useful only if CFETS or PBOC authorization is ever obtained.
- **#233** — the unhashed display registry (`display-catalog.ts`, `series-registry.ts`) and migration `20261127090000_macro_display_frequency.sql`, which lets `macro_series.native_frequency` hold `weekly`. Display series have weight 0 and are outside the `macro_regime` formula hash, so adding one needs no method bump.
- **#237** — removed a byte-identical duplicate of that migration.
- Docs — the plan, the plan audits, the reconcile, the two research notes and this record.

Raw CFETS and PBOC payloads recorded on 2026-11-07 are in no commit. They are kept outside any repository at `/Volumes/AIMATE_WORK/tmp/osbornalpha-wpd-raw-evidence/cn-http-2026-11-07/`.

## 4. Production follow-through for #233 — not verified by this session

The commander session reported that another session applied `20261127090000` to production and deployed main `606be1f2`. I have not confirmed any of the following on production, so each is open until someone reads it:

- the catalog mirror holds the six display rows under the display registry's own version;
- the macro sync after that deploy fetched WALCL, RRPONTSYD and WTREGEN (observations, evidence rows, freshness);
- the series API returns them;
- whether the FRED backfill for the three series has completed.

When this is checked, record it in `docs/audits/2026-11-07-macro-wpd/ROLLOUT-display-registry.md`.

## 5. Remaining owner decisions

The asset-coverage memo (`docs/research/macro-asset-coverage-2026-11-16.md`) is the standing list. In short:

| Decision | Question |
|---|---|
| O-BIS | Ship `CN_LPR_1Y` from BIS after all? Declined on 2026-11-17; §2 lists what re-landing takes |
| O-LPR, O-AFRE | Seek CFETS / PBOC authorization? Declined on 2026-11-16; without it LPR 5Y, quote dates and 社融存量同比 have no source |
| O-MLF | Add an MLF **balance** series (a different quantity) or leave MLF uncovered? |
| O-US-IDX | Licences for S&P 500, Dow Jones Industrial Average, Nasdaq Composite |
| O-CSI300 | Licence for CSI 300 |
| O-HK | Hong Kong indices; needs a region beyond US and CN first |
| O-COMMOD | Gold and copper: licensed daily benchmarks, World Bank monthly averages, or no coverage |
| O-BOND | Define "bond total return" and find a licensed source |

Every item that flips or adds a weighted or restricted catalog row changes `CATALOG_VERSION` and needs one new method version; batch them.
