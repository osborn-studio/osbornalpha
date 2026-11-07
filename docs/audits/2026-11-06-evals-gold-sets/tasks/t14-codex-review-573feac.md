# Codex review — Task 14, commit 573feac (gpt-6-astra, medium; final message only, raw log not committed)

Reference sample validation accepts numeric representations that the evaluator cannot process, allowing validated fixtures to crash evaluation.

Review comment:

- [P2] Normalize accepted decimal values before comparison — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/kinds/reference.ts:71-71
  `parseReferenceSamples` accepts exponent-form values such as `"1e2"` because `isDecimal` validates through `canonicalDecimal`, but returns the original string unchanged. `evaluateReference` then passes it to `compareWithinTolerance`, whose decimal grammar rejects exponents, causing an otherwise successfully validated fixture to abort evaluation with a `RangeError`. Normalize `parsed_value` during parsing or use the comparator's stricter grammar consistently.
Reference sample validation accepts numeric representations that the evaluator cannot process, allowing validated fixtures to crash evaluation.

Review comment:

- [P2] Normalize accepted decimal values before comparison — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/kinds/reference.ts:71-71
  `parseReferenceSamples` accepts exponent-form values such as `"1e2"` because `isDecimal` validates through `canonicalDecimal`, but returns the original string unchanged. `evaluateReference` then passes it to `compareWithinTolerance`, whose decimal grammar rejects exponents, causing an otherwise successfully validated fixture to abort evaluation with a `RangeError`. Normalize `parsed_value` during parsing or use the comparator's stricter grammar consistently.
