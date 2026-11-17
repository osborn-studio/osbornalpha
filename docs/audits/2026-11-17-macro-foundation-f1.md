# F1 macro research foundation

Implemented shared page headers, seven-link navigation with region preservation, registry-based research footers, chart/table switches with gap segmentation, unified state badges and safe value cells, judgment/hypothesis marks, US display-only liquidity rows and fact cards, explanation zones, and the shared evidence-pair drawer shell. Removed unused SourceFooter and DataTableToggle components and eleven obsolete macro drawer message keys. English and Chinese keys remain aligned.

The three liquidity series remain separate from scored rows. Tests verify unchanged clock totals and drivers; no registry or formula changes were made. CycleNotes implementation and templates remain unchanged and inherit the migrated EvidencePairDrawer.

## Test results

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero warnings.
- `npx vitest run src/components "src/app/(app)/macro" src/lib/macro src/app/api/macro --maxWorkers=2`: 186 files passed, 5 skipped; 2247 tests passed, 100 skipped, zero failures. No replay exception used.
- `npx vitest run src/lib/macro/display-registry.hash.test.ts src/lib/judgments/methodologies/macro-regime.v2.test.ts --maxWorkers=2`: 41 tests passed. Formula pin unchanged.
- All commands ran sequentially. Feature tests were run failing before implementation; existing rendering tests were updated for the shared translation context and navigation/state contracts.

## Not completed or verified

- Item 10: `src/components/judgments/InputsDrawer.tsx` was not migrated. It is used by the shared `JudgmentCard.tsx` for non-macro judgments, and the current macro clock does not import it. The task explicitly excludes editing shared non-macro code; wrapping that modal component would nest shells rather than replace its shell. The macro-owned EvidencePairDrawer was migrated through a pure adapter with existing content in its transform slot.
- No browser, Playwright, or `next build` was launched. Responsive layout, focus behavior in a real browser, live authenticated API/database behavior, and production rendering were not verified. Existing environment-dependent tests remained skipped as reported above.
- Failed/rejected explanation DTOs do not provide accepted rendered facts; their facts zone therefore retains an explicit unavailable note and the failure note, with no hypothesis zone.

No protected source files, database schema, methods/versions, dependencies, or feature flags changed. No commit, stash, or branch switch. The pre-existing untracked `docs/audits/2026-11-17-macro-foundation/` directory was left untouched.

## Files changed

81 files, including this report:

- `docs/audits/2026-11-17-macro-foundation-f1.md`
- `messages/en/macro.json`
- `messages/en/macroStrategy.json`
- `messages/zh/macro.json`
- `messages/zh/macroStrategy.json`
- `src/app/(app)/macro/[seriesId]/page.test.ts`
- `src/app/(app)/macro/[seriesId]/page.tsx`
- `src/app/(app)/macro/analyses/[runId]/page.tsx`
- `src/app/(app)/macro/history/page.tsx`
- `src/app/(app)/macro/navigation-region.test.ts`
- `src/app/(app)/macro/page.tsx`
- `src/app/(app)/macro/review/[region]/[month]/page.tsx`
- `src/app/(app)/macro/review/page.tsx`
- `src/app/(app)/macro/transmission/page.tsx`
- `src/app/(app)/macro/transmission/strategy-pages.test.ts`
- `src/components/macro/AllocationTemplateCard.tsx`
- `src/components/macro/AnalysisRunView.tsx`
- `src/components/macro/CatalogCoverage.tsx`
- `src/components/macro/ChangesCard.tsx`
- `src/components/macro/ClockBreakdown.tsx`
- `src/components/macro/ClockPhasePanel.tsx`
- `src/components/macro/CorrelationResult.tsx`
- `src/components/macro/CorrelationWorkbench.tsx`
- `src/components/macro/FedLiquidity.test.ts`
- `src/components/macro/FedLiquidity.tsx`
- `src/components/macro/IndicatorDetail.test.ts`
- `src/components/macro/IndicatorDetail.tsx`
- `src/components/macro/IndicatorTable.tsx`
- `src/components/macro/KeyIndicatorCards.test.ts`
- `src/components/macro/KeyIndicatorCards.tsx`
- `src/components/macro/MacroJudgmentSlot.tsx`
- `src/components/macro/MacroKeyRows.tsx`
- `src/components/macro/MacroRegimeClock.tsx`
- `src/components/macro/MacroResearchFooter.tsx`
- `src/components/macro/MacroState.test.ts`
- `src/components/macro/MacroState.tsx`
- `src/components/macro/MacroSummaryCard.tsx`
- `src/components/macro/MacroTabs.test.ts`
- `src/components/macro/MacroTabs.tsx`
- `src/components/macro/MacroWorkbench.tsx`
- `src/components/macro/SourceFooter.tsx`
- `src/components/macro/allocation-card.test.ts`
- `src/components/macro/charts/AssetBars.test.ts`
- `src/components/macro/charts/AssetBars.tsx`
- `src/components/macro/charts/DataTableToggle.tsx`
- `src/components/macro/charts/MacroLineChart.test.ts`
- `src/components/macro/charts/MacroLineChart.tsx`
- `src/components/macro/clock-weighted.test.ts`
- `src/components/macro/detail-model.test.ts`
- `src/components/macro/detail-model.ts`
- `src/components/macro/display-series.test.ts`
- `src/components/macro/display-series.ts`
- `src/components/macro/foundation.test.ts`
- `src/components/macro/indicator-detail.test.ts`
- `src/components/macro/investment-clock.css`
- `src/components/macro/macro-messages.test.ts`
- `src/components/macro/research-sources.test.ts`
- `src/components/macro/research-sources.ts`
- `src/components/macro/strategy-links.test.ts`
- `src/components/macro/strategy/CycleReturnsTable.tsx`
- `src/components/macro/strategy/DeviationCases.tsx`
- `src/components/macro/strategy/EvidencePairDrawer.test.ts`
- `src/components/macro/strategy/EvidencePairDrawer.tsx`
- `src/components/macro/strategy/ExplanationPanel.test.ts`
- `src/components/macro/strategy/ExplanationPanel.tsx`
- `src/components/macro/strategy/F4Summary.tsx`
- `src/components/macro/strategy/PlaybookGrid.tsx`
- `src/components/macro/strategy/PolicyResponseMatrix.tsx`
- `src/components/macro/strategy/ReviewIndex.tsx`
- `src/components/macro/strategy/ReviewView.tsx`
- `src/components/macro/strategy/StrategyScreens.tsx`
- `src/components/macro/strategy/TransmissionFlow.tsx`
- `src/components/macro/strategy/columns.test.ts`
- `src/components/macro/strategy/cycle-notes.test.ts`
- `src/components/macro/strategy/evidence-pair-adapter.test.ts`
- `src/components/macro/strategy/evidence-pair-adapter.ts`
- `src/components/macro/strategy/remaining-states.test.ts`
- `src/components/macro/use-display-series.ts`
- `tests/macro-integration/workbench.pw.ts`
- `tests/macro-source-integration/browser-stubs/pages.tsx`
- `tests/macro-source-integration/destinations.pw.ts`
