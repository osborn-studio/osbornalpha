# A5 audit disposition (MiniMax `mmx`; commander verification)

mmx degenerated (46 rows, all labelled P1, several duplicated). Verified against `pg-db.ts`:
- **A5-01/A5-02 accepted, fixed**: partial upsert of institution/analyst nulled unsupplied columns; conflict update now lists only supplied columns (pg, memory, supabase) + contract case.
- **A5-17 accepted, fixed**: `hasSummary:false` now filters to reports without a public summary in all three adapters + contract case.
- All others rejected: the adapters are trusted service-role code; state machines, approvals (snippet/summary approval triggers), immutability, fences and blockers are enforced in SQL (A1/A2, tested); limits are clamped at the route (D1); public methods read only views; `listFields` superseded filter is an opt-in parameter; `insertCandidateFields`/`markSuperseded` are implemented by the `broker_extract_commit` RPC per the plan contract.
- PostgreSQL contract run (commander): 2 failures were contract assertions assuming an empty shared DB (older claim rows without `source`; fixed 10,000-row outbox limit) — corrected; A5 block 23/23.
