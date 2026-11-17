Completed C1. No commits, stashes, or branch switches.

Files changed:
- `messages/{zh,en}/{macro,macroStrategy}.json`
- `src/components/macro/{MacroWorkbench.tsx,strategy-links.ts,strategy-links.test.ts}`
- `src/components/macro/strategy/{TransmissionFlow,PlaybookGrid,CycleReturnsTable,PolicyResponseMatrix,ColumnToggle}.tsx`
- Strategy helpers/tests: `strategy-view-model.ts`, `use-column-mode.ts`, `columns.test.ts`, `strategy-messages.test.ts`

Test results:
- Typecheck: passed on Node 22.
- Lint: passed.
- Requested test scope, serial run: 1,411 passed, 83 skipped; only the permitted `replay.test.ts` timeout failed.
- `git diff --check`: passed.
- Forbidden paths unchanged.

Could not complete browser verification: the sandbox rejected the local server with `listen EPERM`. Existing docs and logs were preserved.