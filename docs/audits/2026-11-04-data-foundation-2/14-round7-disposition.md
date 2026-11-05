# Codex round-7 finding: disposition (8th draft)

| # | Decision | How the 8th draft handles it |
|---|---|---|
| R7-1 resolver blocked by its own open item | ACCEPT | `resolve_facts_quarantine(item, chosen, resolved_by)` performs the status transition, the persisted decision, the eligibility checks (treating the resolving item as closed) and the promotion in one transaction under the scope row lock; the route no longer flips `facts.*` items itself. Regression assertion added to §11.2. |
| R6-1 remainder (membership merges outside the lock) | ACCEPT | `quarantine_facts(run, fact_ids, item_id)` appends members to the item's payload inside the same locked transaction; `TableClient.update` is no longer used for membership. |
| A / B / C | OWNER | §14. |
