# Codex 计划审计第二轮（增量，2026-11-06）

对象：计划草稿 2（`bc9f9563`）。提示词 `.claude/scratch/codex-plan-r2.md`（未提交）。以下为原文。

**Verdict: not ready. Blocking IDs: Q1-01, Q1-02, Q1-03.**

References use **P** = [draft-2 plan](docs/superpowers/plans/2026-11-06-judgment-framework.md), at commit `bc9f9563`. Line numbers refer to that draft.

| Round-1 ID | Status | Evidence |
|---|---|---|
| P1-01 | RESOLVED | Union narrowing and explicit evidence casts remove the reported TypeScript errors; checked against the extracted task implementations and tests. P:22286 records the changes. |
| P1-02 | RESOLVED | `pageAll` advances by returned count; calibration paging stops only on an empty page. P:4959–4965, 14813–14827. |
| P1-03 | RESOLVED | Vintage timing applies before override use; overrides must match `settle_by`. P:11430–11438, 11478–11479. |
| P1-04 | PARTIAL | Acceptance revokes the lease under locks, but worker-side quarantine refresh remains outside that transaction and lease check. P:3623–3660, 11549–11554; Q1-02. |
| P1-05 | RESOLVED | Rejection now appends, closes the item, and audits within one RPC transaction. P:3671–3708. A distinct stale-request defect remains below. |
| P1-06 | RESOLVED | Ordinary results freeze operands; ambiguous candidates include the counterpart; overrides rederive operands and recompute ratios. P:10468–10525. |
| P1-07 | RESOLVED | Bars require session-close availability; facts use the fully elapsed UTC date; settlement checks observation cutoff. P:9940–9944, 10421–10424, 11485–11490. |
| P1-08 | RESOLVED | Missing system timestamps now cause abstention rather than invented historical availability. P:7707–7715, 7736–7743. |
| P1-09 | RESOLVED | Settled price windows use frozen `realized.to`. P:13922–13939. |
| P1-10 | RESOLVED | One `INSERT … SELECT` freezes membership and selected settlement IDs; pagination reads that set. P:3714–3756. |
| P2-01 | RESOLVED | Direct RLS-respecting envelope lookup replaces bounded history scanning; settlement history pages until empty. P:3361–3376, 16538, 17155–17161. |
| P2-02 | PARTIAL | Round state prevents ordinary restarts, but failed units retaining generation state bypass `done`. P:14904–14940; Q1-04. |
| P2-03 | RESOLVED | UUID helper is F4-local, with consumers redirected. P:22298. |
| P3-01 | RESOLVED | All three trigger functions explicitly revoke client execution privileges. P:2301–2304. |

| ID | P1/P2/P3 | Task / plan line | Finding | Concrete fix |
|---|---|---|---|---|
| Q1-01 | P1 | T12 P:11462–11468, 11505–11510 | **The review deadline can move indefinitely.** At exactly the deadline, `now > reviewDeadline(q)` is false; resolving the same inconsistency again overwrites `quarantined_at` and schedules another seven days. Extracted-code reproduction: March 25 deadline becomes April 1. The new test skips directly from day 6 to day 8, missing this boundary. | Preserve the original quarantine timestamp for the same unresolved incident. Define expiry consistently at the boundary, or schedule strictly after it. Test the exact deadline and repeated identical inconsistencies. |
| Q1-02 | P1 | T12 P:11549–11554; T3 P:3645–3653 | **A stale worker can still corrupt the quarantine/queue pairing.** Payload refresh occurs before lease validation in a separate write. An expired worker can overwrite a newer worker’s open-item payload, then receive `lease_lost`; the queue retains the newer hash while the item retains the older hash. A crash between refresh and release causes the same split. Acceptance then reports stale indefinitely. | Publish quarantine payload and queue state through one lease-checked transaction, locking queue then item. Test an expired worker refreshing after its replacement and failure between the two current writes. |
| Q1-03 | P1 | T14 P:12538–12541, 12574–12577; T3 P:3694–3700 | **Rejection is atomic but not bound to the evidence being rejected.** The hook reads hash A; a worker refreshes both queue and item to B; the RPC checks only that current queue and item agree, then accepts the old request and records a void whose evidence still names A. | Pass an expected incident identity/hash and cutoff to rejection; compare them with both locked records before appending. Return `stale` on mismatch. Add a hook-read → refresh → reject race test. |
| Q1-04 | P2 | T16 P:14904–14940, 14975–14980 | **Failed generations can still starve later units.** Failure marks the job done, but leaves its state intact. `planRound` unconditionally places every unfinished generation first, including those already done for this round. A slow, consistently failing first unit can consume every invocation. | Distinguish failed/deferred-to-next-round generations from resumable work. Exclude failed-done units until the round advances, while retaining recovery for successful inserts whose clear failed. Test repeated budget-consuming failure with a later unit. |
| Q1-05 | P2 | T3 P:3722–3735; T4 P:5337–5342 | **An empty generation is not actually frozen against reuse.** “Already frozen” is detected through member-row existence/positive length. Freeze zero members, register a judgment, then freeze the same generation again: its membership changes rather than returning the documented error. | Persist a generation marker independently of member count, with an atomic uniqueness claim. Test empty-generation reuse and concurrent freezes of one generation. |
| Q1-06 | P3 | Coordination appendix P:22405; T22 P:21937, 22019–22042 | **Some downstream contract documentation remains stale.** The appendix still instructs implementations to throw `item_not_open`, although the shared contract now returns it. The runbook’s RPC inventory/checks omit newly introduced RPCs. | Update these consumers to the return-status contract and complete RPC inventory; derive privilege assertions from one authoritative list. |

The skeleton and Task 1 `types.ts` blocks are **byte-identical**. The new RPCs have explicit execution grants/revocations, and the ninth table receives service-only read access. Static inspection found no additional PostgreSQL-17/search-path defect in those additions.

Verification was read-only: repository/spec comparison, in-memory TypeScript checking, and an isolated execution of the review-deadline logic. PostgreSQL migrations and the integrated test suite were **not executed**; their passing status is not established. No files changed.