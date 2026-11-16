# Strategy auth and local handler validation

Base: `dc47ba2e`, including merged #138 (`b4853983`). Node v22.22.1.

## Repeat

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH MACRO_HANDLER_BENCHMARK_OUTPUT=/tmp/osstack/cache-regression/handlers.json npx vitest run src/lib/macro/strategy/handler-performance.test.ts --maxWorkers=1
```

Create the output directory first. Output is optional and restricted to `/tmp/osstack/`. The test is also runnable without the output variable.

## Scope and evidence

Local exported GET handlers + real builders + installed Next cache adapter; fixture auth/data/storage; in-memory incremental backend. Excludes production, HTTP/TLS, process startup, real auth/database latency and judgments.

Caches are cold, not the Node process: module loading is excluded, while first-call JIT effects may influence cold samples. Shared-warm means clearing the process memo only. Concurrency is eight same-key calls in one process; distributed cache locking is not demonstrated. Timing includes response serialization/body consumption. Fixed fixture date is 2026-11-07. No cookies, production secrets, external authentication or network access; accidental fetches fail the test. Judgments are disabled in this benchmark; existing route tests cover fresh judgment sections.

| Handler | Cold ms (n=1) | Warm median / p95 ms (n=12) | Shared-warm ms (n=1) | Concurrent cold median / p95 ms (n=8) | Cold history reads |
|---|---:|---:|---:|---:|---:|
| transmission-US | 5.638 | 0.278 / 0.895 | 0.261 | 2.998 / 3.136 | 0 |
| transmission-CN | 1.184 | 0.193 / 1.257 | 0.276 | 2.878 / 3.016 | 0 |
| policy-response | 6.566 | 0.383 / 0.488 | 0.618 | 8.674 / 9.071 | 8 |
| cycle-table | 4.126 | 0.074 / 0.141 | 0.137 | 3.964 / 4.017 | 13 |

Every cold phase writes one manifest; eight concurrent cold calls still write one. Warm/shared-warm calls read no history and write no manifest. Each authenticated request performs one auth check and four live snapshot/publish-state reads. A revision change forces another manifest write. Switching fixture accounts preserves public facts; sign-out after warming returns 401 before any data/cache access. Payload digests agree across cache phases. Raw samples, bytes and counters are in [handler-benchmark.json](handler-benchmark.json). Milliseconds are observations on a busy local host, not test thresholds, SLAs or a before/after speedup claim.

## Findings and change

Two new hook regressions failed on the merged baseline: auth changes did not clear displayed account data or reject previous-session requests, and a changed URL rendered old-region data before its effect ran. The hook now subscribes to auth changes, resets displayed state, fences late responses by generation and unsubscribes on cleanup. URL identity hides old results immediately, including a disabled URL. Reload generation also hides old results before the effect runs; its regression failed before the tick identity fix. An isolated successful-response-to-sign-out regression verifies immediate clearing. INITIAL_SESSION does not duplicate the mount fetch. HTTP cache bypass remains enabled.

The server cache gates and #138 expiry/coalescing behavior remain intact. The existing strategy-latency script measures builders and its direct memo, so it cannot establish authenticated real-handler performance. This harness calls exported GET handlers, real builders and the installed Next cache adapter; only auth/data/storage integrations are fixture implementations.

Remaining cold work: policy-response reads eight histories and cycle-table reads thirteen. Cycle-table currently requests daily and monthly histories regardless boundary. Reducing those reads changes the frozen manifest inputs/hash, so this PR leaves that contract decision for separate work. Remaining warm work includes real auth/database latency and, when enabled, sequential transmission judgment calls. These costs are absent from fixture timings and require a controlled authenticated environment to measure. No additional server caching is justified by these local results.

## Validation and review

- Six targeted files: 108 tests passed with one worker on the final candidate.
- New auth regressions were observed failing before the fix, then passing.
- Targeted ESLint and full TypeScript check passed. Typecheck first caught an implicit-any in the new revision fixture; the final check passed after annotation.
- Five independent gpt-6.1-sol sessions total: implementation, auth review, performance review, harness review and cache expiry/concurrency review. Review sessions made no edits.
- mmx final audit and disposition: [mmx-audit.md](mmx-audit.md).

No deployment, merge, account changes, browser access or shared task-index changes. Production performance acceptance remains with the production owner.
