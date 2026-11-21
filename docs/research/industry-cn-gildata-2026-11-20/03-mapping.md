# 03 — Mapping and gaps

For each element found in `01-competitor-section.md`: where the data can come from, who computes
it, and how a reader replays it and sees its source. Vendor facts are from
`02-gildata-capabilities.md`. Updated 2026-11-20 after the live probe (`02` section 3): **L**
means confirmed by a live call with the owner's key, **U** still unknown.

## 1. Vocabulary used in this document

**Build path**

| Code | Meaning |
|---|---|
| V | Vendor-reported: a figure Gildata returns ready-made. We store it and show it as the vendor's figure. |
| C | Our computation over vendor inputs (company statements, prices, constituents) with a versioned method. |
| F | Our existing foundation: disclosure facts (`src/lib/facts`), the industry method (`src/lib/industry`, `industry-agg/1.0`), existing tables. |
| J | Judgment: registered, versioned method under `src/lib/judgments`, shown apart from facts. |
| — | Not built. |

**Replay story**

| Code | What we store | What "replay" means |
|---|---|---|
| R-raw | The exact vendor response bytes (private bucket), its sha256, the request with the key removed, the interface name, the query-template version, fetch time, vendor as-of if returned. | Re-parse the stored bytes with the recorded parser version and get the same value. The vendor is never called again for replay. |
| R-manifest | The existing `industry-manifest/2` (members, facts, roles, cells) plus R-raw for each vendor input. | The existing `replayFromManifest()` recomputes the cell from stored inputs. |
| R-judgment | The existing judgment snapshot: frozen `InputRef` list with hashes, method id and `formula_hash`. | The judgment framework's replay. |

**What the source drawer shows for a vendor figure** (new evidence kind, see `04-spec.md` §6):
publisher "恒生聚源 Gildata"; product; the vendor's interface label from the response (`api_name`,
for example 行业财务分析); the column name exactly as returned, with its unit; the query-template
id; period; vendor as-of "not provided by vendor" (L: responses carry no as-of, dataset id or
field id); our fetch time; response sha256; parser and mapping version; licence status. It never
shows the key.

## 2. Element-by-element mapping

### 2.1 Level-1 industry data modules

| # | Element | Path | Inputs | Replay | Notes and gaps |
|---|---|---|---|---|---|
| 1 | Shenwan classification tree (31 level-1, later levels 2 and 3) | V into existing `industry_classifications` (`scheme='sw2021'`) | 所属行业分类, 智能选股 (L) | R-raw | L: levels 1–3 with names and **six-digit industry codes**; a direct list query returned nothing, so the tree is assembled from per-stock rows. Existing `sw2021` rows use the `801xxx.SI` index code, so a code mapping is needed (existing Tushare path can supply it). Version consistent with 2021 but not stated. Shenwan names are the index provider's property: display needs the licence answer. |
| 2 | Constituents today | V into `industry_source_memberships` (`source='gildata'`) → resolved `issuer_industry_memberships` | 行业成分股 (L) | R-raw | L: name, code, industry, level; one call per industry. No weights. Reuses the existing resolver and quarantine. |
| 3 | Constituent history (entry and exit dates) | **Not from this account (L)**; F (Tushare `in_date`/`out_date`, already coded) or accumulate our own from weekly snapshots going forward | — | R-raw of each snapshot | L: no dates returned, past-date query silently ignored. Every run is `reconstruction`, which the schema and UI already express. This is the largest data gap. |
| 4 | Heatmap: revenue YoY, parent net profit YoY, gross margin, ROE; annual 10 years | **Phase 1: V** (vendor-reported industry aggregates) with **revenue YoY as C** (not returned; computed from vendor revenue). **Later: C** over company statements with `industry-agg/1.0` | 行业财务分析 (L): quarter-ends 2016-03-31 to 2026-09-30, revenue, parent net profit and its YoY, gross margin, five ROE variants, member count | V: R-raw. C: R-manifest | L: all four metrics obtainable for 2016–2025, so nine YoY years, the same as the competitor shows. Aggregation method and the member set per period are not stated (U): labelled "vendor-reported". Which ROE variant to show is a spec choice (proposed: average ROE for annual, TTM for the latest view). Revenue YoY computed by us compares two vendor aggregates whose member sets may differ; the drawer says so. Path C needs about 5,000 company calls per refresh and still has no announcement dates. |
| 5 | Heatmap: quarterly, 14 quarters, single-quarter | C over V: single quarter = difference of consecutive cumulative vendor values | 行业财务分析 (L): cumulative year-to-date and TTM only | R-raw of both inputs + formula version | L: no single-quarter column. Differencing two aggregates is only sound if the member set did not change between them; when the member counts differ the cell is flagged (`lowCoverage`-style note "member set changed"), and the TTM view is offered as the cleaner alternative. Owner question. |
| 6 | Heatmap colour scale | F (UI) | — | — | Our tokens forbid market red/green on industry metrics; see design brief. |
| 7 | Stage tile: ROE | Same as 4 | | | |
| 8 | Stage tile: three 3-year revenue CAGRs (a/b/c) | C (derived statistic over row 4 `revenue_sum`) | Annual `revenue_sum` at four year-ends | R-manifest or R-raw of the inputs + formula version | A CAGR is arithmetic on facts, not a judgment. It inherits the membership problem: if inputs are reconstruction, the CAGR is labelled reconstruction. Needs 10 annual points; the existing default history start is 2021-12-31, so depth must be extended. |
| 9 | **Stage assignment** (mid growth, late growth, mature, decline) | **J** — `industry_lifecycle_stage` | Rows 4 and 8 | R-judgment | See section 3. |
| 10 | Penetration-rate bands on stage cards | — as data; kept as a definition in the method document only | none | — | Penetration is not available for a level-1 industry from any source we have; the competitor prints the band but assigns by CAGR. We do not print a penetration number we cannot source. |
| 11 | Prosperity: per-dimension values (revenue growth, ROE, gross margin, operating cash flow, valuation) | C — derived statistics (percentile of each dimension in its own history) | Rows 4, 5, 13; cash flow from the vendor column 经营现金净流量/营业总收入 (L) | R-raw | L: all five dimensions have real data, so no placeholder and no proxy is needed. A dimension with no data is still `missing` and drawn as a gap. |
| 12 | Prosperity: composite score and rank | **J** — `industry_prosperity` | Row 11 | R-judgment | Weights are a judgment. Under owner decision D an uncalibrated judgment card shows a label and condition, **no number**, so the composite cannot be shown as "68" at launch. Section 4. |
| 12b | Vendor's own "行业景气度" | V, shown separately | 行业景气度 (L): monthly value, rank, number ranked, rank share, from 2021-08-31 | R-raw | L: exists; definition not in the response (U). A vendor judgment: labelled as the vendor's, never merged into ours. Section 3. |
| 13 | Valuation: PE TTM, PB LF, PS TTM current values per industry | V (vendor-reported) | 行业价值分析 and 指数价值分析 (L): daily; PE TTM, PE LYR, PB LF, PS TTM, PCF, dividend yield, market values, constituent count | R-raw | L: two series exist, one for the industry and one for the Shenwan industry index; the spec uses the index series (longer confirmed history, matches what the competitor cites) and keeps the other for comparison. The existing own-computed valuation (spec I-3) stays disabled (owner decisions H, C). |
| 14 | Valuation percentiles over a window | C — derived statistic over the stored vendor series | Row 13 history: daily from 2016-01-04 (L) | R-raw of each sample + formula version | L: depth is enough for a 10-year window. The vendor also returns its own percentiles for PE TTM and PB LF (window undefined); we compute ours with a stated window and show the vendor's only in the drawer as a cross-check. Existing rule: month-end samples, n ≥ 36; code accepts windows `5y`, `10y`, `all`. Negative PE is `missing` with reason, not a number. |
| 15 | Valuation verdict (PB+PS average below 30 / above 70) | **J** — `valuation_verdict` | Row 14 | R-judgment | A threshold rule is still a judgment about "cheap" and must be registered. |
| 16 | Verdict commentary paragraphs | — | | | Free text that drifts from the data (observed on their page). Not built. |
| 17 | As-of stamp per module | F | run `activated_at`, vendor as-of, `dq_freshness` | — | Already in `RunHeaderBar` / `FreshnessChip`. |

### 2.2 Things their page lacks that our foundation already gives

| Element | Path | Notes |
|---|---|---|
| Industry detail page per Shenwan industry | F — `/intel/industries/[scheme]/[code]` exists | Works for `sw2021` once data exists. |
| Constituents page with dates | F — `…/constituents` exists | Membership cells still need an evidence kind (audit R4). |
| Coverage per cell (members, with data, unresolved) | F for C; partial for V | L: vendor aggregates give a member count per period but not who the members are or how many had data; coverage shows the count and "member list not provided by vendor". |
| Per-cell source drawer and replay endpoint | F, extended with the vendor evidence kind | |
| Table equivalent of each chart; zh/en | F — `ChartTableSwitch`, `messages/*/industries.json` | |
| Cross-source reconciliation | F — `dq_reconciliations` | Gildata vs Tushare membership; later Gildata vs our CN facts for company figures. |

### 2.3 Sub-industry editorial modules

| # | Element | Path | Reason |
|---|---|---|---|
| 18 | 9-group × 6-stage sub-industry matrix with drill-down | — (first release) | Needs a tag taxonomy, sourced penetration figures and written theses. None comes from Gildata as far as documented. A later module could use Shenwan level 2/3 as the sub-industry layer (V + J), which is a different thing from their hand-picked list. |
| 19 | Hype-cycle strips | — | Pure editorial placement with no data. |
| 20 | Stage → stock-selection model table | Partly F: the stage definitions belong in the lifecycle method document | The PE ranges, "share-price driver" and example lists are investment-advice-style text; not built. |
| 21 | Index of 106 sub-industry reports and the report pages | — | Unsourced written research with ratings. Our equivalent is topic research (`TOPICS_ENABLED`), already a separate module. A link from an industry detail page to related topic dossiers is cheap once both exist. |
| 22 | Industry chain | — (first release); V later | Vendor lists "产业链数据" (D); content and licence unknown. |

## 3. Lifecycle stage: who is judging

Three possible origins, with the rule for each.

| Origin | Would be | Label on the page | Framework |
|---|---|---|---|
| A vendor field — **none exists on this account (L)**; kept here for the prosperity index, which does | Vendor judgment | "供应商判断 · 恒生聚源" / "Vendor judgment · Gildata", `MarkTag` kind `judgment`, with the vendor's definition or "definition not published" | Stored as a vendor observation (R-raw). **Not** registered as our method, never settled or calibrated by us, never combined with ours. Shown only if the licence allows. |
| Our rule over facts | Our judgment | "判断 · 方法 `industry_lifecycle_stage@v1`" | Registered `Methodology` (type `industry_lifecycle_stage`, kind `categorical`, subject `industry`, key `sw2021:2021:<code>`), method document under `docs/methodologies/`, frozen inputs, falsifiable condition, settlement. |
| Editorial override (what the competitor does) | Not allowed | — | An override outside the method is exactly the unexplained step found in `01` §7.1. If a qualitative input is wanted, it becomes a declared, versioned input of a `v2`. |

Requirements for our method, taken from the existing framework rather than invented here:

1. **Inputs** are `table_rows` references to rows visible at the judgment's as-of time. Today
   the input whitelist (`PUBLIC_TABLES`) includes `industry_metrics` but not a vendor table. If
   phase 1 stores vendor-reported aggregates in a separate table, that table and a
   `table_rows × gildata` origin must be added, and `docs/methodologies/licenses.json` needs a
   confirmed entry before the method can be `publishable`. So **the licence answer gates the
   lifecycle card as well**, even though the stage itself is our judgment.
2. **Rule (draft for the method spec, not final)**: three consecutive three-year revenue CAGRs
   and the latest ROE; explicit numeric thresholds for "step up", "near zero" and "clearly
   negative"; `abstained` when any of the four year-end revenue points is missing or coverage is
   below the display threshold; no macro override. The competitor's rule text is the starting
   idea only; thresholds are ours and are versioned in `params`.
3. **Falsifiable condition**: for example "the next three-year revenue CAGR falls in the band
   that defines the assigned stage". This needs the `industry_aggregate` resolver, which the
   framework lists but does not implement.
4. **History and stage migration**: one judgment per industry per annual report cycle; a stage
   change is a new judgment row, so the page can show "since when".
5. **Back-test** before publication: assign stages on data known at past year-ends and report a
   confusion matrix (mandate §1.3). With `reconstruction` membership the back-test is itself a
   reconstruction and must say so.
6. **Display under decision D**: label, badge and condition; no percentage or confidence until
   calibrated.

The method spec is audit item O6. It is a separate document from `04-spec.md` and a
prerequisite for the stage grouping view going public. Until a method is registered and
publishable, the stage grouping screen shows the three CAGRs and ROE (derived facts) in one
ungrouped, sortable list with the note "no stage method published".

## 4. Prosperity: facts and judgment split

| Layer | Content | Kind | Display |
|---|---|---|---|
| Dimension value | Latest value of each of five metrics | Fact (V or C) | Number with source drawer |
| Dimension percentile | Position of that value in the industry's own stored history (window stated) | Derived statistic, formula versioned | Bar or radar spoke, 0–100, gap when missing |
| Composite | Weighted combination and rank | Judgment `industry_prosperity@v1` | Under decision D: an ordered label (for example upper / middle / lower third) and the condition; the number appears only after calibration |
| Vendor index | Gildata "行业景气度" if defined | Vendor judgment | Separate row, labelled as the vendor's |

The valuation dimension uses row 14; if valuation is not served, the spoke is a gap. The
cash-flow dimension uses operating cash flow or is a gap; profit growth is never substituted.

## 5. Gaps that block or limit the first release

| Gap | Effect | Closed by |
|---|---|---|
| Licence for display | Everything vendor-sourced or vendor-derived is admin-only | Owner / contract |
| Product and interface reference | **Resolved (L)**: standard edition, 9 free-text tools; response shape known | — |
| Free-text interface | **Confirmed (L)**: block order varies; unsupported conditions dropped silently; multi-industry queries return nothing | Request–response match checks in every parser; one industry per call; quarantine |
| Constituent history | **Confirmed absent (L)**: all history is `reconstruction` | Tushare path, our own snapshots going forward, or the vendor's interface edition |
| Vendor aggregation method and per-period member set | V figures cannot be reproduced, only re-read | Vendor statement in writing, or path C |
| History depth | **Resolved (L)**: aggregates 2016–2026 by quarter; valuation daily from 2016-01-04; prosperity monthly from 2021-08 | — |
| Single-quarter values and revenue YoY | Not returned; derived by us from cumulative values | Formula in the spec; flag when member count changes |
| Industry code namespace | Vendor uses six-digit industry codes; existing `sw2021` rows use index codes | Mapping table, verified against Tushare |
| Point-in-time company statements | **Confirmed absent (L)**: no announcement date or restated flag in the statements table | Our own CN facts for path C |
| PS metric | One migration to the valuation metric CHECK | Build PR |
| Lifecycle method spec, `industry_aggregate` resolver | No stage grouping | O6 decision; method PRs |
| `src/lib/industry/types.ts` and `src/lib/facts/types.ts` are hash-pinned by `macro_regime@v2` | New types cannot go in those files; a new facts `Source` value would force a macro method bump | New files (`types-cn-vendor.ts`); vendor rows kept out of the facts store |
| Shenwan names from a vendor | May need the index provider's permission separately | Owner / contract |
