# Ledger timestamp-filtered replay (inactive) and import-calls CLI boundary

This PR lands work that was left behind in the local `OsbornAlpha-runtime-preflight` worktree when PR #71 (`codex/revocation-feed-contract`) was closed and split into #72 and #73 (merged 2026-10-17). Two commits from that branch (d886c5c, 1366c28, authored 2026-10-06) were never pushed and were not carried into #72 or #73; an uncommitted refactor of the import-calls CLI sat beside them. Both pieces were brought onto a fresh branch cut from `origin/main` (afa59b7) — the two commits by cherry-pick, the refactor by applying `git diff` output and copying the untracked files. Nothing in the source worktree was modified. Earlier verification history for both pieces is recorded in the 2026-10-06 and 2026-10-07 entries of `docs/verification/2026-10-06-ledger-timestamp-view.md` (included in this PR) and in Osborn-PA `BUSINESS-PROGRESS.md`.

## 1. Inactive timestamp-filtered judgment replay

`src/lib/research/s4/ledger.ts` gains `replayTimestampFilteredJudgments(actor, thesisId, asOf)`, a sibling of the existing `replayJudgments`. Both now delegate to a private `replayJudgmentsWithCutoff(actor, thesisId, asOf, recordedOnly)`.

- **Legacy `replayJudgments`** is unchanged in behaviour: it returns every judgment whose *source* was available at or before `asOf`, regardless of when the judgment row itself was created, uncapped, with millisecond `toISOString()` timestamps. It is a retrospective source-availability view and must not be read as "what the user knew at the time".
- **New `replayTimestampFilteredJudgments`** additionally requires the stored judgment `created_at` to be at or before `asOf`. It returns exact UTC microsecond text for `created_at` and `available_at` (via `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`) so an inclusive cutoff round-trips without pg `Date` truncation. It requests 101 rows in the same deterministic total order and fails `input_limit` when more than 100 match, rather than returning a partial prefix.
- **Limits stated in the code comment and preserved here:** `created_at` is a writer-supplied pre-commit wall-clock stamp. Rows can be backdated by any INSERT-capable principal, clocks can step, and rows can commit after the cutoff. The view filters stored timestamps only; it proves neither historical visibility nor source authority nor authentic human judgment. The 100-row cap bounds returned rows, not SQL scan/sort cost or per-row JSON size.

**The replay is inactive.** No route, API handler, report, CLI, flag or environment variable calls `replayTimestampFilteredJudgments`. A repository search on this branch finds the symbol only in `ledger.ts` (definition) and `ledger.integration.test.ts` (tests). `replayJudgments` likewise has no callers outside the ledger module. There is no schema migration and no stored history rewrite. Enabling the view for any consumer is a separate decision that still needs trusted timestamp/origin and permission design.

Coverage lives in `src/lib/research/s4/ledger.integration.test.ts` (real PostgreSQL, runs under `npm run test:db`): inclusive cutoff boundary, later judgment on an earlier source excluded, future-availability source excluded, 100 rows returned / 101 refused, earlier cutoff still returns 100 after later insertion, and a `pg` `Client.query` spy asserting the executed SQL carries `limit $5::integer` with `101` for the filtered view and `null` for the legacy view.

## 2. import-calls CLI boundary

`scripts/import-calls.ts` (WP-A10 one-time mapping of the personal hiphon-pm call journal into the judgment ledger) is split into three files:

- `scripts/import-calls-options.ts` — `parseImportCallsOptions(args)`: pure argument parsing with no file, environment or credential access. Accepts exactly one positional journal path, optional `--scorecard <file>`, optional `--dry-run`, and `--` to end option parsing. Fails closed with `invalid_import_arguments` on a missing journal, extra positionals, unknown `--flags`, duplicate `--dry-run` or `--scorecard`, `--scorecard` without a value, empty paths and NUL bytes. The error never echoes input.
- `scripts/import-calls-runner.ts` — `runImportCallsCli(args, {prepare, stdout, stderr})`: lifecycle seam returning exit code `0 | 1 | 2`. Arguments are parsed before any loader work. `prepare` receives the parsed options and a `registerCleanup` hook and returns the unit of work; the registered cleanup (pool close) is awaited in `finally` before any success output. Failures at module-load, file, database or cleanup stage produce one redacted stderr line (`import_calls_failed: …` with usage) and exit 1; raw error text never reaches stderr. Result JSON goes to stdout only after cleanup.
- `scripts/import-calls.ts` — thin adapter: lazily imports `@next/env` (with a silent logger), the S4 DB module, research service/theses, ledger and `importCalls` *inside* `prepare`, so nothing environment-bound loads when arguments are invalid. Owner missing (`RESEARCH_OWNER_USER_ID`) throws inside `prepare` and is reported through the same redacted path. Journal and scorecard are still read only from the operator-supplied paths.

`src/lib/research/ledger/calls-import.ts` adds `outcomes_planned` to `ImportResult`. A dry run now tracks the card ids it *would* import in this run, so `manual_close` events for those calls count as `outcomes_planned` instead of landing in `outcomes_unmatched`; it also de-duplicates repeated events against a local copy of the existing-outcomes set. Consequently a dry run and a real run on the same journal report identical `planned` / `outcomes_planned` counts, and the dry run never mutates the injected `existingDecisions` / `existingOutcomeEvaluationIds` collections or calls `recordDecision` / `recordOutcome`. The real-run path is otherwise unchanged (`planned` no longer double-counts outcomes in dry-run mode; it counts calls only, as it already did in real runs).

New unit suites (no DB, no files, no environment): `src/lib/research/ledger/import-calls-options.test.ts` (option order independence, `--` handling, every fail-closed case, no input in error text) and `src/lib/research/ledger/import-calls-runner.test.ts` (invalid args refuse before `prepare`, redaction at module/file/database/cleanup stages with cleanup still attempted exactly once, loader failure before cleanup registration, success output emitted only after cleanup in `work → close → output` order). `calls-import.test.ts` gains the dry-run/real-run parity case.

## Reconciliation against current main

Both cherry-picks applied without conflict; `ledger.ts`, `ledger.integration.test.ts` and `calls-import.ts` had not diverged on `main` between 2026-10-06 and afa59b7. The uncommitted diff applied cleanly with `git apply --3way`. Nothing had to be dropped or rewritten.

## Verification (this branch, Mac mini, 2026-10-17)

Fresh `npm ci` in the worktree; no `.env.local` present; `LC_ALL=C` for the database harness.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | pass, 0 warnings |
| Typecheck | `npm run typecheck` | pass |
| Touched unit suites | `npx vitest run src/lib/research/ledger/{calls-import,import-calls-options,import-calls-runner}.test.ts` | 3 files, 29 tests pass |
| Full unit run | `npx vitest run` | 235 files pass, 13 skipped (DB-gated); 1996 tests pass, 114 skipped |
| Real PostgreSQL suite | `LC_ALL=C npm run test:db` | pass, exit 0: 248 files, 2110 tests, 0 skipped (ledger.integration.test.ts included) |
| Production build | `npm run build` | pass, exit 0 |

CI on the PR runs the same lint/typecheck/test:db steps plus the migration, runtime-privilege, TLS and revocation smokes, the sharp runtime smoke, build and `npm audit`; see the PR checks for the authoritative Linux result.

## What this PR does not do

No route, flag or consumer activates the timestamp-filtered replay. No schema migration. No production data, provider, notification or private-data path is touched. The import-calls script remains an operator-run one-time tool; its behaviour on a real database is unchanged apart from the added `outcomes_planned` field and stricter argument validation.

## Worktree disposition

With this PR open, every commit and every uncommitted change that existed only in `OsbornAlpha-runtime-preflight` is on `codex/ledger-timestamp-replay-import-cli`. The branch that worktree was on, `codex/revocation-feed-contract`, is otherwise fully pushed (its other commits landed through #72/#73). The worktree can be removed once this PR merges, or earlier if the branch is kept as the backup.
