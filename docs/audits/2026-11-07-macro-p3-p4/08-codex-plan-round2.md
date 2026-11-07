Draft 2 resolves **14 of 16** round-1 findings. Two remain partial; the remaining defects are P2.

References below use line numbers from the [draft-2 plan](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/docs/superpowers/plans/2026-11-07-macro-workbench-p3-p4.md).

| Round 1 | Status | Reason |
|---|---|---|
| #1 | RESOLVED | Claim locks the run before inspecting state; finish and expiry share that lock. Concurrency tests cover both orderings. |
| #2 | RESOLVED | Events are sorted; `baseM <= lastEnd` excludes shared endpoints. |
| #3 | RESOLVED | Region/window/boundary are frozen in `params`; views and replay derive them from the manifest. |
| #4 | RESOLVED | Event evidence observations and the transition tuple are frozen, including dates, versions and availability. |
| #5 | RESOLVED | Review explanations use immutable `result_id`, including lookup and UI binding. |
| #6 | PARTIAL | Completion data survives finish failure and finalization runs in `finally`, but projection recovery is absent; completion-record failure also creates an unrecoverable bookkeeping state. See R2-1/2. |
| #7 | RESOLVED | Begin errors now record a failed payload and attempt reconciliation with the same key; they no longer immediately mark finalized. |
| #8 | RESOLVED | Exact finalization metadata is persisted and replayed without aggregation; abandoned and running rows are included. Operational defects remain below. |
| #9 | RESOLVED | Missing code version is rejected only after idempotent replay. |
| #10 | RESOLVED | Exact percentage ratios replace intermediate rounding; positive/negative boundary tests are included. |
| #11 | RESOLVED | Truncation becomes an explicit gap, history message and review facts. |
| #12 | PARTIAL | The guard detects two visible equal timestamps, but misses a tie whose first member is the page’s last item. See R2-3. |
| #13 | RESOLVED | Transition change uses the upper-bound delta; zero-direction events are excluded downstream. |
| #14 | RESOLVED | Authenticated GET invokes user-scoped expiry; failed projections permit a new request. |
| #15 | RESOLVED | Unresolved snapshot IDs invalidate regional snapshot reads and prevent comparison promotion. |
| #16 | RESOLVED | `body.facts` freezes the exact model fact list; explanation input reads that list. |

The additional `usage_audit_key = explanation_id::text` change is correct: it supplies a UUID-compatible key consistently to begin and finalize.

Only new or still-blocking defects:

1. **R2-1 — P2: Persisted completion has no projection-recovery path.**  
   **Locations:** L6870–6883, L7030–7034, L10687.  
   The injected finish-failure test deliberately leaves `state:'running', finalized:true`. POST replay only returns that projection; settlement recovery excludes finalized rows; GET eventually abandons it. A successfully paid-for response is therefore never delivered despite durable raw output.

   **Fix:** Add completion recovery independent of `finalized`: reconstruct validation/rendering from the stored manifest and versioned completion data, then retry finish without calling the provider. Persist the metadata necessary for that recovery before finish. Test finish failure → recovery → accepted/rejected projection with exactly one provider call. Ensure expiry does not discard a recoverable completion before this path runs.

2. **R2-2 — P2: The documented repair for failed `recordCompletion` is impossible through the RPCs.**  
   **Locations:** L1092, L7054, L6891–6897, L10689.  
   When recording fails but finish succeeds, the row becomes terminal with `finalize_payload=null`. The runbook requires recording a payload before marking finalized, but `macro_record_completion` rejects a first payload on terminal rows. Direct writes are revoked. If finalization also failed, the exact payload was never persisted.

   **Fix:** Make finish atomically persist the same finalization payload as a fallback, or provide an explicitly validated terminal-row repair operation. Keep existing payloads immutable. Add a test where recording fails, finish succeeds, finalization fails, and recovery subsequently settles and marks the row without recomputing pricing.

3. **R2-3 — P2: Timestamp pagination still silently skips cases.**  
   **Location:** L6631.  
   Example: a full page ends `[…, T+1, T]`, and another unseen card also has timestamp `T`. The last two visible timestamps differ, so the guard allows `before=T`; the unseen card is excluded and an empty next page leaves `incomplete:false`.

   **Fix:** Use a stable `(as_of, judgment_id)` cursor. Until available, mark completeness unproven whenever advancing past a full page using only its final timestamp, regardless of whether the previous visible item matches. Add this singleton-at-boundary fixture.

4. **R2-4 — P2: Recovery instructions depend on errors the billing wrapper never exposes.**  
   **Locations:** L10687–10688; [quota.ts:131](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9/src/lib/billing/quota.ts:131).  
   The runbook expects `finalizeUsageRun` to report `usage run not found` or `usage run finalize conflict`. It maps these to `usage_audit_unavailable` and `usage_audit_invariant`, respectively. Operators cannot perform the prescribed classification from that call’s error.

   **Fix:** Rewrite recovery around the actual wrapper errors and a service-side `usage_events` lookup by `idempotency_key`, distinguishing absent, pending and terminal rows. Alternatively, preserve structured SQL error details in an authorized billing change. Test the recovery instructions against the real wrapper, not only fake `LlmDeps`.

Static review only; implementation and database tests were not executed.

ready with P2 fixes