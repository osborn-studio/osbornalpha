# Codex 计划审计第三轮（增量，2026-11-06）

对象：计划草稿 3（`dab5ad9d`）。以下为原文。

Audited draft 3 at `dab5ad9d`. **P** denotes line numbers in `docs/superpowers/plans/2026-11-06-judgment-framework.md`.

| Prior finding | Status | Evidence |
|---|---|---|
| Q1-01 | PARTIAL | Repeated inconsistencies preserve the timestamp and expiry is inclusive, but transient errors erase incident state: P:11853–11859, 11901–11905, 11915–11920; R3-01 below. |
| Q1-02 | RESOLVED | Lease validation, quarantine upsert and queue publication share one transaction; worker uses one call: P:3802–3835, 11945–11947. |
| Q1-03 | RESOLVED | `p_expected` is compared with both locked records; the hook supplies its observed hash/cutoff: P:3924–3929, 12996–12998. |
| Q1-04 | RESOLVED | Failed units are excluded until the next round; incomplete successful finalizations remain resumable: P:15389–15393, 15423–15429. |
| Q1-05 | RESOLVED | Independent generation claim covers empty cohorts and concurrent freezes; reuse returns stored metadata: P:3956–3976. |
| Q1-06 | RESOLVED | Shared RPC inventory, updated return-status documentation and runbook checks are present: P:2531–2578, 22424–22430, 22582–22609, 22953. |
| P1-04 | RESOLVED | Acceptance revokes the lease under locks; subsequent worker quarantine publication checks that lease atomically: P:3816–3820, 3857–3876. |
| P2-02 | RESOLVED | Persisted round outcomes prevent completed or failed units from repeatedly preceding later units: P:15413–15429, 15443–15468. |

| ID | P1/P2/P3 | Task / plan line | Finding | Concrete fix |
|---|---|---|---|---|
| R3-01 | P1 | T12 P:11859, 11883–11905, 11915–11920; T3 P:3826–3828 | **Transient failures can restart an unresolved incident’s review window.** `failed()` replaces `last_status/detail` with `error/{code,message}`, discarding `quarantined_at` and the incident identity. The next inconsistency starts a new window because preservation requires `last_status === 'inconsistent'`. Extracted-code reproduction: first quarantine March 10, `settle_by` March 20, resolver failure March 17, same inconsistency March 18 → deadline moves from March 20 to March 25. Pending/unavailable transitions also discard this state. This violates spec §5.4’s rule that only resolution/rejection/reopening starts a new incident. | Preserve unresolved-incident identity and first-quarantine time independently of transient attempt status. Make deadline checks and SQL preservation use that incident state. Add inconsistency → error/pending/unavailable → same inconsistency tests, including expiry at the original deadline. |
| R3-02 | P2 | T16 P:14875–14878, 14993–15015 | **The new starvation regression test fails because its UUID generator resets between invocations.** Each `deps()` call restarts `u=0`. Run 1 leaves the failed `all` generation claimed; run 2 gives the market unit that same UUID, producing `generation_reused` and `['market','failed']` instead of the asserted `['market','inserted']`. | Keep the UUID sequence across invocations of one fixture, or inject `randomUUID`. Retain the explicit reuse test’s fixed UUID. Moving the counter outside `deps()` in memory made all four selected scheduling/reuse tests pass. |

Verification was read-only:

- Shared `types.ts` copies are byte-identical; selected changed TypeScript snippets produced no type-check diagnostics.
- Isolated execution reproduced both findings. Both runbook inventory tests passed.
- Static inspection found no additional SQL syntax, signature/grant, adapter-consumer or coordination-fence defect in the reviewed additions.
- PostgreSQL migrations and the full integrated suite were **not executed**.

**Verdict: not ready. Blocking IDs: R3-01, R3-02.**