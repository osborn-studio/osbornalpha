# A4 audit disposition (MiniMax `mmx`; commander verification)

26 items (5 P1, 21 P2), prose format. Verified against `db.ts` / memory implementation; none accepted:
- #1 canonicalJson: default `sort()` is UTF-16 code-unit order (the contract); tested.
- #2 containment: `contains('target_facets', JSON.stringify([facet]))` sends a jsonb literal — correct for jsonb (an array argument would be a PG array literal).
- #3 cursor: `published_date < c or (= c and report_id < id)` with matching order — correct.
- #4 public bundle reads only public views (licence gate inside the view).
- #5 the adapter is constructed with service-role or anon clients by the caller (plan convention); anon has no base-table grants.
- #8 confirmLicence is one CAS update `where version = $v`; the second read only distinguishes not_found from mismatch.
- #6, #7, #9–#26: either enforced in SQL triggers/functions (state machines, approvals, blockers, typed payloads), deferred to the services that own them (C-tasks), by-design memory simplifications documented in its header, or covered by the A5 pg contract run.
