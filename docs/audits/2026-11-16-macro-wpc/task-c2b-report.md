# C2b · Asset bars (§4.3)

Completed on top of the interrupted run's uncommitted work. No commit, stash, or branch change.

- Moved `barGeometry` unchanged to `charts/chart-geometry.ts`, updated the strategy import, and moved its test cases. The removal is the only change to `strategy-view-model.ts`.
- Added `assetBarPanels`: separate symmetric percentage and basis-point domains for each cycle, DTO-derived values and display text, and null/missing handling without zero substitution.
- Added `AssetBars` to IndicatorDetail's asset section, reusing DataTableToggle and preserving the original table. Missing rows display the localized missing label and have no bar; signed asset returns use `--up` / `--down`.
- Titles include the unit, cycle boundaries, and actual observation endpoints. New messages are confined to the final `assetBars` namespace in both locale files.
- During this resume, the tooltip regression tests were observed failing before implementation, then passing. Typecheck also exposed an inherited test-global typing issue, corrected with the existing `vi.stubGlobal` pattern and cleanup.

## Files changed

- `messages/en/macro.json`
- `messages/zh/macro.json`
- `src/components/macro/IndicatorDetail.tsx`
- `src/components/macro/charts/AssetBars.tsx`
- `src/components/macro/charts/AssetBars.test.ts`
- `src/components/macro/charts/chart-geometry.ts`
- `src/components/macro/charts/chart-geometry.test.ts`
- `src/components/macro/strategy/CycleReturnsTable.tsx`
- `src/components/macro/strategy/strategy-view-model.ts`
- `src/components/macro/strategy/strategy-view-model.test.ts`
- This report. The supplied spec and prompt remain untouched.

## Verification

- `npm run typecheck`: passed after the test-global correction.
- `npm run lint`: passed after the final code change.
- `npm test -- src/components/macro src/lib/macro "src/app/(app)/macro" src/app/api/macro --maxWorkers=2`: 1,403 passed, 83 skipped; only failure was the explicitly allowed 60-second timeout in `src/lib/macro/replay.test.ts` (US evidence read-back). 93 files passed, four skipped, one failed. No tests were disabled or edited to bypass failures.
- Final focused geometry, AssetBars, and strategy-view-model run: 47 tests passed across three files.
- `git diff --check`: passed.

The initial unrestricted macro test run was interrupted after several minutes without results and replaced with the two-worker run above. Host load averages exceeded 200 during verification.

## Could not complete

Browser screenshots and live visual verification: Chromium launch failed under the filesystem/process sandbox with `bootstrap_check_in … Permission denied (1100)`; a local `/macro` request also timed out. The temporary development server was stopped. Component rendering, tooltip content, signed geometry, missing rows, and the table toggle are covered by automated tests.
