# Codex round-5 findings: disposition (architect decisions, 6th draft)

| # | Decision | How the 6th draft handles it |
|---|---|---|
| R5-1 abandoned dispositions lost | ACCEPT | Run-level `conflict_dispositions` removed. `publish_sync_run` derives dispositions from the open `same_day_conflict` items that reference rows of the run and quarantines every still-`ok` member, whatever run registered it; the register-abandon-retry-publish sequence is an integration test. |
| R5-2 invoker function cannot read `fact_sync_scope` | ACCEPT | New `fact_state_rev(issuer, market)` (`security definer`, stable, granted to anon) returns only the integer; `read_facts` calls it in the same statement. |
| R5-3 resolving before publication | ACCEPT | The admin route refuses `facts.*` items whose `payload.run_id` run is still `staged` (409 `run_pending`). |
| A / B / C | OWNER | §14. |
