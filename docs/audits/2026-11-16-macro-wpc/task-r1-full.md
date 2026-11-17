You are Codex gpt-6.1-sol in this repository worktree (OsbornAlpha, Next.js 15 / React 19, macro workbench). Do NOT commit, stash or switch branches. At the end print: files changed, test results, anything you could not do.


Hard rules:
- Failing test first for every behaviour, then implementation. Keep zh and en messages in step (messages/zh/*.json, messages/en/*.json).
- NEVER edit: src/lib/macro/{catalog,regime,regime-selection,types,decimal,judgment-contract}.ts, src/lib/judgments/**, supabase/**, src/lib/macro/providers/**, parsers/**, fixtures/**, scripts/macro/**. No migrations. No new dependencies.
- Never write the literal string MACRO_JUDGMENTS_ENABLED in any file under src/components/macro.
- Missing data stays missing: never draw or print 0 for a missing value; restricted/missing sources are labelled as such.
- No numbers invented; every displayed number comes from the existing API/DTO.
- Styling: existing tokens/CSS variables only, radius <= 6px, no gradients/glow/purple; rise/fall colours only for asset returns.
- Must pass: `npm run typecheck`, `npm run lint`, and `npm test -- src/components/macro src/lib/macro "src/app/(app)/macro" src/app/api/macro` (the test `src/lib/macro/replay.test.ts` may time out locally; ignore only that one).


TASK R1 (display registry adoption in the macro UI). Main now has an unhashed display registry: src/lib/macro/display-catalog.ts and src/lib/macro/series-registry.ts (`seriesById`, `ALL_SERIES`, `isDisplayOnly`, type `AnySeriesDef`). Display-only series (e.g. US_WALCL / RRPONTSYD / WTREGEN ids — read display-catalog.ts for the real ids) currently get no detail page because the UI looks series up with `catalogById`.
Switch these lookups to the registry so display-only series get a working detail page and correct overview rows:
- src/app/(app)/macro/[seriesId]/page.tsx (notFound decision and metadata)
- src/components/macro/IndicatorDetail.tsx (def lookup, seriesRead lookup)
- src/components/macro/view-model.ts (source / period lookups)
- src/components/macro/detail-model.ts (`yoyOf` default catalog → ALL_SERIES, only if a display series can have a YoY derive; keep signature)
Do NOT change clock-model.ts, clock-weighted.ts, MacroJudgmentSlot.tsx (they look up regime-weighted series, which live in the hashed catalog) and do not edit anything under src/lib/macro except nothing at all (read-only use of the registry).
Tests first: a display-only id resolves in the page's lookup helper / view-model (period, source label) and an unknown id still 404s; hashed-catalog ids behave exactly as before. If a server API route used by the detail page (src/app/api/macro/series/**) rejects display-only ids because of catalogById, report it but do not edit it unless it is under src/app/api/macro and the fix is the same one-line lookup swap with a test.


RESUME NOTE: a previous run of this exact task was interrupted. The working tree already holds its uncommitted partial work (see git status). Read it, keep what is right and finish on top of it; do not start over, do not revert it.
