# Macro manifest persistence and cold path — production verification

Status: **verified; one target missed** (2026-11-17 12:50 UTC). Cycle-table manifests persist, the history RPC no
longer times out, all eight standard fact views are stored, and macro-sync ran. Signed-in cold samples meet the
cycle-table and policy-response targets; transmission is over its 1 s target (US 1,469 ms, CN 1,009 ms). Still open:
the 24-hour log window. See "Signed-in cold samples after #242 and #243" and "Final state" at the end.

## What was rolled out

| step | time (UTC, 2026-11-17) | result |
| --- | --- | --- |
| Rehearsal: `20261126090000`, `20261126100000`, `20261127090000` in one transaction, then `rollback` | 03:16 | succeeded; production re-read afterwards and unchanged (no new functions, no `body_gz` column, old `native_frequency` CHECK) |
| Apply `20261126090000_macro_manifest_blob.sql` + history row, one transaction | 03:17:35 | ok, 1 history row |
| Apply `20261126100000_macro_strategy_histories.sql` + history row, one transaction | 03:17:39 | ok, 1 history row |
| Apply `20261127090000_macro_display_frequency.sql` (#233) + history row, one transaction | 03:17:42 | ok, 1 history row |
| Deploy exact `origin/main` 606be1f260b57b95514f4791481e29dc1a63b7e3 from a clean detached worktree, `--env VERCEL_GIT_COMMIT_SHA` set | 03:20–03:23 | READY, aliased to `osbornalpha.com` (deployment `stock-monitor-2ru8aq5pf`) |

File hashes applied (sha256 prefix): `08bab5a5146ee852`, `7b1e9e56424ef4f7`, `cc173775d02506aa`, taken from `origin/main`.
`supabase_migrations.schema_migrations` now lists, from 20261120 on: 20261120093000, 20261121090000, 20261123110000,
20261124110000, 20261126090000, 20261126100000, 20261127090000, 20261129090000.

`20261127090000` was not part of this work: it was merged with #233 and not yet applied, and deploying main without it
would have let macro-sync upsert weekly display rows against the old CHECK. `docs/runbooks/macro-sync.md` lists no extra
rollout step for it (no second catalog upsert, no backfill).

## Schema and grants after apply (read-only query)

- `macro_put_manifest_gz(jsonb)` and `macro_strategy_histories(text[],timestamptz,date,date)` exist.
- `macro_put_manifest_gz`: anon no, authenticated no, service_role yes. History RPC: anon yes.
- `macro_strategy_manifests`: `body`, `body_gz`, `body_bytes` all nullable; 37 rows, all 37 still jsonb rows and
  valid under the new constraints.
- `macro_series` CHECK: `native_frequency in ('daily','weekly','monthly','quarterly','event')`.

## Replay proof on production data (read-only, anon key)

`scripts/macro/strategy-latency.ts --compare`, run from a Mac at 03:19 UTC against production. Each manifest is built
twice, through the legacy paged reader and through the new RPC reader; the full manifest hash must be equal. From the
Mac every request also pays about 290 ms of transit and the download crosses the public internet, so compare requests
and bytes first.

| route | legacy: requests / kB / ms | RPC: requests / kB / ms | inputs | hash equal |
| --- | --- | --- | ---: | --- |
| transmission US | 3 / 176 / 1,249 | 3 / 176 / 1,057 | 15 | true (`536b38ac…`) |
| transmission CN | 3 / 176 / 1,076 | 3 / 176 / 1,027 | 15 | true (`30db36d2…`) |
| policy-response window 1 | 29 / 12,959 / 8,327 | 1 / 4,302 / 2,560 | 1,467 | true (`10224f8a…`) |
| policy-response window 3 | 29 / 12,959 / 6,736 | 1 / 4,302 / 2,022 | 1,467 | true (`ce754b8d…`) |
| policy-response window 6 | 29 / 12,959 / 6,715 | 1 / 4,302 / 2,117 | 1,467 | true (`45a72aae…`) |
| cycle-table event_day | 53 / 24,534 / 13,200 | 1 / 8,164 / 4,440 | 22,695 | true (`e5421334…`) |
| cycle-table first_trading_day | 53 / 24,534 / 13,167 | 1 / 8,164 / 3,765 | 22,695 | true (`240bba52…`) |
| cycle-table month_end | 53 / 24,534 / 12,382 | 1 / 8,164 / 3,962 | 22,695 | true (`59d9c236…`) |

The transmission and policy-response window 3 hashes and the cycle-table event_day hash also equal the hashes the same
profiler printed on 2026-11-16 before any change (`536b38ac…`, `30db36d2…`, `ce754b8d…`, `e5421334…`): the new reader
changes no input.

This run also confirms the PostgREST schema reload: the RPC answered through the public API two minutes after apply.

## Smoke checks after deploy

- `GET /api/quote/batch?tickers=600519.SH,AAPL`: 200 with quotes.
- `GET /api/macro/strategy/cycle-table` without a session: 401 (gate intact).

## Signed-in requests after the deploy

Source: commander session, in the owner's logged-in Chrome on `www.osbornalpha.com/macro/history`, 2026-11-17 about
03:27 UTC, deployment of 606be1f2, every request `cache: no-store`, `x-vercel-cache: MISS`. Not measured by this session.

| request | status | time | notes |
| --- | ---: | ---: | --- |
| `cycle-table?boundary=event_day`, first call | 200 | 4,432 ms | 37,448 bytes, 32 episodes, manifest `d31b40e8-7580-4f0a-aaf2-e4eaf39b9e2c` |
| same, second call | 200 | 618 ms | same manifest id |
| `manifests/d31b40e8-…` | 200 | 3,293 ms | 6,461,964 bytes: the stored manifest is readable |
| `transmission?region=US` | 200 | 2,329 ms | above the 1 s cold target; addressed by #242 |

The history page renders. Before the fix the same uncached cycle-table call took 10–28 s and persistence timed out.

## Database and log confirmation (this session, read-only)

Manifest rows created since the deploy:

| manifest | kind | created (UTC) | code version | encoding |
| --- | --- | --- | --- | --- |
| `d31b40e8-7580-4f0a-aaf2-e4eaf39b9e2c` | cycle_table | 03:27:00 | 606be1f2… | gzip: `body` null, `body_gz` 707,654 bytes, `body_bytes` 6,462,365 |
| `e0336a46-e852-451b-b322-d32c3b9c73dd` | transmission | 03:27:02 | 606be1f2… | jsonb (below the 1 MB threshold) |

This is the first cycle-table manifest stored in production since 2026-11-08.

Gateway log for the manifest and history RPCs since 03:15 UTC:

| time | endpoint | status | request bytes | upstream ms |
| --- | --- | ---: | ---: | ---: |
| 03:26:59 | `macro_put_manifest_gz` | 200 | 943,875 | **365** |
| 03:27:02 | `macro_put_manifest_json` (transmission) | 200 | 33,437 | 40 |
| 03:26:56 | `macro_strategy_histories` | 200 | 277 | 1,625 |
| 03:26:51 | `macro_strategy_histories` | **500** | 277 | 3,267 |
| 03:18–03:19 | `macro_strategy_histories` ×6 (profiler run above) | 200 | 205–277 | 635–2,280 |

The large manifest write went from 6,049–19,746 ms upstream (5 of 13 failed) to 365 ms for the one write so far. One
sample is not a distribution; more writes accumulate as snapshots and deploys change the identity.

### Defect found: the history RPC has too little margin under the anon timeout

The Postgres log has one 57014 since the deploy, at 03:26:54, matching the HTTP 500 above: a `macro_strategy_histories`
call was cancelled by the `anon` role's 3 s statement timeout. The request that hit it failed; a request five seconds
later succeeded in 1,625 ms. The cycle-table call normally spends 1.6–2.3 s upstream, which leaves no room on this
instance.

Cause, measured read-only on production: the function runs with invoker rights, so the table's RLS policy calls
`macro_batch_eligible(batch_id)` once per row, twice per series (count and rows), about 45,000 calls. The same query with
the eligibility test written as a set-based `exists` on `ingest_batches` runs in 321–348 ms (one outlier at 2,126 ms).

Fixed by #243, applied 05:51:15 UTC; see "Rollout of #242 and #243" below.

## Rollout of #242 and #243

| step | time (UTC, 2026-11-17) | result |
| --- | --- | --- |
| Rehearsal of `20261126110000_macro_strategy_views.sql` in a rolled-back transaction | 03:44 | succeeded, production unchanged afterwards |
| Apply `20261126110000` + history row, one transaction | 03:45:31 | ok; table is service-role only, RLS on |
| Deploy exact `origin/main` 851f5121 (#242, also ships #241), `--env VERCEL_GIT_COMMIT_SHA` set | 03:46–03:48 | READY, aliased to `osbornalpha.com` (deployment `stock-monitor-meya5mzw6`) |
| #243 merged (308c22e0) | 04:11 | |
| Rehearsal of `20261126120000_macro_strategy_histories_definer.sql` in a rolled-back transaction, as `anon` | 05:50 | same output before and after (md5 `d06f64e5…`, 10,218,256 bytes); 1,668 ms before, 302 and 289 ms after |
| Apply `20261126120000` + history row, one transaction | 05:51:15 | ok; `prosecdef` true, `search_path=pg_catalog, public`, execute for anon and authenticated |

`20261126120000` only replaces a database function, so no application deploy was needed for it. Production still runs
851f5121; main has since moved to c2627bc2 (#244–#247, other sessions' work, not deployed by this session).
File hashes applied (sha256 prefix): `c3bbd046fb2d7c3c`, `a8167a222f6b5d01`, taken from `origin/main`.

Smoke after the deploy: quotes 200; `cycle-table` and `/api/cron/macro-strategy-warm` return 401 without credentials.

## Warm cron and the history RPC, before and after #243

The warm cron runs every 10 minutes and builds whichever of the eight standard views is missing for the current
identity. Gateway and Postgres logs, 03:44–06:03 UTC:

| window | `macro_strategy_histories` calls | HTTP 500 | 57014 lines in the Postgres log | upstream ms |
| --- | ---: | ---: | ---: | --- |
| 03:50–05:50:17, invoker-rights function | 41 | **29** | 32 | 1,835–10,488 for the successes |
| 05:51:15–06:03, definer function | 25 | **0** | **0** | mean 611, max 1,190 |

Before the fix every cycle-table build attempt from the cron failed until 05:50, and one policy-response read failed
at 05:30 while macro-sync was writing. Two of the 32 timeout lines (04:22, 04:23) have no matching history call and
belong to other statements; they were not investigated here. The two cycle-table views stored at 05:50:14 got through
on the old function by chance (one of that run's calls took 3,096 ms, the other was cancelled).

The 25 calls after the fix are 24 forced uncached reads plus the 06:00 cron run. Forced reads: four runs of
`scripts/macro/strategy-latency.ts --compare` from a Mac with the anon key, 05:55–06:00 UTC, each run reading the
cycle-table inputs three times and the policy-response inputs three times through the RPC. This forces the read that
was failing; it does not force the manifest write, which needs a signed-in request or the cron.

Replay proof on the new function and the revision-12 snapshots: all 32 comparisons (8 routes × 4 runs) print
`equal: true` between the legacy paged reader and the RPC reader. First run:

| route | legacy: requests / kB / ms | RPC: requests / kB / ms | inputs | hash equal |
| --- | --- | --- | ---: | --- |
| policy-response window 3 | 29 / 12,960 / 6,550 | 1 / 4,302 / 1,649 | 1,467 | true (`5df89630…`) |
| cycle-table event_day | 53 / 24,539 / 11,851 | 1 / 8,166 / 2,709 | 22,702 | true (`76427b5f…`) |
| cycle-table first_trading_day | 53 / 24,539 / 12,138 | 1 / 8,166 / 2,732 | 22,702 | true (`bdda1b1a…`) |
| cycle-table month_end | 53 / 24,539 / 11,188 | 1 / 8,166 / 2,665 | 22,702 | true (`f6b6ccb5…`) |

The hashes differ from the 03:19 table because macro-sync published revision 12 in between.

## Stored fact views and manifests (read-only query, 06:02 UTC)

All eight standard views exist for the current identity (snapshots US and CN revision 12, code 851f5121):

| kind | views | stored (UTC) | view bytes |
| --- | ---: | --- | --- |
| transmission (US, CN) | 2 | 05:40:08 | 21,041–21,246 |
| policy_response (windows 1, 3, 6) | 3 | 05:40:14–05:40:20 | 379,706–381,840 |
| cycle_table (three boundaries) | 3 | 05:50:14, 05:50:14, 06:00:10 | 34,908–37,680 |

Cycle-table manifests written by the cron: `c7bb9281…`, `8ebf748c…` (05:50:13) and `71d5f80c…` (06:00), all gzip
rows of about 6.46 MB canonical JSON. The four `macro_put_manifest_gz` calls seen so far took 365, 576, 545 and
314 ms upstream. Before the fix the same write took 6,049–19,746 ms and 5 of 13 failed.

## macro-sync and the Fed liquidity series (read-only query, 05:50 UTC)

- `macro.akshare` batch 05:00:45–05:00:57 `success`; `macro.fred` batch 05:30:02–05:31:33 `success`. The FRED run took
  91 s against 23–25 s on the three days before, consistent with the first load of the new series.
- Snapshots: CN revision 12 active from 05:00:58, US revision 12 active from 05:31:34.
- All six Fed liquidity series are active and have observations, ingested 05:31:03–05:31:33:

| series | observations | last period |
| --- | ---: | --- |
| `US_WALCL_W` | 1,248 | 2026-11-11 |
| `US_WALCL` | 287 | 2026-10-31 |
| `US_WTREGEN_W` | 1,248 | 2026-11-11 |
| `US_WTREGEN` | 287 | 2026-10-31 |
| `US_RRPONTSYD_D` | 3,368 | 2026-11-16 |
| `US_RRPONTSYD` | 183 | 2026-10-31 |

## Signed-in cold samples after #242 and #243

Source: commander session, in the owner's logged-in Chrome on `www.osbornalpha.com/macro/history`, 2026-11-17, live
sha 851f5121, `fetch` with `cache: no-store`, sequential in the order listed, no deploy in between. Not measured by this
session. Single samples; the page load preceded the calls, so the function instance was warm but the process memo
was empty for each key (`miss`).

| call | status | total ms | `X-Macro-Strategy-View` | `X-Macro-Strategy-Memo` | bytes | target |
| --- | ---: | ---: | --- | --- | ---: | --- |
| `cycle-table?boundary=event_day`, first | 200 | 661 | stored | miss | 37,448 | under 5 s: met |
| same, second | 200 | 912 | stored | hit | 37,448 | |
| `cycle-table?boundary=month_end` | 200 | 719 | stored | miss | 37,334 | under 5 s: met |
| `transmission?region=US` | 200 | **1,469** | stored | miss | 19,179 | under 1 s: **not met** |
| `transmission?region=CN` | 200 | **1,009** | stored | miss | 19,424 | under 1 s: **not met** |
| `policy-response?window=3` | 200 | 863 | stored | miss | 378,681 | under 1 s: met |

Before the fixes the same uncached cycle-table call took 10–28 s and failed to persist; after #240 alone it took
4,432 ms.

### Why transmission is over 1 s on a stored view (read-only diagnosis, no change made)

The stored view is not the slow part. Every stored read, whatever the route, costs about 660–910 ms here: the
cycle-table and policy-response rows above run the same steps (session check, four parallel snapshot and publish-state
reads, one view row read) and land in that range, and the second cycle-table call, a process-memo hit that reads no
view row at all, still took 912 ms.

Transmission is the only one of the three routes that then does more work. After the view is read,
`transmission/route.ts` runs the judgment section, and `f4-client.ts` makes two HTTP requests, one after the other,
to this application's own public URL (`NEXT_PUBLIC_SITE_URL`): `GET /api/judgments?subject_type=macro_region&…`,
then `GET /api/judgments/<id>`. They are never cached (`cache: 'no-store'`; the runbook states that transmission
recomputes judgments on every request), and each one is a separate function invocation with its own database reads.

Measured from a Mac without a session, five pairs per region, 12:47 UTC: the list call took 503–1,073 ms and the detail
call 500–901 ms (US), 504–733 ms and 500–789 ms (CN). Those totals include about 320 ms of connection and TLS setup
and the Mac's transit, so they bound the cost rather than equal what the function pays from inside the region.

Subtracting the 660–860 ms that the other stored reads took leaves roughly 600–800 ms for the judgment section in
the US sample and 150–350 ms in the CN sample. This attribution is inferred from the route code and the comparison
between routes; the time inside the transmission request was not measured per step, and each row is one sample.

Consequence: with about 0.7–0.9 s spent before the judgment section starts, the 1 s target cannot be met by the
stored view alone. Options, none implemented: start the judgment list call in parallel with the fact view (only the
final mark selection needs the view's snapshot id); read the judgment card and detail in-process instead of through
two HTTP round trips; or reduce the fixed cost shared by every route (the session check and the state reads).

## Final state

Done and evidenced above:

1. A fresh cycle-table request persists its manifest (signed-in request at 03:27; cron writes at 05:50 and 06:00).
2. No 57014 from the manifest write since the #240 deploy, and none from the history RPC since #243 was applied.
3. Replay: legacy and RPC readers give identical manifest hashes for every route, on two snapshot revisions.
4. macro-sync succeeded and the Fed liquidity series have observations.
5. Applied migrations are locked in `supabase/migrations.lock.json` through `20261126120000`. The check requires the
   lock to be contiguous, so this also locks three applied migrations from other work (`20261121090000`,
   `20261123110000`, `20261124110000`) at their `origin/main` bytes; production's history table lists them as applied,
   but their applied bytes were not compared.

Not done:

1. **Transmission cold target.** Measured at 1,469 ms (US) and 1,009 ms (CN) against 1 s; cause and options in the
   section above. Cycle-table and policy-response meet their targets on single samples.
2. **24 hours of natural traffic.** The log evidence covers 03:15–06:03 UTC only.
3. **A true miss still builds.** In the first minutes after a snapshot or deploy changes the identity, before the
   cron has run, a request builds on demand: about 2.7 s of history read for cycle-table from a Mac, more with the
   manifest write.
4. **Mid-size manifest writes are slow under load.** Policy-response manifests (512 kB, below the 1 MB gzip threshold)
   go through the jsonb path. When two were written at once by the cron they took 6.1–6.3 s (03:50), 4.9–5.4 s
   (05:10), 2.6–4.2 s (05:30) and 2.0–2.4 s (05:40) upstream against the 8 s limit. None failed. Lowering
   `MANIFEST_GZ_THRESHOLD_BYTES` would move them to the blob path; not changed here.
