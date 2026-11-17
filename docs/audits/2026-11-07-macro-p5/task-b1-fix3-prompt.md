You are Codex gpt-6-sol. One correction to the B1 fix round you just applied in src/lib/macro/clock-view.ts / clock-view.test.ts (uncommitted in this worktree):

The production engine (src/lib/macro/regime.ts, classifyRegime) stores `contribution.support` as a SPARSE object — `{...hit.support}` where hit.support is `Partial<Record<Regime,number>>` (e.g. `{overheat:0.5,stagflation:0.3}`), while `contribution.contribution` always has the four regime keys. Your "exactly four keys" guard on `support` would make every real stored result fail invariants 2/8/9 → the clock would never show numbers in production. Fix:
- `support`: accept sparse objects; every PRESENT key must be one of the four regimes with a finite number; missing keys mean 0 (as the engine does). Reject extra keys or non-finite values.
- `contribution`: keep the strict four-finite-keys rule (the engine writes all four).
- Manifest rows (`method_manifest.rows[].support`) keep the four-key normalized shape (that is what D1 will write), but the comparison against `C` must treat C's missing keys as 0.
- Update the tests: the hand fixture and the real-classifier fixtures must use the SPARSE support exactly as `classifyRegime` emits it (do not normalize), and add a test that a sparse support passes and that an extra key or a non-finite value fails invariant 2.
Only modify src/lib/macro/clock-view.ts and src/lib/macro/clock-view.test.ts. Run `npm test -- src/lib/macro/clock-view.test.ts`, `npm run typecheck`, `npm run lint`. Do not commit; print files changed, vitest summary, deviations.
