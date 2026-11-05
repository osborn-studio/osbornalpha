# Codex round-6 finding: disposition (7th draft)

| # | Decision | How the 7th draft handles it |
|---|---|---|
| R6-1 single-run gate bypass | ACCEPT | Resolution of `facts.*` items moves into `resolve_facts_quarantine(item, chosen)`: under the scope row lock it checks the owning runs of **all** currently referenced facts (any `staged` → `run_pending`, item status untouched), persists the decision, promotes eligible rows and bumps `state_rev`; thus a conflict can never be resolved while a contributing run is unpublished, and the publish-time disposition scan over open items stays complete. Regression sequence added to §11.2. |
| R5-3 | RESOLVED by the same function. |
| A / B / C | OWNER | §14. |
