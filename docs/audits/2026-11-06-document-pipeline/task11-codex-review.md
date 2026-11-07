codex
The routes mishandle a malformed pagination cursor and misreport extraction setup failures. Both issues have concrete error paths in the existing database and extraction implementations.

Full review comments:

- [P2] Return 400 for structurally invalid extraction cursors — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/route.ts:22-22
  For an existing public document, `extractionsCursor=WyJ4Il0` (base64url for `["x"]`) passes `cursorParam` but fails `timestampUuidCursor` inside `db.extractionsOf`. This catch converts the resulting `DocumentsDbError('invalid_input')` into HTTP 500 rather than the documented 400. Validate the timestamp/UUID cursor shape or map this database error to `invalid_parameter:extractionsCursor`, and add a regression test using a decodable but invalid cursor.

- [P2] Preserve extraction setup failures in the reprocess response — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/app/api/admin/documents/[id]/reprocess/route.ts:39-40
  When extraction is enabled but its worker bundle is missing, `runDocumentsExtract` returns a failed receipt with `errors: [{code: 'worker_missing', ...}]` and no documents. This branch instead reports `skipped/not_due`, hiding the deployment failure from the administrator even though the requested document was reset to `stored`. Inspect the receipt status/errors before treating an empty document list as `not_due`, and return the setup failure code.
The routes mishandle a malformed pagination cursor and misreport extraction setup failures. Both issues have concrete error paths in the existing database and extraction implementations.

Full review comments:

- [P2] Return 400 for structurally invalid extraction cursors — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/route.ts:22-22
  For an existing public document, `extractionsCursor=WyJ4Il0` (base64url for `["x"]`) passes `cursorParam` but fails `timestampUuidCursor` inside `db.extractionsOf`. This catch converts the resulting `DocumentsDbError('invalid_input')` into HTTP 500 rather than the documented 400. Validate the timestamp/UUID cursor shape or map this database error to `invalid_parameter:extractionsCursor`, and add a regression test using a decodable but invalid cursor.

- [P2] Preserve extraction setup failures in the reprocess response — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/app/api/admin/documents/[id]/reprocess/route.ts:39-40
  When extraction is enabled but its worker bundle is missing, `runDocumentsExtract` returns a failed receipt with `errors: [{code: 'worker_missing', ...}]` and no documents. This branch instead reports `skipped/not_due`, hiding the deployment failure from the administrator even though the requested document was reset to `stored`. Inspect the receipt status/errors before treating an empty document list as `not_due`, and return the setup failure code.
