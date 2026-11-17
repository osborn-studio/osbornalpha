Changed:
- `scripts/preview/make-clock-fixture.ts`
- `scripts/preview/clock-screens.ts`
- `src/components/macro/ClockPreview.tsx` — added allocation card.

Results:
- Fixture generator exited 0 via `node --import tsx`; `npx tsx` was blocked by sandbox IPC permissions.
- US coverage: 65%; CN: 60%. Both weighted clocks return `ok`.
- All eight quadrant contribution totals reconcile exactly.
- Repeated generation produced byte-identical files.
- Typecheck, lint, preview bundle, and diff checks passed.
- Chromium screenshots remain for the commander to run.

No commits or stashes. Pre-existing changes left untouched.