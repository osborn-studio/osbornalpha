codex
Regeneration can bypass a failed identity, English comparison results depend on processing order, and automatic decisions ignore execution deadlines. These affect validation correctness and reliable batch completion.

Full review comments:

- [P1] Compute identities before filtering out decided candidates — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/candidates/run.ts:131-136
  After a reviewer rejects one member of a failing statement identity, regeneration excludes that row from `runHkChecks`. The remaining rows then receive a passing, skipped identity because an input is missing, even though the generated statement still fails the equation; approved concepts can subsequently be auto-confirmed. Compute identities over the complete generated column and restrict only the check writes to undecided candidates.

- [P2] Enforce the remaining execution budget during auto decisions — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/candidates/run.ts:159-163
  With a finite deadline, the auto phase still scans every candidate page and performs sequential approval/decision calls without checking the remaining time. It runs even after the candidates phase stops for `deadline_hit`. A backlog can therefore exhaust the invocation before `finishBatch` and `recordAttempt`, leaving a running receipt despite partially committed decisions. Bound pagination and decision processing by the deadline, reserving time for finalization.

- [P2] Recheck primary candidates when English candidates arrive later — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/checks.ts:248-251
  If the Chinese extraction is processed before its English counterpart, its cross-check is saved as unavailable and the extraction is marked done. Processing the English extraction later cannot detect the mismatch because comparison extractions never load counterpart candidates here, and completed primary extractions are not scheduled again. Consequently mismatch detection depends on processing order. Schedule a primary recheck when comparison candidates become available, or perform the comparison from either side.
Regeneration can bypass a failed identity, English comparison results depend on processing order, and automatic decisions ignore execution deadlines. These affect validation correctness and reliable batch completion.

Full review comments:

- [P1] Compute identities before filtering out decided candidates — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/candidates/run.ts:131-136
  After a reviewer rejects one member of a failing statement identity, regeneration excludes that row from `runHkChecks`. The remaining rows then receive a passing, skipped identity because an input is missing, even though the generated statement still fails the equation; approved concepts can subsequently be auto-confirmed. Compute identities over the complete generated column and restrict only the check writes to undecided candidates.

- [P2] Enforce the remaining execution budget during auto decisions — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/candidates/run.ts:159-163
  With a finite deadline, the auto phase still scans every candidate page and performs sequential approval/decision calls without checking the remaining time. It runs even after the candidates phase stops for `deadline_hit`. A backlog can therefore exhaust the invocation before `finishBatch` and `recordAttempt`, leaving a running receipt despite partially committed decisions. Bound pagination and decision processing by the deadline, reserving time for finalization.

- [P2] Recheck primary candidates when English candidates arrive later — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/checks.ts:248-251
  If the Chinese extraction is processed before its English counterpart, its cross-check is saved as unavailable and the extraction is marked done. Processing the English extraction later cannot detect the mismatch because comparison extractions never load counterpart candidates here, and completed primary extractions are not scheduled again. Consequently mismatch detection depends on processing order. Schedule a primary recheck when comparison candidates become available, or perform the comparison from either side.
