# Codex review — Task 7, commit 523357a (gpt-6-astra, medium; final message only, raw log not committed)

The commit breaks subject resolution for unprivileged database clients and introduces a truncation exception without updating its consumer at this commit.

Full review comments:

- [P1] Avoid querying privileged scope data in the public reader — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/adapters/facts.ts:120-121
  For anon or authenticated database clients, `scopeRows()` selects from `fact_sync_scope`, whose SELECT permission is granted only to `service_role` by the facts migration. This unconditional query therefore throws before the filings fallback can run, making every otherwise resolvable subject fail with `read_error(read_failed)` in unprivileged evaluations. Use publicly readable market evidence for the public reader, and reserve scope queries for privileged clients.

- [P2] Map the new truncation exception in the official evaluator — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/adapters/facts.ts:151-151
  When the privileged non-visible lookup is truncated, this now throws `NonVisibleReadError('truncated')`, but `official.ts` at this commit catches every exception from `readNonVisible()` as `read_error('read_failed')`. Consequently the intended truncation reason is lost rather than reported as the new class's comment promises. Include the corresponding evaluator exception handling and an integration test in this change.
The commit breaks subject resolution for unprivileged database clients and introduces a truncation exception without updating its consumer at this commit.

Full review comments:

- [P1] Avoid querying privileged scope data in the public reader — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/adapters/facts.ts:120-121
  For anon or authenticated database clients, `scopeRows()` selects from `fact_sync_scope`, whose SELECT permission is granted only to `service_role` by the facts migration. This unconditional query therefore throws before the filings fallback can run, making every otherwise resolvable subject fail with `read_error(read_failed)` in unprivileged evaluations. Use publicly readable market evidence for the public reader, and reserve scope queries for privileged clients.

- [P2] Map the new truncation exception in the official evaluator — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/adapters/facts.ts:151-151
  When the privileged non-visible lookup is truncated, this now throws `NonVisibleReadError('truncated')`, but `official.ts` at this commit catches every exception from `readNonVisible()` as `read_error('read_failed')`. Consequently the intended truncation reason is lost rather than reported as the new class's comment promises. Include the corresponding evaluator exception handling and an integration test in this change.
