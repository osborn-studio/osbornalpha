# C3 default correlation result cards

Continued the interrupted run's uncommitted work. No commits, stash operations, or branch changes.

## Implementation

- Shared `prepareAnalysis` resolves aliases, reads the selected history with the existing monthly/daily limits, derives policy events, freezes inputs, hashes them, computes results and generates bilingual explanations. POST retains its idempotency lookup before reads and its existing quota/persistence path; existing POST tests were not edited.
- Eight presets use `macro-presets/1`. Every indicator and asset ID in §4.4 exists in this branch's catalog and passes the existing request validator; no ID substitutions were required. Existing asset aliases resolve `US_UST10Y` to `US_DGS10`, and `CN_CGB10Y` to `CN_CGB_10Y` for reads.
- Authenticated GET presets uses the active snapshot cutoff, eligible history, deterministic RFC 4122 v5 request IDs, versioned response keys, a 32-entry LRU and single-flight computation. Hits preserve `computed_at`. Missing snapshots return the specified empty response. Failures remain individual cards. GET never persists an analysis or invokes the quota RPC.
- Correlation now loads preset cards by default through `CorrelationResult` in preset mode. Recalculate/save uses the existing POST with a fresh client request ID, preserves that ID across ambiguous network retries, and retries saved-result reads without another POST. Saved result links use `/macro/analyses/...`.
- `dataHash` excludes cutoff/catalog metadata and includes frozen series content, events and `EVENTS_VERSION`. Saved-run GET derives `data_hash` from persisted frozen inputs without schema changes. Only unequal data hashes show “数据已更新”.
- New messages are appended solely in the final `correlation.preset` namespace in both locales. Existing tokens and result charts are reused.

## Files changed

- `messages/en/macro.json`, `messages/zh/macro.json`
- `src/app/api/macro/analyses/route.ts`
- `src/app/api/macro/analyses/[runId]/route.ts`
- `src/app/api/macro/analyses/presets/route.ts`
- `src/app/api/macro/analyses/presets/route.test.ts`
- `src/app/api/macro/analyses/presets/saved-data-hash.test.ts`
- `src/components/macro/CorrelationWorkbench.tsx`
- `src/components/macro/CorrelationResult.tsx`
- `src/components/macro/CorrelationPresetResults.tsx`
- `src/components/macro/correlation-presets.ts`
- `src/components/macro/correlation-preset-results.test.ts`
- `src/components/macro/correlation-result-preset.test.ts`
- `src/lib/macro/analysis-service.ts`, `src/lib/macro/analysis-service.test.ts`
- `src/lib/macro/analysis-spec.ts`
- `src/lib/macro/preset-contract.ts`, `src/lib/macro/preset-request-id.ts`
- `src/lib/macro/presets-memo.ts`, `src/lib/macro/presets-memo.test.ts`
- This report. The supplied spec and task prompt in this directory were already present and retained.

## Validation

- Confirmed failing tests before implementing saved-run data hashes, the preset result container, and preset-mode result titles. Retained the interrupted run's service/memo/route tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, including a second run after the added tests.
- Focused API/service/memo/UI tests: 36 passed; expanded route/UI verification: 14 passed.
- Full requested test scope, rerun with `--maxWorkers=2`: 98 files passed, 4 files skipped; 1418 tests passed, 83 pre-existing skipped. The only failure was the explicitly allowed local timeout in `src/lib/macro/replay.test.ts` (US evidence read-back, 60-second limit). No other failures remained. The initial default-concurrency run suffered unrelated timeouts and was interrupted. Full rerun log: `/private/tmp/macro-c3-tests.log`.
- `git diff --check`: passed. Protected-file and prohibited-component-string checks: no violations.

## Not performed

- Benchmark script intentionally skipped as requested; `scripts/macro` was not edited.
- No live authenticated browser session or production API/database verification was performed. UI behavior is covered by real React renderer and static-render tests; route tests use the memory DB and mocked session boundary.
