# 06 — Claude Design canvas: Chinese industry research

Date: 2026-11-24. Design only; no application code. Built from `05-design-brief.md` and
`04-spec.md`.

## 1. Where it is

- **Canvas:** <https://claude.ai/artifact/SUEMb6xw32UReg6vEEtzYg> — the unified research canvas
  ("OsbornAlpha 研究板块统一设计"), new section **"7 · 行业研究（中国 · 申万 2021 · 恒生聚源数据 ·
  仅管理员预览）"** below the mobile row. Private to the owner. The 19 earlier artboards are
  unchanged.
- **Sources in the repo:** `docs/superpowers/plans/assets/2026-11-24-industry-cn-canvas/`
  (`project/*.dc.html`, `industry-cn.css`, and `gen.py`, the script that produced the artboards).
- The artboards reuse the canvas's shared stylesheet (same shell, state vocabulary, drawer and
  table styles as the US SIC artboards) plus one small stylesheet, `industry-cn.css`, holding
  only the new pieces in §3.

Every artboard is illustrative: industries are "行业 01–31 / Industry 01–31" with codes in the
`801NNx.SI` pattern, companies are "公司 01" with `0000NN.SZ` tickers, and numbers come from a
formula in `gen.py`. Nothing is taken from the competitor, the vendor or a research report.

## 2. Screens (28 artboards)

Deep links: `<canvas>#artboard-<name>` (for example `…#artboard-Cn-List`). `-en` is the English
twin of the same screen.

| Artboard | Size | Covers (brief section) |
|---|---|---|
| `Cn-Kit` | 1920 | Design decisions: signed heat ramp, origin tag, basis/view toggles, admin-only bar, stage row, percentile bar, judgment/fact separation; the four flows (§6); phone decisions |
| `Cn-List`, `Cn-List-en` | 1440 page | §5.1 list, grid view, admin preview: header with scheme switch next to SIC, three freshness chips (one stale), run bar with `reconstructed`, 31 × 10 signed heatmap, table equivalent, metric = gross margin excerpt with the financial-industry `not served` row, "where judgments live" |
| `Cn-Stages`, `Cn-Stages-en` | 1440 page | §5.2 stages view with a registered method (admin preview): distribution strip with anchors `#stage-growth-mid`, `#stage-growth-late`, `#stage-mature`, `#stage-decline`, the two earliest stages as "0 · not applicable at level 1", table equivalent, one judgment header + one fact table per stage, abstained group |
| `Cn-StagesNoMethod`, `-en` | 1440 page | §5.2 "no stage method published": one ungrouped sortable table of the three CAGRs and ROE |
| `Cn-Detail`, `Cn-Detail-en` | 1440 page | §5.3 detail: latest values (one revised), series chart + table (gap, revised point, member-set-changed mark), valuation percentile bars (negative PE as missing), prosperity dimensions (two missing), judgment area (stage, valuation verdict, composite as ordered label), vendor judgment row, constituents preview |
| `Cn-Constituents`, `-en` | 1440 page | §5.4: as-on date, current-only notice, admin-only reconciliation note, table with date basis (`assumed` / `evidenced`), pagination, empty and withheld notes |
| `Cn-Drawer`, `Cn-Drawer-en` | 1920 | §5.6: vendor-observation drawer in four variants (ok, revised, withheld, retracted), derived-statistic drawer, membership drawer |
| `Cn-States` | 1920 | §5.5, zh and en side by side: withheld page for non-admins, admin preview, empty, loading skeleton, read error, stale (page, single dataset, vendor service ended), partial coverage, not-served section, missing-cell reasons, retracted, three unavailable states of the stages view |
| `Cn-Entry` | 1440 | §5.7, zh and en: hub card (withheld, admin preview, public) and the stock-page industry row (preview, withheld) |
| `Cn-Future` | 960 | Calibrated composite prosperity card, marked as future and not built now |
| `M-Cn-List`, `-en` | 390 | Phone list, table first, one metric and one period with a stepper |
| `M-Cn-Stages`, `-en` | 390 | Phone stages: strip scrolling inside its box, collapsible groups, two-line stage cards |
| `M-Cn-Detail`, `-en` | 390 | Phone detail, stacked sections |
| `M-Cn-Drawer`, `-en` | 390 | Phone drawer as a full-height sheet with collapsible sections |
| `M-Cn-Constituents`, `-en` | 390 | Phone constituents, two-line rows |
| `M-Cn-Withheld`, `-en` | 390 | Phone, non-admin: withheld, empty, loading |

Checks made while producing them: every file passes a tag-balance check; each was rendered in
headless Chromium at its frame width with no horizontal page overflow at 1440 or 390; frame
heights are the measured content heights. They were not opened inside the canvas editor from
this session, so the first look on the canvas is the owner's.

## 3. Answers to the brief's open design questions (§8)

| # | Question | Decision on the canvas |
|---|---|---|
| 1 | Signed ramp | Positive = brass fill; negative = neutral grey fill with a 1px solid frame; sign always printed. Four steps per side: `--accent` at alpha .14 / .28 / .44 / .60, `--text-secondary` at alpha .08 / .16 / .26 / .36 with a frame at alpha .45. No hatch (it needs a gradient). Missing = dashed empty cell, so it cannot be confused with a framed negative. Steps come from fixed thresholds, not from re-ranking the visible grid. |
| 2 | Prosperity | Bars only, with a table equivalent. No radar: a gap on a radar reads as zero. |
| 3 | Phone list | No full heatmap at 390. Table first, one metric and one period, period stepper; the single value column keeps the signed ramp. |
| 4 | Origin tag with mixed origins | Section header carries the default origin; only rows that differ get their own tag; the drawer always shows it. Never on every cell. |
| 5 | Stage summary strip | Chips with counts that are also the anchors, plus a table equivalent. No stacked bar. |

## 4. Components the build will need

Reused as they are (no redesign): `PageHeader`, `FreshnessChip`, `StateBadge` / `StateCell`,
`MarkTag` / `MarkLegend` / `MarkCard`, `ChartTableSwitch`, `ResearchFooter`, `ResearchChain`,
shared `SourceDrawer` shell, `SchemeLevelSwitch`, `RunHeaderBar`, `ListTable`, `CoverageCell`,
`LatestValues`, `SeriesChart`, `PercentileBar`, `ValuationSnapshot`, `StateNotice`,
`JudgmentArea` + `JudgmentCard`, `IndustryEntryCard`, `IndustryRow`.

Changed:

| Component | Change |
|---|---|
| `Heatmap` + `heatmap-model.ts` | Signed encoding: step classes `p1–p4` / `n1–n4`, legend with both sides, revised marker in a cell, two-line missing cell with reason |
| `SchemeLevelSwitch` | `sw2021` label states: internal preview (admin), withheld (non-admin) |
| `RunHeaderBar` | Vendor-run variant: generation, activation time, `reconstructed` with the one-line explanation, origin tag |
| `StateNotice` | `adminPreview` body for vendor datasets (dataset display name, no raw key); `noStageMethod`; vendor-service-ended stale copy |
| `SeriesChart` | Zero baseline for signed series, revised point marker, member-set-changed note in the table |
| `SourceDrawer` adapter | Content for `vendor_observation`, derived statistic and `industry_membership`; "not provided by vendor" and "not published" lines instead of blanks; no URL row value |
| `IndustryEntryCard`, `IndustryRow` | `sw2021` withheld / preview / public variants |

New:

| Component | What it is |
|---|---|
| `OriginTag` | "供应商口径 / Vendor-reported" (hollow square) and "本站计算 / Computed" (filled square) |
| `DerivedChip` | "本站推算 · `yoy/1`": formula id of a statistic derived from vendor figures |
| `BasisToggle`, `ViewToggle` | Segmented controls made of links (`basis`, `view` search params) |
| `PeriodStepper` | Phone list: previous / next period |
| `StageSummaryStrip` | Stage chips with counts and anchors, inside a judgment container, with its table equivalent |
| `StageGroupSection` | Judgment header (label, count, method id, as-of, status, rule, falsifying condition, inputs) above a separate fact table |
| `StageRow` + `SignedMiniBar` | Industry, three CAGRs with zero-centred mini bars and printed values, ROE, "in stage since" as a judgment-tagged cell |
| `ProsperityDimensions` | Five percentile bars with value, percentile, window, state; table equivalent |
| `VendorJudgmentRow` | The vendor's own index, dotted frame, "not our method", definition line or "not published" |
| `ReconciliationNote` | Admin-only one-line notice on constituents |
| `ConstituentsTable` (`sw2021`) | Member since / until, weight state, source link, date basis |

Message keys the copy implies (zh and en are both on the canvas): `states.vendorReported`,
`states.vendorAsOfMissing`, `states.noStageMethod`, `states.adminPreview` (vendor body),
`missing.vendorNotProvided`, `missing.parseFailed`, `missing.insufficientHistory`,
`missing.invalidDenominator`, `missing.noPriorPeriod`, groups `stages`, `prosperity`, `origin`,
`drawer.kind.vendor|derived|membership`.

## 5. Assumptions taken

### 5.1 From the owner questions in `04-spec.md` §13 (spec default used where unanswered)

| Q | Assumed for the design | Where it shows |
|---|---|---|
| Q1 | Personal account, standard edition | Licence section of the drawer: "personal-account terms do not allow giving data to third parties" |
| Q2 | Not allowed to show to other users yet | Admin-only bar on every vendor-data page; non-admins get the withheld page |
| Q3 | Derived figures are also internal for now | CAGR, percentile and stage pages carry the same admin-only bar |
| Q4 | Attribution wording unknown | Footer and drawer show a bracketed placeholder; the public footer shows the vendor only once a dataset is public |
| Q5 | Vendor-reported aggregates in release 1, our own computation in release 2 | Origin tag "vendor-reported" everywhere; "computed counterpart: none yet" slot in the drawer |
| Q6 | No UI effect | — |
| Q7 | Raw responses are stored | Drawer has "replay (original response)" and a response hash |
| Q8 | Default scheme stays `sic` for all locales | CN is reached through the scheme switch; no locale-based landing |
| Q9 | No UI effect beyond freshness | Freshness chips and stale states |
| Q10 | Stage method uses stated numeric thresholds only, no macro override; spec not written yet | Rule and falsifying-condition text are bracketed placeholders; stages view also drawn with no method |
| Q11 | Vendor prosperity index is shown, labelled as the vendor's judgment | Vendor judgment row on the detail page |
| Q12 | Composite prosperity is an ordered label until calibrated | Composite card shows "upper third", no number; `Cn-Future` shows the later variant |
| Q13 | Sub-industry layer out of scope | Level control shows level 1 only |
| Q14 | Tushare Shenwan path kept for reconciliation | Admin-only reconciliation note on constituents |
| Q15 | No UI effect | — |
| Q16 | Single quarter by differencing cumulative values, flagged when the member count changed | Basis toggle annual / single quarter; "member set changed" mark in the series table |
| Q17 | Standard edition, so no entry or exit dates | Current-only notice; "assumed: first observation" date basis |
| Q18 | Average ROE for annual periods, TTM for the latest view | ROE columns and cards |

### 5.2 Design assumptions of this session (not owner decisions)

1. **Coverage for vendor-reported cells** is drawn as vendor member count ÷ members we resolve at
   that period end, with `low coverage` below 0.8. The brief requires a low-coverage cell on every
   data artboard, but the spec does not define coverage for vendor figures. The data session should
   confirm or replace this.
2. **Derived statistics over vendor figures** (YoY, single quarter, CAGR, percentile) keep the
   "vendor-reported" origin tag and add a "derived" chip with the formula id, because the API's
   `origin` has only two values.
3. **"In stage since"** sits in the fact table as a judgment-tagged cell; everything else in that
   table is a fact.
4. **Stage counts** (6 / 9 / 11 / 3, 2 abstained) and all labels attached to placeholder industries
   are invented to show layout.
5. **Neutral placeholder names** are used although the canvas is private, so the artboards can be
   shared later without showing Shenwan names or attaching invented numbers and stages to real
   industries. English industry names on the real pages come from the reviewed table in the spec.
6. **Constituents preview** lists the first five by ticker, because the vendor returns no weights.
7. **Level control** shows level 1 only; levels 2 and 3 are described as navigation-only in a note.
8. The **stale membership chip** on the list and detail headers is there to show the single-dataset
   stale state, not a claim about the data.

## 6. What is not on the canvas

- Light theme (the existing canvases are dark only).
- Admin page `/api/admin/industries/vendor` (fetch events, quarantine): not in this task's scope.
- Method document and judgment history pages: owned by the judgment framework canvas.
- Release 2 (our own aggregation) screens, beyond the "computed" origin tag and the drawer slot.
