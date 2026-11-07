Read-only static audit; no files or git state changed. Tests and PostgreSQL probes were not run. Paths below are repository-relative.

**A — `473ea9a9`**

| ID | P1/P2/P3 | file:line | defect | concrete counterexample | fix |
|---|---|---|---|---|---|
| A-01 | P1 | `src/lib/judgments/compensate.ts:110–132` | Cancellation before production starts is counted as a production failure and can permanently skip a snapshot. | The local deadline fires during `startBatch`. `produce` sees an already-aborted signal and returns zero counts plus `deadline_hit`, without `deferred`. Compensation increments `failing.attempts`; three such runs advance the marker despite no attempted production. | Recheck cancellation after batch setup; recognize skipped cancellation explicitly. Never increment failure attempts or skip an unattempted snapshot. |
| A-02 | P2 | `src/lib/judgments/produce.ts:67`; `src/lib/judgments/compensate.ts:114` | T2-03 remains incomplete: the local signal does not bound actual producer reads. | `m.gather()` never resolves. It receives no signal, `produce` awaits it, and compensation awaits `produce`; neither the 60-second nor parent deadline releases the run. | Bound cancellable read/evaluation stages and propagate cancellation to providers; continue draining/accounting writes already issued. |
| A-03 | P2 | `src/lib/judgments/register.ts:137–146` | The abort guard excludes the idempotency-conflict mutation path. | Abort during gather, then find an existing judgment with different payload: `settle(existing)` writes `dq_quarantine` before reaching the signal check. | Guard the conflict quarantine mutation too, including the unique-violation recovery path; report cancellation as deferred. |
| A-04 | P2 | `src/lib/judgments/settle.ts:377–379,438–440` | Post-claim setup failures still lose accounting and retain leases in the cron path. | Claim 16 rows, then `serverTime`, one `getJudgment`, or `settlementsOf` rejects. Per-row handlers never run; the batch has `fetched=16` but no outcomes, and leases remain until expiry. | Protect all post-claim setup; release owned rows and account each unprocessed row before finalizing. |

**Verdict A: REQUEST CHANGES.** T2-01 is partially fixed: in-flight production is awaited and successful writes retain accounting, but cancellation gaps remain. T2-03 fixes snapshot/containment waits, not producer waits. T2-04’s specified manual setup failures are fixed. T2-02 remains the accepted database-wait risk; A-02 concerns producer reads. No additional unfenced settlement write after lease loss found.

**B — `58b4d8a4`, including adaptation in `12d60c0e`**

| ID | P1/P2/P3 | file:line | defect | concrete counterexample | fix |
|---|---|---|---|---|---|
| B-01 | P2 | `src/lib/dq/judgments-resolver.ts:69–72` | Final-state rejection bypasses atomic evidence validation and audit. | Hook reads a final `void`; another admin reopens it and a worker refreshes the same open quarantine item. The hook then blindly flips that item to rejected, without voiding the reopened judgment or checking the new hash/cutoff. A crash before route audit also leaves an unaudited verdict. | Handle final-state cleanup inside a queue/item-locking RPC, validating expected evidence and current state and writing the audit atomically. |

**Verdict B: REQUEST CHANGES.** Otherwise, auth, `maxDuration=300`, repair-first ordering, preview’s no-write path, client routing, acceptance validation, and reject-only HTTP 400 mapping match the contract. Normal acceptance/rejection RPCs validate evidence identity and prevent repeated mutations. The merge preserves facts-route behavior. The integration test genuinely uses PostgreSQL adapters/RPCs with stubbed market inputs, but does not exercise production Supabase wiring or HTTP routes.