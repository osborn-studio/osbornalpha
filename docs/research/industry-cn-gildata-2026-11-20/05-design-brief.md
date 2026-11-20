# 05 — Design brief for the Claude Design canvas: Chinese industry research

For the session that owns the Claude Design canvases. Companion to `04-spec.md`. The existing
industry canvas is under `docs/superpowers/plans/assets/2026-11-06-industry-canvas/`; this
brief extends it for `scheme=sw2021` with vendor data. It does not redesign the US SIC pages.

## 1. Ground rules

- Tokens only, from `DESIGN.md` / `src/app/globals.css`: dark surfaces, one brass accent
  (`--accent`), Geist with every number in Geist Mono `tabular-nums`, radius 6 / 8 / 12, density
  7 of 10, max width 1400, tap targets 44px, skeletons for loading.
- **No market red/green on industry metrics** (`--up` / `--down` are for prices; enforced by
  `design-tokens.test.ts`). The competitor's red-good / green-bad heatmap is not to be copied;
  nor is any of their layout, iconography, emoji headings or colour.
- No competitor data in any artboard. Placeholder content rules are in §4.
- Every chart has a table equivalent through `ChartTableSwitch`; draw both.
- zh and en for every artboard that carries copy; zh is the longer-number, shorter-label case,
  en the longer-label case. Draw at least the list, detail and drawer in both.
- Facts and judgments never share a container. Facts carry `MarkTag` `fact`; judgments live in
  `JudgmentArea` with `MarkTag` `judgment`. `MarkLegend` sits in the page header.
- A missing value is drawn as a state, never as zero, a dash that looks like a value, or a
  neutral mid-colour.

## 2. Reuse (do not redraw; show them in place)

From `src/components/research-ui`:

| Component | Use here |
|---|---|
| `PageHeader` | Title, scope line (scheme, level, basis), controls slot, freshness, legend |
| `FreshnessChip` | One per dataset in the run header: financials, valuation, membership |
| `StateBadge` / `StateCell` | States `missing`, `withheld`, `notServed`, `lowCoverage`, `reconstructed`, `stale`, `revised`, `retracted` |
| `MarkTag` / `MarkLegend` / `MarkCard` | `fact`, `judgment`, `hypothesis` |
| `ChartTableSwitch` | Every chart; line gaps are not interpolated |
| `ResearchFooter` | Publisher and relay chips ("恒生聚源 Gildata" once public), methods link, disclaimer |
| `ResearchChain` | Already in the layout |
| `SourceDrawer` (`source-drawer/`) | Sections `identity, source, times, transform, licence, links`; variants `ok, revised, withheld, retracted` |

From `src/components/industries`:

| Component | Use here |
|---|---|
| `SchemeLevelSwitch` | `sic` / `sw2021`; level 1 only for now |
| `RunHeaderBar` | Generation, activated time, history class |
| `Heatmap` | Single brass hue, alpha 0.12–0.6, value overprinted |
| `ListTable`, `CoverageCell`, `LatestValues` | List and detail tables |
| `SeriesChart` | Series with table |
| `PercentileBar`, `ValuationSnapshot` | Valuation |
| `StateNotice` | Page-level states, including `adminPreview` |
| `JudgmentArea` (+ `JudgmentCard` from `src/components/judgments`) | All judgments |
| `IndustryEntryCard`, `IndustryRow` | Entry from hub and stock page |

## 3. New pieces to design

| New | What it is | Notes |
|---|---|---|
| **Signed heatmap encoding** | Revenue and profit YoY are signed; the existing heatmap is a single-hue magnitude ramp. Propose an encoding for negative values that uses no market red/green and stays inside the token set (for example brass fill for positive, a neutral `--text-muted`-based fill or hatch for negative, sign always printed). | Deliver the ramp as token + alpha steps so it can be tested. Must be legible in the table equivalent without colour. |
| **Basis toggle** | Annual / single-quarter, next to the metric select | Segmented control; links (search params), not client state |
| **View toggle** | Grid / Stages | Same pattern |
| **Origin tag** | Marks a figure as "供应商口径 / vendor-reported" or "本站计算 / computed" | Small, next to `MarkTag fact`; appears in the list header, detail section headers and the drawer, not on every cell |
| **Stage group section** | A titled group per stage with an anchor, a count, the rule sentence, and a table of industries | The group title is a judgment label: it must sit inside a judgment container with method id and as-of |
| **Stage row** | Industry name, three CAGR mini-bars (2016→19, 19→22, 22→25) with printed values, ROE, stage-since date, link to detail | The CAGRs and ROE are facts and open the drawer; the stage is the judgment |
| **Prosperity dimensions** | Five dimensions as horizontal percentile bars (preferred) or a radar with visible gaps; each with value, percentile, window, and state | Recommend bars as primary and radar as optional: a gap on a radar is easy to misread. Table equivalent required either way |
| **Composite prosperity card** | A `JudgmentCard` showing an ordered label and the condition, no number | Draw the calibrated variant (with number) as a separate, clearly future artboard |
| **Vendor judgment row** | The vendor's own index, if any, visually separate from ours | Label "供应商判断 · 恒生聚源"; definition line or "definition not published" |
| **Vendor source drawer content** | See §5.6 | Uses the shared drawer shell |
| **Derived-statistic drawer content** | Formula, window, sample count, list of input observations, each opening its own drawer | |
| **Reconciliation note** | One-line notice on constituents when two sources disagree | Admin only |

## 4. Placeholder content rules

- Use the 31 Shenwan level-1 names only if the canvas is private; otherwise use neutral
  placeholders ("行业 A" … / "Industry A" …). Codes as `801xxx.SI` pattern.
- Numbers are invented and visibly round or patterned (for example +12.3, −4.5, 18.0), never
  taken from the competitor page, a vendor screen or a research report.
- Include in every data artboard at least: one `missing` cell with a reason, one `lowCoverage`
  cell, one negative value, one very large value (three digits), one `revised` cell, and a
  financial-sector row where gross margin is `notServed` ("not applicable to this industry").
- Dates: activation times in ISO with timezone; periods as `FY2025`, `2026Q2`; vendor as-of
  shown on some rows and "not provided by vendor" on others.
- Company names on the constituents artboard: placeholders ("公司 01"), tickers in the
  `000000.SZ` pattern.

## 5. Screens and states

Desktop at 1440 and phone at 390 for each unless noted. Phone rule from `DESIGN.md`: single
column below 768, no horizontal page scroll, bottom tab bar.

### 5.1 List — grid view (`/intel/industries?scheme=sw2021`)

Content, top to bottom:

1. `PageHeader`: "行业研究 / Industry research"; scope "申万一级 · 31 个行业 · 年度" ; controls:
   scheme switch, basis toggle, metric select (revenue YoY, parent net profit YoY, gross
   margin, ROE), view toggle; `FreshnessChip` × 3; `MarkLegend`.
2. `RunHeaderBar`: generation, activated at, history class `reconstructed` with its one-line
   explanation, origin tag.
3. `ChartTableSwitch`: heatmap (31 rows × 10 annual columns, or × 14 quarterly) ↔ `ListTable`
   (same grid as numbers, plus coverage column). Row label links to detail. Cell opens the
   drawer. Sort by any column in table mode. Legend for the signed ramp.
4. `ResearchFooter`.

States to draw: ok; first column empty because no prior-year base (cells `missing` with reason
"no comparison period", not dashes); loading skeleton; `stale` (chip + notice, values kept);
`withheld` for a signed-in non-admin (page-level notice, no grid, link to what is available:
US SIC); `adminPreview` (full grid with the preview notice); `empty` (no active run yet);
error.

Phone: table-first. One metric and one period column visible, with a period stepper; industry
name sticky; the heatmap is offered as a secondary view scrolled inside its own container, or
omitted — propose and justify.

### 5.2 List — stages view (`…&view=stages`)

1. Header as above; scope line names the method id and as-of.
2. A stage summary strip: six stage chips with counts; the two earliest read "0 · 一级行业不适用"
   and are not links. Each other chip jumps to `#stage-growth-mid`, `#stage-growth-late`,
   `#stage-mature`, `#stage-decline`.
3. One stage group section per non-empty stage: title, count, rule sentence from the method,
   condition (what would falsify it), then stage rows.
4. An "abstained" group for industries the method could not classify, with the reason.

States: method published (as above); **no method published** (single ungrouped sortable table
of the three CAGRs and ROE, notice "尚未发布阶段判断方法 / no stage method published"); method
registered but not publishable (admin preview only); `withheld`; `stale`.

Phone: summary strip scrolls horizontally inside its container; each group is a collapsible
section; stage rows become two-line cards (name + ROE; three CAGR values in mono).

### 5.3 Industry detail (`/intel/industries/sw2021/[code]`)

Sections:

1. Header: industry name (zh/en), code, parent scheme and level, freshness chips, legend,
   links: constituents, replay help.
2. Latest values (`LatestValues`): revenue, parent net profit, both YoY, gross margin, ROE,
   member count; each with coverage and origin tag.
3. Series (`SeriesChart` + table): metric select, basis toggle; gaps not interpolated; revised
   points marked.
4. Valuation: PE TTM, PB, PS as `PercentileBar` rows with current multiple, percentile, window
   select (5y / 10y / all), sample count; negative PE as `missing` with reason; a small series
   with table.
5. Prosperity dimensions (new): five bars with value, percentile, window, state.
6. `JudgmentArea`: lifecycle stage card, valuation verdict card, composite prosperity card;
   then the vendor judgment row if present. Each card: label, method id, as-of, condition,
   status (open / settled / abstained), link to method document and history.
7. Constituents preview: count, top ten by weight if weights exist, link to full list.
8. Footer.

States: ok; valuation `notServed` (section stays with the state, not removed); prosperity with
two dimensions `missing`; no judgments (`noJudgment` notice); `stale`; `withheld`;
`adminPreview`; an industry with a `revised` latest value.

Phone: sections stack; series chart full width with the table below a switch; percentile bars
stack label above bar; judgment cards full width.

### 5.4 Constituents (`…/constituents`)

Table: company, ticker (link to stock page), member since, member until, weight if provided,
source, availability (`evidenced` / `assumed`). Date picker "as on". Count and pagination.
Notice when history is assumed from first observation. Admin-only reconciliation note.
States: ok, current-only (no history), empty, withheld. Phone: two-line rows.

### 5.5 Empty, restricted and stale — one artboard collecting them

Side by side, zh and en, the exact copy and layout for: `empty`, `withheld` (non-admin),
`adminPreview`, `stale` (page and single dataset), `notServed` section, `missing` cell reasons
(`vendorNotProvided`, `parseFailed`, `insufficientHistory`, `invalidDenominator`, "not
applicable to this industry"), `lowCoverage`, `retracted` (run withdrawn), vendor service
ended (stale with last successful fetch date). Copy must contain no raw codes.

### 5.6 Source drawer — vendor observation

Shared drawer shell, sections in order:

| Section | Fields |
|---|---|
| Identity | industry, metric, period, value with unit, origin tag "vendor-reported", `MarkTag fact` |
| Source | publisher "恒生聚源 Gildata"; product; interface name; dataset / table / field if supplied, else "query template `…/1`"; row locator; response sha256 (shortened, copyable). No URL |
| Times | period; vendor as-of or "not provided by vendor"; fetched at; available at (activation) |
| Transform | parser version; mapping version; method "vendor-reported/1"; code version; line "aggregation method: not published by vendor" when unknown |
| Licence | status (`internal` / `public`); attribution text; note |
| Links | replay (original), run, constituents on that date, computed counterpart with the difference when it exists |

Variants: `ok`; `revised` (previous value and when); `withheld` (no value, licence note only);
`retracted`. Also draw the **derived statistic** drawer (formula, window, `n` samples, input
list) and the **membership** drawer (source row, dates, availability).

Phone: drawer becomes a full-height sheet; sections collapsible; sha and ids wrap in mono.

### 5.7 Entry points

- Hub card (`IndustryEntryCard`) variant for `sw2021`: withheld and public states.
- Stock page `IndustryRow` for an A-share: Shenwan industry chip linking to the detail page;
  withheld state.

## 6. Flow to show on the canvas

List (grid) → cell → drawer → replay link; list → row → detail → constituents; list → stages →
group anchor → row → detail → judgment card → method document; non-admin landing on `sw2021` →
withheld notice → SIC. One flow diagram with these four paths, desktop and phone.

## 7. Deliverables and order

1. Signed heatmap encoding and origin tag (token-level decisions everything else depends on).
2. List grid view, all states, desktop and phone, zh and en.
3. Vendor source drawer and the states artboard.
4. Detail page.
5. Constituents.
6. Stages view and judgment cards.
7. Prosperity dimensions.

Order matches the build PRs in `04-spec.md` §12: items 1–3 are needed before PR-3, item 5
before PR-2's admin constituents page, items 6–7 before PR-6 and PR-9. Export artboards to
`docs/superpowers/plans/assets/<date>-industry-cn-canvas/` as for the earlier canvas.

## 8. Open design questions (for the canvas session to answer with options)

1. Signed ramp: fill versus hatch for negatives, and how many alpha steps remain distinguishable
   on `--bg-card`.
2. Prosperity: bars only, or bars plus radar.
3. Phone list: is a heatmap worth showing at 390 at all.
4. Where the origin tag sits when a page mixes computed and vendor-reported figures (release 2).
5. Stage summary strip: chips with counts, or a single stacked bar with a table equivalent.
