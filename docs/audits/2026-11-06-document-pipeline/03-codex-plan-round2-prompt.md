# Codex plan audit, round 2 (incremental) — F3 disclosure document pipeline

Read-only. Plan: `docs/superpowers/plans/2026-11-06-document-pipeline.md`. Spec: `docs/superpowers/specs/2026-11-04-document-pipeline-design.md`. Round 1 findings: `docs/audits/2026-11-06-document-pipeline/01-codex-plan-round1.md`; dispositions: `02-disposition-round1.md` (P1-1 was rejected with a rationale — challenge it only if the rationale is factually wrong about the plan). The round-1 fix diff is `git diff b2d908b 535cc2f -- docs/superpowers/plans/`.

Tasks:
1. For each accepted round-1 item, verify the fix in the plan actually closes the defect (say CLOSED / NOT CLOSED with reason).
2. Find NEW defects, especially ones introduced by the fix diff (signature drift across tasks, the new `p_zero_output` arg, `value_replays`, cursor `{segment,last_ref,settled,attempts,seq}`, `fresh-db.ts`, renew_* lease functions, `cursor_regression`, `hk_promotion_due` exclusion), in the same categories as round 1: wrong/unreplayable public data or lost evidence; incompatibility with landed code (`supabase/migrations/20261106090000_financial_facts.sql`, `src/lib/facts/*`, `src/lib/dq/*`, `scripts/s4/local-db.ts`); atomicity/concurrency; failing its own tests/gate or network in tests; spec/coordination rule violations (no edits to existing `src/lib/facts/*`; `// F3` blocks; migration timestamps 20261108090000/20261108091000; revoke execute on every new function).

Skip style nits; do not re-raise round-1 items that are CLOSED.

Output: (a) table `| R1 ID | CLOSED? | note |`; (b) table `| ID | Sev | Task/location | Defect | Concrete fix |` for new items (IDs R2-P1-1…); (c) one line `VERDICT: ready` or `VERDICT: not ready (N P1, M P2)`.
