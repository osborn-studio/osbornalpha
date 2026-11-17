Completed R1, preserving the partial work.

Files changed:
- `src/app/(app)/macro/[seriesId]/page.tsx`
- `src/components/macro/{IndicatorDetail.tsx,view-model.ts}`
- Regression tests: `page.test.ts`, `indicator-detail.test.ts`, `view-model.test.ts`

Validation:
- Typecheck and lint passed.
- Final serial suite: **1,591 passed, 86 existing skips**.
- Regression control: old lookups caused 19 failures; registry lookups passed.

Not completed: replay verification, excluded as permitted. API routes already support the registry; no display series currently declares YoY, so `detail-model.ts` stayed unchanged.

No commits, stashes, branch switches, dependencies, or protected-file edits.