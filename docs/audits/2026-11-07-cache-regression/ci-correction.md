# PR #146 CI boundary correction

CI run `42384738081` had one failing test: `strategy-pages.test.ts:32` treated every `@/lib/supabase` prefix as privileged, including the existing `@/lib/supabase/client` browser auth module. Reproduced locally: one failure, ten passing tests across strategy pages and the strategy hook.

The production auth pattern is already correct: `useStrategyFetch` and `useMacroOverview` subscribe through `getBrowserSupabase`; `src/lib/supabase/client.ts` starts with `'use client'`, imports `createBrowserClient` from `@supabase/ssr`, and reads the public Supabase URL and anon key. No application code changed.

The structural guard now parses runtime module references, normalizes relative paths, and permits exactly the browser entry point. Server/admin/anon clients, Supabase barrels, strategy stores/flags/server helpers, server-only modules and Node imports remain forbidden. Negative fixtures exercise named/default/namespace/side-effect/empty imports, re-exports, dynamic imports and require. Explicitly erased type imports remain permitted. A separate assertion checks the auth listener's client import, the client directive/factory, its exact safe dependencies and public environment reads; computed, whole-env, destructured and private-key process accesses fail the assertion. This is a structural regression guard, not a general security analyzer.

## Verification

Verification root: `/Users/osborn/Developer/CodeX/.worktrees/OsbornAlpha/cache-regression-ci` (physical path `/Volumes/AIMATE_WORK/Developer/CodeX/.worktrees/OsbornAlpha/cache-regression-ci`). Node `v22.22.1`, Vitest `--maxWorkers=1`.

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- --maxWorkers=1 'src/app/(app)/macro/transmission/strategy-pages.test.ts' src/components/macro/strategy src/components/macro/use-macro-overview.test.ts src/lib/macro/strategy/handler-performance.test.ts src/app/api/macro/strategy/routes.test.ts
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run lint
git diff --check
```

All passed: 9 test files, 167 tests; full typecheck and lint. The narrower strategy-pages/strategy-hook/overview-hook run also passed: 3 files, 17 tests. Existing Vitest config-loader advisory remains unchanged.

## Final MiniMax audit

Executed `mmx text chat --model MiniMax-M2.5 --messages-file /tmp/osstack/pr146-ci/messages.json --max-tokens 10000 --output json --non-interactive --no-color`. Submitted the final test diff, hook tests, browser client and existing overview auth pattern. Returned model `MiniMax-M2.5`, stop reason `end_turn`.

Final response:

> APPROVE
>
> No blocking findings.

No application hooks, frozen manifest persistence, shared global docs, root untracked files, merge or deployment changes.
