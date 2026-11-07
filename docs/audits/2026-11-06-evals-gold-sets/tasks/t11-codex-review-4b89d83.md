# Codex review — Task 11, commit 4b89d83 (gpt-6-astra, medium; final message only, raw log not committed)

The replay runner does not validate the requested module against the supplied fixture, allowing mislabeled evaluation reports and persisted results.

Review comment:

- [P2] Reject replay files that do not match the requested module — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/cli/run-replay.ts:100-102
  When `--set` explicitly names a facts replay file, callers can supply `--module macro` (or another module) and still execute the facts backend. Only the mode is checked, while `replaySetOf` labels the resulting report with `args.module`, allowing facts results to be reported—and with `--write-db`, persisted—as another module's evaluation. Check `file.module === args.module` before opening the backend, as `runOfficial` already does.
The replay runner does not validate the requested module against the supplied fixture, allowing mislabeled evaluation reports and persisted results.

Review comment:

- [P2] Reject replay files that do not match the requested module — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/cli/run-replay.ts:100-102
  When `--set` explicitly names a facts replay file, callers can supply `--module macro` (or another module) and still execute the facts backend. Only the mode is checked, while `replaySetOf` labels the resulting report with `args.module`, allowing facts results to be reported—and with `--write-db`, persisted—as another module's evaluation. Check `file.module === args.module` before opening the backend, as `runOfficial` already does.
