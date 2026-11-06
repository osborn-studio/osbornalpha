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
