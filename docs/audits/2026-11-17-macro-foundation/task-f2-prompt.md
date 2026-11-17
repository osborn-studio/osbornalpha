You are Codex gpt-6-astra in this repository worktree. Do NOT commit, stash or switch branches. Uncommitted work from task F1 is in the tree; keep it. All hard rules of `docs/audits/2026-11-17-macro-foundation/task-f1-prompt.md` still apply (read its "Hard rules" section). At the end print: files changed, test results, anything not done.

# Task F2 (small): pin the Fed liquidity display series to the snapshot time

`src/components/macro/use-display-series.ts` fetches the three display series with `new Date()` as the window end and no `asOf`. The values therefore are "latest known now", while the clock card and key indicator cards next to them are read at the overview snapshot time (see how `KeyIndicatorCards.tsx` passes `asOf={createdAt}` to `IndicatorDetail`, and the `asOf` parameter of `fetchSeriesWindow`). Every number on the page must be replayable at the snapshot time.

1. `useDisplaySeries` takes the snapshot instant (the overview envelope's created-at that the key cards already use) and passes it as `asOf` to `fetchSeriesWindow`; the window end is the snapshot date, not today. Refetch when the snapshot instant changes. No `new Date()` in this path.
2. Both callers (`FedLiquidity` in `MacroWorkbench`, and `MacroJudgmentSlot` for the clock display rows) pass that instant. If the instant is not available yet (overview still loading or failed), do not fetch; show the existing missing state with a reason ("snapshot time unavailable", reuse an existing message key if one fits, zh + en).
3. Failing test first: a test that the fetch URL carries `asOf` equal to the snapshot instant and that nothing is fetched without it.

Run ONE check at a time: `npm run typecheck`, `npm run lint`, `npx vitest run src/components "src/app/(app)/macro" src/lib/macro src/app/api/macro --maxWorkers=2`. No build, no Playwright.
