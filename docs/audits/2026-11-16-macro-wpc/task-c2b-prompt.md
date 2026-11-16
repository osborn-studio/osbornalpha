You are Codex gpt-6.1-sol in this repository worktree (OsbornAlpha, Next.js 15 / React 19, macro workbench). Do NOT commit, stash or switch branches. At the end print: files changed, test results, anything you could not do.

Contract: docs/audits/2026-11-16-macro-wpc/spec-section-4.md (written before main moved). Where it disagrees with the code on this branch, the code's structure wins: the route is `/macro` (not `/intel/macro`), keep existing component/file names, reuse existing helpers. Read the existing code first.

Hard rules:
- Failing test first for every behaviour, then implementation. Keep zh and en messages in step (messages/zh/*.json, messages/en/*.json).
- NEVER edit: src/lib/macro/{catalog,regime,regime-selection,types,decimal,judgment-contract}.ts, src/lib/judgments/**, supabase/**, src/lib/macro/providers/**, parsers/**, fixtures/**, scripts/macro/**. No migrations. No new dependencies.
- Never write the literal string MACRO_JUDGMENTS_ENABLED in any file under src/components/macro.
- Missing data stays missing: never draw or print 0 for a missing value; restricted/missing sources are labelled as such.
- No numbers invented; every displayed number comes from the existing API/DTO.
- Styling: existing tokens/CSS variables only, radius <= 6px, no gradients/glow/purple; rise/fall colours only for asset returns.
- Must pass: `npm run typecheck`, `npm run lint`, and `npm test -- src/components/macro src/lib/macro "src/app/(app)/macro" src/app/api/macro` (the test `src/lib/macro/replay.test.ts` may time out locally; ignore only that one).

Parallel-run rules: other Codex runs are working in sibling worktrees on other parts. Stay strictly inside your part. In messages/zh/*.json and messages/en/*.json add new keys ONLY inside one new namespace block named as stated in your task, appended as the LAST top-level-or-section key of the file you extend; do not reorder or reformat existing keys. Prompt/report files live in docs/audits/2026-11-16-macro-wpc/.

TASK C2b (spec 4.3 only; namespace for new messages: `assetBars`). Do NOT touch overview cards, MacroLineChart markers, correlation, transmission or the cycle/policy tables' column logic.
Asset bars: move `barGeometry` from src/components/macro/strategy/strategy-view-model.ts to a charts geometry module (src/components/macro/charts/chart-geometry.ts or the existing charts directory; delete the old implementation, update imports, move its tests; change nothing else in strategy-view-model.ts); add `assetBarPanels(assetsByCycle, cycles)` → per cycle `{pct:{domainMax,rows}, bp:{domainMax,rows}}` with rows `{asset_id,name,value:number|null,text}`; a missing value draws no bar and prints 缺失; zero axis centred; bp and % never share a scale; in IndicatorDetail's asset section render the bars with the existing table kept behind a bars/table toggle; colours --up/--down; tooltip/title gives unit and the cycle endpoints. Tests per 4.7 (`chart-geometry.test`).


RESUME NOTE: a previous run of this exact task was interrupted. The working tree already contains its uncommitted partial work (see `git status`). Read it, keep what is right, and finish the task on top of it; do not start over and do not revert it.
