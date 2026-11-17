Implemented F3; F1/F2 work preserved. No commits, stashes, or branch switches.

- Full detail uses only the PageHeader title; compact previews retain their heading.
- Navigation uses a tested canonical href builder: `region` first, then `boundary`, without duplicates.
- Confirmed fixture CSS omitted shared drawer sizing utilities because Tailwind excluded `research-ui`. Added that scan coverage. Moved FedLiquidity’s drawer outside MarkCard. The fixture page’s F1 change only affected review routing; no new drawer ancestor was found.

Files changed:
- `src/components/macro/`: `IndicatorDetail.tsx`, `indicator-detail.test.ts`, `FedLiquidity.tsx`, `FedLiquidity.test.ts`, `MacroTabs.tsx`, `MacroTabs.test.ts`, `fixture-stylesheet.test.ts`
- `src/components/macro/strategy/`: `StrategyScreens.tsx`, `cycle-notes.test.ts`
- `tests/macro-source-integration/`: `destinations.pw.ts`, `server.ts`, `stylesheet.ts`

Test results:
- Typecheck: passed.
- Lint: passed.
- Requested Vitest suite: **2,257 passed, 100 skipped**.
- Regression tests demonstrated failures before fixes.

Not done: build and Playwright, as instructed. Actual viewport scrolling/click recovery remains unverified; the CSS omission is confirmed, but its exclusive responsibility for the browser regression is not. Shared research-ui files remain unchanged.