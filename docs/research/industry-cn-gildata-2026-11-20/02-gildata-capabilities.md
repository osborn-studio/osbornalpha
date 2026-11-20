# 02 — Gildata (恒生聚源) capability map

Compiled 2026-11-20. First pass: public pages only, no account created, no terms accepted, no
endpoint called. Second pass, the same day, after the owner placed `GILDATA_API_KEY` in
`~/.config/osbornalpha/secrets.env`: a small read-only probe of the live service (section 3).
The key value was never printed, logged, written to a file or put in a stored URL.

Every statement carries one of four marks:

- **L** — confirmed by a live call on 2026-11-20 with the owner's key (section 3).
- **D** — documented on a vendor page (link given); not checked live unless also marked L.
- **T** — stated only on a third-party page that describes the vendor's product (link given).
  A lead, not a fact.
- **U** — unknown; needs the owner's contract or a further check.

## 1. Which Gildata product this is

The vendor has several delivery channels. Which one the owner registered for decides almost
everything else, so it is the first owner question.

| Channel | What it is | Access | Mark |
|---|---|---|---|
| **数据地图 MCP** (Data Map MCP) | Financial data exposed as MCP tools for AI agents; built on the vendor's AIDB dataset. Offers "个人登录/注册" and "机构咨询". | Personal account or institutional contract; a key | D — `https://www.gildata.com/products/datamap` |
| AIDB 数据底座 | The "AI-ready" dataset behind the MCP: three-table model (LLM metadata, LLM relations, LLM data). "申请试用". | Trial by application | D — `https://www.gildata.com/products/AIDB` |
| 基础数据库 / 应用数据库 / 主题数据库 | The classic institutional database, delivered by a sync tool into the customer's own SQL Server, Oracle, MySQL and similar. Theme databases include a quant factor library and "财务PIT数据" (point-in-time financials) and an industry-chain graph. A data dictionary link is offered. | Institutional contract | D — `https://www.gildata.com/products/core-data` |
| WarrenQ F1 / Pure, 智眸 | Desktop and web terminals. | Account | D — vendor site navigation |
| LIGHT 云 `gildataastock` REST services | Hundsun's open platform publishes Gildata A-share REST services (for example "聚源股票F10基础版"): company profile, statements summaries, share structure, daily to yearly quotes. Sandbox and production gateways are listed. | LIGHT cloud application credentials (not read) | D — `https://www.hs.net/wiki/service/589.html`, `https://www.hs.net/wiki/nohead/252_gildataastock_v1_astock_quotes_interval_quote.html` |
| 阿里云 marketplace / 百炼 | "金融综合问数MCP" and a "裸接口版" listed by the vendor, "免费开通，按量计费". | Cloud marketplace account | T — search listing of `https://market.aliyun.com/store/4926193/index.html` (page itself not opened) |

**Confirmed live (L):** the key works against the 数据地图 MCP "tool" server and is refused by the
"api" (interface edition) server. The account is therefore the standard edition of 数据地图 MCP.
Whether it is a personal or an institutional account cannot be seen from the API and remains
the first owner question.

## 2. 数据地图 MCP: what is documented

Source for all D marks in this section: `https://www.gildata.com/products/datamap`, read
2026-11-20.

| Topic | Statement | Mark |
|---|---|---|
| Data families | Shanghai, Shenzhen and Beijing stocks; industry, concept and index data; funds; bonds; (carousel shows 5 families, 4 were readable) | D |
| Stock data | Company profile, share structure, shareholders and executives; real-time and historical quotes, capital flow; financial statement analysis, earnings forecasts, ratings and consensus; IPO, lock-up, holdings changes, margin trading | D |
| **Industry, concept and index data** | "板块成分": industry and concept constituents with weight ranking. "板块行情": index real-time and historical series, capital flow. "财务全景": industry-level profitability, solvency and growth analysis. "多维比对": index valuation, **industry prosperity (行业景气度)**, industry-chain data, constituent weights | D |
| Editions | 综合版: one interface, the vendor's own agent plans the retrieval. 标准版: several task agents (stock screening, fund screening, bond screening, research reports, data Q&A). **接口版: more than 450 fine-grained interfaces** | D |
| Billing | "计费灵活"; elsewhere on the vendor site, usage-based billing in a unit called "聚粒" is described for WarrenQ | D (existence) / U (prices, quotas) |
| Formats | "层级化 JSON 和 Markdown" with semantic tags | D |
| Query style | "自然语言智能解析": tools read a loosely worded request and plan multi-step retrieval | D |
| Server-side aggregation | "服务端完成聚合运算仅传回结果" | D |
| Security | Identity pass-through and OAuth flow; calls audited | D |
| Caveat on the page | "本页数据均为测试所得，本产品依托于AIDB" | D |

Statements from third-party pages (skill listings that wrap this product; read through a search
engine on 2026-11-20). The live probe (section 3) confirmed the host and the two server names,
showed that a bearer header works so the URL placement is unnecessary, and showed that the
interface-edition names below are **not callable with this account**:

| Topic | Statement | Mark |
|---|---|---|
| Key | Called `JY_API_KEY` in those skills; applied for through the product page or by e-mail to the vendor; the vendor sends keys for a "tool" edition and an "interface" edition | T — `https://skillhub.cloud.tencent.com/skills/jy-fund-manager-profile`, `https://jindage.com/en/skills/jy-in-depth-stock-report` |
| Transport | Two remote MCP servers, a "tool" server and an "api" server, on the vendor's API host, **with the key passed as a URL query parameter** | T — same |
| Call shape | Each interface takes a single free-text `query` argument (for example a company name plus what is wanted) | T — same |
| Limits seen by users | "at most 3 indicators per call" on some interfaces; occasional HTTP 500 that succeeds on retry; some interfaces need a particular wording | T — same |
| Industry interface names | `StockBelongIndustry` (a stock's Shenwan / CSRC classification), `IndustryConstituentStocks`, `IndustryFinancialAnalysis`, `IndustryDailyQuote`, `IndustryCapitalFlow`, `SectorRank`, `ConceptConstituentStocks` | T — search results for the skill pages above and related ones |
| Company interface names | `FinancialStatement` (three statements), `FinancialAnalysis`, `StockValueAnalysis` (PE, PB, PS, EV/EBITDA, dividend yield, used by the skill to compute historical percentiles), `ValueAnalysisComparison`, `FinancialDataComparison`, `FinancialRatioComparison`, `StockDailyQuote`, `StockMultiPeriodQuote`, `MainOperIncData`, `ProcurementAndSales` | T — same |
| Macro and industry series | `MacroIndustryData` on the "tool" server | T — same |
| Scale | "more than 3000 indicators" in AIDB; product released early March 2026 | T — `https://www.caieglobal.com/ainews/289.html` |

No public reference manual for the 450 interfaces was found. The names above are a partial list
seen in other people's prompts, not a catalogue.

## 3. Live verification, 2026-11-20

The owner placed `GILDATA_API_KEY` on 2026-11-20. A scratch probe (kept outside the repository)
made 5 authentication attempts, 1 tool listing and 16 tool calls, all read-only. The key was
loaded with `node --env-file`, sent only to the vendor's API host, and redacted from all output.
Raw responses stay in the session scratch directory and are not committed; this section records
shapes (interface names, column names, row counts, date ranges), not values.

### 3.1 Access

| Topic | Live result | Mark |
|---|---|---|
| Key accepted | Yes. No second credential (app id, secret, account) was asked for | L |
| **Header authentication** | `Authorization: Bearer <key>` is accepted. The URL query parameter also works; `x-api-key` and a bare `token` header are rejected (HTTP 401, code 1001). **The key never needs to be in a URL** | L |
| Transport | MCP over HTTP POST (JSON-RPC, protocol `2025-03-26`), plain JSON responses, no session id header | L |
| **Entitlement** | The "tool" server answers and lists **9 tools**. The "api" server (the 450-interface edition) answers `Unauthorized tool or server access` for this key | L |
| Tools on this account | `FinQuery`, `MacroIndustryData`, `SmartStockSelection`, `SmartFundSelection`, `SmartFundManagerSelection`, `AnnouncementData`, `IcEnterpriseDataQuery`, `FinDataFallbackQuery`, `WebSearch` | L |
| Call shape | Every tool takes one free-text `query` (some also `topk`; `FinDataFallbackQuery` also an optional `api_name`). **No structured parameters** (no code, date range, field list) | L |
| Response shape | Tool result text is JSON: `code`, `results[]`, sometimes `message`. Each result has `api_name` (the underlying interface, in Chinese, for example 行业财务分析) and `table_markdown` (a Markdown table with units in the column headers). No dataset id, no table or field identifiers, no update timestamp, no as-of | L |
| Latency | 2–12 seconds per call | L |
| Rate-limit or quota headers | None returned. No limit was hit in 16 calls | L (absence) / U (the actual quota and price) |
| Row volume | One call returned 2,642 daily rows (about 357,000 characters) without truncation; another returned 544 rows | L |
| Determinism | The same query twice returned the same set of result blocks **in a different order** (byte hashes differ, content equal after sorting) | L |
| Multi-industry queries | Two queries asking for all 31 industries at once returned zero rows. One industry per call works | L |
| **Silently ignored conditions** | A query for constituents "as of 2019-12-31" returned exactly the same response as the query for current constituents. A query for the lifecycle stage returned four unrelated tables. The service answers with what it has and does not say that a condition was dropped | L |

### 3.2 Data, by need

| Need | Live result | Mark |
|---|---|---|
| Shenwan classification of a stock | `所属行业分类`: stock, Gildata code, scheme label "申万行业分类", level (一级 / 二级 / 三级), industry name, **industry code in the Shenwan industry-code form (six digits, for example `270000`), not the `801xxx` index code** | L |
| Classification tree as a list | Two phrasings returned zero rows. The tree has to be assembled from constituents and per-stock classification, or a working phrasing found | L (not obtained) |
| Shenwan version | The prosperity table labels its scheme "申万行业分类(新)"; level-3 names carry the 2021-style suffixes. Consistent with the 2021 standard; not stated outright | L (indirect) |
| Constituents, current | `行业成分股`: stock name, code, industry, level, scheme. 544 rows for one level-1 industry. **No entry date, no exit date, no weight**, even when asked | L |
| **Constituent history** | **Not available through this account**: the past-date query was ignored, the per-stock "history of changes" query returned only the current three levels, and `FinDataFallbackQuery` with `api_name` set returned the same current list | L |
| Screening by industry | `SmartStockSelection` returns stocks with Shenwan level 1, 2 and 3 names in one table (42 rows for one industry with `topk=-1`) | L |
| **Industry-level financial aggregates** | `行业财务分析`: 60 columns. Per industry and cut-off date: number of listed securities; revenue and revenue TTM; operating cost; operating profit; net profit; parent net profit (each with TTM); net assets; total assets; ROE in five variants (average, diluted, TTM, two ex-items); gross margin and gross margin TTM; net margin; **operating cash flow / total revenue**; parent net profit YoY; gross profit YoY; turnover, leverage and per-employee ratios. Amounts in 万元 | L |
| Aggregate history and periodicity | **Every quarter-end from 2016-03-31 to 2025-12-31 in one call** (10 years × 4), plus 2026-06-30 and 2026-09-30 in another. Flow values are **cumulative year-to-date**, with separate TTM columns; there is no single-quarter column and **no revenue YoY column** | L |
| Member count per period | Present (上市证券数量). It differs from the current constituent count, so the aggregate is over some period-specific set; **which set is not stated** | L |
| Aggregation method | Not stated in the response | U |
| Industry valuation | `行业价值分析`: constituent count, total / float / free-float market value, PE TTM, PE LYR, PB LF, PS TTM, PS LYR, PCF, dividend yield; daily | L |
| Index valuation | `指数价值分析` for the Shenwan industry index: the same multiples plus PB MRQ, PEG, equity risk premium, and **the vendor's own historical percentiles for PE TTM and PB LF**; **daily from 2016-01-04 to the previous trading day** | L |
| **Prosperity indicator** | `行业景气度`: per industry and month-end: a prosperity value (a small decimal), its rank, the number of industries ranked, rank share. **Monthly from 2021-08-31**. No definition in the response | L (exists) / U (definition) |
| **Lifecycle stage** | **No such field.** The query fell back to financial, valuation, prosperity and technical tables | L |
| Industry technical indicators | `行业技术分析` (moving averages, MACD, KDJ, RSI) exists; not needed | L |
| Company statements | `财务报表`: item name, item code (for example `OperatingRevenue`, `NPParentCompanyOwners`), hierarchy, report period, period type, cumulative flag, amount, display unit, YoY. Annual 2015–2025 returned for one company | L |
| Point-in-time / as-reported | The statements table has **no announcement date and no restated flag**; the same query returned two statement blocks with different period coverage and no label saying which is original and which restated. Announcement dates come only through separate `A股公告` rows (announcement id, title, date, publish time) | L |
| Macro and industry operating series | `MacroIndustryData` is on the account; not probed | D (tool description) |

### 3.3 What the live calls change

1. The account is the **standard ("tool") edition**, not the interface edition. The interface
   names listed from third-party pages in section 2 are not callable with this key; the
   Chinese `api_name` values in responses are the vendor's own labels for the same datasets.
2. The four data modules of the competitor page can all be fed from this account: aggregates
   2016–2025 by quarter, daily index valuation since 2016, monthly prosperity since 2021-08.
   A full refresh is about four calls per industry (members, financials, valuation,
   prosperity), roughly 125 calls for 31 industries.
3. Constituent history and point-in-time financials are **not** obtainable. All history built
   on this account is reconstruction, and our own company-level aggregation (path C) cannot be
   made point-in-time from this source alone.
4. The free-text interface drops conditions it cannot serve without saying so. Every parser
   must check that the response actually matches the request (interface name, industry, date
   range, column set) and reject it otherwise.
5. Result-block order is not stable, so raw bytes are stored as received and a canonical form
   (blocks sorted) is hashed for comparison.

## 4. Access mechanics (documentation, where not superseded by section 3)

| Topic | Finding | Mark |
|---|---|---|
| Authentication | A key; OAuth for third-party platforms | D; header form confirmed in 3.1 (L) |
| Quotas, rate limits, concurrency | Not stated; none observed | U |
| Price and billing unit | Usage-based; unit and price not published on pages read; the probe could not see consumption | U |
| Response format | "Hierarchical JSON and Markdown" | D; exact shape in 3.1 (L) |
| Field identifiers, sign conventions | Units are in column headers; no field ids for aggregates; item codes exist for company statements | L |
| Pagination and maximum rows | No pagination seen; upper bound unknown | U |
| Update time of each dataset after disclosure | Not stated; not in responses | U |
| Service continuity | The vendor may change, interrupt or end the service at any time | D — service agreement, section 3 |
| Accuracy | No warranty of timeliness or accuracy | D — service agreement, section 6.1 |

## 5. Terms: storing, deriving, displaying

Source: the vendor's public service agreement for WarrenQ F1 and 数据地图 MCP, shown on the
personal-centre sign-in page
(`https://ufe.gildata.com/allInDataTest/gildata-personal-center/#/loginProtocol`), read
2026-11-20 without accepting it. It is the agreement a personal registrant accepts; an
institutional contract would have its own terms. Short paraphrases; one phrase quoted where the
wording decides the matter.

| Question | What the public agreement says | Mark |
|---|---|---|
| Who may use the data | Only the account holder personally, within the authorised scope of the service (section 2, account rules) | D |
| Giving data to others | The account holder may not use the service or its data for a commercial purpose beyond that scope "或向任何第三方提供" (or provide it to any third party) | D |
| Commercial use of content | Text, images and other material in the service are protected; no commercial use without the rights holder's consent (section 4.1) | D |
| Investment advice | The service may not be used for unlicensed investment consulting or stock recommendation (section 2.8.4) | D |
| Storing responses on our own servers | Not addressed | U |
| Deriving new figures (aggregates, percentiles, scores) and showing those | Not addressed | U |
| Showing vendor figures on a public website | Not addressed directly; "provide to any third party" reads as a prohibition for a personal account | D (by implication) |
| Attribution wording required when display is allowed | Not addressed | U |
| Shenwan classification names and codes (owned by the index provider) passed through the vendor | Not addressed | U |
| Retention after the account ends | Not addressed | U |

**Reading for the project.** Under the public personal-account agreement, showing Gildata
figures to OsbornAlpha users is not permitted: OsbornAlpha users are third parties, and the site
is a commercial service. Storing responses for our own replay and computing our own figures are
not addressed either way. The release gate in the specification therefore treats every
Gildata-sourced figure, and every figure derived from one, as **admin-only** until the owner
has written terms that allow display. The competitor's "数据源:恒生聚源" label shows that some
arrangement for display exists for them; it does not tell us which.

## 6. Risks that follow from the above

1. **Replay through a natural-language interface (confirmed, L).** Tools take free text only;
   block order varies between identical calls; unsupported conditions are dropped silently.
   Replay must rest on *our stored raw response*, never on re-calling the vendor, and every
   parser must verify that the response matches the request. The source drawer can show the
   vendor's interface label (`api_name`), the query template, the column name, our fetch time
   and the response hash. It cannot show a vendor table or field id or a vendor as-of time,
   because the responses carry none.
2. **No constituent history, no point-in-time (confirmed, L).** Only today's constituents are
   returned. Any history is a reconstruction; the existing industry schema already models this
   (`historyClass` reconstruction).
3. **Vendor aggregates are opaque (confirmed, L).** Ready-made numbers with a member count but
   no method and no member list for the period. They can be shown only as vendor-reported.
   Our own aggregate over company-level inputs would cost roughly one call per company per
   refresh (about 5,000) and would still lack announcement dates.
4. **Key placement (resolved, L).** The bearer header works; the key is never put in a URL.
5. **Personal licence.** See section 5. Unchanged by the probe.
6. **Service can change or stop without notice.** Stored responses keep the pages alive in a
   stale state; the design needs that state.
7. **Cost is invisible to the client (L).** No quota or consumption header is returned, so the
   call budget has to be enforced on our side and reconciled with the owner's account page.

## 7. Questions

### 7.1 Still open — owner or contract

1. Is the account personal or institutional, and what do its terms say beyond the public
   service agreement?
2. Does your agreement allow showing Gildata figures to signed-in OsbornAlpha users, to the
   public, or to nobody but you?
3. Does it allow showing figures we compute from Gildata inputs (growth rates, percentiles,
   stage labels) when the inputs themselves stay hidden?
4. Does it allow storing raw responses on our servers, and for how long after the account ends?
5. What attribution text and what restrictions on Shenwan names and codes apply?
6. What does a call cost in the account's billing unit, what is the quota, and what monthly cap
   should we stay under? (A full refresh is about 125 calls.)
7. Is the interface edition (450 interfaces, possibly with constituent dates and structured
   parameters) worth asking the vendor for?
8. Can the vendor state, in writing, the aggregation method of 行业财务分析, the member set it uses
   per period, and the definition of 行业景气度?

### 7.2 Answered by the live probe (see section 3)

| # | Question | Answer |
|---|---|---|
| 9 | Which tools does the server expose | 9 tools on the "tool" server; "api" server refused |
| 10 | Structured parameters; same response twice | Free text only; same content, different block order |
| 11 | Shenwan version, levels, codes | Levels 1–3; six-digit industry codes, not index codes; version consistent with 2021, not stated |
| 12 | Constituent dates; past date | No dates; past date silently ignored |
| 13 | Industry financial aggregates | 60 columns, quarter-ends 2016–2026, cumulative and TTM, member count, no method |
| 14 | Prosperity | Monthly value, rank and rank share since 2021-08; no definition |
| 15 | Lifecycle field | None |
| 16 | Valuation | PE TTM, PB LF, PS TTM daily; index series since 2016-01-04 with vendor percentiles for PE and PB |
| 17 | Company statements | Annual 2015–2025 with item codes; cumulative; no announcement date or restated flag in the table |
| 18 | As-of or dataset id in responses | No |
| 19 | Row limits | 2,642 rows in one response without truncation; 31-industry queries return nothing |
| 20 | Errors | No 5xx and no rate limit in 16 calls; auth failure is HTTP 401 code 1001 |

### 7.3 Still open — needs a few more calls

21. A phrasing that returns the level-1 and level-2 lists with codes directly.
22. Whether `MacroIndustryData` holds industry operating series useful for prosperity.
23. Which of the two statement blocks returned for a company is the restated one.
24. The mapping from six-digit industry codes to `801xxx.SI` index codes (needed to join with
    the existing `sw2021` rows, whose `code` is the index code).
