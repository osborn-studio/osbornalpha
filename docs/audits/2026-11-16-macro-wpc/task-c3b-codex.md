Implemented C3b. `PresetsMemo.get` accepts optional `shouldStore(value)`. Responses containing `read_failed` remain uncached and return `miss`; AnalysisError failures and `input_truncated` remain memoized.

Files changed:
- `src/lib/macro/presets-memo.ts`
- `src/lib/macro/presets-memo.test.ts`
- `src/app/api/macro/analyses/presets/route.ts`
- `src/app/api/macro/analyses/presets/route.test.ts`

Verified failing tests before implementation. All requested checks passed:
- Tests: 36 passed across 5 files
- TypeScript: passed
- ESLint: passed

Existing C3 work preserved. No commit or stash.