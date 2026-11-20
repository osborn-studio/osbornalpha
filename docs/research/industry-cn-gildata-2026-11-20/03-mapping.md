# 03 — Mapping and gaps

For each element found in `01-competitor-section.md`: where the data can come from, who computes
it, and how a reader replays it and sees its source. Vendor facts are from
`02-gildata-capabilities.md`; anything marked **T** or **U** there is still unverified here.

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
publisher "恒生聚源 Gildata"; product and interface name; dataset, table and field **only if the
response carries them**, otherwise the query-template id; period; vendor as-of time if returned,
otherwise "not provided by vendor"; our fetch time; response sha256; parser and mapping version;
licence status. It never shows the key or a URL containing it.

## 2. Element-by-element mapping

### 2.1 Level-1 industry data modules

| # | Element | Path | Inputs | Replay | Notes and gaps |
|---|---|---|---|---|---|
| 1 | Shenwan classification tree (31 level-1, later levels 2 and 3) | V into existing `industry_classifications` (`scheme='sw2021'`) | Gildata classification / constituents interfaces (T) | R-raw | Version and codes unverified (U). Existing Tushare path stays as a second source for reconciliation. Shenwan names are the index provider's property: display needs the licence answer. |
| 2 | Constituents today | V into `industry_source_memberships` (`source='gildata'`) → resolved `issuer_industry_memberships` | `IndustryConstituentStocks` (T) | R-raw | Reuses the existing resolver and quarantine. |
| 3 | Constituent history (entry and exit dates) | V if the vendor returns dates; otherwise F (Tushare `in_date`/`out_date`, already coded) or — | U | R-raw | Without dated history every run is `reconstruction`, which the schema and UI already express. This is the largest data gap. |
| 4 | Heatmap: revenue YoY, parent net profit YoY, gross margin, ROE; annual 10 years | **Phase 1: V** (vendor-reported industry aggregates). **Later: C** over company statements with `industry-agg/1.0` | `IndustryFinancialAnalysis` (T) for V; company `FinancialStatement` (T) or our CN facts for C | V: R-raw. C: R-manifest | V figures have an unknown aggregation method (U) and are labelled "vendor-reported". C is the mandate-conformant path (explicit 整体法, members listed) but needs about 5,000 companies of inputs. The existing method already defines all four metrics plus `revenue_sum`, `net_income_parent_sum`, `member_count`, and excludes the two financial level-1 codes from gross margin. |
| 5 | Heatmap: quarterly, 14 quarters, single-quarter | Same as 4 | Same; needs single-quarter values | Same | Whether the vendor returns single-quarter or cumulative is U. For C, the existing method has `3M` duration and the single-quarter differencing rules. |
| 6 | Heatmap colour scale | F (UI) | — | — | Our tokens forbid market red/green on industry metrics; see design brief. |
| 7 | Stage tile: ROE | Same as 4 | | | |
| 8 | Stage tile: three 3-year revenue CAGRs (a/b/c) | C (derived statistic over row 4 `revenue_sum`) | Annual `revenue_sum` at four year-ends | R-manifest or R-raw of the inputs + formula version | A CAGR is arithmetic on facts, not a judgment. It inherits the membership problem: if inputs are reconstruction, the CAGR is labelled reconstruction. Needs 10 annual points; the existing default history start is 2021-12-31, so depth must be extended. |
| 9 | **Stage assignment** (mid growth, late growth, mature, decline) | **J** — `industry_lifecycle_stage` | Rows 4 and 8 | R-judgment | See section 3. |
| 10 | Penetration-rate bands on stage cards | — as data; kept as a definition in the method document only | none | — | Penetration is not available for a level-1 industry from any source we have; the competitor prints the band but assigns by CAGR. We do not print a penetration number we cannot source. |
| 11 | Prosperity: per-dimension values (revenue growth, ROE, gross margin, operating cash flow, valuation) | C — derived statistics (percentile of each dimension in its own history) | Rows 4, 5, 13; operating cash flow needs a new metric | R-manifest / R-raw | No placeholder and no proxy: a dimension with no data is `missing` and drawn as a gap. Operating cash flow is not in `AGG_METRICS`; adding it needs a method version bump and a migration to the metric CHECK. |
| 12 | Prosperity: composite score and rank | **J** — `industry_prosperity` | Row 11 | R-judgment | Weights are a judgment. Under owner decision D an uncalibrated judgment card shows a label and condition, **no number**, so the composite cannot be shown as "68" at launch. Section 4. |
| 12b | Vendor's own "行业景气度" | V, shown separately if it exists and is defined | "多维比对" (D exists, definition U) | R-raw | A vendor judgment: labelled as the vendor's, never merged into ours. Section 3. |
| 13 | Valuation: PE TTM, PB LF, PS TTM current values per industry | V (vendor-reported index valuation) | "指数估值" (D exists; fields U) | R-raw | The existing own-computed valuation (spec I-3) stays disabled (owner decisions H, C). PS is not a current valuation metric: migration. |
| 14 | Valuation percentiles over a window | C — derived statistic over the stored vendor series | Row 13 history | R-raw of each sample + formula version | Needs history depth (U). Existing rule: month-end samples, n ≥ 36; code accepts windows `5y`, `10y`, `all`. Negative PE is `missing` with reason, not a number. |
| 15 | Valuation verdict (PB+PS average below 30 / above 70) | **J** — `valuation_verdict` | Row 14 | R-judgment | A threshold rule is still a judgment about "cheap" and must be registered. |
| 16 | Verdict commentary paragraphs | — | | | Free text that drifts from the data (observed on their page). Not built. |
| 17 | As-of stamp per module | F | run `activated_at`, vendor as-of, `dq_freshness` | — | Already in `RunHeaderBar` / `FreshnessChip`. |

### 2.2 Things their page lacks that our foundation already gives

| Element | Path | Notes |
|---|---|---|
| Industry detail page per Shenwan industry | F — `/intel/industries/[scheme]/[code]` exists | Works for `sw2021` once data exists. |
| Constituents page with dates | F — `…/constituents` exists | Membership cells still need an evidence kind (audit R4). |
| Coverage per cell (members, with data, unresolved) | F for C; U for V | Vendor aggregates may not give member counts; then coverage shows "not provided by vendor". |
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
| A vendor field (none documented; question 15 in `02`) | Vendor judgment | "供应商判断 · 恒生聚源" / "Vendor judgment · Gildata", `MarkTag` kind `judgment`, with the vendor's definition or "definition not published" | Stored as a vendor observation (R-raw). **Not** registered as our method, never settled or calibrated by us, never combined with ours. Shown only if the licence allows. |
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
| Product and interface reference unknown | Client and parsers cannot be finalised | Key + probe PR |
| Free-text interface determinism | Parsers may break; coverage of a 31 × 10 grid uncertain | Probe; strict parse + quarantine |
| Constituent history | All history is `reconstruction` | Vendor dates, or Tushare path, or accept and label |
| Vendor aggregation method | V figures cannot be reproduced, only re-read | Vendor documentation, or path C |
| History depth (10 annual, 14 quarterly, 11-year valuation) | Shorter grids; percentile rule n ≥ 36 may fail | Probe |
| Operating cash flow metric; PS metric | Two migrations to CHECK constraints and a method version bump | Build PRs |
| Lifecycle method spec, `industry_aggregate` resolver | No stage grouping | O6 decision; method PRs |
| `src/lib/industry/types.ts` and `src/lib/facts/types.ts` are hash-pinned by `macro_regime@v2` | New types cannot go in those files; a new facts `Source` value would force a macro method bump | New files (`types-cn-vendor.ts`); vendor rows kept out of the facts store |
| Shenwan names from a vendor | May need the index provider's permission separately | Owner / contract |
