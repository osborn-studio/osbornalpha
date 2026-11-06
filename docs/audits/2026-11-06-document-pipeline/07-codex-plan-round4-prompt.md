# Codex plan audit, round 4 (incremental) — F3 disclosure document pipeline

Read-only. Plan: `docs/superpowers/plans/2026-11-06-document-pipeline.md`. Spec: `docs/superpowers/specs/2026-11-04-document-pipeline-design.md`. Prior rounds and dispositions in `docs/audits/2026-11-06-document-pipeline/` (01–06). Round-3 fix diff: `git diff 4b484c2 84f973f -- docs/superpowers/plans/`. (Ignore uncommitted working-tree changes to migration one; Task 1 is being implemented separately.)

1. Verify R3-P1-1, R3-P2-1, R1-P2-7 are CLOSED.
2. Find NEW P1/P2 defects introduced by the round-3 diff: the `unit_currency` role and `unit_evidence` publish rule; `renew_hk_fact_lease` (holder-only, grants/revokes, interplay with landed `claim_fact_sync_lease`/`release` in `supabase/migrations/20261106090000_financial_facts.sql`); `quiesce()`/drainMs; the `node:worker_threads` extraction worker that registers tsx at runtime (is this viable in Next.js 15 on Vercel serverless and in `next build` file tracing? does it break typecheck/lint/test?); cross-task signature drift.
Same categories and coordination rules as before. Skip nits; do not re-raise closed items.

Output: (a) `| ID | CLOSED? | note |`; (b) `| ID | Sev | Task/location | Defect | Concrete fix |` (IDs R4-P1-1…); (c) `VERDICT: ready` or `VERDICT: not ready (N P1, M P2)`.
