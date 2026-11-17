# WP-D PR-3a implementation report

The display registry contains three native Federal Reserve liquidity series and three monthly derivations. No commit was created. The pre-existing untracked `pr3a-prompt.md` was left alone.

- Display catalog version: `macro-catalog/bbacf40d154d`.
- Original catalog version: `macro-catalog/30bcaa2a33c5`.
- Recomputed `macro_regime@v2` formula hash: `dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`.
- The formula import closure contains neither display registry module.
- The diff against `origin/main` is empty for every frozen path, including decimal.ts, judgment-contract.ts, UI paths, translations, and strategy fixtures.
- No new banned wording was added. `git diff --check` passes.

## Files changed

New files:

- `src/lib/macro/display-catalog.ts`
- `src/lib/macro/series-registry.ts`
- `src/lib/macro/display-catalog.test.ts`
- `src/lib/macro/display-registry.hash.test.ts`
- `supabase/migrations/20261127090000_macro_display_frequency.sql`
- This report.

Modified files:

- `src/app/api/cron/macro-sync/route.ts` and `route.test.ts`
- `src/app/api/macro/ingest/route.ts`
- `src/app/api/macro/routes.test.ts`
- `src/app/api/macro/publish-judgment.test.ts` (the fake fetch now recognizes registry series)
- `src/app/api/macro/series/[id]/route.ts`
- `src/app/api/macro/series/[id]/versions/route.ts`
- `src/lib/macro/ingest.ts`
- `src/lib/macro/derive.ts`
- `src/lib/macro/quality.ts` and `quality.test.ts` (WTREGEN validation fix)
- `src/lib/macro/freshness.ts`
- `src/lib/macro/read-api.ts` and `read-api.test.ts`
- `src/lib/macro/db.ts`
- `src/lib/macro/db-contract.ts`
- `src/lib/macro/memory-db.ts`
- `src/lib/macro/series-extras.ts` (parameter type only)
- `src/lib/macro/analysis-spec.ts`
- `src/lib/macro/workbench-options.ts`
- `src/lib/macro/parsers/fred-csv.test.ts`
- `src/lib/macro/macro.integration.test.ts`
- `scripts/macro/record-fred-fixtures.ts`

## Deliberately retained catalog consumers

| Consumer | Display series behavior |
| --- | --- |
| `catalog.ts` lookup, indicators and regime inputs | Display ids are absent. |
| `regime.ts`, `regime-selection.ts`, F4 judgments and methodology definitions | Display values cannot contribute; a display-only input map has zero contributions and the full region weight uncovered. |
| `snapshots.ts` | Snapshot input/history manifests, catalog counts, catalog version and publish inputs exclude display series. The fixture-backed cron test compares manifests and regime results before and after display ingestion. |
| `views.ts`, overview API | Display series do not appear in overview rows; the overview keeps the original version. |
| `strategy/**`, particularly `strategy/wiring.ts` | Display series are absent from the strategy port catalog and manifests. |
| `series-extras.ts` asset selection | Display rows are indicators, so they are not cycle comparison assets. Display monthly series can have their own cycles through the widened parameter type. |
| `cn-series.ts`, `parsers/index.ts`, CN export/collector paths | Remain CN/AKShare-only; display ids are not CN parser entries. FRED cron invokes its CSV parser directly. |
| `testing/seed.ts`, existing replay helpers | Continue seeding/replaying the original regime catalog; new cron tests ingest display fixtures separately. |
| Evidence API | Evidence is addressed by hash and remains readable for display series; its response envelope retains the original catalog version. |
| Analyses API | Monthly display indicators pass the widened analysis validator; frozen analysis inputs still carry the existing API's original catalog version. |
| Cron and ingest original mirror calls | Retained verbatim, followed by a separate display mirror upsert. Publication and existing batch metadata retain the original version. |
| `memory-db.ts` canonical JSON helper, `display-catalog.ts` canonical JSON/hash helpers | Use pure helpers from the original catalog without adding display definitions to it. |

`analysis-spec.ts` and `workbench-options.ts` were updated because they would otherwise reject or omit monthly display series.

WTREGEN validation limitation — fixed: `quality.ts` now makes `usd_mn` range-only (`maxRelJump:null`). TGA week averages legitimately double or halve around debt-ceiling episodes; the 0…20 000 000 range still rejects negative values and catches a ×1000 unit error. The `usd_bn` profile is unchanged. Regression tests cover the four real WTREGEN transitions from May 2007 and June 2023. The cron fixture test requires every non-empty WALCL, WTREGEN and RRPONTSYD row to be inserted with zero quarantined, and verifies the derived row for every completed month.

## Migration and database checks

The requested timestamp was free and later than every existing migration. The migration discovers the single native_frequency CHECK using its deparsed column name, requires exactly one match, replaces it, and accepts weekly values. The integration test replays it twice, writes a weekly definition through `macro_upsert_catalog`, and rejects a bogus frequency.

The lock file was left unchanged because these earlier migrations are not locked:

- `20261121090000_macro_manifest_json_transport.sql`
- `20261123110000_company_evidence_fact_lookup.sql`
- `20261124110000_company_digest_retry_selection.sql`

Both prescribed commands were attempted with `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH`:

- `npm run test:db -- src/lib/macro/macro.integration.test.ts`
- `npm run test:migrations`

Both were blocked before tests by sandbox `listen EPERM` on the tsx IPC socket. A `node --import tsx` retry bypassed IPC but was blocked by `listen EPERM` on localhost. PostgreSQL replay and frequency acceptance therefore remain unverified in this sandbox; the tests are written.

## Verification

The first catalog test failed on the missing display module before implementation; the baseline formula hash test passed.

- Targeted cron/publication/hash tests: 31 passed, 0 failed.
- Registry/parser/read API/analysis/options/route tests: 62 passed, 0 failed.
- `npm run typecheck`: passed, exit 0.
- `npm run lint`: passed, exit 0.
- Protected-path diff gate: passed, no output.
- Full-suite and isolated replay results: recorded below.

The full gate was rerun as `npm test -- src/lib/macro src/app/api/macro src/app/api/cron src/lib/judgments --maxWorkers=2 --reporter=verbose`: 1,866 passed, 1 failed, 168 skipped; 133 files passed, 1 failed, 9 skipped. The sole failure was the unchanged replay test `replay US > two independent replays publish the same facts`, exceeding its existing 60-second timeout at 72.8 seconds. Earlier runs also exposed a fake-fetch catalog mismatch and an overly broad fixture row-count assertion; both were corrected and their targeted tests pass. No source test timeout was changed.

`npm test -- src/lib/macro/replay.test.ts --maxWorkers=1`: 13 passed, 0 failed (161.81 seconds). The full gate was repeated with one worker to avoid contention with the expensive offline replay.

Final gate: `npm test -- src/lib/macro src/app/api/macro src/app/api/cron src/lib/judgments --maxWorkers=1` passed: **1,867 passed, 0 failed, 168 skipped**; **134 files passed, 9 skipped**, exit 0, 115.40 seconds. The skipped tests require database services. Typecheck, lint and the protected-path diff gate also passed after the final code edits. The only unexecuted verification is PostgreSQL integration/migration replay blocked by sandbox socket permissions.

## WTREGEN validation fix verification

Test-first reproduction: 6 failed, 23 passed before the profile fix (the profile expectation, four real transitions, and full fixture acceptance). After the fix:

- `npm test -- src/lib/macro/quality.test.ts src/app/api/cron --maxWorkers=1`: 123 passed, 0 failed; 16 files passed.
- Recorded fixtures: WALCL 618 native / 142 monthly; WTREGEN 618 native / 142 monthly; RRPONTSYD 2,954 native / 142 monthly. Every non-empty native row is inserted; zero native or derived rows are quarantined.
- `npm run typecheck`: passed, exit 0.
- `npm run lint`: passed, exit 0, zero warnings.
- Protected-file byte comparison against `origin/main`: 139 checked, 0 differences.
- No commit created; existing PR-3a work retained.
