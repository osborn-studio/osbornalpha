# Codex review — Task 12, commit 0eedb46 (gpt-6-astra, medium; final message only, raw log not committed)

The new expert-evidence validation rejects legitimate disagreements about missing values, preventing those reviews from completing successfully.

Review comment:

- [P2] Allow evidence that contradicts an expected-missing case — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/expert.ts:39-40
  When an expert finds a value in the source document for a case marked `expect: 'missing'`, a legitimate `disagree` check cannot pass: this branch requires `absent: true` and both values to be null regardless of the verdict. It therefore rejects the very evidence demonstrating that the gold expectation is wrong, even with a completed follow-up. Validate absence against the observed evidence and verdict rather than requiring it to match the gold expectation unconditionally.
The new expert-evidence validation rejects legitimate disagreements about missing values, preventing those reviews from completing successfully.

Review comment:

- [P2] Allow evidence that contradicts an expected-missing case — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/expert.ts:39-40
  When an expert finds a value in the source document for a case marked `expect: 'missing'`, a legitimate `disagree` check cannot pass: this branch requires `absent: true` and both values to be null regardless of the verdict. It therefore rejects the very evidence demonstrating that the gold expectation is wrong, even with a completed follow-up. Validate absence against the observed evidence and verdict rather than requiring it to match the gold expectation unconditionally.
