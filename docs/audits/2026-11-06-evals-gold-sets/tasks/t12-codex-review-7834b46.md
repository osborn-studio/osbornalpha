# Codex review — Task 12, commit 7834b46 (gpt-6-astra, medium; final message only, raw log not committed)

Standalone expert validation can approve unauthenticated run references, and audit parsing can silently drop distinct findings. Both undermine the evidence checks introduced by this commit.

Full review comments:

- [P2] Authenticate the run referenced by standalone expert validation — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/handlers.ts:90-92
  `validate.ts --expert <file> --release` accepts any syntactically valid UUID as `population.evaluated_run_id`, including nonexistent, failed, or non-privileged runs. This handler only loads the gold set, and `validateExpertRecord` never resolves the run. Section 8 of the design requires a passing privileged run; the manifest's separate authentication does not protect this standalone command. Resolve and validate the referenced run, failing closed when it cannot be authenticated.

- [P2] Keep synthesized finding IDs unique across report tables — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/audit.ts:60-60
  When a report contains two severity tables without explicit IDs, the counter resets for each table, so both tables' first P1 finding becomes `R<round>-P1-1`. The report-wide `seen` set then silently discards the second finding. Consequently, generated counts underreport findings and one disposition can satisfy release validation while another finding remains unaddressed. Keep the counters report-wide or include table identity in synthesized IDs.
Standalone expert validation can approve unauthenticated run references, and audit parsing can silently drop distinct findings. Both undermine the evidence checks introduced by this commit.

Full review comments:

- [P2] Authenticate the run referenced by standalone expert validation — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/handlers.ts:90-92
  `validate.ts --expert <file> --release` accepts any syntactically valid UUID as `population.evaluated_run_id`, including nonexistent, failed, or non-privileged runs. This handler only loads the gold set, and `validateExpertRecord` never resolves the run. Section 8 of the design requires a passing privileged run; the manifest's separate authentication does not protect this standalone command. Resolve and validate the referenced run, failing closed when it cannot be authenticated.

- [P2] Keep synthesized finding IDs unique across report tables — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/evals/validate/audit.ts:60-60
  When a report contains two severity tables without explicit IDs, the counter resets for each table, so both tables' first P1 finding becomes `R<round>-P1-1`. The report-wide `seen` set then silently discards the second finding. Consequently, generated counts underreport findings and one disposition can satisfy release validation while another finding remains unaddressed. Keep the counters report-wide or include table identity in synthesized IDs.
