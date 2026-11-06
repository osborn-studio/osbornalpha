# Codex review — Task 3, commit bb82e7be (gpt-6-astra, medium; final message only, raw log not committed)

The new validation gate can silently stop validating the existing external legacy gold set when its lock entry is removed. This leaves a gap in the promised bidirectional lock enforcement.

Review comment:

- [P2] Reject removal of external gold sets from the lock — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/cli.ts:39-44
  If the existing `src/lib/facts/fixtures/gold/plan2.json` entry is removed from `lock.json` while the file remains unchanged, all CI checks pass: `listGoldSetPaths(root, lock)` no longer discovers it, this loop checks only remaining entries, and gold-diff ignores lock changes without inspecting unchanged files. This silently removes the legacy gold set from future validation. Check for removed registrations against the base lock, or discover supported external gold sets independently of the current lock.
The new validation gate can silently stop validating the existing external legacy gold set when its lock entry is removed. This leaves a gap in the promised bidirectional lock enforcement.

Review comment:

- [P2] Reject removal of external gold sets from the lock — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/cli.ts:39-44
  If the existing `src/lib/facts/fixtures/gold/plan2.json` entry is removed from `lock.json` while the file remains unchanged, all CI checks pass: `listGoldSetPaths(root, lock)` no longer discovers it, this loop checks only remaining entries, and gold-diff ignores lock changes without inspecting unchanged files. This silently removes the legacy gold set from future validation. Check for removed registrations against the base lock, or discover supported external gold sets independently of the current lock.
