### T verification

| # | Status | Verification |
|---|---|---|
| T1 | RESOLVED | §§3.2, 5.1, 5.3–5.4 and 9.2 consistently require active-generation/published-run filtering before cardinality checks and generation-aware duplicate detection. |
| T2 | PARTIAL | Atomic per-key commits, accepted-result reuse, fenced adapters and derived counters are specified; crash recovery still excludes the open items it must recover (U2). |
| T3 | PARTIAL | Persisted member states, fenced replacement/failure/finalization and terminal timestamps are specified, but the blanket lease precondition also blocks initial claim/takeover (U1). |
| T4 | RESOLVED | Producers and adoption now use `facts.us`/`facts.cn`, matching landed `sync.ts`; market values remain uppercase. |
| T5 | RESOLVED | Candidate adaptation matches landed `FactCandidate`; generation/version provenance, generated IDs, `issuer_id`, filing date and replay-required handling are specified. |
| T6 | RESOLVED | Both predicates move to landed `fact_promote_rows`, preserve its privileges and existing checks, and cover every promotion entry point. |
| T7 | RESOLVED | Lineage reads preserve landed non-`ok` window behavior, history filtering, limits, truncation and decimal-string semantics. |
| T8 | RESOLVED | Full lineage vectors propagate through metrics types/adapters/pagination; before/after checks suppress unstable or stale results with `metrics:[]`. |
| T9 | RESOLVED | Missing filing helpers are explicitly added; calendar coverage is unbounded by row count; materialization accepts lineage members and preserves retry/truncation behavior. |
| T10 | PARTIAL | Actual dispatcher integration, durable resolution hooks and retry semantics are specified, but reconciliation-isolation recovery has contradictory selection and missing persisted targets (U2). |
| T11 | RESOLVED | Acceptance columns remain function-only while landed service-role grants for the three linking columns are explicitly preserved. |
| T12 | RESOLVED | The baseline includes landed §16 contracts, expected-revision publication, stale-plan retry, scope snapshot protection and non-overwriting topology placeholders. |
| T13 | RESOLVED | The baseline specifies landed 35-entry `FACT_CONCEPTS`, derived limits, distinct `monetary_funds`, and missing CN `cash`. |
| T14 | RESOLVED | Gold binding uses independently verified exact Tushare references; linker document IDs are cross-checks, and type-5 comparisons require their own verified documents. |
| T15 | RESOLVED | Real retained CN responses and enablement gate reconciliation; synthetic fallback is prohibited, unverified calendar evidence stays unavailable, and pending US gold produces `incomplete_gold`. |

### New findings

| # | Severity | Section | Finding | Prescribed fix |
|---|---|---|---|---|
| U1 | P2 | §3.1 calendar functions; §6.2 | The new rule says **every** pass function first validates an existing token, current ownership and an unexpired lease—including `claim_calendar_pass(p_market,p_batch)`, which has no token and must create a pass or acquire an expired lease. These preconditions prevent bootstrap and takeover. | Give claim its own atomic create/acquire protocol: serialize creation, lock an existing unfinished pass, acquire only an idle/expired lease, and return its token. Apply the live-owner token check only to replacement, failure and finalization. |
| U2 | P2 | §§3.2, 4.6, 5.6 | `--pending-hooks` scans **resolved** items but is also required to recover isolation hooks on **open** `reconcile_mismatch` items. Moreover, `apply_reconcile_result` persists a hook without the `detail.issuer_id/market` required by the new persisted-target recovery contract; its returned target disappears on a crash. | Include open reconciliation-isolation items with pending/failed hooks in recovery. Atomically persist their issuer/market target with the hook; resolve the current materialization target through `T(i)` when recovering. Test a crash immediately after commit while the item remains open. |
| U3 | P1 | §3.2 `adopt_candidate` | The rewritten conflict guard raises only when a differing same-key/day `ok` row exists **and no open dispute exists**. Previously, adoption required both absence of differing `ok` values and absence of open disputes. The new conjunction permits direct `staged → ok` adoption into an open conflict, bypassing the protection preserved in landed `fact_promote_rows`. | Reject with `conflict_exists` when **either** a differing same-key/day `ok` value **or** an applicable open dispute exists. Check both under the scope lock before insertion; test adoption with an open dispute and no remaining `ok` competitor. |

Verdict: not ready — calendar claim preconditions, isolation-hook recovery, and the adoption conflict guard require correction