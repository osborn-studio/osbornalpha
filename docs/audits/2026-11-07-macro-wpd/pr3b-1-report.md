WP-D PR-3b part 1 implements BIS-backed monthly `CN_LPR_1Y`. New `CATALOG_VERSION`: `macro-catalog/b91aad6b17f3`. US and CN weights remain 100 and 125. The latest LPR value `3` contributes `{recovery:3,overheat:2,stagflation:1,recession:1}` with weight 10 and rule `policy.2_5to4_5`; CN coverage increases by `10/125` for otherwise identical inputs.

BIS runs in its own `ts-bis` / `macro.bis` batch. Its receipt is under `bis`; a BIS failure leaves the FRED batch and US publication intact. Preview fetches and parses without writes. No CN snapshot is published here: the next CN publication after AKShare ingest finish picks up the eligible BIS observations. Definition failures retain the exact evidence bytes and retrieval receipt without inserting LPR observations.

The parser verifies the instrument definition on every row, excludes pre-August-2019 observations and the current UTC month, and produces 87 completed months from the recorded fixture as of 2026-11-16. Tests cover all change points, exact fixture hash, independent locator replay, CSV quoting and reordered columns, typed parse errors, retries, and redirect rejection. `csv_row.column` remains a zero-based CSV field index, matching FRED and the existing replay reader; `line` is the one-based physical file line. The fixture and manifest were already staged and were not modified. No upstream hosts were requested during this work; fetch tests use fakes.

Verification:

| Command / scope | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `npm test -- src/lib/macro src/app/api/macro src/app/api/cron --maxWorkers=1` | 1393 | 8 | 88 |
| `npm test -- src/lib/judgments --maxWorkers=1` | 525 | 3 | 84 |
| Focused implementation tests (seven files) | 135 | 0 | 0 |
| Cron route tests | 20 | 0 | 0 |

`npm run typecheck`, `npm run lint`, and `git diff --check` pass. Initial parser/provider/catalog/freshness and cron tests were run red before their implementations. A transient replay timeout passed on recheck and in the final gate. The publication fake fetch was extended to serve the recorded BIS fixture; all of its assertions remain unchanged.

The following failures are deliberately left for part 2. The v2 method still binds the previous catalog; its publication assertions now observe an abstained judgment. Catalog and formula pins remain unchanged. The snapshot registration title below is abbreviated.

1. `src/lib/macro/display-catalog.test.ts` — keeps display definitions outside the regime catalog and weights.
2. `src/lib/macro/display-registry.hash.test.ts` — preserves the registered v2 formula and excludes the display registry from its closure.
3. `src/app/api/macro/publish-judgment.test.ts` — US production sync immediately registers the exact published snapshot through the real producer.
4. `src/app/api/macro/publish-judgment.test.ts` — CN finish registers once and a keyed finish replay preserves the same judgment.
5. `src/app/api/macro/publish-judgment.test.ts` — publication hook and compensation for the same binding retain one idempotent judgment.
6. `src/app/api/macro/publish-judgment.test.ts` — concurrent hook producers for a fresh binding register one judgment and leave the scan marker alone.
7. `src/app/api/macro/publish-judgment.test.ts` — a newer active snapshot does not retarget an older publication callback.
8. `src/app/api/macro/publish-judgment.test.ts` — failed CN hook completes fact publication, replay skips it and compensation can recover.
9. `src/lib/judgments/methodologies/macro-regime.v2.test.ts` — macro_regime@v2 (Task 19) registers snapshot s1: categorical claim, margin_pp in percentage points, frozen catalog_version, 3-month period target.
10. `src/lib/judgments/methodologies/macro-regime.v2.test.ts` — macro_regime@v2 (Task 19) macro_regime_replay on the same vintage → recovery → hit.
11. `src/lib/judgments/methodologies/macro-regime.v2.test.ts` — pins the v2 selection-only hashed file list and formula_hash.

PostgreSQL execution is unverified in this sandbox. The existing local DB harness fails with `listen EPERM` on `127.0.0.1`, before PostgreSQL startup. Two new `S4_TEST_STATE` cases are written in `src/lib/macro/macro.integration.test.ts`: adapter acceptance/rejection, path enforcement and replay stability; and retirement/event idempotence, invalid actor/reason, missing methodology, registration refusal and execute grants. Retirement coverage lives in that macro DB suite to honor the explicit restriction against editing `src/lib/judgments/**`.

The replayable migration widens only the discovered adapter CHECK, requires exactly one match, excludes `macro_evidence_path`, and evaluates the existing path predicate against a BIS CSV path. The current path CHECK concatenates the adapter and admits BIS. Dataset checks are generic length/pattern checks and admit `macro.bis`; no closed dataset enum was found.

`supabase/migrations.lock.json` was not changed because these earlier migration files are unlocked:

- `20261121090000_macro_manifest_json_transport.sql`
- `20261123110000_company_evidence_fact_lookup.sql`
- `20261124110000_company_digest_retry_selection.sql`
- `20261125090000_macro_display_frequency.sql`

Changed files (including this report; excluding the pre-existing staged fixtures and prompt):

- `docs/audits/2026-11-07-macro-wpd/pr3b-1-report.md`
- `src/app/api/cron/macro-sync/route.test.ts`
- `src/app/api/cron/macro-sync/route.ts`
- `src/app/api/macro/publish-judgment.test.ts`
- `src/lib/macro/catalog.test.ts`
- `src/lib/macro/catalog.ts`
- `src/lib/macro/evidence.test.ts`
- `src/lib/macro/evidence.ts`
- `src/lib/macro/freshness.test.ts`
- `src/lib/macro/freshness.ts`
- `src/lib/macro/ingest.test.ts`
- `src/lib/macro/ingest.ts`
- `src/lib/macro/macro.integration.test.ts`
- `src/lib/macro/parsers/bis-cbpol.test.ts`
- `src/lib/macro/parsers/bis-cbpol.ts`
- `src/lib/macro/providers/bis.test.ts`
- `src/lib/macro/providers/bis.ts`
- `src/lib/macro/regime.test.ts`
- `src/lib/macro/types.ts`
- `src/lib/macro/views.test.ts`
- `src/lib/macro/views.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20261128090000_macro_wpd_v3.sql`

All requested implementation work is present. Remaining work is PostgreSQL execution outside the sandbox and the explicitly deferred v3 methodology, documentation and pinned assertions. Protected components, pages, messages, display catalog rows, strategy fixtures, `scripts/macro/cn-series.json`, and all files under `src/lib/judgments/**` and `docs/methodologies/**` remain unchanged. No commit or deployment was made.
