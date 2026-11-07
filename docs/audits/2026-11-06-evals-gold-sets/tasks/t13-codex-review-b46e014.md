# Codex review — Task 13, commit b46e014 (gpt-6-astra, medium; final message only, raw log not committed)

The new extraction evaluator can crash on an invalid predicted date rather than scoring the prediction as incorrect. This leaves a concrete error-handling defect despite the kinds currently being disabled in the registry.

Review comment:

- [P2] Reject invalid dates without throwing during extraction scoring — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/kinds/extraction.ts:51-51
  When a parsed prediction contains a date-shaped but invalid value such as `2024-13-01`, the regex passes but `toISOString()` throws `RangeError: Invalid time value`. Because neither `valuesEqual` nor `matchGroup` catches this exception, one incorrect extracted date aborts the entire evaluation instead of counting as a mismatch (FP + FN). Check that the parsed date has a finite timestamp before calling `toISOString()`, and add a regression test with an invalid predicted month or day.
The new extraction evaluator can crash on an invalid predicted date rather than scoring the prediction as incorrect. This leaves a concrete error-handling defect despite the kinds currently being disabled in the registry.

Review comment:

- [P2] Reject invalid dates without throwing during extraction scoring — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/kinds/extraction.ts:51-51
  When a parsed prediction contains a date-shaped but invalid value such as `2024-13-01`, the regex passes but `toISOString()` throws `RangeError: Invalid time value`. Because neither `valuesEqual` nor `matchGroup` catches this exception, one incorrect extracted date aborts the entire evaluation instead of counting as a mismatch (FP + FN). Check that the parsed date has a finite timestamp before calling `toISOString()`, and add a regression test with an invalid predicted month or day.
