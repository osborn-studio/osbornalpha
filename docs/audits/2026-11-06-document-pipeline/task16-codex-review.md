codex
An initialization failure for one issuer aborts the entire promotion loop and loses receipts for already-published work. The error path also leaves the CLI's batch unfinished.

Review comment:

- [P2] Preserve issuer outcomes when a later issuer fails initialization — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/promote.ts:92-92
  If an issuer lookup, `ensureHkScope`, or `claimLease` throws, those calls are outside `promoteIssuer`'s error handling, so this await rejects the entire synchronization and discards outcomes already accumulated for earlier, successfully published issuers. `runDocumentsCandidates` consequently records only `promote_failed`, omitting the published facts from its counts, and skips all remaining issuers; the CLI exits without finishing its batch. Catch initialization failures per issuer and return a failed outcome so completed work remains accounted for and subsequent issuers can proceed.
An initialization failure for one issuer aborts the entire promotion loop and loses receipts for already-published work. The error path also leaves the CLI's batch unfinished.

Review comment:

- [P2] Preserve issuer outcomes when a later issuer fails initialization — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/hk-facts/promote.ts:92-92
  If an issuer lookup, `ensureHkScope`, or `claimLease` throws, those calls are outside `promoteIssuer`'s error handling, so this await rejects the entire synchronization and discards outcomes already accumulated for earlier, successfully published issuers. `runDocumentsCandidates` consequently records only `promote_failed`, omitting the published facts from its counts, and skips all remaining issuers; the CLI exits without finishing its batch. Catch initialization failures per issuer and return a failed outcome so completed work remains accounted for and subsequent issuers can proceed.
