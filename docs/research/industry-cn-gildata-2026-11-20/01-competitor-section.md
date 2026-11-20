# 01 — Competitor section study: chaosaiagent.com `/industries`

Observed 2026-11-20 (Beijing time; 2026-11-19 evening US Pacific), signed out, in a desktop
browser, page read as text. Nothing was downloaded and no data from the page is stored in this
repository beyond the short examples needed to describe a defect. The page is a reference for
structure and method only (mandate section 5, rule 1).

Sources for every statement below, unless another URL is given:

- List page: `https://www.chaosaiagent.com/industries` (anchor `#stage-growth-mid` is one of
  its sections).
- Detail pages sampled: `/industries/battery-cell`, `/industries/gold-jewelry`.
- Earlier study: `docs/research/chaosai-integration-2026-11-04/` (`REPORT.md`,
  `PAGE_INVENTORY.csv` row for `/industries`, `SOURCE_MAP.csv` rows `INDUSTRY_FIN`,
  `INDUSTRY_VAL`), read on 2026-11-04.

## 1. What the page is

One long page with a sticky in-page navigation bar and seven anchored sections. The browser tab
title is "行业研究 | 数据源:恒生聚源" and the sticky bar repeats "数据源:恒生聚源". The sticky bar
subtitle says "6 大模块 · 9 大行业" although it links to seven sections.

The page mixes two different things under one name:

1. **Data modules on the 31 Shenwan (申万) level-1 industries**: financial heatmap, lifecycle
   stage distribution, prosperity radar, valuation percentiles. These are the part that the
   "恒生聚源" label can plausibly refer to.
2. **Editorial coverage of 106 hand-picked sub-industries in nine groups** (AI, semiconductors,
   power batteries, new consumption, humanoid robots, intelligent driving, innovative drugs,
   energy storage, commercial space): a lifecycle matrix, two hype-cycle strips, a
   stock-selection table, and an index of report pages. These are written research, not vendor
   data.

There is **no detail page for a Shenwan industry**. Rows and bubbles for the 31 industries are
not links. The only detail pages are the editorial sub-industry reports.

## 2. Sections, in page order

| # | Anchor | Content | Unit of analysis |
|---|---|---|---|
| 0 | (top) | Lifecycle model explainer: six stage cards | concept |
| 1 | `#heatmap` | Financial heatmap | 31 SW level-1 industries |
| 2 | `#stage-distribution` (+ `#stage-growth-mid`, `#stage-growth-late`, `#stage-mature`, `#stage-decline`) | Stage distribution, grouped lists | 31 SW level-1 industries |
| 3 | `#radar` | Five-dimension prosperity radar | 10 "representative" SW industries |
| 4 | `#valuation` | PE / PB / PS percentile bars, then an over/under-valued verdict | 31 SW level-1 industries |
| 5 | `#position-chart` | Group × stage matrix with drill-down, plus two hype-cycle strips | 88 sub-industries in 9 groups |
| 6 | `#stock-model` | Stage → stock-selection model table | concept + examples |
| 7 | `#industry-index` | Index of sub-industry report pages | 106 report pages in 9 groups |

### 2.0 Lifecycle model explainer

Six cards: introduction (导入期), early growth (成长初期), mid growth (成长中期), late growth
(成长末期), maturity (成熟期), decline (衰退期). Each card shows a **penetration-rate band**
(2–10%, 10–25%, 25–50%, 50–70%, >70%, none for decline), a one-line description of industry
structure, and a one-phrase stock-selection style. Two cards carry a site "focus" badge. The
four later cards show how many Shenwan industries sit in that stage (3, 5, 15, 8 = 31) and link
to the matching anchor in section 2. The two earliest cards link to `#stage-intro` and
`#stage-growth-early`, which do not exist on the page (dead anchors).

### 2.1 Financial heatmap

- Grid: 31 rows (industries) × time columns. Controls: an annual/quarterly toggle (two
  buttons) and a metric selector with four options: revenue YoY, parent net profit YoY, gross
  margin, ROE.
- Annual view: columns 2016–2025. Quarterly view: 14 columns 23Q1–26Q2.
- Cells show a signed integer percentage; colour scale in seven bands from below −20% to above
  +30%, red for good and green for bad (the mainland convention). A legend is shown.
- Hover titles give industry, period, metric key and value. No link, no drill-down, no source
  per cell.
- First column of the annual YoY views (2016) is a dash for every row, and the first four
  quarterly columns (23Q1–23Q4) are dashes, because no prior-year base is loaded. The header
  still says "10 年" and "14 季".
- A footnote under the radar says the quarterly figures are "单季整体法" (single-quarter,
  aggregate method). The annual method is not stated.

### 2.2 Stage distribution

- Four groups (mid growth, late growth, maturity, decline), each a list of industry tiles. A
  tile shows the industry name, ROE, and three numbers labelled a / b / c.
- Stated method, paraphrased: for each industry compute three consecutive three-year revenue
  CAGRs (2016→19, 2019→22, 2022→25). All three stepping up means growth; all three near zero
  means mature; a clearly negative latest segment means decline. Then a domestic macro
  qualitative adjustment is applied ("叠加国内宏观定性…修正").
- Hover title on a tile adds the latest annual revenue and the three CAGRs to one decimal.
- A note explains that no level-1 industry is in the two earliest stages; those stages are
  populated only by sub-industries in section 5.
- Each group header repeats the penetration band from the explainer and a short style phrase.

### 2.3 Prosperity radar

- Ten industries, ranked 1–10 by a composite score (0–100), each drawn as a five-axis radar:
  revenue growth, ROE, gross margin, cash flow, valuation. Each card shows the score and the
  latest quarter label (26Q2).
- Stated inputs: quarterly financials 2023Q1–2026Q2, each dimension scored 0–100.
- The footnote states two substitutions: the valuation axis is a constant 50 ("占位") because
  no PE history is connected, and the cash-flow axis is proxied by the four-quarter average of
  parent net profit YoY.
- How the ten industries were chosen, how each axis is scaled to 0–100, and the weights are not
  stated.

### 2.4 Valuation percentiles and verdict

- One row per industry: a short code (the last three digits of the Shenwan index code), then
  three horizontal percentile bars for PE TTM, PB LF and PS TTM. Each bar shows the current
  multiple and its percentile; a marker shows the 50% line; five colour bands of 20 points.
- Stated source and window: Shenwan index, weekly frequency, 2016-01 to 2026-09-15 (called 11
  years); percentile = position of the current value in that history. A link goes to
  `swsresearch.com`. An "as of 2026-09-15" stamp is shown.
- Negative PE is shown as N/A with the negative value next to it.
- Below the bars, a "qualitative analysis" block: the verdict uses the simple average of the
  PB and PS percentiles (50/50); below 30% is "undervalued", above 70% "overvalued"; PE is
  shown as a secondary reference only. Two lists (4 overvalued, 14 undervalued) with a
  paragraph of commentary each.
- No sort control, no table view, no time series, no drill-down.

### 2.5 Sub-industry lifecycle matrix and hype-cycle strips

- Matrix: 9 groups × 6 stages, each cell the count of covered sub-industries, colour depth by
  count, row and column totals (88 in total, none in decline).
- Interaction: clicking a non-empty cell opens an overlay listing that cell's sub-industries.
  Each entry shows a penetration figure, the parent Shenwan level-1 industry, sometimes a
  one-line quoted thesis, and links to the sub-industry report page.
- Two strips place AI and humanoid-robot sub-industries on five hype-cycle phases, with the
  note that emerging industries use the hype-cycle and traditional ones the lifecycle model.

### 2.6 Stage → stock-selection model table

A six-row table (one per stage) with a stage filter (a select). Columns: stage with its key
tracking variables, penetration band, industry structure, stock-selection model, share-price
driver (including typical PE ranges), and example industries from the site's coverage. A note
below says the model is a steady-state frame and that a disruptive technology can reset an
industry's stage.

### 2.7 Coverage index

Nine group cards with sub-headings and links to 106 report pages (`/industries/<slug>`), some
tagged "hot". Counts per group: 28, 19, 13, 11, 10, 8, 7, 4, 6.

### Footer of the page

Two lines: data source ("申万一级行业基本面 xlsx(2016-2025) + 季度财务 xlsx(2023Q1-2026Q2)" plus
the site's own coverage conclusions) and methodology (lifecycle theory, "借鉴多份历史研报").

## 3. Detail pages (sub-industry reports)

Reachable without signing in. Both samples are single-page reports with a tab strip; switching
tabs appends sections on the same URL (no deep link per tab).

- **Header**: group badge, industry name, a one-line stage description, a rating word (for
  example "增持" on the battery page), an author line, four headline tiles (market size, leader
  share, margin, a forward estimate), a short thesis list, and a "last updated" month (battery
  page: April 2026).
- **Tabs** (battery page): priority quadrant, market size, competitive landscape, technology
  routes, cost structure, core companies, investment conclusion. The jewellery page has a
  different set of eight (quadrant, market size, consumers, landscape, a topic-specific tab,
  key companies, supply chain, investment logic). So the template is "quadrant first, then a
  topic-specific sequence".
- **Content types**: a company priority quadrant with scores and tiers; tables of market size
  by year including estimates; company cards with ticker, bullet strengths and warnings; rating
  tables; an "investment clock" paragraph; watch-list indicators.
- **Charts**: none as SVG or canvas on the two samples; everything is cards and tables.
- **Sources**: no source is cited for any number on either sample; no link out; no as-of date
  per figure. Estimates (for example "2026E") are not distinguished from reported values other
  than by the suffix.

## 4. Interactions (complete list observed)

| Where | Interaction |
|---|---|
| Sticky bar | Jump to seven anchors |
| Stage cards | Jump to four stage groups (two links dead) |
| Heatmap | Annual / quarterly toggle; metric select; hover title |
| Stage tiles | Hover title only |
| Valuation | Outbound link to the index provider's site |
| Matrix | Click cell → overlay with sub-industries → links to reports |
| Stock model | Stage filter |
| Index | Links to report pages |
| Report page | Tab strip |

Not present: search, sorting, comparison of two industries, time-range selection, CSV or image
export, table view of any chart, per-number source, per-industry page for Shenwan industries,
constituents list, language switch, as-of time per module (only valuation has one).

## 5. What is stated about sources and update times

| Module | Stated source | Stated time |
|---|---|---|
| Whole page | "数据源:恒生聚源" (title and sticky bar) | none |
| Heatmap, stages | "申万一级行业基本面 xlsx (2016-2025)" and "季度财务 xlsx (2023Q1-2026Q2)" | none; latest quarter 26Q2 |
| Radar | "申万一级行业季度财务 xlsx(单季整体法)" | "最新季度 26Q2" |
| Valuation | "申万指数周频" | "截至 2026-09-15" |
| Sub-industries | the site's own research conclusions; "借鉴多份历史研报" | report page month |

The module-level statements point to **spreadsheet files**, not to a live vendor interface. The
"恒生聚源" label does not say which product, dataset or date. Whether the spreadsheets were
exported from a Gildata terminal or database is not stated. This matters for us: the competitor
page is evidence that Gildata data *can* produce these modules, not evidence of how they are
licensed to show it.

## 6. What they do not show

- Constituents of an industry, their count, or how membership changed over time.
- Which classification version (Shenwan 2014 or 2021) and how history before the 2021 revision
  was mapped.
- Aggregation method for annual figures; treatment of financials (banks, insurers) for gross
  margin and ROE; treatment of loss-making members; restatements.
- Coverage (how many members had data in each period).
- Any confidence, history or back-test for a stage assignment; when a stage last changed.
- Sources and dates for sub-industry penetration figures.
- English.

## 7. Stale, inconsistent or unexplained items

Each is an observation on 2026-11-20; short figures are quoted only to locate the defect.

1. **Stage assignment is rule plus editorial override, with the rule under-specified.** The
   bands printed on every stage are *penetration rates*, but the stated assignment rule uses
   *revenue CAGR steps*, and a macro qualitative adjustment is then applied without listing
   which industries were adjusted. Examples where the printed a/b/c values do not obviously fit
   the group: an industry in "mid growth" whose three CAGRs are all at or below about 10; one in
   "mature" with a latest three-year CAGR near +38; one in "mature" with +27. No vendor field
   is cited. Conclusion: the stage is the competitor's own judgment, not a vendor field.
2. **Stock-model table contradicts the stage distribution.** The table lists transport and
   non-bank financials as decline-stage examples; the distribution puts both in maturity.
3. **Radar uses placeholders.** Valuation axis fixed at 50 and cash flow proxied by profit
   growth, while the same page has a valuation module with PE history. The footnote says the PE
   data is "to be connected".
4. **Valuation is two months old.** As-of 2026-09-15 on a page viewed 2026-11-20, described as
   weekly.
5. **Verdict text does not match the bars.** The undervalued commentary quotes percentiles for
   two consumer industries and two others that differ from the figures in the list directly
   above it; the overvalued sentence names four industries and says "three" metrics are all
   high while one of the four has a low PE percentile.
6. **Heatmap header overstates coverage.** "10 years" has 9 usable YoY columns; "14 quarters"
   has 10.
7. **Implausible cells.** Bank revenue YoY swings between large negative and above +160 in
   adjacent years, and the conglomerate row shows +274 in one year. No explanation (membership
   change, reclassification or aggregation error cannot be told apart).
8. **Counts disagree across modules.** The matrix totals 88 sub-industries; the index says 106;
   the sticky bar says six modules for seven sections.
9. **Detail page stage label differs from the matrix vocabulary** (a free-text stage with an
   arrow on the battery page).
10. **Report pages carry ratings and estimates with no sources**, and one sampled page was last
    updated seven months earlier.
11. **Dead anchors** for the two earliest stages.

## 8. What is worth replicating, and what is not

Replicate (structure and method, rebuilt on our own stored data):

- The four level-1 modules: heatmap with annual/quarterly and four metrics, stage grouping,
  prosperity view, valuation percentiles with an explicit verdict rule.
- The idea that the stage groups are an entry point (anchors per stage).
- The explicit statement of the rule next to each derived view.

Do differently (required by the mandate):

- Every cell opens its source; coverage and membership are visible.
- Stage, prosperity score and valuation verdict are judgments with a registered method version,
  shown apart from facts; no placeholder axis, no proxy presented as the real metric.
- A Shenwan industry gets its own detail page.
- As-of time on every module; stale state when the refresh is late.
- Table equivalent for every chart; zh and en.

Out of scope for the first release (section 5–7 of their page): the 106 editorial sub-industry
reports, the group × stage matrix, hype-cycle strips, ratings and stock-selection examples.
They are written research with unsourced numbers; reproducing them would mean either copying
their text or writing our own research programme, which is a separate decision.
