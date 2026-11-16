# C2a acceptance — overview key cards and marker layers

Scope: spec §4.1, §4.2 and their §4.7 tests. Resumed the existing uncommitted partial implementation. Route remains `/macro`; existing component names, catalog, API routes, formatting helpers, Sparkline and IndicatorDetail are reused. No commit, stash, branch switch, dependency change or migration.

Implemented:

- Overview cards appear before the indicator table, with two desktop columns and one mobile column. Catalog-verified IDs: US `US_DFF`, `US_DGS10`, `US_CPI_YOY`, `US_UNRATE`; CN `CN_PMI_MFG`, `CN_CPI_YOY`, `CN_CGB_10Y`, `CN_M2_YOY`. Only envelope rows are selected. First two cards default to expanded; other cards use their envelope Sparkline.
- Card headers retain the envelope snapshot value, period and precomputed change. Missing and restricted values stay labelled and do not render history. An active source with no snapshot value is explicitly labelled missing.
- One mounted-component promise cache loads `snapshot.created_at` from the existing snapshot route. Expanded compact history receives this exact instant on every chunk and transform. Failed timestamp reads retain snapshot headers and never fall back to live history. Caption and observation-identity mismatch hint are bilingual.
- Derived markers default on and calendar markers off, both in the model and MacroLineChart. Identity deduplication retains same-day distinct tenors, kinds, regions and calendar ranges. The current US target event DTO has no series ID, so its identity uses the existing upper-target constant. Markers that snap to the same chart bar remain separate.
- Two accessible `aria-pressed` pills control the layers. The enabled-event list is limited to six, ordered by descending effective date, derived before calendar on ties, then identity. Calendar effective date is its meeting end. Derived chart text appears only for absolute changes at least 25 bp; calendar markers have no chart text.
- New card surfaces and compact descendants override the global 8px card radius to 6px. Existing semantic tokens and neutral indicator colours are reused. No strategy, correlation, asset table/bar or protected source files changed.
- Added only the final `keyCards` and `markers` namespace blocks to both locale files; all existing message content and order remain unchanged.

Validation:

- Resume baseline: four focused test files, 32 tests passed. Added a regression for an active source with a missing snapshot value; observed it fail on `status.active`, then fixed the card label and observed it pass. Additional regression tests cover failed timestamp lookup, chart-level layer defaults and coincident markers, identity dimensions and ±25 bp thresholds.
- Final focused run: five files, **39 tests passed**.
- `npm run typecheck`: **passed**, including a final run after all TypeScript changes.
- `npm run lint`: **passed**, including a final run after all source/test changes.
- Requested full-range first run: 1404 passed, 83 skipped, six timeout failures. Three were in the explicitly allowed `src/lib/macro/replay.test.ts`; the other timeouts were IndicatorDetail, strategy cycle-performance and strategy manifest-transport. No failed assertions were reported.
- Re-ran the full requested range with bounded concurrency, excluding only the permitted replay timeout file: `npm test -- src/components/macro src/lib/macro "src/app/(app)/macro" src/app/api/macro --exclude src/lib/macro/replay.test.ts --maxWorkers=2`. **95 files passed, four skipped; 1402 tests passed, 83 skipped, zero failures.** The other first-run timeout cases passed without test timeout changes or source changes to strategy.
- `git diff --check`: passed. JSON comparison against HEAD confirms existing messages are unchanged, and the new namespace keys match between zh and en. Protected-path diff check passed.

Limitations / work not completed:

- Four browser screenshot groups and live responsive/keyboard/console verification could not be completed. Playwright's installed Chromium launch failed inside the sandbox with `MachPortRendezvousServer: Permission denied (1100)` before a browser page opened. Component tests use React test renderer and mock the chart library boundary; they do not substitute for visual verification. Existing React test renderer deprecation and Vite config warnings remain.
- The original full-range command was not fully green because of the recorded timeouts; the bounded-concurrency rerun is green with only the user-authorized replay exclusion.
- Expanded `seriesHistory(asOf)` filters observation availability but does not freeze the snapshot's eligible batch/history membership. A matching last observation does not prove all internal points match the snapshot. Recorded this explicitly in `docs/runbooks/macro-sync.md` §14; frozen-history projection remains D1 work under the contract.

Files changed (including the resumed partial C2a work):

- `src/components/macro/KeyIndicatorCards.tsx`
- `src/components/macro/KeyIndicatorCards.test.ts`
- `src/components/macro/IndicatorDetail.tsx`
- `src/components/macro/IndicatorDetail.test.ts`
- `src/components/macro/MacroWorkbench.tsx`
- `src/components/macro/view-model.ts`
- `src/components/macro/view-model.test.ts`
- `src/components/macro/detail-model.ts`
- `src/components/macro/detail-model.test.ts`
- `src/components/macro/charts/MacroLineChart.tsx`
- `src/components/macro/charts/MacroLineChart.test.ts`
- `messages/zh/macro.json`
- `messages/en/macro.json`
- `docs/runbooks/macro-sync.md`
- `docs/audits/2026-11-16-macro-wpc/pr-c2a-acceptance.md`

Pre-existing audit inputs (`spec-section-4.md`, `task-c2a-prompt.md`, `.codex.log`) were left in place.
