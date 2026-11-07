codex
The extraction CLI can attribute stale-worker results to current code, undermining reproducibility. The scheduler also leaves unfinished batch records and misses freshness failures when document selection throws.

Full review comments:

- [P2] Finalize the batch when selecting due documents fails — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:109-109
  If `storedDue()` or an explicit `documentById()` lookup rejects after `startBatch()` succeeds, the exception escapes without finishing the batch or recording a failed freshness attempt. A transient RPC failure therefore leaves a permanently `running` receipt and does not increment freshness errors. Wrap the post-start work in an outer error handler that attempts both cleanup operations before rethrowing, as the existing document-sync runner does.

- [P2] Rebuild or validate an existing extraction worker before use — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/scripts/documents/extract.ts:44-44
  When a checkout already has a worker bundle and subsequently updates extraction code, this CLI silently reuses the old bundle. Unlike `npm run build` or `npm run dev`, direct invocation does not run the build lifecycle hooks. Consequently, `--apply` can persist results from an obsolete extractor while labeling them with the current checkout's code version and extractor version. Rebuild before running, or verify a source/version fingerprint before accepting the existing bundle.
The extraction CLI can attribute stale-worker results to current code, undermining reproducibility. The scheduler also leaves unfinished batch records and misses freshness failures when document selection throws.

Full review comments:

- [P2] Finalize the batch when selecting due documents fails — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:109-109
  If `storedDue()` or an explicit `documentById()` lookup rejects after `startBatch()` succeeds, the exception escapes without finishing the batch or recording a failed freshness attempt. A transient RPC failure therefore leaves a permanently `running` receipt and does not increment freshness errors. Wrap the post-start work in an outer error handler that attempts both cleanup operations before rethrowing, as the existing document-sync runner does.

- [P2] Rebuild or validate an existing extraction worker before use — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/scripts/documents/extract.ts:44-44
  When a checkout already has a worker bundle and subsequently updates extraction code, this CLI silently reuses the old bundle. Unlike `npm run build` or `npm run dev`, direct invocation does not run the build lifecycle hooks. Consequently, `--apply` can persist results from an obsolete extractor while labeling them with the current checkout's code version and extractor version. Rebuild before running, or verify a source/version fingerprint before accepting the existing bundle.
