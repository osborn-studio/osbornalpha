# Codex plan audit, round 5 (incremental) — F3 disclosure document pipeline

Read-only. Plan: `docs/superpowers/plans/2026-11-06-document-pipeline.md`. Prior rounds/dispositions 01–08 in `docs/audits/2026-11-06-document-pipeline/`. Round-4 fix diff: `git diff 84f973f 014150e -- docs/superpowers/plans/`. Note: Tasks 1–2 are already implemented (commits c78fd42, ba92c1e, 907bd56, 234c037); for Task 1/2 the committed code supersedes the plan text.

1. Verify R4-P2-1, R4-P2-2 and recheck-N1 are CLOSED.
2. Find NEW P1/P2 defects introduced by the round-4 diff: `scripts/documents/build-extract-worker.ts` + esbuild bundle (`build/extract-worker/extract-worker.mjs`, prebuild hook, outputFileTracingIncludes, test/CI ordering — does `npm test`/typecheck/test:db in CI need the bundle built first?), `FINAL_RESERVE_MS`/budget plumbing, `advanceCursor(…, reset)` caller in Task 7, cross-task signature drift.
Skip nits; do not re-raise closed items. If nothing P1/P2 remains, say ready.

Output: (a) `| ID | CLOSED? | note |`; (b) `| ID | Sev | Task/location | Defect | Concrete fix |` (IDs R5-P1-1…); (c) `VERDICT: ready` or `VERDICT: not ready (N P1, M P2)`.
