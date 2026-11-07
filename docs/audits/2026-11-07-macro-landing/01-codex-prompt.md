# Task: macro workbench replaces the "Today" landing page; /today → /macro

You are working in a Next.js 15 App Router repo (React 19, next-intl without locale routing, Supabase auth, vitest, Playwright).
Work ONLY in this worktree root. Do not run `git commit`, `git stash`, `git checkout` or anything that changes branches. Do not deploy.
Do not print secrets. Node modules are installed.

The directory `src/app/(app)/intel/macro` has ALREADY been `git mv`-ed to `src/app/(app)/macro` (all sub-routes: `[seriesId]`, `analyses/[runId]`, `history`, `review`, `review/[region]/[month]`, `transmission`, and the two structural tests `pages.test.ts` and `transmission/strategy-pages.test.ts`). Nothing inside those page files has been edited yet.

## Hard boundaries (other sessions own these files — DO NOT EDIT)
- `src/lib/macro/**`
- `src/components/macro/**` (all of it, including `strategy-links.ts` and its test). Their `/intel/macro/...` hrefs stay as they are; the permanent redirects below keep them working.
- `src/lib/judgments/**`, `src/lib/foreign/**`, `src/app/api/**`
- `src/components/company/**`
- The page files now under `src/app/(app)/macro/**/page.tsx`: do not change their contents (comments mentioning `/intel/macro` may stay).
- migrations, `database.types.ts`, `vercel.json`

## Method: TDD, strictly
For every behavioural change below: first add/adjust the test so it FAILS against the current code (run it and confirm the failure), then make the smallest change that makes it pass, then run the suite. Use the repo's existing test style (vitest, structural `readFileSync` guards are an accepted pattern here; see `src/app/(app)/macro/pages.test.ts` and `src/middleware.test.ts`).

## Changes

### 1. Navigation (`src/components/TabBar.tsx`, `messages/{zh,en}/common.json`)
- The first tab (`id: 'home', navKey: 'today', href: '/today'`) becomes `id: 'macro', navKey: 'macro', href: '/macro'`. Keep it first. Replace the sunrise glyph with a simple line-art "macro" glyph in the same style (24×24 viewBox, 1.5px stroke, currentColor): a globe (circle r=8 at 12,12 + one vertical ellipse + horizontal line through the centre) — nothing elaborate.
- `navKey` union type: replace `'today'` with `'macro'`.
- Active-match logic: remove the `/today` special case; every tab uses `pathname.startsWith(t.href)` (so `/macro/transmission` highlights the macro tab, `/intel/...` highlights intel).
- `common.nav.today` → `common.nav.macro`: zh `"宏观"`, en `"Macro"`. Keep the nav object key order (macro first). The zh/en parity test for `common` is in `src/i18n/messages-parity.test.ts`; keep it green.
- Test: add `src/components/TabBar.test.ts` (structural, like the existing macro page guards): the first TAB entry has `href: '/macro'` and `navKey: 'macro'`; the file contains no `/today`; the active check is `pathname.startsWith(t.href)` with no `/today` special-case; both `messages/*/common.json` have `nav.macro` and no `nav.today`.

### 2. Routes and redirects (`next.config.mjs`)
`/macro` is now canonical (the page files already live there). In `redirects()` return, all `permanent: true`:

| source | destination |
|---|---|
| `/dashboard` | `/macro` (was `/today`) |
| `/today` | `/macro` |
| `/intel/macro` | `/macro` |
| `/intel/macro/:path*` | `/macro/:path*` |

Test: add `src/next-config-redirects.test.ts` (vitest only picks up `src/**/*.test.ts`) that imports `../next.config.mjs`, calls `redirects()` and asserts exactly those four entries (source, destination, permanent). If importing the config in vitest fails because of the next-intl plugin wrapper, fall back to a structural assertion on the file text; say which you used.

### 3. Every `/today` reference becomes `/macro`
- `src/middleware.ts` line ~99: the authed `/login`|`/register` redirect target → `/macro`. Update the doc comment at the top too. Test: extend `src/middleware.test.ts` with a case: authed user (`getUser` resolves a user) requesting `/login` → response status 307 and `location` ends with `/macro`.
- `src/app/auth/callback/route.ts`: default `next` → `/macro`. Test: add `src/app/auth/callback/route.test.ts` mocking `@/lib/supabase/server` (`getServerSupabase` → `{ auth: { exchangeCodeForSession, getUser }, from: () => ({ insert }) }`): with `?code=x` and no `next`, the redirect `location` is `${origin}/macro`; with `?next=/portfolio` it is `${origin}/portfolio`; without `code` it is `/login?error=auth_failed`.
- `src/components/AuthForm.tsx` (`window.location.href = '/today'`), `src/components/TopBar.tsx` (logo link), `src/app/page.tsx` (two CTAs), `src/app/not-found.tsx`, `src/app/(app)/error.tsx` → `/macro`.
- `src/app/api/brief/preview/route.ts` has a comment mentioning "BriefGlance on /today" — reword the comment only (no code change in `src/app/api/**`): say the brief preview is consumed by `/briefs`.
- After this, `grep -rn "/today" src e2e` must return nothing except `src/app/api/usage/today/**` (an unrelated API path) and `src/components/UsageToday*`/`usage-today-format` (unrelated).

### 4. Remove the Today page and its components
- Delete `src/app/(app)/today/` (page.tsx only) and `src/components/today/{BriefGlance,PortfolioGlance,RadarStream,MacroGlance}.tsx`. First `grep -rn "components/today" src` — the only importers are the Today page and `src/app/(app)/macro/pages.test.ts`; if you find another, keep that component and tell me.
- Keep `src/lib/today/clock.ts` and its test (used by `src/lib/data/kline/reliability.ts`).
- Delete `messages/zh/today.json` and `messages/en/today.json`; remove `'today'` from `MESSAGE_DOMAINS` in `src/i18n/request.ts` (keep the comment structure; just drop the entry). Check nothing else reads the `today` message domain (`useTranslations('today'`, `getTranslations('today'`).
- `src/app/(app)/macro/pages.test.ts`: fix the paths from `src/app/(app)/intel/macro/` to `src/app/(app)/macro/`; delete the test case "Today glance has no mock rows and sits inside MACRO markers" and the stale "no mock data in Today" wording in the header comment; replace the test "TabBar highlights /intel/macro/* through the /intel prefix" with "TabBar highlights /macro/* through the /macro prefix" asserting `href: '/macro'` and `pathname.startsWith(t.href)`. Keep the `/intel` MacroSummaryCard test.
- `src/app/(app)/macro/transmission/strategy-pages.test.ts`: `BASE='src/app/(app)/macro'`.
- `src/app/(app)/dynamic-rendering.test.ts`: leave as is unless it breaks.
- Check `scripts/ci/research-checks.ts` (critical suites list) and `src/lib/research/ci-contract.test.ts` for any `intel/macro` or `today` test paths and update them if present.

### 5. Playwright specs (`e2e/`)
- `e2e/authed.spec.ts`: title "login flow reaches /macro, then key authed pages render"; `waitForURL('**/macro')`; the heading assertion becomes `getByRole('heading', { name: '宏观工作台' })`.
- `e2e/company.spec.ts`, `e2e/production-security-search.spec.ts`, `e2e/research-setup.spec.ts`: `waitForURL('**/today')` → `'**/macro'`.
- `e2e/smoke.spec.ts`: replace the `/today` test with `'/today permanently redirects to /macro, then to /login with next=/macro'` (goto `/today`, expect pathname `/login`, `next` === `/macro`); the `/dashboard` test expects `next` to contain `macro`; add `'/intel/macro and /intel/macro/transmission redirect to /macro/*'` (unauthenticated: final pathname `/login`, `next` === `/macro` and `/macro/transmission` respectively).
- Also update `docs/demo/record/record.ts` string literals `/today` → `/macro` (it is a demo script, not run in CI).

### 6. Docs (text only)
- `docs/runbooks/macro-sync.md`, `docs/runbooks/macro-strategy.md`, `docs/runbooks/data-foundation.md`: every `/intel/macro` → `/macro`, and add one sentence near the first occurrence in each runbook: "路径 2026-11-07 起为 `/macro`（旧路径 `/intel/macro/*` 308 永久重定向）". In `macro-sync.md` §13.5 item 2 (the `/today` 宏观一览 card check): replace with "`/today` 已移除，`/macro`（宏观工作台）是登录后的落地页，底栏第一个标签为“宏观”；`/intel` 仍有宏观摘要卡。"
- Do not edit `docs/audits/**` or `docs/superpowers/**` (historical records).

## Verification (run all, fix what you broke, report exact results)
1. `npm run typecheck`
2. `npm run lint`
3. `npx vitest run src/components src/i18n src/middleware.test.ts src/app/auth "src/app/(app)" src/next-config-redirects.test.ts`
4. `npm run build` (the `prebuild` step builds a worker bundle; let it run)
5. `grep -rn "/today\|components/today\|'today'" src e2e messages --include=*.ts --include=*.tsx --include=*.json | grep -v "usage/today\|UsageToday\|usage-today\|industry\|evals\|judgments\|tracking.json\|TrackingInbox"` → must be empty.
Do NOT run the full `npm test` (long); do not run Playwright (I will).

## Report
Write a concise report to stdout: files changed/deleted, which tests you added and that each failed first, the exact commands run with pass/fail counts, and anything you could not do. No prose beyond that.
