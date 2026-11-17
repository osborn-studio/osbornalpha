Implemented B-Δ2 and the additional clock validation/empty-state fixes using TDD. No commits, stash, dependencies, or network calls added.

Files changed:

- `src/lib/macro/`: `allocation-template.ts`, `allocation-template.test.ts`
- `src/components/macro/`: `AllocationTemplateCard.tsx`, `allocation-card.test.ts`, `MacroJudgmentSlot.tsx`, `MacroWorkbench.tsx`, `clock-weighted.ts`, `clock-weighted.test.ts`, `ClockBreakdown.tsx`
- `messages/zh/macro.json`
- `messages/en/macro.json`

Validation:

- Requested Vitest command: **19 files, 193 tests passed**
- Including page/flag isolation: **20 files, 200 tests passed**
- Typecheck: **passed**
- Lint: **passed**
- `git diff --check`: **passed**

Deviation: browser layout verification was blocked by Chromium’s sandbox MachPort permission failure. Static component rendering and CSS compilation succeeded.