codex
Targeted in-memory reproductions confirmed that conflicting bilingual labels bypass ambiguity detection and staggered date headers suppress otherwise valid balance-sheet candidates.

Full review comments:

- [P2] Match all same-line bilingual label cells before accepting a concept — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/generate.ts:109-111
  When a bilingual row has a recognized leading label and a trailing translated label, the leading-only attempt succeeds and the trailing cell is never examined. For example, `Gross profit 100 90 收益` emits gross-profit candidates without `label_ambiguous`, although `matchConcepts` correctly rejects the combined labels as conflicting. This also discards EPS units supplied only in trailing labels. Evaluate all same-line label cells together before trying wrapped-label alternatives.

- [P2] Collect column dates across header lines — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/period.ts:134-137
  When balance-sheet column dates occupy different header lines, selecting just one `best` line drops a valid column. A header with `31 December 2025` above the left column and `31 December 2024` on the following line above the right column retains only 2024; generation then returns no candidates and `BS:no_main_column`. Collect positioned tokens across header lines, deduplicating equivalent bilingual tokens per column, rather than discarding every line except one.
Targeted in-memory reproductions confirmed that conflicting bilingual labels bypass ambiguity detection and staggered date headers suppress otherwise valid balance-sheet candidates.

Full review comments:

- [P2] Match all same-line bilingual label cells before accepting a concept — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/generate.ts:109-111
  When a bilingual row has a recognized leading label and a trailing translated label, the leading-only attempt succeeds and the trailing cell is never examined. For example, `Gross profit 100 90 收益` emits gross-profit candidates without `label_ambiguous`, although `matchConcepts` correctly rejects the combined labels as conflicting. This also discards EPS units supplied only in trailing labels. Evaluate all same-line label cells together before trying wrapped-label alternatives.

- [P2] Collect column dates across header lines — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/period.ts:134-137
  When balance-sheet column dates occupy different header lines, selecting just one `best` line drops a valid column. A header with `31 December 2025` above the left column and `31 December 2024` on the following line above the right column retains only 2024; generation then returns no candidates and `BS:no_main_column`. Collect positioned tokens across header lines, deduplicating equivalent bilingual tokens per column, rather than discarding every line except one.
