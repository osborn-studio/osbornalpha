# Codex round-4 findings: disposition (architect decisions, 5th draft)

| # | Decision | How the 5th draft handles it |
|---|---|---|
| R4-1 abandonment order vs trigger | ACCEPT | `begin_sync_run` / `abandon_sync_run`: mark `abandoned` first, then delete facts; abandoning a published run raises `run_published`. |
| R4-2 public rows changed before publish | ACCEPT | Conflict dispositions are recorded on the run (`fact_sync_runs.conflict_dispositions`) and applied only inside `publish_sync_run`; abandoning leaves published rows unchanged. `conflict_quarantine` RPC removed. |
| R4-3 conflict state lost | ACCEPT | A (K, date) with an open `same_day_conflict` item is "contested"; later arrivals join the group (quarantined + merged into the item), whatever their value. |
| R4-4 promotion eligibility and binding decision | ACCEPT | `promote_quarantined` requires: run published, mapping generation active, no open conflict on the K/date, membership in `detail.chosen_fact_ids` of any resolved conflict item that references the row, no other open item referencing it. `chosen_fact_ids` persisted before promotion; acknowledgement stores `[]`. |
| R4-5 PostgREST `max_rows` truncation | ACCEPT | `read_facts` returns one `jsonb` envelope `{state_rev, rows, truncated, row_count}`; planning and materialization refuse on `truncated` (`read_truncated`). Verified `supabase/config.toml` `max_rows = 1000`. |
| R4-6 freshness token | ACCEPT | `fact_sync_scope.state_rev` incremented by `publish_sync_run` and `promote_quarantined` under the scope row lock; `read_facts` returns it in the same snapshot; `replace_financial_metrics(…, based_on_rev, …)` compares under the same lock. Metrics column `based_on_rev`. |
| R4-7 scope write path | ACCEPT | `reconcile_fact_sync_scope` RPC (lease-independent, service role, touches only `reasons/priority/fetch_key`, inserts new rows); exceptions to the write-function precondition listed in §4.5/§4.7. |
| N14 revision compatibility | ACCEPT (tightened) | Differencing only when both operands' current disclosures come from the same filing, or both sequences are unrevised; otherwise omitted. |
| N11 correction identity | OPEN (verify) | Title matching stays best-effort; identity of correction documents is recorded in §15 for the token-holding verification step. |
| N12 date-boundary refresh | ACCEPT (clarified) | No future-dated facts exist (available_date ≤ today by construction); materialization happens on publish and promotion only. |
| N20 db/materialization deadlines | ACCEPT WITH LIMIT | DB statements are bounded by the platform statement timeout, not by the sync budget; cut-off runs are abandoned by the next holder. |
| R3-4 linking exemption | ACCEPT (documented) | Explicit column-level exception; it cannot change fact visibility or `mapping_gen`. |
| A / B / C | OWNER | §14. |
