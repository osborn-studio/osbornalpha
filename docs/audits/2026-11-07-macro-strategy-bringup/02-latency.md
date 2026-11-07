# Macro strategy fact routes — latency (2026-11-07)

Follow-up to `01-bringup-record.md` §8.5 (PR #119): the uncached fact routes missed the runbook §2 step 7 targets (p95 < 500 ms first call, < 100 ms repeat) and `cycle-table` took 10–28 s. This record holds the profile, the change and the replayable before/after numbers. Branch `claude/macro-strategy-latency`.

## 1. Where the time went

Measured read-only against the production database through PostgREST with the anon key (`scripts/macro/strategy-latency.ts`, builders only, no `putManifest`), from the owner's Mac. Every request from the Mac carries ~290 ms of transit; the counts and bytes are what matter, the wall times are relative.

| route (before, main `78e9c4d7`) | PostgREST requests | bytes | max in flight | wall (Mac) |
|---|---|---|---|---|
| transmission US / CN | 5 | 190 KB | 1 | 2.1 s |
| policy-response window=3 | 25 | 9.5 MB | 1 | 11.7 s |
| cycle-table event_day | 49 | 21 MB | 1 | 23.5 s |

Findings:
- Vercel functions (`hnd1`) and the Supabase project (`ap-northeast-1`) are co-located; the per-request cost in production is PostgREST serialising a 1000-row `select *` page (~560 KB each) plus the round trip, roughly 150–300 ms. Nothing is slow in SQL: `macro_observations_latest_idx (series_id, period_end desc, version desc) where status='ok'` serves every history read.
- `MacroDb.seriesHistory` paged 1000 rows per request with OFFSET, strictly sequentially, and every builder read its series one after another: the three policy-event sources (`US_FED_TARGET_D` 3272 rows, `_UPPER_D`/`_LOWER_D` 6535 rows each) cost 17 requests alone; cycle-table adds five daily column histories (6715 / 6352 / 5222 / 2711 / 203 rows) and four monthly ones.
- `transmission` called `latestObservations` once per node series missing from the snapshot, sequentially, after two sequential `observationsByIds`.
- The cycle-table manifest freezes 22 451 inputs (1.1 MB body): `macro_put_manifest` uploads it and `putManifest` reads it back. That part is unchanged here.
- Production rows: 51 039 observations over 29 series; one manifest per kind existed before this change.

## 2. Change (no computed number or manifest hash changes)

- Reads: `seriesHistory` issues page 0 and an exact count concurrently, then the remaining pages in parallel (at most 8 in flight per call; count unavailable → the old sequential sequence); `observationsByIds` fetches its id chunks in parallel; the two snapshots, the three event histories and all column / dimension histories of a builder load concurrently; `transmission` resolves its node series with one batched `latestObservations`. `manifest.ts build()` sorts catalog, reads and inputs, so the order of reads never reaches the hash; `replay.test.ts` rebuilds every committed manifest under randomised read completion order and requires the committed `manifest_hash` (fixtures were not re-recorded).
- Memo: `src/lib/macro/strategy/memo.ts`, a per-process LRU of 32 entries with single-flight builds, keyed by `(kind, params, US and CN active snapshot id/revision/created_at, macro_publish_state revision + input_revision per region, catalog_version, code_version)`. Snapshot rows are immutable (republish inserts a new row and bumps the publish revision; every observation write bumps `input_revision`), so the key is a complete identity of a fact manifest's inputs. A hit costs one round trip (the four state reads in parallel) after the session gate. With no snapshot in either region the cutoff is the request time, so the memo is bypassed. Response header `X-Macro-Strategy-Memo: hit | miss | coalesced`; bodies and `Cache-Control: private, max-age=300` unchanged.
- Audits: MiniMax M3 round 1 raised 68 findings; the accepted ones (coalesced vs hit, `clear()` during an in-flight build, first-row-wins in the batched lookup, fallback double page fetch, page fan-out cap, storing the manifest id in the memo entry, typed memo values, no-snapshot bypass, count validation, extra tests, runbook wording) were fixed in round 2; the stale-cache findings were dismissed by the data model above. Round 2 (10 findings) re-raised the dismissed points and found one real nit (the count-unusable fallback issued one empty page request after a short first page), fixed in round 3. Audit transcripts: the session's scratchpad `mmx-findings-{1,2}.md` (not committed).

## 3. After

Same script, same database state, same Mac (section 4 has the replay commands).

Builders only (`--repeat`, second call of each pair):

| route (after) | PostgREST requests | bytes | max in flight | wall (Mac) | before → after |
|---|---|---|---|---|---|
| transmission US / CN | 5 | 190 KB | 2 | 1.1 s | 2.1 s → 1.1 s |
| policy-response window=3 | 33 | 9.5 MB | 16 | 1.8 s | 11.7 s → 1.8 s |
| cycle-table event_day | 62 | 21 MB | 34 | 2.7 s | 23.5 s → 2.7 s |

The request count rises by one exact-count request per history (13 for cycle-table, 8 for policy-response) and falls by one `latestObservations` per batched node; bytes are unchanged because the same rows are read.

Route-level memo flow (`--memo`: state read + single-flight around the build, two calls per route):

| route | first call | second call |
|---|---|---|
| transmission US | miss, 7 requests, 1.7 s | hit, 4 requests, 15 KB, 0.35 s |
| transmission CN | miss, 7 requests, 1.1 s | hit, 4 requests, 15 KB, 0.54 s |
| policy-response window=3 | miss, 35 requests, 1.9 s | hit, 4 requests, 15 KB, 0.30 s |
| cycle-table event_day | miss, 64 requests, 2.8 s | hit, 4 requests, 15 KB, 0.31 s |

A hit is the four parallel state reads (two active snapshots, two publish-state rows): one round trip, ~300 ms from the Mac and the in-region round trip (tens of milliseconds) on Vercel. The anon key cannot read `macro_publish_state`, so the script reports `publishState: unavailable` and keys on the snapshots alone; the routes read it with the service role.

Manifest hashes before and after (first 16 hex): transmission US `fa074c8e3fbc5d56`, transmission CN `33f17386ff8ff071`, policy-response window=3 `d66f51a2f8001fcf`, cycle-table event_day `09e341c0af6f0915` — identical.

What this does and does not prove:
- The uncached path is bounded by bytes now, not by round trips: cycle-table still moves 21 MB of `select *` rows and puts / reads back a 1.1 MB manifest, so a cold build on a fresh Vercel instance stays in the seconds. The 500 ms first-call target is not reachable without changing what is read (a projection or a one-call history RPC) and is recorded as missed for cold builds.
- The repeat target is met by the memo on a warm instance: one state round trip plus the session gate. Production numbers for the hit path must be read from the `X-Macro-Strategy-Memo` header and the Network panel after the deploy (section 5).
- Unit proof: `memo.test.ts` (hit/miss per key component, bound, single-flight, clear during flight), `routes.test.ts` (hit avoids the builder and `putManifest`, miss after an `input_revision` change, coalesced concurrent calls, no-snapshot bypass), `manifest.test.ts` (batched vs single lookups: same reads, inputs and hash, truncated fallback), `db.test.ts` (count + pages, fan-out cap, fallback sequence, filter chain), `replay.test.ts` (committed hashes under random read order).

## 4. Replay

```bash
node --env-file=<file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY> --import tsx scripts/macro/strategy-latency.ts --repeat
```

`--memo` runs the route-level memo flow (state read + single-flight) twice per route and prints the outcome; `VERBOSE=1` prints every PostgREST request. The "before" rows were produced by the same counting-fetch method (an identical throwaway script without the memo imports) on main `78e9c4d7` before the change.

## 5. Production follow-up (commander)

After the deploy: call each fact route twice with `cache: 'no-store'` and record the header and timing; expected `miss` then `hit`. If first calls on cold instances matter, the next step is a read-side change: a jsonb RPC returning projected history rows for several series in one call (migration), or a persisted memo (`key → manifest_id`) so a fresh instance only reads the stored manifest.
