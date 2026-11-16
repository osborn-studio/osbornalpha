# Wave219 production recovery and acceptance

At 12:06 UTC on November 9, 2026, both production domains returned runtime `bffe600bca13b5f27b2ca2898f7dff7e4b4cb046`. Main at `ff5cdb65a5015c7fb28a5b640c83cc439413f9bd` added only the Wave215 documentation. All 12 public checks passed within their recorded scope. Chrome stopped at `cgWindowNotFound`, so authenticated acceptance of the deployed NOAH Overview explanation and SIC3571 desktop spacing remains open. [Machine receipt](2026-11-09-wave219-recovery.json) · [Wave215 closeout](2026-11-09-wave215-closeout.md)

- NOAH Overview returned the four expected `multiple_units` explanations. Annual Statements returned eight periods, seven rows and 56 evidence entries. The SIC3571 response included SMCI's USD revenue evidence for the period ending June 30, 2026.
- The three targeted A-share overviews resolved the expected issuer identities. Coverage and latest facts were absent, and the public CN directory returned zero rows.
- Before the AAPL recovery attempt, the public coverage period was October 23, 2026, while its latest filing period was September 26. Company-events freshness reported `error`.

## AAPL recovery

The read-only dry run planned one US stream at revision 1. It built 3,000 evidence rows from 3,000 facts, derived 236 events and planned coverage through September 26, 2026 across 44 filings.

One guarded apply on the deployed revision succeeded. Batch `f0d5a671-59b2-468a-aa2b-9dbc1dfe2599` recorded attempt 3 at revision 1, with 3,000 evidence rows and 236 event upserts. Event content was unchanged. There was no retry. Client-observed timings were 11.623 seconds for evidence replacement, 3.205 seconds for digest replacement and 23.645 seconds end to end.

Database readback showed the successful attempt, 3,000 evidence rows and coverage rebuilt at 12:13:33.638 UTC, with the period changing from October 23 to September 26. Global company-events freshness stayed in error. A 12:16 UTC readback identified the one remaining failed stream as POOL US.

The public Overview with `asOf=2026-11-09` returned the rebuilt coverage at 12:14:35 UTC on a cache miss. The default URL still returned October 23 on a cache hit at 12:14:36 UTC, with an age of 474 seconds. The deployed default policy allows 3,600 seconds of cache freshness and 600 seconds of stale-while-revalidate. Default-URL propagation remains open. The successful run emitted no failure request ID. The historical effective timeout, request-to-backend join and source of elapsed work remain unresolved.

## Open code changes

Five independent GPT-6.1-Sol CLI runs were launched for retry selection, manifest correlation, public acceptance, AAPL preflight and company cache policy.

| Pull request | Scope and local verification |
|---|---|
| [#220](https://github.com/osborn-studio/osbornalpha/pull/220), `6b6ff304` | Makes failed published streams eligible for the existing sweep after backoff, preserving queue order, quota and writer fences. The regression failed before the change in both adapters. Fresh local PostgreSQL verification passed 463 tests with three existing skips, and confirmed the selector's privileges and replay behavior. |
| [#221](https://github.com/osborn-studio/osbornalpha/pull/221), `6797a2f3` | Adds an optional upstream request ID to the private manifest RPC failure event. Local tests passed 660 with 48 database-gated skips. This supports future client-to-gateway correlation. Manifest persistence recovery, gateway-to-backend correlation, the historical effective budget and the cause of the delay remain open. |
| [#222](https://github.com/osborn-studio/osbornalpha/pull/222), `151c9e0e` | Sets a 60-second shared cache lifetime without stale-while-revalidate for successful nonempty current Overviews and the company directory. Historical Overview cache behavior is preserved. Local tests passed 530 with 70 conditional skips. |

At the 12:20:25 UTC cutoff, all three PRs were open and required review. The Application test jobs were in progress. The machine receipt records the individual checks. All three changes were outside the observed production runtime. Wave219 used the existing deployed code for recovery, with no deployment or migration.
