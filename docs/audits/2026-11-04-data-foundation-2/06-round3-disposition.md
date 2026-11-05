# Codex round-3 findings: disposition (architect decisions, 4th draft)

| # | Decision | How the 4th draft handles it |
|---|---|---|
| R3-1 activation ≠ publication | ACCEPT | Every write belongs to a **sync run** (`fact_sync_runs`, one per issuer × market × batch). `publish_sync_run` is one transaction: lock the scope row, validate the lease, flip the run's `staged` rows to `ok`, set `filings.mapping_gen` for every filing in the run's manifest (zero-output filings included), reject generation regression, mark the run `published`. Crash before it → run stays `staged` and is abandoned by the next holder. |
| R3-2 cleanup deletes evidence | ACCEPT | Cleanup deletes only rows of runs in status `staged` (abandoned) for that issuer × market; quarantined rows of `published` runs are kept. |
| R3-3 market scoping | ACCEPT | Runs, cleanup and publication are keyed by (issuer, market); dual-feed derivation: metrics carry `basis` that includes the market, and formulas are chosen per filing market. |
| R3-4 fencing in every mutation | ACCEPT | All ingestion writes go through SQL functions that `select … for update` the scope row and validate the lease token: `begin_sync_run`, `stage_filings`, `stage_facts`, `quarantine_facts`, `publish_sync_run`, `abandon_sync_runs`, `release_fact_sync_lease` (raises on ownership mismatch). Admin promotion uses `promote_quarantined` with an advisory lock. `service_role` loses direct insert/update on facts and filings. |
| R3-5 same-day conflict | ACCEPT | A same-day conflict quarantines **both** sides, including an already-`ok` row (`ok→quarantined`), so the outcome is arrival-order independent; current value falls back to the previous date. Acceptance is acknowledgement only unless the admin names the chosen rows (`chosen_fact_ids` in the POST body); promotion then promotes only those. |
| R3-6 read bounds | ACCEPT | Reads go through one SQL function `read_facts(...)` (security invoker, RLS applies) that performs the filing-generation join and current-value selection in one statement (one snapshot), hard cap 10,000 rows with a `truncated` flag; derivation and planning use the same function. |
| R3-7 typed decoding | ACCEPT | Scanner output is decoded by a per-source schema: control fields to numbers, financial values to canonical decimal strings (`canonicalDecimal`: no exponent, no trailing zeros); equality is on canonical form. |
| N12 stale metrics | ACCEPT | `replace_financial_metrics(issuer, rows, based_on_run)` refuses when a newer published run exists; caller recomputes. |
| N14 YTD revisions | ACCEPT (revised) | Differencing uses the subtrahend's disclosure as visible at the minuend filing's `available_date` (same information set); none → omit. |
| N16 overlapping quarantines | ACCEPT | Promotion skips rows referenced by another open item; hook state records stage (`promote` / `materialize`) so retries resume at the failed stage. |
| N20 deadline residue | ACCEPT (wording) | Budget passed to uploads; a run cut by the deadline is abandoned before exit when time allows, otherwise by the next holder; the acceptance claim is "no residue after the next run". |
| N11 correction linkage | ACCEPT | `restatement` filings look for titles containing 更正 + year + kind; otherwise pending. |
| N23 freshness masking | ACCEPT | `ok` iff idle or `published ≥ max(1, ceil(attempted/2))`. |
| N24 evidence lookup | ACCEPT | `GET /api/facts/[ticker]?factIds=` returns rows by id regardless of generation. |
| N4 service-role bypass | ACCEPT | See R3-4. |
| N10 / A / C | OWNER | Unchanged (§14). |
