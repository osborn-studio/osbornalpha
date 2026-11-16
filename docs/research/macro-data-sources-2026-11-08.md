# Macro source feasibility — 2026-11-08

Checked **2026-11-08, Asia/Shanghai** against baseline `origin/main` `b0a67adb`.
Research outcome: **no new source cleared for automated product ingestion**. Official LPR history and directly retrievable AFRE stock publications exist. AFRE is technically promising; its rights and historical coverage need resolution before an ingestible adapter is justified. This is a research deliverable, not a data launch. No catalog, weights, registry, formula, methodology hash, flags, schema, or production data changed.

## Actual catalog inventory

`src/lib/macro/catalog.ts` contains four missing rows and six restricted rows. The catalog version remains `macro-catalog/30bcaa2a33c5`.

| Catalog ID | Current status / weight | Required definition and unit | Native frequency / revision policy in catalog |
|---|---|---|---|
| US_ISM_PMI | missing / 15 | ISM national manufacturing composite diffusion index; index points; seasonally adjusted | monthly / revisable |
| US_VIX_D | restricted / 0 | Cboe VIX daily closing index, expected near-term volatility from stock-index options; index points | daily / immutable |
| US_VIX | restricted / 5 | last eligible daily VIX close of each month; same index | monthly derived / immutable |
| CN_LPR_1Y | missing / 10 | 1-year loan prime rate; percent, not 5-year LPR or historical benchmark lending rate | monthly / immutable |
| CN_MLF_1Y | missing / 10 | 1-year MLF operation rate; percent, not operation quantity or reverse-repo rate | event / immutable |
| CN_AFRE_STOCK_YOY | missing / 20 | year-over-year growth of month-end aggregate financing stock; percent, not monthly financing flow | monthly / revisable |
| US_SP500 | restricted / 0 | S&P 500 index level | daily / immutable |
| US_NASDAQCOM | restricted / 0 | Nasdaq Composite index level | daily / immutable |
| US_DJIA | restricted / 0 | Dow Jones Industrial Average level | daily / immutable |
| CN_CSI300 | restricted / 0 | CSI 300 index level | daily / immutable |

“Immutable” above describes existing application handling, not a publisher guarantee that corrections never occur. Source corrections must be assessed before activation; do not silently change revision policy.

## Official publisher checks

### ISM manufacturing PMI: licensed source required

- [Current ISM October 2026 report and usage conditions](https://www.ismworld.org/globalassets/pub/research-and-surveys/rob/pmi/r4in202610pmi.pdf): the report includes a personal/noncommercial license and restrictions on redistribution and derivative tables/time series. Public availability does not clear product use.
- This check verified a current report, **not** an entitled historical archive or machine API. Full history, vintage access, exact release calendar, authentication, quotas and commercial terms remain unverified. Request those explicitly from ISM before implementation.
- Seasonal updates/revisions require an entitled vintage policy; the app already classifies this indicator as revisable. A regional Fed survey, S&P PMI or manufacturing output index cannot be assigned `US_ISM_PMI` or its regime weight.
- Decision: remain missing. Obtain ISM permission or a vendor agreement expressly permitting the intended storage, display, derived analysis and AI use. Merely subscribing to a terminal is insufficient evidence of redistribution rights.

### VIX: download exists; product entitlement unresolved

- [Cboe historical-data page](https://www.cboe.com/tradable-products/vix/vix-historical-data/) provides historical index downloads. [FRED VIXCLS notes](https://fred.stlouisfed.org/series/VIXCLS) identify daily closing frequency, index units, Cboe ownership and FRED's permission to reprint. FRED also labels the series citation-required; that label is not itself an OsbornAlpha entitlement.
- [Cboe website terms §2](https://www.cboe.com/terms/) permit limited personal/noncommercial downloads and require consent for broader uses, subject to their stated exceptions. No product-specific consent was found in this session.
- Community history claims January 1990 onward; complete coverage was **not** downloaded or verified here. Do not confuse legacy VXO, VIX futures, intraday quotes or settlement values with VIX close. Native corrections remain possible; FRED notes data can be revised.
- Public page browsing needs no account; authenticated commercial feeds, quotas, refresh SLA, complete history and downstream entitlements must be agreed with Cboe. Monthly `US_VIX` would still derive from native daily evidence, not an upstream monthly average.
- Decision: both rows remain restricted. Ask Cboe for the applicable index-data/display/derived-use agreement, or an authorized distributor with explicit downstream rights. No subscription or purchase initiated.

### LPR: official history exists; electronic extraction requires authorization

- [CFETS Chinese LPR page](https://www.chinamoney.org.cn/chinese/bklpr/) verifies the 1-year and 5-year-plus tenors, quotation mechanism, and publication at 09:00 Beijing time on the 20th, deferred for holidays. [English page](https://www.chinamoney.org.cn/english/bmklpr/) dates the reformed mechanism to 2019-08-20.
- [Official historical download UI](https://www.chinamoney.com.cn/r/cms/chinese/chinamoney/html/currency/lpr-shibor-history-download.html) contains date inputs and an Excel export action.
- [Verified PBOC reply](https://wzdt.pbc.gov.cn/eportal/ui?msgDataId=d5033b88445d445fba30e19dad3739e6&pageId=77c3557bd521439ea5cd869f5393ba98) directs post-2019-08-20 inquiries to China Money history and distinguishes earlier benchmark lending rates. This demonstrates an official discovery path, not a verified data API.
- [CFETS legal declaration §1](https://www.chinamoney.org.cn/chinese/legaldeclaration/) requires written authorization for copying/redistribution and electronic extraction. Do not reverse-engineer or call the export endpoint before authorization. The UI was inspected; **no payload, endpoint contract, export bounds, historical completeness, correction policy or API quota was validated**.
- The catalog's technical reason (“no verified official interface”) is now incomplete: an official UI exists. It remains missing because an authorized, verified machine interface is still absent. Keep this research outside the catalog to avoid changing the methodology binding.
- Decision: prioritize a CFETS machine-access and product-use agreement. Start the reformed series at 2019-08-20 unless a separately defined earlier regime is explicitly approved; do not backfill benchmark lending rates as LPR. Preserve actual publication date separately from month-end observation date and retrieval first-seen time.

### AFRE stock YoY: highest-value exact gap, not the AKShare flow series

- [PBOC August 2025 stock report](https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html) exists. An ordinary CLI GET returned HTTP 200, 24,993 bytes, `text/html`; the body includes the headline stock YoY. Receipt: fetched `2026-11-08T12:41:00.832488Z`, SHA-256 `dba2e5c43c1d3839f8f196cb280ea8c77553d385affe6079dbc075d02b7fafd4`. Raw response stays in task scratch, outside the PR. The [official government relay](https://app.www.gov.cn/govdata/gov/202509/12/536584/article.html) exposes the monthly stock, headline YoY, release date and definition: financing balance at period end. It also describes scope adjustments from January 2023. Preserve comparable-scope publisher growth, rather than computing growth from potentially incomparable rounded balances.
- This verifies one monthly publication and a 2025-09-12 release for August, **not** an archive, fixed release-day promise, historical earliest date, vintage API or complete monthly coverage. Authentication and numerical rate limits were not documented on the checked pages.
- The report footer directly links the [PBOC main-site legal notice](https://www.pbc.gov.cn/rmyh/109345/index.html). Section 1 reserves rights unless specially marked and describes downloading/use by media and websites already permitted by PBOC, with source attribution. No special reuse marking or applicable permission was verified for this report. Treat commercial redistribution as **uncleared**, not as a legal conclusion that underlying statistical facts can never be reused. No inference from the procurement subdomain is needed.
- [NBS 2025 annual communiqué](https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html) includes year-end stock growth. That is not a monthly source. No matching monthly NBS database leaf was verified in this bounded search. [NBS terms](https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html) allow downloading NBS statistics with usage conditions; they also distinguish third-party material and public/free informational reuse. An NBS relay must not be assumed to grant underlying third-party rights.
- Decision: ask PBOC for a documented monthly stock/YoY archive, revision policy and intended-use permission, or use an entitled provider after checking its precise series definition. Do not sum flows into stock or substitute `macro_china_shrzgm`.

### MLF: definition break prevents a continuous single-rate source

- [PBOC 2025 Q1 monetary-policy report, printed p.11](https://www.pbc.gov.cn/zhengcehuobisi/125207/125227/125957/f5c4690f2cbd40918bf24c2d39ac58af/2025091218344076234/2025081517321679368.pdf) explains that March 2025 introduced multiple-price awards and removed the unified winning MLF rate. This is a definition issue in addition to access and rights.
- Historical single-rate events may be recoverable, but a current unique 1-year MLF policy-rate time series cannot be assumed. Full earlier event history, publication/correction rules, API authentication, limits and commercial reuse were not verified.
- Decision: remain missing. Any historical terminal-date treatment or distinct 7-day reverse-repo policy-rate ID requires parent methodology coordination; never carry the last MLF rate forward as a newly observed rate.

### Restricted equity indices

- [S&P DJI licensing](https://www.spglobal.com/spdji/en//about-us/data-index-licensing/) and [S&P terms §4.2](https://www.spglobal.com/en/terms-of-use) require attention to data/display/derived-use permissions for S&P 500 and DJIA. No agreement or free replacement for those definitions was established.
- [Nasdaq GIDS licensing notice](https://www.nasdaqtrader.com/TraderNews.aspx?id=DN2024-5) says historical and end-of-day redistribution licensing requirements changed effective 2024-08-01. “Delayed/EOD is free to redistribute” is not a valid assumption for Nasdaq Composite.
- CSI 300 remains restricted: no verified underlying commercial data grant or entitled API was established. The existing AKShare wrapper is not such a grant. Publisher portal: [CSI](https://www.csindex.com.cn/).
- For these four catalog rows, full coverage, first history date, close/publication timing, correction policy, auth and quotas were **not validated**. Obtain administrator/distributor specifications and rights before building a collector. ETF prices, futures and total-return variants are distinct measures requiring distinct IDs.

## Developer-community search and implementation evidence

Internet search used the live web tool, and independent CLI searches used `mmx search query` for GitHub AKShare implementations and official CFETS terms. Search results were leads; conclusions above follow opened publisher pages, terms, and source code.

| Community implementation checked | Actual finding | Disposition |
|---|---|---|
| [AKShare macro_china.py, revision a6ab0d4](https://github.com/akfamily/akshare/blob/a6ab0d4ccb9858683396bd1b1ed8fbc80cb2f450/akshare/macro/macro_china.py) | `macro_china_lpr` calls Eastmoney; `macro_china_shrzgm` calls MOFCOM flow statistics | Neither establishes official authorized LPR access or stock YoY semantics |
| [OpenBB Cboe historical model, revision bbf1ab2](https://github.com/OpenBB-finance/OpenBB/blob/bbf1ab2020c2ce025333db56ece2036190fcad9c/openbb_platform/providers/cboe/openbb_cboe/models/index_historical.py) | Implements Cboe historical index fetching and distinguishes daily from recent intraday data | Engineering lead only; code licensing cannot authorize underlying data redistribution |
| [DBnomics ISM provider](https://db.nomics.world/ISM) and [maintainer-community issue](https://dbnomics.discourse.group/t/data-quality-bug-ism-pmi-dataset-returning-higher-values-instead-of-headline-pmi-since-2025-09/1000) | A user reports that `ISM/pmi/pm` began reading percent-higher rather than headline PMI | Not independently reproduced or assumed fixed; require direct publisher/vintage reconciliation and permission |
| [datasets/finance-vix README, revision f953e6a](https://github.com/datasets/finance-vix/blob/f953e6ab3ceb944a75f81708a6afbcb8864ee83d/README.md) | Documents Cboe download route and explicitly bases PDDL labeling on an assumption about factual data | That assumption is not publisher authorization; do not rely on it |

## Official complementary candidate explored, not shipped

[Fed G.17](https://www.federalreserve.gov/releases/g17/about.htm) offers NAICS manufacturing real output, index 2017=100, monthly SA: Board code `GMF` ([code documentation](https://www.federalreserve.gov/releases/g17/Current/ipdisk/g17tab1.txt)), also relayed as [FRED IPMAN](https://fred.stlouisfed.org/series/IPMAN). A proposed distinct ID would be `US_IPMAN_INDEX`; no row was added. Output is a complement to business surveys, **not** PMI; do not transfer ISM thresholds or weights.

The [Board copyright notice](https://www.federalreserve.gov/disclaimer.htm) generally permits reuse of Board information unless otherwise marked. G.17 releases are midmonth; the [release calendar](https://www.federalreserve.gov/releases/g17/default.htm) specifies 09:15 monthly releases and noon annual revisions. The [annual revision notice](https://www.federalreserve.gov/releases/g17/revisions/Current/DefaultRev.htm) shows that earlier history and seasonal factors change. Real-time backtesting needs vintages, not today's revised history backdated to the original month.

Access findings prevent a deliverable adapter:

1. Ordinary CLI GETs to the independently linked [Board SA text file](https://www.federalreserve.gov/releases/g17/Current/ipdisk/ip_sa.txt) and [official XML archive](https://www.federalreserve.gov/releases/g17/data/FRB_g17_xml.zip) returned HTTP 403. The browser reader can display the text file. This blocks those two tested CLI routes, **not the entire publisher**. No access-control bypass attempted. A usable direct machine route, service quota and complete GMF history remain unverified.
2. [FRED service terms](https://fred.stlouisfed.org/legal/), summarized prohibited-use section II, restrict use “in connection with the development or training of any software program or system or machine learning”. This is broader than model training in its wording; it does **not** establish that every runtime display or inference use is prohibited merely because a product has AI features. The same page permits attributed internal commercial use and client reports for public-domain/citation-required series. Parent must assess the actual retrieval, persistence, display and AI-analysis path against the full applicable terms; do not infer either universal clearance or a universal AI-product ban. Existing integrations are unchanged.
3. A small FRED-bound prototype was explored, tested and removed pending this service-terms/use-path assessment. It is **not** shipped or a cleared source. This PR contains no parser or data fixture. Neither complete GMF history nor current numeric equivalence across Board/FRED vintages was established.

Preferred next step: obtain a publisher-approved direct Board machine route or written clarification of relay use, then implement against exact publisher bytes. No arbitrary subscription needed or purchased. A generic current-release HTML scrape would not establish a reliable historical source.

## Parent-owned implementation and release procedure

Dependencies are per-source rights evidence (applicable public reuse terms or permissions where required, covering storage, public display, redistribution, derived results, AI use and evidence retention), an approved machine endpoint, and a documented definition/history/revision contract. No vendor is presumed entitled; request written coverage from the original publisher or its authorized distributor. Prefer AFRE stock YoY (weight 20) and authorized LPR (weight 10) for exact-gap work; manufacturing output is only a separate optional extension.

1. Record applicable public-domain/reuse policy or agreement/terms version, allowed use, attribution, endpoint host/path, auth handling, quota, release calendar, earliest reliable observation and vintage/correction policy. Avoid including credentials in fixtures or logs.
2. Capture bounded raw official bytes and receipt (final HTTPS URL/host, HTTP status, content type, fetched time, SHA-256, tool/parser versions). Build fail-closed parsers and synthetic malformed/definition-mismatch fixtures before network integration. Test exact units, tenor, period, missing cells, revisions, provenance and input bounds.
3. Keep candidate collection disabled and outside the registry. A parser alone cannot change `missing` to `active`. New complementary definitions get distinct IDs; existing IDs retain their definitions.
4. Parent reviews catalog-version impact, methodology components/formula hashes and registry binding. Any required methodology re-registration is a **separate coordinated release**; do not silently activate against the old binding. Treat the MLF definition break separately.
5. Rehearse on an isolated database using historical bytes and first-seen availability. Verify unchanged existing catalog/regime behavior, revision/quarantine handling and reproducible as-of reads; never backdate retrieval availability to publication time.
6. Parent alone authorizes production ingestion/flags, publishes or registers any required methodology, performs browser acceptance, deploys and merges. Coverage remains missing/restricted until all applicable gates pass.

## Validation for this research deliverable

Node 22.22.1; existing dependency tree reused through a local worktree symlink. No new dependency or database access. Baseline catalog, `macro-regime.v2` and CN-parser suites: **72 passed**. Final validation and mmx disposition are recorded in the PR/report. No adapter acceptance or production acceptance is claimed.
