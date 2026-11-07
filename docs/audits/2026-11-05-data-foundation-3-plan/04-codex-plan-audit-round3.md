Audited `7bb6264` read-only. References use `plan:<line>` and `spec:<line>`. Findings are from static inspection; database interleavings were not executed.

**Q verification**

| Item | Status | Verification |
|---|---|---|
| Q1 | RESOLVED | `applyUpstreamCoverage` preserves positive evidence and changes only uncovered pending/overdue periods (`plan:19879–19887`). |
| Q2 | RESOLVED | Pending snapshots precede key resolution; cycle creation, cursors, and selective consumption share one transaction (`plan:15994–16007`, `10520–10569`). All three adapters are wired; memory uses the existing serialization wrapper. A separate lock-order regression remains: R1. |
| Q3 | RESOLVED | Task 19a reuses the existing `Row` import and adds only `InputsHashNow` (`plan:21024–21028`). |

**Findings**

| # | Severity | Task/Step | Finding | Prescribed fix |
|---|---|---|---|---|
| R1 | P2 | 8a / 8c, merge and cycle locks | **New diff regression: cycle creation can deadlock with a merge.** `set_merge` locks issuer rows `FOR UPDATE` before taking the cycle advisory lock (`plan:9372–9384`). `open_reconcile_cycle` takes that advisory lock first, then inserts cursors (`plan:10525`, `10548–10550`), whose issuer foreign key (`plan:1080`) requires a conflicting key-share lock. With a shared issuer, each transaction can wait for the other; PostgreSQL aborts one. The new concurrency tests pass empty member lists (`plan:10253`, `10259`), avoiding this path. | Acquire the cycle advisory lock before topology/scope/issuer locks in `set_merge`. Add a two-connection regression with a nonempty cycle containing the merge target and assert both operations complete without deadlock. |
| R2 | P2 | 4a Step 5, identifier writes | **Concurrent writes can erase another identifier’s provenance.** `plan:5286–5294` reads provenance, merges locally, then replaces the whole object. Concurrent ISIN and FIGI updates can both satisfy their separate column guards: both values survive, but the later update discards the earlier evidence. Landed `src/lib/db/table-client.ts:103` performs whole-value replacement. | Perform the guarded identifier update and provenance-key merge atomically under the security-row lock. Test concurrent ISIN/FIGI writes and an interleaving with claim resolution; require both values and evidence keys to survive. |
| R3 | P2 | 12 Steps 3–5; 14c Step 3b | **Historical SEC acceptance times are never fetched.** Both production and script wiring omit `coverFrom` (`plan:16559`, `13697`), which explicitly means main-document-only (`plan:7031–7039`). A stored filing present only in `files[]` remains `acceptance_not_found` on every rerun, despite available upstream evidence. This violates the pagination requirement in `spec:376` and prevents backfilling those rows toward E7. | Fetch pages covering pending filings in both entry points, or fetch all historical pages. Preserve each entry’s page/hash for mismatch evidence. Add a regression whose pending accession exists only in a historical page and assert acceptance is written. |

Verdict: not ready — a new merge/cycle deadlock, provenance lost updates, and missing historical acceptance fetching require correction