# Integration notes — plan 2026-11-06-industry-research

Output: `docs/superpowers/plans/2026-11-06-industry-research.md` (skeleton + Tasks 1–20, ~17.2k lines).
Part files were edited in place; pre-integration copies are in `orig/`. The plan is assembled as
skeleton (everything above the TASKS marker) + `### Task N` sections of part-A…D. Uncommitted.

## Verification done (scratch harness = repo copy + every plan code block extracted)

- Every `src/…`/`scripts/…` code block with a path header (108 files) + the plan's manual Modify steps
  (freshness weekly, scope.ts INDUSTRY block, Task 4 additions, Task 5 fixture `cp`) applied to a copy of the repo.
- `tsc --noEmit`: 0 errors in industry code (only pre-existing harness noise: missing docs/data JSON).
- `eslint --max-warnings=0` on all industry dirs/routes/scripts: clean.
- vitest (memory): 69 files / 557 tests pass (all industry unit tests + existing src/app/api + scope.test).
- test:db via `db-one.ts` on PostgreSQL 17: industry.integration 7 + functions.integration 33 + sync.integration 6 = 46 pass.
- `types.ts` awk extraction from the skeleton still yields 172 lines.
- Not run: page `.tsx` (only typechecked where headers allowed extraction), E2E, full `npm test`/`test:db` of the whole repo.

## Cross-part changes (task — what — why)

1. Skeleton contract — `ManifestRole.duration` added (Part C request): 12M and 3M cells share (metric, period_end).
   Same line → awk copy in Task 3 still 172 lines. Part D fixtures/role literals updated; `filterManifest` filters roles by duration too.
2. Task 2 SQL / Task 3 memory — activation completeness now per (metric, duration) table identical to Task 10
   `cellSpecs` (3M every period end for sums/YoY, 12M only Dec 31 incl. gross_margin, TTM roe, INSTANT count).
   New contract case; Task 10 `expectedCells` returns duration and pins the same table. Counts updated (db.test 27, functions 33).
3. Task 12 — verified: deps per cell = candidate members (`n_members`), reused cells copy `member_state_revs`; `failRun`
   called on every activation failure. No change needed beyond (5).
4. Task 13 — removed the `mark_revised` pre-read/quarantine (Task 2/3 `apply_observations` already writes it);
   APPLY_CHUNK 500 per A6.
5. Task 12 — added `buildCellManifest(deps,q)` (shared `loadGroup/readIssuerFacts/computeGroup` with the run) + test
   (same hash as stored manifest, nothing written). Needed by Task 15 `/replay?mode=recompute`.
6. Task 11 `ManifestStore.put` — verified it always attempts upload (409 = present) and always registers; unchanged.
7. `memoryIndustryDb(opts?)` — Part A signature kept; B (no-arg) and C (`{tables}`) call sites compatible.
8. `industryCnUniverse` reads source records via service-role TableClient (decision B1 in skeleton); no code change.
9. Task 16 `jobs.ts` rewritten to adapt the real runners (Part D assumed `{dryRun}` signatures, `runFactsScope`,
   `RunnerReceipt` returns): per-runner mapping, `combineReceipts`, facts-scope implemented in jobs.ts,
   memberships-sw = classifications→source→resolve, memberships-sic = classifications→memberships, dry-run
   unsupported for sic/marks/aggregate, `IndustryJobDeps.scopeDb`, `marksFetcher` (Task 5 fetchDailyBasic → Task 13 fetch).
   jobs.test rewritten (14 tests). `supabaseManifestStore(admin, db)` call sites fixed (public-deps, replay-check, admin replay).
10. Task 15 — freshness dataset names fixed to what runners write (`industry.sw2021.memberships`, `industry.sic.memberships`);
    `replayFromManifest` mocks return full `ReplayResult`.
11. Criticals — Task 14 step now replaces the exact `criticalSuites.push(...)` line from Tasks 1/2.
12. Isolation — Tasks 4/14 checked: private versions; level-3 '2021' slot reserved for Task 14 (skeleton A12).
13. Skeleton — new sections 《跨任务接口约定》(A1–A13, B1–B3, C1–C4 + export signatures) and
    《已知规格偏差》(52 items); Task 20 §18.1 table generated from it (all 52 rows). File map, coverage, order tables updated.
14. All references to the dropped part headers ("Interface notes", "Part X") rewritten to skeleton sections / task numbers.

## Spec 7th-draft deltas (coordinator, K1–K3, owner decision H)

- A. Real fixtures: Task 5 Step 1 `cp`s 33 recordings into `src/lib/industry/fixtures/tushare/` and 3 paging pages into
  `paging/`; `fixtureTushareCall(dirs)` merges all recordings per api; no `_synthetic` files remain — non-producible cases are
  labelled in-test edits of real responses. Tests re-based on real data (31/134/346 nodes; 129/58/42/0 members; 10 L + 2 D
  stock_basic; 10 daily_basic rows). Task 13 and Task 14 marks read the real daily_basic via Task 5's adapter.
- B. K3 windows: Task 8 `windowEnd = min(out_date+1, delist_date)`, `valid_to_available_date = valid_to`, `in_date >= delist_date`
  → `membership_after_delist` (delist dates from one `stock_basic(D)` call per resolve run); `n_unresolved` uses
  `out_date >= on` in memberships.ts, memory, supabase, pg (my earlier knownBy refinement reverted); Task 14 seeds with `windowEnd`.
  Source records accept `out_date = in_date`.
- C. `attributes.parent_industry_code`; new `src/lib/industry/sw2021.ts` (`SW2021_CODE_ALIASES`, Task 7) used by source records and
  put into `METHOD_CONFIG.code_aliases` (Task 10 now depends on Task 7); `classification_code_unknown` quarantine; CONFIG_HASH pin updated.
- D. `load-a-share` already fetched L/P/D (verified); paging test uses the recorded limit=50 pages.
- E. `security_marks.free_share` (+ `free_share_text`) in Task 1; `MarkRow/MarkInput.free_share` in the contract; Task 2 SQL and
  Task 3 memory compare free_share as content (`is not distinct from`) and hash it; Task 5/13/16 carry it (×10000, null if ≤0);
  `METHOD_CONFIG.total_share_basis='all_classes_incl_h_b'`. New contract case + marks test for a free_share-only revision.
- F. Goal/coverage/runbook/§18 text: valuation deferred by owner decision H (not "no token"); conventions: token at
  `~/.config/osbornalpha/secrets.env`, scripts via `node --env-file=… --import tsx`, never printed/committed, tests never need it.
  `record-fixture.ts` now writes the same envelope as the recordings (numbers byte-exact) and gains `--stock-basic <L|D|P>`.

## Open / not resolved

- `classification` conflicts compare `attributes` (Part A) — an upstream `is_pub` change is quarantined as
  `classification_name_conflict` (deviation 13); left as is.
- `in_date >= delist_date` (spec says `>`) chosen to avoid empty windows (deviation 50) — owner/Codex should confirm.
- Page components (`*.tsx` without path headers) and E2E were not executed in the harness.

## Round 1 fixes (Codex plan audit `06-codex-plan-round1.md`, on top of e200d7c)

| # | Tasks touched | Change | Tests added/changed |
|---|---|---|---|
| 1 P1 | 10, 15, 17, 20, skeleton | New `src/lib/industry/method-constants.ts` (no imports) holds `METHOD_VERSION`/`DISPLAY_*`; `method.ts` re-exports; `display.ts` imports the constants module, so no client graph reaches `canonical-json.ts`→`node:crypto`. Task 20 gates add `npm run build` + rendered drawer check. | Task 17 `client-bundle.test.ts` (walks every `'use client'` module's static import graph; fails on any `node:`/builtin; self-check that the walker sees `method.ts`→`node:crypto`); Task 10 `method.test` asserts the constants file has no imports. |
| 2 P1 | 18 (+ modifies Task 16 licences route/test), skeleton | New `stale-views.ts` store (per dataset key, 2 h expiry, bounded); `loadView(key,build,{scheme})` serves a stale view only after a successful, positive `isDatasetPublic` re-check, else fails closed and forgets the dataset; licences route calls `forgetViews(key)`. | `page-data.test` +2 (revoke then failed read → null; gate down → null; expiry; per-dataset forget); licences route test asserts `forgetViews`. |
| 3 P1 | 8, skeleton | `reconcileDelistings`: every run fetches `stock_basic(D)`; resolved current records with still-open ok rows get re-applied through `apply_industry_memberships` (its close step), closing rows in place at `windowEnd`; differing closed windows → `membership_delist_conflict`. `records` gains `delistClosed/delistConflicts`. | resolve test: two-run (listed → delisted, identical member payload; same membership ids closed at 2022-06-23; third run no-op). |
| 4 P1 | 1, 2, 3, 4, 11, skeleton contract | GC claim/tombstone: `industry_manifests.gc_claimed_at`; `gc_industry_manifest_candidates` claims (FOR UPDATE SKIP LOCKED, stale claim > 1 h re-claimable); `put_industry_manifest` and staging (new internal `industry_manifests_lock_for_reference`, FOR SHARE) raise `manifest_gc_in_progress` on a claim; delete only claimed rows. `ManifestStore.put` registers first, uploads after. New contract error code `manifest_gc_in_progress`. | Task 2 SQL test rewritten + new interleaving test (claimed → stage/put refused; stage holding FOR SHARE → GC skips); contract case (memory + pg); manifest.test GC race on memoryIndustryDb; supabase store order test. |
| 5 P2 | 2, 3 | Successor = target whose `provenance.source_membership_id` is the old row's record's descendant in `p_source_ids` (recursive `fwd`/`heir` CTE; memory mirrors). | Contract case: two disjoint windows of one issuer corrected in one call (later window first); every superseded row points at its own lineage. |
| 6 P2 | 9, 14 | `claimSicScopeRow` CAS on `(updated_at, lease_batch_id)`; `finishSicScopeRow` fenced by `lease_batch_id` (`lease_lost`); `syncSicScope` inserts only (23505 ignored). | sic.test CAS/fence case; Task 14 two-connection test (two pools, `Promise.all` claims → exactly one wins; loser cannot complete). |
| 7 P2 | 9 | Departed issuers' scope rows retired (`next_due_at = RETIRED_DUE`, CAS, not while leased), re-activated on return; due rows paged and filtered (active + lease free) until `limit` eligible. | sic.test: retire/reactivate/no-overwrite case; 450 inactive overdue rows ahead → 6 active processed, 450 retired. |
| 8 P2 | 15 (comment), 20 | `e2e-fixture.ts` builds one manifest per (code, period_end) through `computeAggregateCell`+`buildAggregateManifest`; cells come from those manifests; `E2E_TAMPERED` (电子 2025) deliberately mismatched. E2E happy path asserts `[data-reproduced="true"]`; new tampered E2E case asserts `"false"` (6 cases). `manifestOf` documented as layout-only (replay mocked). | `e2e-fixture.test.ts`: every ok cell replays true except the tampered one. |

Skeleton: file map (method-constants, stale-views, client-bundle.test, e2e-fixture.test), interface A7/A14/B1b/B1c/C5/C6, contract (`manifest_gc_in_progress`, `ManifestStore.put` order), deviations 53–60 (Task 20 §18 table regenerated: 60 rows), order table (Task 14 ← 9, Task 18 ← 16).

Found by the new `next build` gate (not by Codex): `tushare-industry.ts` and `sec-sic.ts` defined fixture dirs as
`new URL('../fixtures/…/', import.meta.url)`; webpack bundles them into the cron route and cannot resolve a directory URL
→ build failure. Now `join(process.cwd(),'src/lib/industry/fixtures/…')` (tests/scripts run from the repo root).

Verification on a repo copy rebuilt from the plan: tsc 0 industry errors; eslint industry dirs clean; vitest 71 files /
569 tests pass; test:db industry files 49 pass (7 + 35 + 7); `next build` succeeds (all industry routes/pages compiled;
the Task 18/19 INDUSTRY blocks in `/intel` and `/stock/[ticker]` were not applied in the copy; E2E not run).

## Round 2 fixes (`docs/audits/2026-11-06-industry-research/08-codex-plan-round2.md`)

- **R2-1 (P1, manifest GC reclaim).** `industry_manifests` gains `object_path` (check: `sha256/<hash>/<uuid>.json.gz`)
  and `gc_claim uuid`. `put_industry_manifest` assigns a fresh generation path on each new registration (a touch keeps
  it); `gc_industry_manifest_candidates` returns `[{hash, object_path, claim}]` with a new token;
  `delete_industry_manifests(jsonb)` deletes only rows whose `gc_claim` still equals the token. Contract:
  `manifestObjectPath`, `ManifestGcClaim`, `remove({hash,objectPath}[])`, `deleteManifestIndex({hash,claim}[])`.
  `manifest.ts` reads and writes through the index path (`isManifestObjectPath` replaces `manifestPath`); the replay
  test resolves paths through the DB. New tests: SQL "stale collector after a reclaim" (Task 2) and the
  `manifest.test` reclaim → re-upload → stale delete case (the new object survives and `get(hash)` works).
- **R2-2 (P1, late delisting on a closed window).** New SQL `correct_industry_membership_windows(batch, issuer,
  scheme, version, source, rows)`. It takes an issuer lock and requires the record to be current and resolved to the
  issuer. For each level, the old ok row becomes superseded (`superseded_by` points to the new row) and a corrected
  row is inserted with the same `source_membership_id`. Same window counts as a duplicate. Implemented in all three
  `IndustryDb` impls, with a contract test. `reconcileDelistings` now corrects instead of quarantining (records
  `delistCorrected`); it quarantines `membership_delist_conflict` only when the DB rejects. Resolve test: 600090.SH is
  closed 2017-06-29, then a 2016-12-31 delisting is learned. Result: rows superseded and linked, no member at
  2017-03-31, still a member at 2016-06-30, and the next run is idempotent.
- **R2-3 (P2, unfenced SIC writes).** `apply_sic_memberships` gains `p_lease_batch` and `p_sec_submissions`. After
  the issuer lock it runs `SELECT … FOR UPDATE` on the scope row and requires the lease to match and be unexpired,
  else `lease_lost`. `sec_submissions` provenance moves into the same transaction (a null code means provenance only
  and returns `none`). `runMembershipsSic` no longer updates `issuers` directly; on `lease_lost` it neither
  quarantines nor finishes. New error code `lease_lost`. Tests: SQL lease_lost and expired lease; memory contract;
  `sic.test` takeover (the old worker's apply is rejected with no rows or provenance written; the new holder inserts).
- Skeleton contract updated (types.ts is now 178 lines; the Task 3 awk expectation is updated). A7, B1b and B1c are
  amended. Deviations 61–63 were added and section 18 was regenerated (63 rows).
- Verification on the rebuilt repo copy: tsc 0 errors; eslint clean on the industry dirs plus scripts; vitest
  71 files / 573 tests pass (+4); DB tests 51 pass (functions 37, industry 7, sync 7). `next build` was not re-run
  this round (no page or route code changed).

## Round 3 fixes (`docs/audits/2026-11-06-industry-research/10-codex-plan-round3.md`)

- **R3-1 (P1, empty corrected window).** `correct_industry_membership_windows` now handles a corrected
  `valid_to <= valid_from` (delisted on or before the window start). It moves the stored ok row to `quarantined` in the
  same transaction, adds `provenance.quarantine{reason:'membership_after_delist', valid_to, batch_id}`, inserts no
  successor, and returns `quarantined`. The same behaviour is in all three impls; the shared contract adds
  `CorrectWindowsResult` and `correctResult`. `reconcileDelistings` routes every empty window (open or closed) to
  this call, then records `dq_quarantine(membership_after_delist)` and `afterDelist`. Tests: a contract case
  (quarantined:3, no ok rows) and two two-run resolve tests (delist 1997-01-01 before, 1997-06-16 exactly on
  `valid_from`). Each test checks that `membersAt` includes 600090.SH before and excludes it after, and that a third
  run is idempotent.
- **R3-2 (P2, lease expiry after a lock wait).** `apply_sic_memberships` locks the scope row `FOR UPDATE` without
  conditions, then checks owner and `lease_until > clock_timestamp()` before any write. New two-connection test: A
  holds the issuer lock, B calls inside a 1.5 s lease, the lease expires, A commits, and B gets `lease_lost` with no
  membership or provenance written. Checked by mutation: the test fails if the check reverts to `now()`.
- `types.ts` is now 180 lines (Task 3 awk expectation updated). B1b and B1c are amended; deviations 64–65 were added
  and section 18 was regenerated (65 rows).
- Verification on the rebuilt repo copy: tsc 0 errors; eslint clean; vitest 575 pass; DB tests 52 pass
  (functions 38, industry 7, sync 7).
