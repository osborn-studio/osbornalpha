# Codex review — Task 2, commit 57dc33b (gpt-6-astra, medium; final message only, raw log not committed)

The new metric validation rejects legitimate borrowings-total targets through two independent constraints that contradict the existing derive implementation.

Full review comments:

- [P2] Allow equal period boundaries for INSTANT metrics — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/gold/schema.ts:318-318
  For `borrowings_total`, `deriveMetrics` deliberately emits `duration: 'INSTANT'` with `period_start === period_end`, as also asserted in `derive.test.ts`. This new unconditional comparison rejects every correctly specified borrowings-total gold case. Permit equal boundaries for INSTANT metrics while retaining strict ordering for duration metrics.

- [P2] Include the emitted CN borrowings basis in the whitelist — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/gold/schema.ts:28-28
  For CN `borrowings_total`, `deriveMetrics` emits `basis: 'cn_incl_bonds'`, but this whitelist omits it. Consequently, a gold target using the actual derived metric identity fails with `not_emitted_by_derive`, independently of the period-boundary issue. Add `cn_incl_bonds` to the permitted CN bases and cover it with a schema regression test.
The new metric validation rejects legitimate borrowings-total targets through two independent constraints that contradict the existing derive implementation.

Full review comments:

- [P2] Allow equal period boundaries for INSTANT metrics — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/gold/schema.ts:318-318
  For `borrowings_total`, `deriveMetrics` deliberately emits `duration: 'INSTANT'` with `period_start === period_end`, as also asserted in `derive.test.ts`. This new unconditional comparison rejects every correctly specified borrowings-total gold case. Permit equal boundaries for INSTANT metrics while retaining strict ordering for duration metrics.

- [P2] Include the emitted CN borrowings basis in the whitelist — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/gold/schema.ts:28-28
  For CN `borrowings_total`, `deriveMetrics` emits `basis: 'cn_incl_bonds'`, but this whitelist omits it. Consequently, a gold target using the actual derived metric identity fails with `not_emitted_by_derive`, independently of the period-boundary issue. Add `cn_incl_bonds` to the permitted CN bases and cover it with a schema regression test.
