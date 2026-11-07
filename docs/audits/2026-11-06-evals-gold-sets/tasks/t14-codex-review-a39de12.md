# Codex review — Task 14, commit a39de12 (gpt-6-astra, medium; final message only, raw log not committed)

The reducer's new mandatory registration requirement breaks its existing manifest-validation caller for dual-source evidence. The caller must be migrated alongside the interface change.

Review comment:

- [P2] Update manifest validation to supply the pair registration — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/reduce.ts:34-36
  When a release manifest includes dual-source evidence with an authenticated fixture, `validate/manifest.ts:164` still calls `reduceForKind` with `evidenceClass` rather than the newly required `registration`. This now throws unconditionally, aborting manifest validation instead of returning validation findings. Update that caller to resolve the F6-owned registration and handle an unregistered pair as a validation finding.
The reducer's new mandatory registration requirement breaks its existing manifest-validation caller for dual-source evidence. The caller must be migrated alongside the interface change.

Review comment:

- [P2] Update manifest validation to supply the pair registration — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/reduce.ts:34-36
  When a release manifest includes dual-source evidence with an authenticated fixture, `validate/manifest.ts:164` still calls `reduceForKind` with `evidenceClass` rather than the newly required `registration`. This now throws unconditionally, aborting manifest validation instead of returning validation findings. Update that caller to resolve the F6-owned registration and handle an unregistered pair as a validation finding.
