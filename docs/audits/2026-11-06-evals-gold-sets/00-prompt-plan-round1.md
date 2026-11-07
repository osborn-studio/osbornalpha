You are an adversarial senior reviewer. Audit the IMPLEMENTATION PLAN

    docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md   (draft 1, commit 642ec4c, ~12.6k lines, 16 tasks)

against its spec docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md (draft 6; §0 is authoritative; §15.1 defines the buildable-now subset) and the LANDED code on this branch (src/lib/facts/**, src/lib/dq/**, src/lib/db/**, src/lib/entities/resolve.ts, scripts/ci/research-checks.ts, scripts/ci/research-db.ts, .github/workflows/ci.yml, supabase/migrations/**, src/app/api/facts/**, src/app/api/admin/dq/**).

The plan will be executed task-by-task by implementers who read only the plan's conventions (top of file) and their own task. Find defects that would:
- produce false-pass or misleading evidence (gate pass without coverage, synthetic data admitted as truth, legacy plan2.json ever passing, provenance not actually verified, ledger/manifest checks bypassable, sentinel leakage);
- be unbuildable or fail when executed as written (wrong landed import/signature/path, code that does not compile against landed types, tests that cannot pass, critical suites containing skips, S4_TEST_STATE inventory drift, migration lock/inventory problems, shared-DB interference with other test:db suites such as sync-us.integration.test.ts or dq-foundation.integration.test.ts);
- violate the ownership boundary (edits outside src/lib/evals/**, scripts/evals/**, docs/evals/**, docs/audits/2026-11-06-evals-gold-sets/**, the one migration, src/app/api/admin/evals/**, and the marked shared blocks listed in the conventions);
- contradict the spec (§0 R5-1…R5-12, §3.2/§3.3 reduction, §4 gold rules, §5.x kinds, §6.3 persistence order, §10 manifest authentication) or each other across tasks (names, shapes, file paths, ordering dependencies).

Do not report style. Spot-check code blocks against landed code by opening the files. Say when unsure.

Output: first line `**Verdict: …**` (ready / not ready for execution, one sentence). Then a findings table: `# | Severity (P1/P2/P3) | Task / plan line | Issue | Evidence | Fix`, numbered P1-1…; P1 = false evidence or cannot execute; P2 = will cost rework or a wrong contract; P3 = minor. If there are no P1/P2, say so explicitly. Do not modify files.
