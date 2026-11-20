# 02 — Gildata (恒生聚源) capability map

Compiled 2026-11-20 from public pages only. No account was created, no terms were accepted, no
key was used (`GILDATA_API_KEY` is not yet in `~/.config/osbornalpha/secrets.env`; only the
variable names in that file were checked, never values). No endpoint was called.

Every statement carries one of three marks:

- **D** — documented on a vendor page (link given).
- **T** — stated only on a third-party page that describes the vendor's product (link given).
  Treat as a lead to verify with the key, not as fact.
- **U** — unknown; needs the owner's contract or the key.

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

Working assumption for the rest of this document: **the owner registered a personal account for
数据地图 MCP** (the product with self-service registration and a key). If it is one of the
others, sections 3–5 change.

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
engine on 2026-11-20; each needs verification with the key):

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

## 3. Capability by need

| Need | Available? | Evidence | Mark |
|---|---|---|---|
| Industry classification: Shenwan | A stock's Shenwan and CSRC classification can be queried | `StockBelongIndustry` description | T |
| Shenwan version (2014 vs 2021), levels 1/2/3, codes | Not stated anywhere public | — | U |
| Other classifications (CSRC, CITIC, GICS, CSI) | CSRC mentioned once; others not stated | T for CSRC | U |
| Industry constituents, current | Yes | product page "板块成分"; `IndustryConstituentStocks` | D / T |
| Constituent weights | Yes ("权重排序", "成分股权重") | product page | D |
| **Constituent history (entry and exit dates)** | Not stated | — | U |
| Industry-level financial aggregates | Yes: "行业整体盈利、偿债、成长能力分析" | product page; `IndustryFinancialAnalysis` | D / T |
| Aggregation method of those aggregates (整体法, median, weighting; treatment of financials and losses) | Not stated | — | U |
| Industry index quotes | Yes, real-time and historical | product page; `IndustryDailyQuote` | D / T |
| Industry / index valuation (PE, PB, PS) | "指数估值" listed | product page | D |
| Valuation history depth and frequency | Not stated | — | U |
| **Prosperity indicator** | "行业景气度" listed under multi-dimensional comparison | product page | D |
| What the prosperity indicator is (definition, scale, frequency, history) | Not stated | — | U |
| **Lifecycle stage** | Not mentioned on any page read | — | U (assume absent) |
| Industry-chain data | Listed | product page | D |
| Company statements, ratios, valuation, prices | Yes | product page; interface names | D / T |
| Point-in-time or as-reported financials | A "财务PIT数据" theme database exists in the institutional product line; whether the MCP exposes it is not stated | core-data page | D (exists) / U (in MCP) |
| Restatement vintages | Not stated | — | U |
| Hong Kong and US stocks | One skill claims A-share and Hong Kong coverage | T | U |

## 4. Access mechanics

| Topic | Finding | Mark |
|---|---|---|
| Authentication | A key; OAuth for third-party platforms. Third-party pages show the key in the URL query string | D (key, OAuth) / T (URL placement) |
| Header-based authentication | Not stated | U |
| Quotas, rate limits, concurrency | Not stated | U |
| Price and billing unit | Usage-based; unit and price not published on pages read | U |
| Response format | Hierarchical JSON and Markdown | D |
| Field names, units, currency, sign conventions | Not published | U |
| Determinism of a free-text query (same query → same rows) | Not stated; the product emphasises natural-language parsing and server-side planning | U — **the most important technical unknown for replay** |
| Structured parameters (code, date range, fields) on the MCP interfaces | Not stated for MCP; the LIGHT cloud REST services do take structured parameters (`en_prod_code`, `begin_date`, `end_date`, `fields`) | U (MCP) / D (LIGHT) |
| Pagination and maximum rows | Not stated | U |
| History depth | Not stated | U |
| Update time of each dataset after disclosure | Not stated | U |
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

1. **Replay through a natural-language interface.** If the interfaces only take free text and
   the server plans the retrieval, the same call may not return the same rows tomorrow. Our
   replay must therefore rest on *our stored raw response*, never on re-calling the vendor.
   The source drawer can show "vendor dataset and interface, query text, as-of time, stored
   response hash", but only shows "table / field" if the response carries them.
2. **No constituent history, no point-in-time.** If the vendor returns only today's
   constituents, any history we compute is a reconstruction with look-ahead in membership. The
   existing industry schema already models this (`historyClass` reconstruction vs
   point-in-time); the Chinese side would launch as reconstruction and say so.
3. **Vendor aggregates are opaque.** If "行业整体盈利" comes as ready-made numbers with no
   method and no member list, we can show them only as vendor-reported figures, not reproduce
   them. Our own aggregate over company-level vendor inputs is the replayable path, at the cost
   of roughly 5,000 companies × statements of calls.
4. **Key in URL.** If the key must travel in the query string, request URLs must never be
   logged or stored; raw-response records store the URL with the key removed.
5. **Personal licence.** See section 5.
6. **Service can change or stop without notice.** Stored responses keep the pages alive in a
   stale state; the design needs that state.

## 7. Questions for the owner (contract) and for the key (verification)

Owner or contract:

1. Which Gildata product and edition did you register for (数据地图 MCP personal, institutional,
   interface edition; or LIGHT cloud; or the database)?
2. Does your agreement allow showing Gildata figures to signed-in OsbornAlpha users, to the
   public, or to nobody but you?
3. Does it allow showing figures we compute from Gildata inputs (aggregates, percentiles,
   scores) when the inputs themselves stay hidden?
4. Does it allow storing raw responses on our servers, and for how long after the account ends?
5. What attribution text and what restrictions on Shenwan names and codes apply?
6. What are the quota, rate limit and price per call, and is there a monthly cap you want us to
   stay under?
7. Is there a header-based way to send the key, or only the URL parameter?
8. Can the vendor supply a reference manual for the interface edition (names, parameters,
   fields, units)?

With the key (read-only calls, a few dozen at most, raw responses kept in a scratch directory):

9. List the tools each server exposes and save their schemas (names, parameters, descriptions).
10. Do the industry interfaces accept structured parameters (Shenwan code, level, date, period)
    or only free text? Is the response the same on two identical calls?
11. Which Shenwan version and levels come back; are index codes (801xxx) and names included?
12. Do constituents come with entry and exit dates; can a past date be asked for?
13. What does `IndustryFinancialAnalysis` return: which metrics, which periods, annual and
    single-quarter, how far back, and does it state the aggregation method and member count?
14. What is "行业景气度": a number, its scale, frequency, history, and stated definition?
15. Is there any lifecycle or stage field?
16. Industry valuation: PE TTM, PB LF, PS TTM availability, frequency and first date; is the
    source the Shenwan index series or the vendor's own calculation?
17. Company statements: first period, single-quarter vs cumulative, restated vs as-first-
    reported, announcement date per row.
18. Does every response carry an as-of or update timestamp and a dataset identifier?
19. Row limits and pagination behaviour on a 31-industry × 10-year request.
20. Error behaviour: rate-limit response, the intermittent 500 others report.
