codex
Scope reconciliation can incorrectly retire valid issuers under server-side pagination limits or overlapping runs. Both conditions need safeguards before the reconciliation is reliable.

Full review comments:

- [P2] Continue paging when the server returns a capped page — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/scope.ts:52-52
  When PostgREST's row cap is below `MAX_PAGE`, this condition treats the first capped page as the complete result. Consequently, `inScopeIssuers()` omits later research entities and reconciliation can retire their existing document scopes. The shared `selectAll()` explicitly handles this configuration by continuing until an empty page. Make this keyset reader similarly distinguish exhaustion from server-side truncation, and test it with a table client that returns fewer rows than requested.

- [P2] Guard retirement against newer scope reconciliations — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/scope.ts:147-151
  Overlapping reconciliations can retire a newly activated issuer: run A reads the cohort before the issuer enters scope, run B reads the updated cohort and activates it, then A's `scopeAll()` sees B's row and unconditionally writes priority zero. `reconcile_document_sync_scope` has no freshness guard, so this disables document scheduling until another reconciliation repairs it. Carry a source-read snapshot into a conditional database retirement, as the existing facts reconciliation does, or serialize the entire read/reconcile operation per source.
Scope reconciliation can incorrectly retire valid issuers under server-side pagination limits or overlapping runs. Both conditions need safeguards before the reconciliation is reliable.

Full review comments:

- [P2] Continue paging when the server returns a capped page — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/scope.ts:52-52
  When PostgREST's row cap is below `MAX_PAGE`, this condition treats the first capped page as the complete result. Consequently, `inScopeIssuers()` omits later research entities and reconciliation can retire their existing document scopes. The shared `selectAll()` explicitly handles this configuration by continuing until an empty page. Make this keyset reader similarly distinguish exhaustion from server-side truncation, and test it with a table client that returns fewer rows than requested.

- [P2] Guard retirement against newer scope reconciliations — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/lib/documents/scope.ts:147-151
  Overlapping reconciliations can retire a newly activated issuer: run A reads the cohort before the issuer enters scope, run B reads the updated cohort and activates it, then A's `scopeAll()` sees B's row and unconditionally writes priority zero. `reconcile_document_sync_scope` has no freshness guard, so this disables document scheduling until another reconciliation repairs it. Carry a source-read snapshot into a conditional database retirement, as the existing facts reconciliation does, or serialize the entire read/reconcile operation per source.
