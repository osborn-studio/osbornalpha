Read-only review of `d7895e4b`. In-memory fault-injection reproductions confirmed the defects below; no files changed. SQL privileges and lease predicates were inspected, not executed against PostgreSQL.

| ID | CLOSED? | note |
|---|---|---|
| T7-01 / original review | CLOSED | Poll window persists before listing. Existing `seq=99` advanced to `100`; no checkpoint regression reproduced. |
| T7-02 | CLOSED | Renewal requires the current holder and an unexpired lease. Memory matches SQL; pg/Supabase call that RPC. SQL revokes PUBLIC/anon/authenticated execution and grants service_role. |
| T7-03 | CLOSED | Release-time `lease_lost` now fails the issuer and prevents freshness success. |
| T7-04 | NOT CLOSED | Ordinary/`unknown` database failures propagate, but release failures remain swallowed and other database codes can become item failures. See N1/N3. |
| T7-05 | CLOSED | Version pagination is drained before duplicate detection. |
| Opus: deterministic item errors | NOT CLOSED | Conflict quarantine works only when insertion is reached; equal-hash conflicts bypass it. Error classification is also too broad. See N1/N4. |
| Opus: deadline guard / MIN_ITEM_MS | CLOSED | Guards precede listing and item processing; budget exhaustion avoids consuming attempts. |
| Opus: coverage-gap / quarantine skips | NOT CLOSED | Settled refs survive restart, but quarantine resolution cannot reactivate them. See N2. |
| Opus: duplicates before put | CLOSED | Matching hashes avoid object writes and asset fetching. Ownership validation still needs N4. |
| Opus: 404 refs | CLOSED | Summary includes refs, capped at 50. |
| Opus: tests | NOT CLOSED | Regression tests were added, but omit the reproduced failure paths below. |
| Adapter rejected rows | CLOSED | Rejections produce `document_url_rejected` quarantine entries and receipt errors. |

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P1 | `src/lib/documents/sync.ts:300` | **Database integrity failures consume document attempts and advance past unstored evidence.** Every `DocumentsDbError` except `unknown`/`lease_lost` is treated as item-local. The shared mapper converts SQLSTATE `23503` into `invalid_input`, including a batch foreign-key failure unrelated to document validity. Injecting that mapped failure consumed attempts 1/2; run 3 quarantined the document and advanced to the next segment with zero stored documents. | Preserve database error provenance and explicitly allowlist item-local validation failures. Infrastructure, batch, query, and cursor failures must reject without consuming attempts or settling the ref. |
| N2 | P1 | `src/lib/documents/sync.ts:290` | **Resolved quarantines remain permanently skipped during coverage-gap restarts.** `already_quarantined` adds the ref to `settled`; line 287 skips it before checking current quarantine status, and line 335 preserves it across restarts. Reproduced: open quarantine → sync → `resolved_accept` → sync still yielded zero fetches/documents and retained the ref in `settled`. | Separate quarantine-dependent skips from terminal settlements; recheck quarantine status on replay and retry accepted/resolved items. Test resolution after both quarantine creation and `already_quarantined` skipping. |
| N3 | P2 | `src/lib/documents/sync.ts:130` | **Release infrastructure failures still report issuer success and fresh data.** Throwing `DocumentsDbError('unknown', 'database unavailable')` from release resolved normally with issuer `success`, batch `partial`, freshness `fresh`, and `consecutive_errors=0`. | Propagate non-lease release failures into the infrastructure cleanup/rethrow path; do not increment issuer success or refresh freshness. |
| N4 | P2 | `src/lib/documents/sync.ts:211` | **Early duplicate detection bypasses issuer ownership validation.** A matching hash belonging to another issuer returns `stored:true` before insertion can raise the ownership conflict. Reproduced: the second issuer reported three duplicates and success, with zero owned documents and zero conflict quarantines. | Check version ownership before hash matching, including dry-run, and quarantine `document_ref_conflict` regardless of whether bytes match. |

A transient database error mapped to `unknown` during `documentVersions` correctly rejected with no attempts or quarantine. N1 concerns database failures mapped to other codes, rather than all transient errors.

VERDICT: fail (2 P1, 2 P2)