# Macro manifest persistence and cold path — production verification

Status: **in progress** (2026-11-17 03:40 UTC). Rollout of #240 is done and cycle-table manifests persist again; a
timeout defect in the new history RPC, the macro-sync run and the #242 (stored fact views) rollout are still open. See "Open items" at the end.

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

Fix in progress: replace the function with a definer-rights version that applies the anon policy's predicate
(`status = 'ok'` and the batch is `success` or `partial`) explicitly. Until it is deployed, a cold cycle-table or
policy-response build can fail with HTTP 500 when the database is busy; a retry succeeds.

## Open items

1. **History RPC margin** (defect above): fix, apply, deploy, then re-check the log for 57014.
   The forced series of 20 cold requests has not been run; only one cold cycle-table write has been observed.
2. **macro-sync.** The daily cron runs at 05:30 UTC. Before it, `US_WALCL*`, `US_RRPONTSYD*` and `US_WTREGEN*` have no
   observations. To confirm after the run: the run succeeds and the three Fed liquidity series have observations.
3. **#242** (stored fact views, migration `20261126110000`, warm cron): not merged, not applied, not deployed. The
   cold-instance targets (cycle-table under 5 s, transmission and policy-response under 1 s) are measured after it.
4. Lock the applied migrations in `supabase/migrations.lock.json` (repo convention: after production apply).
