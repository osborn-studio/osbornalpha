**Verdict: not ready for execution**

Locations refer to draft 2 at `aee2f05`, verified against task code.

| Round-1 item | Status | Where |
|---|---|---|
| P1-1 | CLOSED | T1 L1083–1086 requires evaluated cases; T14 L12043–12052 distinguishes unavailable samples from missing system values. |
| P1-2 | CLOSED | T12 L10236–10279 authenticates fixtures; T14 L12178–12217 derives membership, thresholds, readiness and retractions. |
| P1-3 | PARTIAL | T12 L10210–10217 and L10800–10834 reads committed bytes and checks ancestry/CI identity. Offline verification still returns success; R2-1. |
| P1-4 | CLOSED | T12 L10383–10389 recomputes freshness at `prepared_at` using landed `computeFreshness`. |
| P1-5 | CLOSED | T11 L8234–8236 requires `matchLedger` on the shared `observedDiffOf` contract. |
| P1-6 | CLOSED | T9 L6184–6197 verifies every setup before grouping; T11 L8316–8321 verifies before recording-cache lookup. |
| P1-7 | CLOSED | T4 L3138–3154 checks HEAD and working-tree status independently; T11 L8364 rejects dirty recording, L8501–8535 commits before recording/rechecking. |
| P1-8 | CLOSED | T8 L5702–5708 verifies sources for absence expectations; L5786–5792 derives verification flags. Separate metric regression: R2-3. |
| P1-9 | CLOSED | T12 L9525–9549 matches dispositions by round and ID and rejects ambiguous reuse. |
| P1-10 | CLOSED | T11 L8598–8607 writes the real database replay report; L8663–8678 requires a report and publishes its digest. |
| P2-1 | PARTIAL | T9 L6298–6312 rejects conflicting setups and initially populated issuers, but same-setup reuse bypasses state checks; R2-2. |
| P2-2 | CLOSED | T14 L12186–12197 excludes fixture-designated canaries; T12 L10078–10084 tests the actual reference result through manifest validation. |
| P2-3 | CLOSED | T2 L1417–1442 enforces `review_required` and distinct reviewers; T12 L10249–10250 checks release evidence. |
| P2-4 | PARTIAL | Ownership boundary L19 and T16 L12985–12988 authorize spec edits; T12 L9557–9559 defers the foreign audit index. Declined scratch-root portion not reconsidered. |
| P2-5 | CLOSED | T15 L12901–12906 excludes ineligible forecasts from population while retaining skipped counts. |

| # | Severity | Task / plan line | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| R2-1 | P1 | T12 L10321–10325, L10906–10911; T3 L2763, L2827–2828 | **Unverified CI evidence still produces a successful manifest validation.** | Without `--online`, CI verification only appends `manifest_ci_unverified` to notices. The CLI computes `ok` from findings alone, then returns exit 0. The test at L10070 explicitly expects no findings offline. Thus a nonexistent, failed or wrong-SHA run in the correct repository can satisfy the automated gate. | Make unperformed mandatory CI verification prevent success. Preserve notices for diagnostics, but return nonzero/incomplete offline. Add a CLI-level test asserting `ok:false` and nonzero exit. |
| R2-2 | P2 | T9 L6303–6312; T11 L8587–8604 | **The new isolation guard treats a previous build as proof that database state remains unchanged.** | `builds.some(b=>b.setup===setup.setup_sha256)` returns before any database inspection. Executing the extracted guard accepted the same setup after simulated database mutation, performing **zero database checks**. The plan itself mutates ZZEVC after the base build (L7064, L7077), then reuses that setup for frozen evidence. Restricting current replay requests to A/B masks the contaminated setup rather than enforcing its declared state. | Use an isolated database per frozen build, or verify the complete relevant state before reuse. Test build → amendment/quarantine mutation → rebuild of the **same** setup, including a projection of the affected issuer. |
| R2-3 | P2 | T8 L5786–5792; T7 L4987–4994; T12 L10301–10302 | **The new verification aggregation makes valid metric artifact evidence impossible.** | Metric provenance returns verified `input_chains`, with no top-level `object_path`; T8 moves those chains into `detail.inputs` (L5730–5731). `verifiedOf` nevertheless requires a top-level path for every non-absence case. Executing it with a passing metric and verified input paths returned `{artifacts:false,sources:true}`, causing `manifest_unverified`. | Make artifact verification support derived metrics: require complete, nonempty verified input chains, including each input’s object path. Add an adapter → official report → manifest regression test. |

Read-only review. The guard and metric-aggregation counterexamples were executed in memory; full implementation/database suites were not run. No files were modified.