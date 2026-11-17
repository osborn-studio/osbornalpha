WP-D PR-3b part 2 registers the single current method as `macro_regime@v3`, pinned to `macro-catalog/b91aad6b17f3`. Formula, rules, weights, explicit deps and gather / compute / condition / resolveTarget behavior remain unchanged. Method labels and error labels now identify v3. The test compares the literal catalog pin with runtime `CATALOG_VERSION`.

The cron conflict contents are resolved: main's display-registry tests/helpers are retained, alongside the BIS setup and batch tests. All 20 cron tests pass. Git still reports the path unmerged because staging is reserved for the commander; there are no conflict markers. No Git index writes, commit, merge, or deployment was performed.

The pure `macro-method.ts` selector serves compensation, publication hooks, deviations, playbooks and the F4 client. Its test asserts that the single macro entry in REGISTRY has the same version. The v3 closure excludes both display-catalog.ts and series-registry.ts. The v3 formula hash is:

`f5d2d6cb32e21cd024e8189a806507371b8e25dfdc1399007476fb44cc83732c`

Retirement supports repeated `--retire id@version` with `--reason` of at least 10 trimmed characters. Preflight rejects registry members, missing rows and absent/inactive newer database versions before any writes. Dry-run prints the retirement intent. Apply calls `retire_methodology` with actor `script`; Supabase, memory and PG adapters implement the new port. Tests cover parsing, refusals, dry-run preservation, event contents, idempotence and admin RPC arguments. The sync test leaves an active orphan v2 row byte-for-byte unchanged, plans exactly one v3 registration with exit 0, then plans a resync.

Tests were run red before implementation: the existing v2 suite reproduced three catalog/hash failures; v3 and retirement tests initially failed on missing new modules; the RPC wiring test then failed until retirement joined the service RPC inventory. The golden replay was rebuilt and verified.

| Gate | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `npm test -- src/lib/judgments src/lib/macro src/lib/evals src/app/api tests --maxWorkers=1` | 3393 | 0 | 195 |
| Test files in that gate | 276 | 0 | 12 |
| Focused implementation tests (7 files) | 133 | 0 | 0 |
| Final focused method/retirement/inventory/cron tests (4 files) | 66 | 0 | 0 |
| Protected macro components and app pages (24 files) | 237 | 4 | 0 |

`npm run typecheck`, `npm run lint`, and `git diff --check` pass.

The exact `npx tsx scripts/judgments/build-replay-fixture.ts macro` and `… macro --check` commands were attempted but failed before script execution because the tsx CLI cannot open its IPC listener (`listen EPERM`, temporary `.pipe` path). Running the same builder with `node --import tsx scripts/judgments/build-replay-fixture.ts macro` succeeded; `node --import tsx scripts/judgments/build-replay-fixture.ts macro --check` exits 0 and reports the fixture up to date.

The four protected-page failures are in `src/app/(app)/stock/[ticker]/page.test.ts`: handled unavailable card for configured database errors; framework 404 for unknown security; no-issuer state with security known; no-issuer state with universe down. Their local HTTP fixture cannot listen on `127.0.0.1` (`EPERM`), causing four timeouts and four unhandled listener errors. The 23 other files pass, including all macro component tests. No protected files were edited.

PostgreSQL execution remains unverified: `node --import tsx scripts/s4/local-db.ts` reproduces `listen EPERM` on `127.0.0.1` before database startup. The part-1 retirement SQL test and migration remain untouched; DB suites are among the existing skips. Tests added here use memory/stub ports and no upstream network.

The v3 methodology documents the BIS definition and weekly publication timing, the CN hand calculation, unchanged formula/rules/weights, missing 社融存量同比 and MLF with their catalog reasons, and v2 cut-over settlement. Runbooks specify migration rehearsal/application, deployment, registration, owner publication confirmation, BIS ingestion, CN snapshot, both regions' judgments, then v2 retirement and rollback. `v2.md` and licenses.json remain untouched.

Moved files (plain filesystem moves, not staged):

- `src/lib/judgments/methodologies/macro-regime.v2.ts` → `src/lib/judgments/methodologies/macro-regime.v3.ts`
- `src/lib/judgments/methodologies/macro-regime.v2.test.ts` → `src/lib/judgments/methodologies/macro-regime.v3.test.ts`

Other files changed/added by this part (excluding incoming staged main changes and the pre-existing prompt):

- `docs/audits/2026-11-07-macro-wpd/pr3b-2-report.md`
- `docs/methodologies/macro_regime/v3.md`
- `docs/runbooks/judgments.md`
- `docs/runbooks/macro-sync.md`
- `fixtures/judgments/macro/us-2026-09-11.json`
- `fixtures/judgments/macro/us-2026-09-low-coverage.json`
- `fixtures/judgments/macro/us-2026-09-revised.json`
- `fixtures/judgments/replay/macro-regime.json`
- `scripts/judgments/sync-methodologies.ts`
- `src/app/api/cron/macro-sync/route.test.ts`
- `src/app/api/macro/publish-judgment.test.ts`
- `src/app/api/macro/strategy/routes.test.ts`
- `src/lib/evals/kinds/f4-adapter.test.ts`
- `src/lib/evals/validate/cli.test.ts`
- `src/lib/judgments/cohort-store.test.ts`
- `src/lib/judgments/compensate.test.ts`
- `src/lib/judgments/compensate.ts`
- `src/lib/judgments/db.test.ts`
- `src/lib/judgments/db.ts`
- `src/lib/judgments/integration/macro-bridge.integration.test.ts`
- `src/lib/judgments/job-keys.test.ts`
- `src/lib/judgments/macro-api.ts`
- `src/lib/judgments/macro-method.ts`
- `src/lib/judgments/memory-judgments-db.ts`
- `src/lib/judgments/methodology-retirement.test.ts`
- `src/lib/judgments/methodology-retirement.ts`
- `src/lib/judgments/methodology-sync.test.ts`
- `src/lib/judgments/on-macro-published.ts`
- `src/lib/judgments/pg-judgments-db.ts`
- `src/lib/judgments/public-reads.test.ts`
- `src/lib/judgments/registry.ts`
- `src/lib/judgments/replay.test.ts`
- `src/lib/judgments/rpc-inventory.ts`
- `src/lib/judgments/testing/fixture-methods.ts`
- `src/lib/judgments/testing/macro-fixture.ts`
- `src/lib/judgments/types.ts`
- `src/lib/macro/display-catalog.test.ts`
- `src/lib/macro/display-registry.hash.test.ts`
- `src/lib/macro/snapshots.ts`
- `src/lib/macro/strategy/deviations.test.ts`
- `src/lib/macro/strategy/deviations.ts`
- `src/lib/macro/strategy/f4-client.test.ts`
- `src/lib/macro/strategy/f4-client.ts`
- `src/lib/macro/strategy/playbooks.test.ts`
- `src/lib/macro/strategy/playbooks.ts`
