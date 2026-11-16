# Codex plan audit, round 1 — F3 disclosure document pipeline

You are auditing an implementation PLAN (not code) in this repository (read-only).

- Plan: `docs/superpowers/plans/2026-11-06-document-pipeline.md` (~17.9k lines, Tasks 1–19, ends with `## 整合记录`).
- Spec it implements: `docs/superpowers/specs/2026-11-04-document-pipeline-design.md` (6th draft; §0 lists round-5 overrides).
- Landed code the plan builds on: `supabase/migrations/20261106090000_financial_facts.sql`, `src/lib/facts/*`, `src/lib/dq/*`, `src/lib/db/*`, `src/lib/research/ingest/collectors/*`, `src/app/api/cron/facts-sync/route.ts`, `scripts/ci/research-checks.ts`, `scripts/s4/local-db.ts`.
- Mandate (owner): primary sources only; every public number replayable to its source bytes; facts separate from judgments; no auto approval; HK facts only via candidate → check → owner approval → promotion.

Find defects in the PLAN that would, if implemented as written:
1. publish wrong or unreplayable public data, or lose evidence (citations, raw bytes, hashes);
2. be incompatible with the landed code (wrong function names/signatures, SQL that conflicts with landed triggers/constraints/grants, PostgREST 1000-row truncation, lease/lock semantics);
3. break atomicity/concurrency (races between sync, extract, candidates, promote; stale_plan handling; Step-0 recovery);
4. fail its own tests or the gate (typecheck, lint, test:db, test:migrations), or put network access in tests;
5. violate the spec or the coordination rules (only edits `src/lib/facts/*` by adding files; `// F3` blocks in shared files; migration timestamps 20261108090000/20261108091000; every new function revokes execute from public/anon/authenticated).

Spot-check the code blocks against the repo (grep imports and signatures). Skip style nits.

Output: a markdown table `| ID | Sev (P1/P2/P3) | Task/location | Defect | Concrete fix |` with IDs P1-1…, then a one-line verdict: `VERDICT: ready` or `VERDICT: not ready (N P1, M P2)`.
