# Wave215 production closeout — 2026-11-09

At 11:27:38 UTC both `osbornalpha.com` and `www.osbornalpha.com` served exact main `bffe600bca13b5f27b2ca2898f7dff7e4b4cb046` on Ready deployment `dpl_CmYBDBCjtGSZ5Hf9EEoj7KWJtEir`. All 18 anonymous probes passed. The exact-main Application and Macro CI runs passed. The preceding verified deployment `dpl_F3uADfAwC1nPGJA8mxBgS9wcMAou` at `9da178f8` is the rollback baseline. Rollback was not invoked. See the [machine receipt](2026-11-09-wave215-closeout.json), [Application CI](https://github.com/osborn-studio/osbornalpha/actions/runs/42607201237), and [Macro CI](https://github.com/osborn-studio/osbornalpha/actions/runs/42607200384).

| Merged change | Verified scope |
| --- | --- |
| [#214](https://github.com/osborn-studio/osbornalpha/pull/214) targeted A-share bootstrap | Three production issuer identities initialized and verified by DB and public API readback. |
| [#215](https://github.com/osborn-studio/osbornalpha/pull/215) Overview reporting-unit explanation | Both public NOAH Overview endpoints returned HTTP 200 and the expected four `multiple_units` reasons for null cells. Gross margin remained null with no reason. Neither response included evidence entries. Final signed-in Overview acceptance remains open. |
| [#216](https://github.com/osborn-studio/osbornalpha/pull/216) private evidence-write request correlation | Deployed. No qualifying AAPL attempt or production upstream request ID was captured. |
| [#217](https://github.com/osborn-studio/osbornalpha/pull/217) constituent Company column spacing | Deployed. The local shared fixture increased the 1592px text gap from 2px to 17px in English and Chinese, with identical 844px and 390px measurements. Exact signed-in SIC3571 visual acceptance remains open. |
| [#218](https://github.com/osborn-studio/osbornalpha/pull/218) release record | Preserves the earlier wave215 cutoff as historical evidence. |

The #215 final head `bb5964f3` isolated disposable PostgreSQL test fixtures after a CI deadlock. It left production SQL unchanged. The final branch recorded 9,119 full local tests and 112 PostgreSQL checks passing, followed by green exact-head remote CI.

The final signed-in Chrome retry stopped at `cgWindowNotFound`. The earlier `e0ec530f` signed-in check still establishes NOAH’s 2025 annual Statements CNY and USD revenue drawers and SIC3571’s SMCI revenue evidence drawer on that release. The [earlier wave215 record](2026-11-09-wave215-release.md) preserves those observations and their limits.

## CN identities and facts preflight

Targeted batch `b9e1a0dd-a741-4222-8d92-9958def4b68b` succeeded with three inserts and no errors. Readback verified three active issuers, three open primary A-share windows, nine hashed Tushare snapshots with sidecars, zero claims, and unchanged full-universe freshness. Each selected overview returned HTTP 200 with the expected issuer. Their latest facts and coverage were null, the three had no `fact_sync_scope` or `issuer_coverage` rows, and the public CN directory returned zero rows.

| Ticker | Issuer | Listing date | Planned facts since 2025 |
| --- | --- | --- | ---: |
| `600519.SH` | 贵州茅台酒股份有限公司 | 2001-08-27 | 224 |
| `000333.SZ` | 美的集团股份有限公司 | 2013-09-18 | 244 |
| `300750.SZ` | 宁德时代新能源科技股份有限公司 | 2018-06-11 | 236 |

A separate guarded facts dry run planned 704 inserts from 27 successful exact Tushare requests. It performed no batch, scope, lease, fact or storage writes. Apply-only checks, publication, filing links, metrics, and the separate company coverage digest remain unverified. Public CN numeric evidence also requires per-value PDF page, row and column locators. Production still uses `emptyPdfLocatorSource`.

## AAPL scheduled-window observation

The 11:20 UTC company digest batch `d19fa31b-106c-4077-a917-cf23f951ebb5` on `9da178f8` succeeded while idle, attempted zero streams, and recorded two failed backlog items. Dataset freshness remained `error`. AAPL’s issuer-scoped digest remained failed at digested revision 1. Stored coverage and the header’s coverage source reported 2026-10-23, while the overview separately returned the 2026-09-26 fiscal period. Equal scope and digest revisions and a recent sweep excluded AAPL under the current selector rules even though backoff had elapsed. This is an operational retry-policy gap. No new AAPL writer execution, request-to-backend correlation, historical timeout cause or recovery was established.

SW/I-3 rights and pipeline gates, independent financial/event gold, multi-member lineage, issuer methodology, disabled F6 kinds, foreign runtime and preferred quote-source recovery remain open. The release itself did not change flags, grants, licences, cron configuration or migrations.
