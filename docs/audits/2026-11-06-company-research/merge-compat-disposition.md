# Landed plan 3 compatibility review

Compared against local src/app/api/facts/[ticker]/metrics/route.ts, src/app/api/facts/[ticker]/route.ts, and src/lib/facts/{db,types,public-route}.ts.

1. **mirrors landed** — row based_on_lineage is the complete stateRevs vector, including target; comparing before/after plus each row requires no separate target guard.
2. **mirrors landed** — membership uses join(','); lineageOf returns target first and predecessors ordered by issuer_id, while revision-vector equality is order independent.
3. **mirrors landed** — separate lineageOf/stateRevs reads before and after are the landed protocol; restored the missing conflict-envelope read inside that bracket and tested revision movement during it.
4. **mirrors landed** — tickerAsOf selects historical ownership independently of fact asOf; keep acceptance across company routes as requested.
5. **mirrors landed** — readParams validates allowed names and duplicates, tickerAsOfParam validates dates; preserve shared company acceptance and existing invalid/duplicate tests.
6. **mirrors landed** — stateRevs(issuers, market) calls read_facts_lineage with that market and returns canonical LineageRev[] from state_revs.
7. **mirrors landed** — a single-member lineage is valid for an issuer without predecessors; documented this fixture simplification explicitly; merged-member tests supply [TARGET, OLD].
8. **mirrors landed** — lineageRevsEqual compares sorted full issuer=revision sequences, so missing, extra and duplicate entries differ; retain the landed helper.
9. **mirrors landed** — retain ordered membership comparison; existing tests cover membership, predecessor revision and target revision changes.
10. **mirrors landed** — adapter canonicalizes vectors; equality of before/after makes comparison against before sufficient; no extra proxy-only malformed-vector policy.

Additional fixes: replay now uses readFactsLineage + deriveLineageMetrics with envelope stateRevs; the gate accepts predecessor facts, loads member filings, and resolves evidence/PDF locators per member. computedAt compares full lineage vectors. Metrics expose lineage, resolution, basedOnLineage and publicConflict metadata. publicConflict contains only keys/date/IDs (no financial values); metric values still pass through gateCell. Client DTO additions are optional for compatibility. UTC-date route tests use a fixed clock.

Regression coverage includes real-gate predecessor inputs for replay/materialized metrics, predecessor-owned filings, per-member CN locators, computedAt vector mismatch/order, conflict metadata and conflict-read races. Out-of-scope single-issuer snapshot consumers are recorded in the implementation log.
