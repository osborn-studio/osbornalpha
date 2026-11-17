# P5 reconcile against main (2026-11-16)

Branch `claude/macro-p5-chaosai-essence`, origin/main `68701c48` merged (clean, no conflicts), pushed. Source of facts: read-only survey of main's clock (PRs #135, #142, #144/#152/#163/#177, #174) and WP-C surfaces. Rule applied: **main wins on structure**; differences are listed as findings, not rewritten.

## 1. How main's clock works (so the delta fits it)

- Client-only. `MacroJudgmentSlot.tsx` reads `/api/judgments?…types=macro_regime&view=latest&include_abstained=1` and `/api/macro/snapshots/{id}` (the F4 card's own snapshot id); `judgment-view.ts::clockFrom` accepts a card only if exactly one `macro_regime@v2` card, lifecycle `open`, snapshot input equals the overview snapshot id, `display.percent===null`. `basisFrom`/`clockMetadataFrom` require the snapshot route's snapshot id to match.
- Rows: `clock-model.ts::clockRowsFrom` joins stored contributions to snapshot observations; rule label from `RULES` only if `rulesVersion===RULES_VERSION`.
- Judgments off: slot and nav link are not rendered; methodology tab shows `methodology.judgmentsOff`. Flag isolation test `pages.test.ts` still enforced.
- My files `src/lib/macro/clock-{view,f4,contract}.ts` are in the tree and imported only by their tests. Main's `clock-model.ts` already imports `RULES`/`catalogById` client-side, so my "client never imports regime.ts" rule is moot; my server route (`/api/macro/snapshots/[id]/clock`) is **dropped** from scope.

## 2. WP-B items

| Spec item | Status | Evidence / gap |
|---|---|---|
| Quadrant cards, primary/secondary, no probability wording | **shipped** | `ClockPhasePanel`, `MacroRegimeClock`; copy denies probability (`widget.coverageNote`, `widget.formula`, `clock.coverage`); normalised shares never displayed; `clockFrom` rejects non-null percent. |
| Top-3 drivers per quadrant by contribution | **partial** | Main shows **2** (`ClockPhasePanel.tsx:36-37` `.slice(0,2)`); sort = contribution desc then `seriesId`. Delta: 3, tie-break weight desc then id. |
| Expandable table: zh/en name, value, period, rule text, weight, contribution | **shipped** | `ClockBreakdown.tsx` columns indicator/value(+period)/rule/weight/contribution. |
| Table: unit, comparison (prev / 3M), support coefficients | **absent** | no unit/comparison/support columns (`ClockRow` has none). |
| Evidence drawer link | **partial** | only for top-3 rows via button, others link to `/macro/{id}`; delta: every row with a frozen observation opens the drawer on its `observation_id`. |
| Reconciliation: card score = Σ table = stored scores; fail → no numbers | **absent** | agrees by construction (both from `rows`), never compared with stored `regime.scores`/`norm`/`coverage`; no test. Finding (mandate: replayable numbers). |
| Distinct states: missing / restricted / no-rule / insufficient coverage / disabled / F4 unavailable | **partial** | shipped: disabled (not mounted), F4 missing/ambiguous/stale/lifecycle reasons, metadata loading/unavailable, missing axis, tie. **Absent:** per-row missing/restricted/not-matched/no-data (rows exist only for contributions, so unmatched weighted series are invisible and "denominator keeps missing weight" is not shown); insufficient coverage as a state; F4-unavailable is merged with "missing". |
| Allocation template ≠ recommendation | **n/a (new)** | no allocation card on the clock (`widget.frameworkNote` only). Owner-approved `macro_allocation_template@v1` card = delta (b). |
| Publication gate (F4 card, same snapshot, not probability) | **shipped** | `clockFrom` + RLS `publishable`. Not checked: catalog/method version equality of the claim vs snapshot (spec invariant 7). Finding, low risk. |

Findings vs mandate (not rewritten): (1) no card↔stored reconciliation; (2) unmatched weighted rows hidden; (3) F4 claim `catalog_version`/`distribution` not compared with the stored snapshot.

## 3. WP-C items

| Item | Status | Evidence |
|---|---|---|
| Overview big chart cards | **absent** | overview = ChangesCard, CatalogCoverage, IndicatorTable; `IndicatorDetail compact` only after row click (`MacroWorkbench.tsx`). |
| FOMC-dot denoising / marker layers | **absent** | `detail-model.ts::markersOf` + `MacroLineChart` render all markers. |
| Comparable asset bars (bp vs %) | **absent** | `IndicatorDetail.tsx` asset table text only. |
| Default correlation result cards | **absent** | presets only prefill the form; no presets route. |
| Transmission label folding / duplicate "机制假设：机制假设：" | **absent (bug present)** | edge data already prefixed (`transmission-v1.ts`), `flow.edge` adds prefix again (`TransmissionFlow.tsx:59`). |
| Available / full catalog toggle | **absent** | `CycleReturnsTable`/`PolicyResponseMatrix` render all columns. |
| History per-cycle 解读 (P4 template mechanism) | **absent** | `ExplanationPanel` only on transmission and review; `HistoryScreen` has none. |

Stale links noted: `strategy-links.ts:8` still `/intel/macro/history` (redirects to `/macro`); route is now `/macro`.

## 4. Delta (priority order; Codex gpt-6-sol writes, mmx audits)

- **B-Δ1 (a)** extend main's clock: 3 drivers; full weighted-row model with states (matched / not_matched / no_data / missing / restricted + insufficient-coverage banner); columns unit, comparison (prev, 3M), support; every row with frozen observation opens the drawer; **client-side reconciliation** (reuse `reconcileStorage` from `clock-view.ts`) before showing numbers, fail → state without numbers; separate F4-unavailable copy. Files: `clock-model.ts`, `judgment-view.ts`, `ClockPhasePanel.tsx`, `ClockBreakdown.tsx`, `MacroJudgmentSlot.tsx`, messages, tests.
- **B-Δ2 (b)** `macro_allocation_template@v1` card (static versioned template, zh/en, cited classic investment-clock mapping; labelled 假设框架 / 未经检验 / 不构成投资建议; "current" marker only when the clock's primary regime is published; never a probability).
- **C-Δ (c)** big chart cards, marker layers, asset bars, default correlation cards (presets route), transmission prefix fix + folding, column toggle.
- **C-Δ (d)** history per-cycle 解读 through the P4 validated template path (facts only, no model numbers, no quadrant words).
- Dropped: server clock route, `method_manifest` (WP-D side, not required by the clock), my plan tasks B3–B6.
