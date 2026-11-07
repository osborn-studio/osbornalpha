# Codex review — Task 10, commit 2296893 (gpt-6-astra, medium; final message only, raw log not committed)

Replay fixture validation rejects supported TTM metric filters and throws an unintended exception for malformed calendar dates. Both issues need targeted parser fixes and regression tests.

Full review comments:

- [P2] Allow TTM duration filters for metric replay requests — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/replay/fixture.ts:44-44
  A metrics request with `concepts: []`, `metrics: ['roe']` and `durations: ['TTM']` is rejected as `gold_invalid`. However, `deriveMetrics` emits `roe` and trailing-twelve-month metrics with duration `TTM`, and `projectMetrics` supports filtering those rows. Validate durations against the metric duration set for metrics requests so these valid replay requests can be recorded and evaluated.

- [P2] Check date validity before calling toISOString — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/replay/fixture.ts:31-31
  An invalid date such as `2026-13-01` in `request.asOf` or `setup.today` passes the regex but makes `toISOString()` throw a `RangeError`. This bypasses the parser's `gold_invalid` refusal and its field-specific diagnostic. Check that the parsed timestamp is finite before converting it back to ISO, returning false for invalid dates.
Replay fixture validation rejects supported TTM metric filters and throws an unintended exception for malformed calendar dates. Both issues need targeted parser fixes and regression tests.

Full review comments:

- [P2] Allow TTM duration filters for metric replay requests — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/replay/fixture.ts:44-44
  A metrics request with `concepts: []`, `metrics: ['roe']` and `durations: ['TTM']` is rejected as `gold_invalid`. However, `deriveMetrics` emits `roe` and trailing-twelve-month metrics with duration `TTM`, and `projectMetrics` supports filtering those rows. Validate durations against the metric duration set for metrics requests so these valid replay requests can be recorded and evaluated.

- [P2] Check date validity before calling toISOString — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/replay/fixture.ts:31-31
  An invalid date such as `2026-13-01` in `request.asOf` or `setup.today` passes the regex but makes `toISOString()` throw a `RangeError`. This bypasses the parser's `gold_invalid` refusal and its field-specific diagnostic. Check that the parsed timestamp is finite before converting it back to ISO, returning false for invalid dates.
