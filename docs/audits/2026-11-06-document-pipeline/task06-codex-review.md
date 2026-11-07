codex
The adapters can silently omit default EDGAR filings and interpret malformed CNINFO responses as complete results. Both issues undermine collection completeness.

Full review comments:

- [P2] Add requested EDGAR forms to the default set — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/sources/edgar.ts:36-36
  When `forms` is supplied, it replaces all default forms rather than extending them as documented in §6.2 and the constant's comment. For example, `{forms:['4']}` silently excludes every 10-K and 10-Q. Build the set from both `EDGAR_DOC_FORMS` and the requested additions so enabling extra forms does not disable normal report collection.

- [P2] Reject CNINFO responses missing the announcements field — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/sources/cninfo.ts:50-52
  An HTTP-200 JSON error response or changed response shape such as `{}` passes this validation and becomes a successful empty list. If this happens on a later page, the adapter instead returns a truncated list as complete. Require the expected response shape, while preserving explicitly supported empty-result representations, and throw `layout_changed` rather than silently treating a missing field as no announcements.
The adapters can silently omit default EDGAR filings and interpret malformed CNINFO responses as complete results. Both issues undermine collection completeness.

Full review comments:

- [P2] Add requested EDGAR forms to the default set — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/sources/edgar.ts:36-36
  When `forms` is supplied, it replaces all default forms rather than extending them as documented in §6.2 and the constant's comment. For example, `{forms:['4']}` silently excludes every 10-K and 10-Q. Build the set from both `EDGAR_DOC_FORMS` and the requested additions so enabling extra forms does not disable normal report collection.

- [P2] Reject CNINFO responses missing the announcements field — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/sources/cninfo.ts:50-52
  An HTTP-200 JSON error response or changed response shape such as `{}` passes this validation and becomes a successful empty list. If this happens on a later page, the adapter instead returns a truncated list as complete. Require the expected response shape, while preserving explicitly supported empty-result representations, and throw `layout_changed` rather than silently treating a missing field as no announcements.
