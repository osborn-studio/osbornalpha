codex
An unfinished poll can advance its effective window without saving a resume cursor, causing permanent document omissions when listing exhausts the budget before processing begins.

Review comment:

- [P1] Persist the poll window before releasing an unfinished run — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/sync.ts:235-238
  If a fresh poll's listing consumes the item budget before the first item starts, `dirty` is still false, so `persist()` writes no cursor. Releasing with `success` then updates `last_success_at`. On the next run, `pollSegment()` derives its start from that new timestamp instead of the unfinished window, permanently skipping unprocessed documents older than the one-day overlap (for example, after several days of downtime). Persist the active segment even when no item has advanced before releasing an unfinished poll.
An unfinished poll can advance its effective window without saving a resume cursor, causing permanent document omissions when listing exhausts the budget before processing begins.

Review comment:

- [P1] Persist the poll window before releasing an unfinished run — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/sync.ts:235-238
  If a fresh poll's listing consumes the item budget before the first item starts, `dirty` is still false, so `persist()` writes no cursor. Releasing with `success` then updates `last_success_at`. On the next run, `pollSegment()` derives its start from that new timestamp instead of the unfinished window, permanently skipping unprocessed documents older than the one-day overlap (for example, after several days of downtime). Persist the active segment even when no item has advanced before releasing an unfinished poll.
