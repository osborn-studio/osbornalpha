# Codex review — Task 8, commit 23322c5 (gpt-6-astra, medium; final message only, raw log not committed)

The expanded decimal input range is not supported by the existing result formatter, causing valid comparisons to become read errors.

Review comment:

- [P2] Allow expanded decimal differences when raising the input cap — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/compare.ts:12-12
  With the new 512-character input limit, valid operands can produce an absolute difference longer than the 512-character limit enforced by `canonicalDecimal`, which `formatDecimal` calls. For example, comparing `'1'.repeat(512)` against `'0.1'` produces a 514-character difference and throws `invalid_decimal:length` instead of returning a comparison. The official evaluator consequently reports `read_error` for valid values. Decouple intermediate/result formatting from the input-length cap so all accepted operands can be compared.
The expanded decimal input range is not supported by the existing result formatter, causing valid comparisons to become read errors.

Review comment:

- [P2] Allow expanded decimal differences when raising the input cap — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/compare.ts:12-12
  With the new 512-character input limit, valid operands can produce an absolute difference longer than the 512-character limit enforced by `canonicalDecimal`, which `formatDecimal` calls. For example, comparing `'1'.repeat(512)` against `'0.1'` produces a 514-character difference and throws `invalid_decimal:length` instead of returning a comparison. The official evaluator consequently reports `read_error` for valid values. Decouple intermediate/result formatting from the input-length cap so all accepted operands can be compared.
