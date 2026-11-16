# Cycle handler cold/warm fixture benchmark

Run from the repository with Node 22 and installed lockfile dependencies:

```sh
mkdir -p /tmp/osstack/macro-benchmark
MACRO_FULL_PATH_BENCHMARK_OUTPUT=/tmp/osstack/macro-benchmark/full-path.json \
  npx vitest run src/lib/macro/strategy/full-path-performance.test.ts --maxWorkers=1
```

This complements the pure CPU benchmark from #155 and the separate handler/manifest-transport tests. It invokes the exported cycle GET for `event_day`, `first_trading_day`, and `month_end`, with production wiring, installed Supabase read/write clients and adapters, real builders, manifest canonicalization/hash/upload, metadata readback, evaluation, Next cache adapter, and JSON response consumption. Only the session, HTTP transport and database/cache backends are fixtures. No environment credentials are loaded; global network fetch is forbidden, and the custom client transport accepts only `fixture.invalid`.

Each boundary runs cache-empty, five process-memo-warm requests, one Next-cache-warm request after clearing the process memo, and another cache-empty request. Cache resets preserve stored manifests and identity. “Cold” means both application cache layers are empty in the same already-running Node process. The Next incremental backend is an in-memory test double; this does not establish distributed cache reuse. A shared-cache retrieval still reports the process memo header `miss`.

The fixed 2026-11-07 fixture contains five daily series with 4,300 rows each, five monthly histories with 216 rows each, and 133 Fed policy observations. Every manifest retains 22,713 frozen inputs. Daily histories span 2007–2018; later episodes intentionally exercise missing coverage. Monthly histories span 2007–2024. Decimal text includes precision beyond JavaScript numbers. No sampled production data is used.

Deterministic regression gates assert:

- Cache-empty: 39 simulated database HTTP requests (33 observation requests, two snapshots, two publication revisions, one manifest RPC, one metadata read). Each daily series has four 1,000-row pages and one 300-row page.
- Both warm modes: four live snapshot/publication requests, no history download or manifest upload; process memo and Next cache counters distinguish the modes.
- Exact US/CN active-snapshot and publication-revision requests, all daily/monthly/policy history request counts and metadata identity/hash readback. Full submitted manifest body/hash equality against an independently built in-memory-port reference, including every input ID, version, exact value and source. This catches omitted or duplicated pages even when total row counts match.
- Complete response equality across cache modes and cache resets, exact view replay from the stored manifest, nonempty episodes and successful cells, metadata-only persistence readback, and no external network access.

JSON output contains every sample, per-request query/method/table/series/projection/offset/limit/status/rows and request/response entity-body bytes, total database request count/bytes, handler response bytes, complete response SHA-256, manifest hash/input count/canonical body bytes and cache activity. Bytes exclude headers, compression and TLS. Timing starts before GET invocation and stops after `response.text()`; integrity checks and reference construction occur outside the timer.

No timing threshold is enforced. Fixture timings include the emulator's filtering/sorting/JSON work and local scheduling/JIT/GC effects. They exclude process startup, real authentication, network/TLS, PostgreSQL execution, permissions/RLS and production cache persistence. This benchmark cannot resolve the prior 16.114-second first-observed production miss, establish a speedup over #155, or demonstrate an SLO. Auth and cache security behavior remain covered by the existing route/handler tests. Measurement results and review artifacts belong outside the repository under `/tmp/osstack/`.
