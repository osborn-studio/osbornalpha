**Changed:** Macro navigation and labels, permanent redirects, auth landing targets, route guards, Playwright specs, demo script, and three runbooks. The pre-moved macro page files were left unchanged. **Deleted:** the Today page, four Today components, and two Today message files.

**TDD:** Added `TabBar.test.ts`, `next-config-redirects.test.ts`, and `auth/callback/route.test.ts`; extended `middleware.test.ts` and `macro/pages.test.ts`. Each new behavior failed before its implementation change. The `next.config.mjs` test imports the config directly.

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| Requested `npx vitest run …` | 342 passed, 1 failed |
| Focused Vitest run for changed behavior | 27 passed |
| `npm run build` | Pass, including prebuild |
| Requested grep check | Produced matches; empty-result requirement unmet |

The Vitest failure is in `src/components/macro/strategy-links.test.ts`, which still reads the moved page at its old path. That test is inside the explicit `src/components/macro/**` do-not-edit boundary. The grep matches include the required `/today` redirect tests and unrelated retained `today` identifiers; removing those matches would conflict with the requested coverage and exclusions. Playwright was not run, as instructed.