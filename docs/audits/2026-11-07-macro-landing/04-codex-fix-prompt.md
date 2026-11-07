# Fix round after review (macro landing)

Same worktree and boundaries as `docs/audits/2026-11-07-macro-landing/01-codex-prompt.md` (do not edit `src/lib/macro/**`, `src/components/macro/**`, `src/app/api/**` code, `src/lib/judgments/**`, `src/lib/foreign/**`; no git commit/stash/checkout; no deploy; do not print secrets). TDD: failing test first, then the change.

Do NOT run `npm run build` or `next dev` this round (a dev server is running in this tree). Only typecheck, lint and the focused vitest runs.

1. Segment-aware tab matching. Create `src/components/tab-active.ts` exporting a pure `isTabActive(pathname: string, href: string): boolean` = `pathname === href || pathname.startsWith(href + '/')`. Use it in `src/components/TabBar.tsx`: `const active = isTabActive(pathname, t.href);`. Add `src/components/tab-active.test.ts` with cases: (`/macro`,`/macro`) true; (`/macro/transmission`,`/macro`) true; (`/macro/US_UNRATE`,`/macro`) true; (`/macrofoo`,`/macro`) false; (`/intel/methods/x`,`/intel`) true; (`/intel`,`/macro`) false; (`/watchlist`,`/macro`) false. Update `src/components/TabBar.test.ts` to assert `isTabActive(pathname, t.href)` is used and no bare `pathname.startsWith(t.href)` remains; update the TabBar test in `src/app/(app)/macro/pages.test.ts` the same way (that file is in the moved page folder and is yours to edit).

2. Smoke e2e asserts the 308s directly. In `e2e/smoke.spec.ts` add one table-driven test `'legacy paths answer 308 with the /macro location'` using the `request` fixture: `request.get(path, { maxRedirects: 0 })` for `/today`, `/dashboard`, `/intel/macro`, `/intel/macro/transmission`, `/intel/macro/review/US/2026-10`; expect status 308 and the `location` header to end with `/macro`, `/macro`, `/macro`, `/macro/transmission`, `/macro/review/US/2026-10` respectively. Keep the existing browser-level tests.

3. `src/app/api/brief/preview/route.ts` comment (comment only): the previous round wrote "consumed by /briefs" without checking. `grep -rn "brief/preview" src` and name the actual callers of the skipLLM=true path in that comment (e.g. "composition-only callers such as <component>"); if none remain after the Today removal, say "(no in-app caller after the Today page removal; kept for API clients)".

Verify: `npm run typecheck`, `npm run lint`, `npx vitest run src/components src/app/\(app\)/macro src/i18n`. Report: files changed, each new test's failing-first evidence, commands with counts, anything not done. Terse.
