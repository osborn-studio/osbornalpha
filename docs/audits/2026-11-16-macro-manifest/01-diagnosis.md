# Macro manifest persistence and cold path — diagnosis (2026-11-16)

Read-only. No production write, RPC call, migration, setting change or deploy was made. Production reads used the
Supabase Management API SQL endpoint with `read_only: true` and the Management API logs endpoint. Local runs used a
disposable PostgreSQL 17 cluster. Base: `origin/main` 68701c48.

## Answer

1. **Production does not persist cycle-table manifests today.** The last stored `cycle_table` manifest is from
   2026-11-08 06:18 UTC. The only attempt since then (2026-11-13 03:13 UTC) was cancelled with SQLSTATE 57014 and
   returned HTTP 500.
2. **Root cause: the size of the JSON document, not a lock, index, trigger or per-row loop.** A cycle-table manifest
   is one 6.3–6.5 MB JSON body with 22,451–22,669 inputs. On the project's default compute (no compute add-on,
   `shared_buffers` 287 MB, `work_mem` 2,184 kB) PostgREST plus PostgreSQL need 6–20 s to accept, parse and store it.
   The `authenticator` login role caps each statement at 8 s. Every large write is therefore at or over the limit;
   whether it succeeds is chance.
3. **#170 (raw JSON transport) reduced the time but did not move it under the limit.** 2 of 5 large writes on the new
   endpoint still failed.

## Evidence

### Stored manifests (production, 2026-11-16 13:00 UTC)

| kind | rows | first | last | avg stored bytes | max stored bytes |
| --- | ---: | --- | --- | ---: | ---: |
| cycle_table | 9 | 2026-11-07 09:33 | **2026-11-08 06:18** | 1,187,554 | 1,207,932 |
| policy_response | 9 | 2026-11-07 09:32 | 2026-11-13 03:10 | 94,478 | 114,953 |
| transmission | 17 | 2026-11-07 09:32 | 2026-11-13 03:10 | 19,932 | 19,947 |
| review | 2 | 2026-11-07 09:36 | 2026-11-07 09:36 | 3,281 | 3,292 |

Stored bytes are after pglz TOAST compression. The latest cycle-table body is 6,455,019 bytes as canonical JSON and
6,892,027 bytes as `body::text`. Both active snapshots were republished on 2026-11-16 (revision 11), and many deploys
have shipped since 11-08, so new cycle-table identities exist; none has been stored.

### Every manifest RPC call in the gateway log, 2026-11-08 → 2026-11-16

Source: unified `logs` table, `source = 'edge_logs'`, path `/rest/v1/rpc/macro_put_manifest*`. `total` is the gateway
origin time; `upstream` is the time spent in PostgREST and PostgreSQL (`x-envoy-upstream-service-time`).

| body bytes | calls | HTTP 200 | HTTP 500 | upstream ms (min – max) |
| ---: | ---: | ---: | ---: | --- |
| 33,435 – 33,437 | 9 | 9 | 0 | 14 – 220 |
| 402,398 – 512,217 | 4 | 4 | 0 | 168 – 416 |
| 6,345,793 – 6,459,324 | 13 | 8 | **5** | **6,049 – 19,746** |

Large calls only:

| time (UTC) | endpoint | status | total ms | upstream ms |
| --- | --- | ---: | ---: | ---: |
| 11-08 00:42:48 | macro_put_manifest | 500 | 11,061 | 10,376 |
| 11-08 00:43:07 | macro_put_manifest | 500 | 20,267 | 19,480 |
| 11-08 00:43:35 | macro_put_manifest | 200 | 13,450 | 12,940 |
| 11-08 00:45:30 | macro_put_manifest | 200 | 13,300 | 11,861 |
| 11-08 00:54:13 | macro_put_manifest | 200 | 13,225 | 11,684 |
| 11-08 04:11:18 | macro_put_manifest | 500 | 12,782 | 11,294 |
| 11-08 04:32:57 | macro_put_manifest | 200 | 9,410 | 8,708 |
| 11-08 04:58 | macro_put_manifest_json | (57014 in the Postgres log; no matching edge row in the day's result) | | |
| 11-08 05:06:22 | macro_put_manifest_json | 200 | 7,747 | 6,907 |
| 11-08 06:03:01 | macro_put_manifest_json | 200 | 8,006 | 6,049 |
| 11-08 06:18:07 | macro_put_manifest_json | 200 | 20,618 | 19,746 |
| 11-13 03:13:07 | macro_put_manifest_json | **500** | 19,646 | 18,871 |

What this shows:

- Time is spent upstream of the gateway (PostgREST + PostgreSQL), not in the upload: total − upstream is 0.5–2 s.
- Time grows faster than size: 13–16× the bytes of a policy-response body costs 35–110× the time. That is the
  signature of memory pressure on a small instance, not of linear CPU work.
- Successful large calls already take 6–20 s. With an 8 s statement cap there is no margin.
- The Postgres log has a 57014 line (`canceling statement due to statement timeout`, user `authenticator`) for each
  HTTP 500: 11-08 00:42:58, 00:43:25, 04:11:29 (old transport), 04:58:26 and 11-13 03:13:21 (JSON transport).
- No manifest RPC call of any size appears on 11-09 → 11-12 or 11-14 → 11-16. Traffic to the history page is very
  low; the single attempt in the last eight days failed.

### Where the time goes inside PostgreSQL

`pg_stat_statements` (cumulative since 2026-06-20; cancelled executions are not counted):

| statement | calls | mean ms | max ms | temp blocks written |
| --- | ---: | ---: | ---: | ---: |
| old transport (`json_to_record` → `macro_put_manifest`) | 59 | 1,303.6 | 7,543.3 | 12,474 |
| JSON transport (`macro_put_manifest_json($1::jsonb)`) | 10 | 710.3 | 3,407.1 | 0 |

Read-only profile on production of the latest stored cycle-table body (three runs):

| operation | execution ms |
| --- | --- |
| detoast + decompress + serialise (`body::text`) | 689 |
| the same plus re-parse to jsonb (`(body::text)::jsonb`) | 2,485 / 2,552 / 3,649 |
| decode + sha256 of the same body as a 739 KB gzip blob sent as base64 | about 7 (planning-time constant folding; execution < 1) |

So parsing 6.9 MB of JSON text into jsonb alone costs 1.8–3 s on this instance. The write then compresses it with
pglz and, on a replay, detoasts the stored body and compares it in full. Completed statements top out at 3.4 s (JSON
transport) and 7.5 s (old transport), while the same requests spend 6–20 s upstream: PostgREST's own handling of the
body before and around the statement is the larger share. A cancelled call means the statement alone passed 8 s; the
spread between 0.3 s and more than 8 s for an identical payload again points to memory pressure.

Ruled out:

- Triggers: none on `macro_strategy_manifests`.
- Indexes: two btrees (`manifest_id`, `manifest_hash`); the table has 37 rows, heap 16 kB, TOAST 12.4 MB.
- Per-row plpgsql work: the function is one `insert … on conflict do nothing` plus one equality check.
- Locks: the earlier wave169 sample showed an active statement at 7.79 s with no wait event; the pattern here (all
  large calls slow, including successes) does not fit lock contention.
- Role settings: `authenticator` has `statement_timeout=8s, lock_timeout=8s`; `service_role` has no override;
  `anon` 3 s; `authenticated` 8 s. Server default 120 s applies only to other sessions.

### Local reproduction (PostgreSQL 17.x, the real production body, 22,669 inputs)

| operation | local ms |
| --- | ---: |
| `macro_put_manifest_json` first insert | 57 – 65 |
| replay with full-body conflict check | 42 |
| parse + serialise only | 47 |
| prototype: insert the gzip blob from base64 (986 kB text → 739,497-byte bytea, `storage external`) | 6 |

The canonical-JSON SHA-256 computed locally equals the stored `manifest_hash`. On this machine the statement needs
about 60 ms, so an 8 s timeout cannot be reached; a forced `statement_timeout=30ms` cancels the same statement with
57014. The production parse is 50–70× slower than local (2.5 s against 47 ms). The timeout is a property of the
payload on production compute, and it is reproduced there by the log table above, not by local hardware.

Compression of the same canonical body: gzip level 6 → 739,497 bytes in 87 ms (8.7× smaller); level 9 → 708,679 bytes
in 317 ms; gunzip + `JSON.parse` 20 ms.

## What users see

`GET /api/macro/strategy/cycle-table` runs build → persist → evaluate inside the shared fact cache. When persistence
fails the route logs `[macro-cycle-table] {stage:'persist_manifest'}` and returns HTTP 500
`{"error":{"code":"strategy_failed"}}` after roughly 20–30 s. Nothing is cached on failure, so the next request
repeats the full cold build (49 PostgREST pages, about 21 MB) and the same write. The history page's cycle table
therefore shows its error state whenever the 300-second fact cache is empty, which at current traffic is always.
Transmission and policy response are unaffected by the timeout (bodies ≤ 512 kB, ≤ 416 ms upstream).

A secondary failure was also logged: on 11-08 04:32 five parallel `macro_observations` page reads were cancelled with
57014 during one cold build. The cold read path can fail on its own under load.

## Fix chosen from the evidence

1. **Persistence: store large manifests as a compressed blob with the unchanged hash.** The client already builds the
   canonical JSON and its SHA-256. For bodies over a size threshold it sends gzip(canonical JSON) as base64
   (about 1 MB of text carrying one string, instead of 6.5 MB of structured JSON) to a new RPC, which stores the bytes
   in a `bytea` column without parsing or pglz. `manifest_hash` stays `sha256(canonical JSON)`: no hash, computed
   number or replay result changes. Readers gunzip and verify the hash against the bytes they read. A hash conflict
   compares the stored blob with the incoming one; if the bytes differ the client reads the stored blob back and
   compares canonical text before deciding between idempotent replay and `payload_conflict`. Small manifests keep the
   jsonb path. Needs one migration.
   Rejected: raising the timeout (leaves a 6–20 s write in the request and the memory pressure in place); chunked or
   staged jsonb writes (the same bytes still cross PostgREST and are still parsed); a set-based rewrite (the function
   has no per-row work to remove).
2. **Cold path: a persisted, identity-keyed view materialization** written when a view is first built and when a
   snapshot publishes, keyed by the existing memo identity (kind, params, both snapshot ids/revisions/created_at,
   publish revision and input revision per region, catalog version, code version). A request then reads one row.
   A true miss still has to build, so the build's read side also moves from 49 `select *` pages to one projected
   history RPC. A replay test must prove the materialized view is byte-identical to the on-demand build.

## Limits of this diagnosis

- Host CPU, memory and swap metrics for the database instance were not read; "memory pressure" is inferred from the
  non-linear timings, not observed directly.
- The split between PostgREST and PostgreSQL inside `upstream` is bounded (statement ≤ 8 s, completed statements
  ≤ 3.4 s on the JSON transport) but not measured per request.
- The log endpoint returns at most one day per query; each day from 11-08 to 11-16 was queried separately. Days before
  11-08 were not queried.
- The page's rendered error state was read from the route code, not observed in a browser.
