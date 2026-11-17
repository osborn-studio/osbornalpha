Implemented F2. Display requests use the snapshot’s `created_at` as `asOf` and its date as the window end. Snapshot changes refetch; absent timestamps show the existing bilingual missing reason without fetching.

Files changed under `src/components/macro/`:
- `use-display-series.ts`, `use-snapshot-time.ts` (new)
- `FedLiquidity.tsx`, `MacroWorkbench.tsx`, `MacroJudgmentSlot.tsx`
- `KeyIndicatorCards.tsx`, `ClockBreakdown.tsx`
- `FedLiquidity.test.ts`, `KeyIndicatorCards.test.ts`, `MacroJudgmentSlot-display.test.ts` (new)

Tests: regression failures confirmed first; typecheck and lint passed. Full requested Vitest run: **2,252 passed, 100 skipped**; no failures.

Not done: build and Playwright, as requested. F1 work preserved; no commit, stash, or branch switch.