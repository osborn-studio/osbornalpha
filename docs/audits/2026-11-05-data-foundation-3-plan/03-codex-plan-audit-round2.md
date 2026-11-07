Audited `ff4d290` read-only. References below use `plan:<line>` and `spec:<line>` for the supplied documents. No additional P1/P2 defect was confirmed as introduced by the round-2 diff itself; Q1–Q3 are continued-review findings.

**P verification**

| Item | Status | Verification |
|---|---|---|
| P1 | RESOLVED | Historical reads, truncation rejection, and same-filing/generation filtering added (`plan:12811–12830`). |
| P2 | RESOLVED | Restore hashes use pair-specific current right-side evidence; unavailable evidence refuses restoration (`plan:15253–15268`, `16788`). |
| P3 | RESOLVED | Evidence append now locks the pending claim and patches only `sources` (`plan:2316–2337`, `3660`). |
| P4 | RESOLVED | Hook and audit-marker writes use atomic detail patches (`plan:2344–2356`, `12745`, `12769`, `15735`). |
| P5 | RESOLVED | Accepted keys are read before evaluation; fully committed members complete without upstream reads (`plan:15793–15800`). |
| P6 | RESOLVED | Annual regimes generate annual slots and retain six applicable periods; window expanded (`plan:18630–18690`). |
| P7 | RESOLVED | Typed parser state replaces closure-mutated locals; the exact replacement parser compiles under TypeScript 5.9.3 with no diagnostics (`plan:14310`). |
| P8 | RESOLVED | Explicit nullable `SecFixture` permits string overrides (`plan:4962–4964`). |
| P9 | RESOLVED | Both calendar factories include `acceptance_source:null` (`plan:18278`, `19255`). |
| P10 | RESOLVED | Response bodies use owned typed-array copies; `sampleBytes` is explicitly widened (`plan:16437`, `17265–17266`). |
| P11 | RESOLVED | Lineage integration setup inserts `ADMIN` into `auth.users` before topology calls (`plan:17439`). |

| # | Severity | Task/Step | Finding (plan line, landed file:line) | Prescribed fix |
|---|---|---|---|---|
| Q1 | P2 | 18a Step 3, upstream coverage | **One uncovered historical period discards valid evidence for every period.** `plan:19580–19582` compares coverage against the oldest expectation, then recomputes all rows with unavailable upstream. Executing the supplied calendar block with a 20-F issuer and known 2025/2024 filings changes the 2025 row from `filed_not_ingested` to `unknown_upstream` because the six-period window reaches 2020. This contradicts `spec:494–497`. Calendar sync is a new module with no landed counterpart. | Track coverage per expected period. Preserve positive matching filing evidence, and mark only uncovered periods unavailable. Add a regression with incomplete older history and a known recent filing. |
| Q2 | P2 | 8a topology registration; 14b Step 3, `openCycle` | **Cycle creation can lose a concurrently registered merge member.** After `plan:15693` reads an old cycle’s detail, `set_merge` can append a target at `plan:9373–9381`. The stale whole-detail replacement at `plan:15705` erases that append and marks the snapshot consumed. Landed `src/lib/db/table-client.ts:103` replaces the supplied JSON value. A separate interleaving—merge after `pair.members()` but before the pending read—also gives the new target zero expected keys (`plan:15684`), allowing completion without checking its conflicts. | Make pending-member handoff atomic with merge registration; consume only transferred entries. Resolve expected keys for pending targets before freezing the cycle. Test both interleavings and crash recovery. |
| Q3 | P2 | 19a Step 5(6), imports | **The prescribed edit cannot typecheck.** `plan:20676` adds `import type {Row}`, but landed `src/lib/dq/dashboard.ts:3` already imports `Row` with `TableClient`; no preceding step removes it. Reproduced TS2300, “Duplicate identifier 'Row'.” | Reuse the existing `Row` import and add only `InputsHashNow`. |

Verdict: not ready — calendar evidence handling, merge-member handoff, and an admin compile blocker require correction