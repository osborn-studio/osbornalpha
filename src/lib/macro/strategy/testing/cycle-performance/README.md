# Cycle evaluation CPU benchmark

This measures pure `buildCycleTable` evaluation, including invocation-local history preparation. It excludes history network reads, manifest persistence, authentication, HTTP handling, and production latency. The merged #150 optimization removed a redundant manifest-body download after persistence; this change addresses remaining repeated filtering/sorting of frozen inputs during view evaluation. All frozen inputs are retained.

Fixture: five active asset columns plus restricted/unknown columns; 45,000 synthetic daily rows and 1,500 monthly rows plus one duplicate = 46,501 frozen inputs, 120 policy events forming 60 alternating episodes. Histories cover roughly 25 years and remain below the 10,000-period per-series limit. Includes reversed input order and exact decimals. This is a large representative data shape, not sampled production data.

Node 22.22.1, same local machine, one worker. Each boundary has two warm-up evaluations then 15 timed evaluations; fixture creation, hashing, and assertions occur outside the timer. Before source: `ab11d6e3`. After source: the implementation in this PR. Timings vary with scheduling and GC; the deterministic work budget is the regression gate.

| Boundary | Before median ms | After median ms | Before/after |
| --- | ---: | ---: | ---: |
| event_day | 117.41 | 23.56 | 4.98x |
| first_trading_day | 111.11 | 16.48 | 6.74x |
| month_end | 77.02 | 6.97 | 11.05x |

Raw samples and complete canonical view SHA-256 digests are in `before.json` and `after.json`. All three view digests match. Regression tests also compare the complete input body before/after evaluation and its manifest hash, exercise A/B/A calls, mutable input between calls, stable daily duplicate selection, monthly last-wins selection, exact decimals, UTC boundaries, coverage and truncation. Existing strategy/route tests cover fresh auth and tenant isolation; production auth/cache paths are unchanged.

Deterministic history preparation budget: 13,950,300 role inspections before (test failed as intended), 232,505 after. Each of five active columns scans the frozen input array once per evaluation instead of once per episode. Daily endpoint search remains linear and unchanged. Arrays/maps are invocation-local; no shared cache or new network reads. Peak transient memory was not benchmarked; retained prepared arrays hold references to the already-loaded frozen inputs.

Reproduce from this branch:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
MACRO_CYCLE_BENCHMARK_OUTPUT=/tmp/cycle-after.json \
npx vitest run src/lib/macro/strategy/cycle-performance.test.ts --maxWorkers=1
```

Validation: strategy suite 528 passed / 42 skipped, route suite 95 passed, full TypeScript check and targeted ESLint passed. Skipped database integrations were not run. No deployment or production speedup is claimed.
