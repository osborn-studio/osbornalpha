# Codex review — Task 2, commit 94a1ce2 (gpt-6-astra, medium; final message only, raw log not committed)

The schema accepts metric cases without their mandatory current binding and historical cutoff. Tests could not be run because the checkout lacks executable test dependencies.

Review comment:

- [P2] Require current binding for metric cases — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/gold/schema.ts:198-201
  A metric case can currently use `binding: 'document'` and omit `source.available_date`, provided it supplies a document ID. The parser then returns it as ready with `as_of: null` and no provenance gaps. This violates the metric contract in specification §4.2: metrics must use current binding and derive their historical cutoff from `source.available_date`. Reject document-bound metric cases so malformed gold data cannot bypass the required evaluation cutoff.
The schema accepts metric cases without their mandatory current binding and historical cutoff. Tests could not be run because the checkout lacks executable test dependencies.

Review comment:

- [P2] Require current binding for metric cases — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/gold/schema.ts:198-201
  A metric case can currently use `binding: 'document'` and omit `source.available_date`, provided it supplies a document ID. The parser then returns it as ready with `as_of: null` and no provenance gaps. This violates the metric contract in specification §4.2: metrics must use current binding and derive their historical cutoff from `source.available_date`. Reject document-bound metric cases so malformed gold data cannot bypass the required evaluation cutoff.
