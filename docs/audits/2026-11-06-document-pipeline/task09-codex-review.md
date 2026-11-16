codex
Two reproducible extraction defects silently remove genuine repeated characters and discard tables containing year-shaped financial amounts. Both affect the accuracy of the generated document data.

Full review comments:

- [P2] Require overlapping glyphs before removing duplicate text — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/extract/pdf.ts:81-81
  When a PDF represents adjacent repeated narrow glyphs as separate text items, the fake-bold filter deletes genuine characters. For example, two `1` items at x=10 and x=14, each width 4 and height 10, produce `1` instead of `11`. This silently corrupts extracted financial values. Require near-identical or substantially overlapping bounds rather than comparing origin distance against font height alone.

- [P2] Distinguish year headers from financial amounts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/extract/tables.ts:42-43
  A labeled financial row whose amounts happen to fall between 1900 and 2099 is classified as a year header and terminates the table. For example, aligned rows `Revenue 3000 2800`, `Cost 2025 2024`, and `Profit 975 776` produce no tables at all because the middle row splits the run into single-row fragments. Use header context or label information to distinguish year headings from body amounts instead of treating every year-shaped numeric tail as a header.
Two reproducible extraction defects silently remove genuine repeated characters and discard tables containing year-shaped financial amounts. Both affect the accuracy of the generated document data.

Full review comments:

- [P2] Require overlapping glyphs before removing duplicate text — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/extract/pdf.ts:81-81
  When a PDF represents adjacent repeated narrow glyphs as separate text items, the fake-bold filter deletes genuine characters. For example, two `1` items at x=10 and x=14, each width 4 and height 10, produce `1` instead of `11`. This silently corrupts extracted financial values. Require near-identical or substantially overlapping bounds rather than comparing origin distance against font height alone.

- [P2] Distinguish year headers from financial amounts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/extract/tables.ts:42-43
  A labeled financial row whose amounts happen to fall between 1900 and 2099 is classified as a year header and terminates the table. For example, aligned rows `Revenue 3000 2800`, `Cost 2025 2024`, and `Profit 975 776` produce no tables at all because the middle row splits the run into single-row fragments. Use header context or label information to distinguish year headings from body amounts instead of treating every year-shaped numeric tail as a header.
