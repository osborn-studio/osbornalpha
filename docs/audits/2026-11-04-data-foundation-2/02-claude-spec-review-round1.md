# Independent Claude review of the plan-2 spec (round 1)

Reviewer: fresh Claude agent (Fable 5.1), read-only, 2026-11-04. Target: `docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md` at commit `7d2faa7` plus the uncommitted `report_type ∈ {1,4,5}` edit.

## A. Internal contradictions

- **A1 · P1 · §3 vs §5.3/§6.2 — fallback order vs `ambiguous_tag`.** §3/§5.3 quarantine two tags with different values in the same filing/period; §6.2 says the preferred tag wins. Filers commonly tag both `Revenues` and `RevenueFromContractWithCustomerExcludingAssessedTax` with different values, so reading 1 would quarantine revenue for a large share of the S&P 500. Fix: first *present* tag wins; `ambiguous_tag` only when the *same* tag has conflicting `val` for the same `accn+start+end`.
- **A2 · P2 — concept count.** Table has 27 rows; prose says 25 / 24; `concepts` cap 25. Derive the cap from `FACT_CONCEPTS.length`.
- **A3 · P2 — `report_type=5` fetched but undefined**; fixtures `rt{1,4}`; §6.5 timings stale; type-5 rows may carry a later report's `f_ann_date`. Define semantics and versioning or drop.
- **A4 · P2 — quota → `skipped_summary(quota)` is informational**, so the batch finishes `success`, not `partial`. Use a non-informational code.
- **A5 · P2 — §6.1 step order vs §7.3 hook**: quarantine written before fact ids exist. Write facts first (status quarantined) then the item with ids, or key the hook on `natural_key`.
- **A6 · P2 — §5.2 rule 2 compares against quarantined rows**, so a clean later filing reaffirming a rejected value never becomes visible. Compare against `ok` rows only.
- **A7 · P2 — A-share gold assertions "skip"** but the suite is in `criticalSuites`, which throws on any non-passed assertion. Keep A-share assertions in a non-critical suite until fixtures are committed.
- **A8 · P3 — `<=` in SQL vs `RangeOptions.lt`** (exclusive); `between` needs `lt: to+1 day`.
- **A9 · P3 — `fetch_key` "10 位 CIK" vs `issuers.cik` stored stripped.** Pad in one place.
- **A10 · P3 — `fiscal_period` allows `Q4` but `periods` whitelist omits it.**

## B. Cannot be implemented as written

- **B1 · P1 — bulk insert.** `TableClient.insert` is single-row; ~1,000 PostgREST calls per issuer × 40 issuers is not feasible in 300 s. Add `insertMany` to all three clients.
- **B2 · P2 — `fact_id bigint identity` vs memory client** (echoes inserted row, no synthesized ids). Use client-generated uuid keys like plan 1.
- **B3 · P2 — raw hash via `tushareCall`** is impossible (bytes never exposed). Add a raw variant.
- **B4 · P2 — per-fact `rule_warning` entries vs `capErrors` (100)** push genuine `failed` entries out. Aggregate per rule.
- **B5 · P2 — Vercel budget**: 40 issuers × 5–50 MB companyfacts; CN 9 calls × 60 ≈ 270 s. Add a deadline, lower defaults.
- **B6 · P2 — `supabase/seed.sql` inserts into `financial_history`**; after conversion to a view `db reset` fails.
- **B7 · P3 — PostgREST 1000-row cap / single `orderBy`**: use `selectAll`, sort and filter in memory.
- **B8 · P3 — `dq_quarantine.payload` must be an object**, not an array.
- **B9 · P3 — storage "已存在则跳过"**: say 409 catch or prior list.

## C. Ambiguities

- **C1 · P2 — quarter numbering needs the issuer's fiscal-year end**, stored nowhere.
- **C2 · P2 — EDGAR `filings.period_end/fiscal_*`** undefined (one accession spans many periods).
- **C3 · P2 — re-run after `resolved_reject`** re-opens items unless rules run only on net-new candidates.
- **C4 · P3 — Tushare `filings.raw_hash`** with 9 snapshots per filing.
- **C5 · P3 — restatement flags with quarantined vintages.**
- **C6 · P3 — `shares_outstanding` from `dei`** has a cover-date `period_end`; gold assertion "at FYE" would miss.
- **C7 · P3 — define "dataset 前缀".**

## D. Mandate

- **D1 · P2 — `code_version = 'local'`** for the owner's local backfill breaks replayability; fall back to `git rev-parse HEAD`.
- **D2 · P3 — "历史不变" caching** is a tolerance, not immutability.
- **D3 · P3 — tz rule changes must bump `MAPPING_VERSION`** (DST-aware conversion).
- Privacy: no findings (scope/batches service-role only, no user ids).

## E. SQL checks

- View: `security_invoker` correct; `not exists` filter matches §5.1; restrict `f.concept`; FYE change collapses under `max()`; old table was percent, view emits ratios.
- `unique nulls not distinct`: valid on PG 17.
- Append-only trigger: consistent; say whether `ok → quarantined` is allowed.
- `getFactsAsOf`: `DISTINCT ON` matches `ORDER BY`; only the `<=`/`lt` mismatch.
- `fiscal_year` "= year(period_end)" not enforced; use a generated column.

## Could not verify

Tushare report types 4/5, `total_share` unit, `fin_exp_int_exp`, points and row caps; frequency of `Revenues` vs `RevenueFromContract…` co-tagging; SEC dissemination timing and `fy/fp` meaning; Vercel limits and companyfacts sizes; hosted PostgreSQL version.
