Implemented F4. Workflow labels retain their own wording; both macro state components now accept typed data statuses. Missing/restricted series retain unified badges.

Playwright selectors now use **View → Table / Chart**. The Version-table and chart/canvas assertions remain; no shared-component changes were needed.

Files changed for F4:

- `src/components/macro/`: `MacroState.tsx`, `MacroState.test.ts`, `CatalogCoverage.tsx`, `ChangesCard.tsx`, `ClockBreakdown.tsx`.
- `src/components/macro/strategy/`: `CycleReturnsTable.tsx`, `DeviationCases.tsx`, `ExplanationPanel.tsx`, `ExplanationPanel.test.ts`, `F4Summary.tsx`, `PolicyResponseMatrix.tsx`, `ReviewIndex.tsx`, `ReviewIndex.test.ts`, `ReviewView.tsx`, `TransmissionFlow.tsx`, `remaining-states.test.ts`.
- `tests/macro-source-integration/destinations.pw.ts`.

Tests run sequentially:

- Typecheck: passed.
- Lint: passed.
- Requested Vitest suite: **2,261 passed, 100 skipped**; hash pins passed.

Not verified: Playwright/browser behavior and build, per instructions. F1–F3 work preserved; no commit, stash, or branch switch.