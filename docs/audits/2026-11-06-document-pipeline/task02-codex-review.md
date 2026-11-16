codex
The adapters disagree on transactional behavior in failure cases. Chunked check writes can leave partially confirmed candidates that prevent retries, while failed memory scope reconciliation can retain changes that PostgreSQL would roll back.

Full review comments:

- [P2] Preserve atomicity when writing candidate checks — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/db.ts:210-212
  For more than 500 checks, each chunk commits independently. If a later chunk fails, earlier chunks can already have inherited human decisions and changed candidates to `confirmed`; retrying the original call then fails with `decided` in `write_candidate_checks`. The memory implementation instead validates the whole input before writing, so contract tests conceal this production-only partial-commit behavior. Submit the checks in one transaction, or provide explicit resumable semantics that safely handle already-committed chunks.

- [P2] Validate all scope rows before mutating the memory store — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/memory-documents-db.ts:130-135
  When a reconciliation input contains a valid row followed by a row with an empty `fetch_key`, this loop persists the first row and then throws `invalid_input`. The PostgreSQL implementation executes a single INSERT statement and rolls back the entire call on that constraint violation. Validate the complete input before applying changes so failed reconciliation calls leave the memory adapter unchanged and tests exercise the same rollback behavior as production.
The adapters disagree on transactional behavior in failure cases. Chunked check writes can leave partially confirmed candidates that prevent retries, while failed memory scope reconciliation can retain changes that PostgreSQL would roll back.

Full review comments:

- [P2] Preserve atomicity when writing candidate checks — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/db.ts:210-212
  For more than 500 checks, each chunk commits independently. If a later chunk fails, earlier chunks can already have inherited human decisions and changed candidates to `confirmed`; retrying the original call then fails with `decided` in `write_candidate_checks`. The memory implementation instead validates the whole input before writing, so contract tests conceal this production-only partial-commit behavior. Submit the checks in one transaction, or provide explicit resumable semantics that safely handle already-committed chunks.

- [P2] Validate all scope rows before mutating the memory store — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/memory-documents-db.ts:130-135
  When a reconciliation input contains a valid row followed by a row with an empty `fetch_key`, this loop persists the first row and then throws `invalid_input`. The PostgreSQL implementation executes a single INSERT statement and rolls back the entire call on that constraint violation. Validate the complete input before applying changes so failed reconciliation calls leave the memory adapter unchanged and tests exercise the same rollback behavior as production.
