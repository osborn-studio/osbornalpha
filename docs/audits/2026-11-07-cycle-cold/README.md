# Cold cycle manifest persistence

Base `dc47ba2e`, branch `codex/cycle-cold`. Independent of PR146.

## Change and correctness

`putManifest` previously sent the complete body to `macro_put_manifest`, then selected `*` from the manifest table, transferring the body again. It now snapshots the canonical JSON once before I/O, uses that value for the unchanged hash and RPC payload, selects only `manifest_id,manifest_hash,created_at`, and returns that detached submitted value after validating metadata. Missing/malformed IDs, missing rows, wrong hashes/IDs, invalid timestamps and read/RPC failures reject with `StrategyDbError`. Date metadata from the PostgreSQL transport still normalizes to UTC.

This relies on the existing service-only RPC in migration `20261115090000_macro_strategy.sql`: it inserts the submitted JSONB, or checks stored body equality on hash conflict and raises `payload_conflict`. Manifest tables grant select only to runtime roles, with no update/delete grants. No migration changes are required. `manifest(id)` still fetches full stored evidence. Histories, frozen inputs, method versions, cache identity, auth and RPC conflict semantics are unchanged. Optional `SelectSpec.columns` is implemented by both Supabase and the PostgreSQL test transport.

Capturing the canonical JSON before awaiting also prevents caller mutation from changing returned evidence relative to the submitted/hash-identified body. Undefined object members disappear as they do over JSON transport; exact decimal text and input order remain intact.

## Repeatable transport evidence

```sh
mkdir -p /tmp/osstack/cycle-latency
PATH=/opt/homebrew/opt/node@22/bin:$PATH CYCLE_TRANSPORT_BENCHMARK_OUTPUT=/tmp/osstack/cycle-latency/transport.json npx vitest run src/lib/macro/strategy/manifest-transport.test.ts --maxWorkers=1
```

The installed Supabase client and real adapter run over simulated HTTP with explicit fixture configuration. A real cycle builder produces a synthetic manifest with **22,433 frozen inputs**, 6,338,036 body bytes and hash `220cd6ee43ba381dd2e36b41f7c245d1f0059622e9b98a6733d7dd971ef47434`. The baseline transport forces the legacy wildcard select; the candidate uses the metadata projection. Both use the candidate canonical-snapshot algorithm, so this isolates response shape rather than benchmarking the entire old implementation.

| Bytes (UTF-8 JSON, uncompressed, no headers) | Legacy wildcard response shape | Metadata response shape |
|---|---:|---:|
| RPC request body | 6,338,323 | 6,338,323 |
| RPC response + manifest select response | 6,338,261 | 217 |

This removes 6,338,044 returned bytes (over 99.99%) in the synthetic case while keeping both request count and submitted body unchanged. Canonical stored/submitted body equivalence, hash equality, every evidence input and rendered cycle view equality are asserted. Raw byte/timing observations are in [transport-benchmark.json](transport-benchmark.json). Single local timing samples are order/JIT/GC/shared-host dependent and are **not** production timings or a demonstrated production speedup. The test enforces bytes and equivalence, with no timing threshold.

## Supplied production context and remaining work

Root supplied `/tmp/osstack/cache-authenticated-cua.json`: 18 total observations across six endpoints, three per endpoint. Cycle observed miss 16,114 ms, then hits 1,167/663 ms; transmission US 2,618 → 1,573 → 849 ms, CN 1,822 → 979 → 1,140 ms; policy response 2,691 → 1,304 → 1,209 ms. All returned 200/private,no-store. This is sparse pre-change evidence, not robust p95. This session did not open a browser or access production credentials.

Root supplied read-only profiler `/tmp/osstack/cycle-latency/read-only-profile.log`: cycle 49 HTTP requests, 21,097 KB, 22,451 inputs and 3,583 ms locally for reads/building. It excludes full handler work and manifest writes, so subtracting it from browser time does not isolate persistence latency. This PR removes a proven redundant transfer; the production owner must measure actual post-change cold latency. Observation reads, full RPC upload, hashing, database JSONB equality on replay and shared-cache work remain costs. No histories/frozen inputs are dropped.

## Validation

- New real-client transport tests failed on the original full-body read; malformed metadata cases also exposed missing validation.
- Six focused Vitest files pass: **201 tests**, one worker (`manifest-transport`, `db`, `replay`, `cycle-table`, `manifest`, API strategy routes).
- Targeted ESLint and full TypeScript check pass on Node 22.22.1.
- The PostgreSQL integration transport now honors projections. No database integration run is claimed; no local database fixture was supplied. Date mapping has a focused adapter test; SQL and privileges are unchanged.
- Independent mmx final audit and disposition: [mmx-audit.md](mmx-audit.md).

No production requests/writes, credentials, Chrome, deploy/merge, shared task-index changes or PR146 modifications.
