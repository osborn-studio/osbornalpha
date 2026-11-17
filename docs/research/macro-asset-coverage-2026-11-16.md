# Macro asset coverage — decision memo (2026-11-16)

Scope: which asset series the macro workbench could add (US equity indices, CSI 300, Hong Kong, gold, copper, bond total return), from which **primary** source, under which rights, and with which price/total-return and trading-day semantics. **Nothing here is implemented**: every item that needs the owner's written licence confirmation is an owner decision (runbook §9). Builds on `docs/research/macro-data-sources-2026-11-08.md` (#182) for S&P DJI, Nasdaq, CSI and Cboe; new checks on 2026-11-16 are marked ✔; anything I could not open is marked "not verified" rather than assumed.

Catalog today (main `68701c48`): `US_SP500`, `US_NASDAQCOM`, `US_DJIA`, `CN_CSI300` are `restricted` (rights `third_party`, via FRED for the US three, via AKShare/CSI for CSI 300); `US_WTI*` active (EIA via FRED); `US_UST10Y` / `CN_CGB10Y` are asset *views* of the 10-year yields (a yield, not a holding return). There is no Hong Kong, gold, copper or total-return row, and `Region` only knows US and CN.

> **Status, 2026-11-17:** WP-D is closed and this memo is the standing list of owner decisions for macro data coverage. Nothing in it has been decided or built since it was written. Two changes to the "catalog today" paragraph above: the Fed liquidity series (WALCL, RRPONTSYD, WTREGEN) are now live as display-only rows in the unhashed display registry (#233), and the China rows `CN_LPR_1Y`, `CN_AFRE_STOCK_YOY`, `CN_MLF_1Y` remain `missing` (LPR via BIS was built and not shipped). The China decisions (O-BIS, O-LPR, O-AFRE, O-MLF) are listed with the ones below in `docs/audits/2026-11-07-macro-wpd/FINAL-STATE-2026-11-17.md` §5.

## Summary table

| Asset | Primary source (publisher) | Rights found | Price vs total return | Trading-day alignment | Verdict |
|---|---|---|---|---|---|
| S&P 500, Dow Jones Industrial Average | S&P Dow Jones Indices | Licence required for data/display/derived use (#182: S&P terms §4.2); FRED is a relay, not the owner; S&P pages returned 403 to an ordinary GET today | Price index (FRED `SP500`, `DJIA`); total-return variants are separate indices and ids | NYSE days; monthly row = last trading day | **Owner decision O-US-IDX**; stays `restricted` |
| Nasdaq Composite | Nasdaq, Inc. | EOD/historical redistribution licensing changed 2024-08-01 (#182); "EOD is free" is not an assumption we can make | Price index (`NASDAQCOM`) | Nasdaq days | **O-US-IDX**; stays `restricted` |
| CSI 300 | China Securities Index Co. | No product grant verified (#182); site reachable today (200) but its disclaimer is script-rendered and could not be read by an ordinary GET | Price index `000300`; the total-return index (`H00300`) is a different id | SSE/SZSE days (A-share calendar, differs from US) | **O-CSI300**; stays `restricted` |
| Hong Kong (Hang Seng, Hang Seng Tech) | Hang Seng Indexes Co. (HKEX is only the exchange) | Not verified: the terms URL I tried returned 404; no grant known | Price and total-return indices both exist; HSTECH starts 2020-07-27 (no back-simulation) | HKEX days; **needs `Region` ≠ US/CN → methodology/type change** | **O-HK** + a separate spec; not in catalog |
| Gold | LBMA Gold Price (administered by ICE Benchmark Administration) | ✔ LBMA page: "A licence from IBA is required in order to obtain, use or redistribute real-time or historical benchmark data" (historical tables moved behind a licensed portal) | Spot benchmark price (USD/oz), no yield; twice-daily auction (10:30 and 15:00 London) | London business days; must choose the AM/PM fix and the monthly rule (last fix of month vs average) | **O-COMMOD** (IBA licence) — no free primary source |
| Copper | London Metal Exchange official price | LME data page returned 403 to an ordinary GET; terms not verified | Cash settlement price (USD/t), not a futures roll series | LME days | **O-COMMOD** |
| Gold / copper monthly averages | World Bank "Pink Sheet" (`CMO-Historical-Data-Monthly.xlsx`) | ✔ page lists monthly XLS and annual XLS; it points to World Bank Terms of Use for datasets, which resolved to the general World Bank terms: limited licence, attribution including **third-party content providers**, no charging for access/redistribution/derivatives. Whether the underlying LBMA/LME series are cleared by that licence is **not** established | Monthly **average** price, not month-end, and not a total return | Month, no trading-day alignment | Candidate only if the owner accepts averages; needs an `.xlsx` locator and bucket MIME (a migration) — **O-COMMOD** |
| Bond total return | None free and primary found. Candidates by publisher: ChinaBond/CCDC 中债指数 (publishes a monthly index statistics report; site reachable ✔); ICE BofA / Bloomberg US indices (licensed vendors) | Not verified for redistribution | The existing `US_UST10Y` / `CN_CGB10Y` are **yield** views; a yield change in bp is not a holding return | Bond market days | **O-BOND**; do not label yields as returns |

## What each decision unlocks

1. **O-US-IDX / O-CSI300** — flip `restricted` rows to `active` per runbook §9 (record who confirmed, when, scope; set `rights`; attribution text from the rights holder). The ingestion for the US three already exists (FRED CSV). CSI 300 needs a collector that reads the publisher, not the AKShare wrapper. Each flip changes `CATALOG_VERSION` and therefore forces the next F4 method version; batch them with the other WP-D activations.
2. **O-HK** — requires extending `Region` and the regime/type vocabulary first (a methodology change, not a data task); no catalog row until then.
3. **O-COMMOD** — decide between (a) buying/obtaining the IBA and LME licences for daily benchmarks, (b) accepting World Bank monthly averages with the third-party-content caveat, or (c) not covering gold/copper. Under (b) the monthly average must be a distinct series id (`…_AVG`), never presented as a month-end price.
4. **O-BOND** — define "bond total return" first (index, currency, maturity band, price vs total return), then ask the publisher; until then show yields with the existing "yield change, not holding return" wording.

## Semantics to keep when any of this is built

- Price index ≠ total-return index ≠ ETF ≠ futures: each is its own id; never alias one onto another (#182).
- Month-end rows derive from native daily rows with the existing `month_end` rule (last observation, completion witness = first later-month observation); a monthly average source is a different definition.
- Trading calendars differ (NYSE, SSE/SZSE, HKEX, London); cross-market comparisons use the existing same-period pairing and never fill a holiday.
- Restricted rows stay out of `collectableOf`; nothing is fetched until the owner's written confirmation is recorded in `docs/audits/`.
