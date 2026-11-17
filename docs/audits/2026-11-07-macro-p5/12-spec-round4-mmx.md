T-M1: closed
T-M2: closed
T-M3: closed
T-M4: closed
T-M5: closed
T-M6: still open (v1/v2 still rejects `secondary_state===null`; v2 does not remove that requirement or define a clock-specific path)
T-M7: closed
T-M8: closed
T-M9: closed
T-M10: closed
T-M11: closed
T-M12: closed
T-M13: closed
T-M14: still open (the manifest freezes `prev_observation_id`/`prev3m_observation_id`, but the clock still infers `prev` from “the latest remaining observation,” which is not the publication-time selection)
T-M15: closed
T-M16: still open (v2 still reuses live C6 dependencies and the exact closure/hash inputs remain unspecified)
T-M17: still open (the rollout still retires v1 before registering v2 and still permits a `methodology_missing` window)
T-M18: closed
T-M19: closed
T-M20: closed
T-M21: closed
T-M22: closed
T-M23: closed
T-M24: closed
T-M25: closed
T-M26: closed
T-M27: closed
T-M28: still open (all six `firstPeriod` cells remain `[D0a]`, so D1 is still blocked on unspecified data)
T-M29: still open (the weekly next-period formula still conflates observation date and publication/freshness due date)
T-M30: still open (per-series publication-day and `available_at` conventions remain unverified and unspecified)
T-M31: still open (the WTREGEN monthly aggregation rule and partial-week treatment remain undefined)
T-M32: closed
T-M33: closed
T-M34: closed
T-M35: still open (AFRE cross-page conflict, equal-date tie handling, and revision semantics remain undefined)
T-M36: still open (MLF monthly value, witness, `available_at`, and same-month selection remain incompletely specified)
T-M37: still open (D1 adds catalog/code fields but no normative `macro_series` schema or loader/migration contract)
T-M38: closed
T-M39: closed
T-M40: closed
T-M41: closed
T-M42: closed
T-M43: closed
T-M44: closed
T-M45: closed
T-M46: closed
T-M47: closed
T-M48: closed
T-M49: closed
T-M50: closed
T-M51: closed
T-M52: closed
T-M53: closed
T-M54: still open (the AFRE table identifier and exact row/column/unit contract remain unspecified)
T-M55: closed
T-M56: still open (the exact void transition, deadline, audit event, and verification process remain unspecified)
T-M57: closed
T-M58: closed
T-M59: closed
T-M60: closed
T-M61: closed

| # | Severity P1/P2/P3 | Section | Defect | Concrete fix |
|---|---|---|---|---|
| 62 | P1 | §3.2, §3.3, §3.4 | The D1 `method_manifest` is not executable as the manifest required by the clock contract. It omits the contribution `observation_id`, explicit latest observation ID for unmatched rows, comparison observation IDs/roles, contribution cells, and a complete normalized support vector. Invariant 1 therefore cannot be checked against a manifest row, and rows may have two different notions of “latest.” | Define one versioned manifest row containing `status`, `latest_observation_id`, `prev_observation_id`, `prev3m_observation_id`, `matched`, `rule_id`, a complete four-regime `support` vector, and the four-regime `contribution` vector. Store zero support for every nonmatched scoring row; use the manifest’s explicit IDs for all projections and reconciliation. |
| 63 | P1 | §3.3, §3.4 | The clock still says it may import current `regime.ts` and `catalog.ts` after the version gate, and the manifest explicitly permits current rule-label lookup by `rules_version`. The draft does not provide a versioned rule-label registry or an immutable mapping, so a code change can alter historical public labels while the numeric reconciliation still passes. | Freeze the rule label in every matched manifest row and remove all live `regime.ts`/`catalog.ts` imports from `clock-view.ts`. Store the complete catalog snapshot or immutable catalog-version artifact needed to resolve historical names/statuses, and add a test that changes live catalog/rule data without changing the clock response. |
| 64 | P1 | §3.3, §3.4 | The manifest schema does not represent non-classified results completely. A null-regime result has contributions and denominator information but the stated manifest has no explicit matched weight, scores, coverage, axes, primary/secondary state, or margin, so invariant 4’s classified-only checks and the proposed null-regime reconstruction remain undefined. | Persist a canonical result payload containing denominator, matched weight, uncovered weight, scores, coverage, axes, primary/secondary state, margin, and contributions regardless of whether the regime is null. State which invariants apply to null-regime records and test coverage-below-threshold and zero-score cases. |
| 65 | P1 | §3.4 | Invariant 5 still recomputes `N'` from rounded r6 contribution cells. The publication code accumulates unrounded score cells and rounds only when storing `scores` and `norm`; summing rounded contributions can change the denominator or tie ordering, so the stated reconstruction is not the publication algorithm. | Persist the unrounded score totals used for normalization, or define and persist a canonical selection trace. Reconcile against those exact totals, with stored `scores` and `norm` checked as separately rounded projections; add accumulation and tie-boundary fixtures. |
| 66 | P1 | §3.4 | Invariant 8 is still impossible as written for unmatched rows: it requires `rule_id ∈ RULES[row.type]`, but unmatched rows have no matched rule and the manifest permits `rule_id:null`. | Restrict invariant 8 to matched rows and require their rule ID to exist in the frozen rule table. For unmatched rows require `rule_id=null` and a normalized zero support vector. Test both branches. |
| 67 | P1 | §5.2, §5.7 | D1 changes catalog/manifest semantics while retaining upstream `METHODOLOGY_VERSION='v1.0'`. The clock’s version gate therefore cannot distinguish a pre-D1 v1.0 snapshot from a D1 v1.0 snapshot except by catalog hash, and the spec does not require an input-selection/manifest version in the result. This permits incompatible frozen schemas under the same methodology version. | Add a distinct version such as `macro-regime-manifest/2` or `macro-regime-inputs/2` to the snapshot/result and gate it explicitly. Preserve the old manifest reader only for replay if required; do not reuse `METHODOLOGY_VERSION` for schema changes. |
| 68 | P1 | §5.7 | The v2 formula-hash plan remains nondeterministic. “`deps`逐字=v1列表” includes live `snapshots.ts`, `read-api.ts`, `freshness.ts`, and `db.ts`; the exact v2 module closure and hash serialization are unspecified. A later live-file edit can change v2’s formula hash or behavior while the catalog literal remains unchanged. | Pin the exact v2 module path, imported symbols, immutable method-data files, canonical hash algorithm, and closure inputs. Exclude mutable infrastructure from the formula hash or hash an explicitly frozen implementation artifact; test that unrelated live infrastructure edits do not alter the method hash and that any formula dependency edit does. |
| 69 | P1 | §5.7 | The production sequence still creates an invalid method window: migration retires v1, then `sync-methodologies.ts` is expected to register v2, but consumers are switched to v2 in the same deployment. A sync failure leaves no active/publishable macro method; before sync, old code’s v1 output is deliberately rejected. | Split rollout into: deploy v2-compatible code without switching producers; sync/register and verify publishable v2; switch producers/consumers; publish and verify an A snapshot; only then retire v1 in a separate migration/job. Add failure/rollback tests for each stage. |
| 70 | P1 | §5.7, §5.8 | The retirement operation is not an idempotent transactional contract. The SQL sketch derives `seq` via `max(seq)+1`, which races under concurrent execution, and the event’s `reason`, `occurred_at`, exact `publishable`, `formula_hash`, and `code_version` source are not fixed. Re-running may create duplicate status-change events or violate audit expectations. | Use a locked/serializable transaction or an atomic RPC that locks the methodology row, allocates the next sequence, updates status, and inserts exactly one event with all required fields copied from the methodology row. Define rerun behavior and unique-event semantics; test first run, rerun, and concurrent execution. |
| 71 | P1 | §5.3, §5.8 | `official_http` is added to the evidence-object CHECK, but the supplied ingest path writes retrievals through `putRetrieval`, and the draft provides no normative schema/migration verification for every retrieval adapter-bearing column. If `macro_retrievals.adapter` has a restrictive CHECK, official HTTP ingestion remains undeployable. | Add the exact `macro_retrievals.adapter` column and CHECK to the normative migration inventory; migrate it to allow `official_http` if present, or state and verify that it has no adapter CHECK. Include insertion tests for both evidence objects and retrievals. |
| 72 | P1 | §5.3 | The draft defines MIME-to-parser mapping but still lacks an enforceable mapping between adapter and parser. `parserFor(series_id)` may resolve a parser whose catalog adapter differs from the evidence’s inferred adapter, allowing `official_http` bytes to be parsed or persisted under another transport. | Extend each parser/catalog specification with `adapter`, `parser_id`, and `parser_version`. Require the inferred catalog adapter, parser adapter, and evidence adapter to agree before parsing or storage; reject with a stable code otherwise. Add mixed-adapter and wrong-parser fixtures. |
| 73 | P1 | §5.3 | The official HTTP validation compares `url.host` to `spec.fetch_host` and separately stores `url.hostname`, but the allowed host list permits different combinations of hosts and does not define protocol or redirect policy. A source could pass on one scheme while its fetch/evidence host storage uses another. | Pin scheme, hostname, effective port, exact evidence path, and redirect policy per source. Validate the final and original URLs against the same source policy, reject userinfo, and define that redirect targets are revalidated; add scheme, port, redirect, and userinfo tests. |
| 74 | P1 | §5.3, §5.4, §5.5 | The draft authorizes parsers and catalog rows for official HTTP sources, but does not define how the parsed numeric values are bound to the catalog series, period, unit, and policy rate event semantics. The existing ingest path relies on claims and `claimPeriodEnd`, while the parser contracts only specify some row keys; a successful parse could therefore produce values with an incorrect unit or period mapping. | For each new series/parser, pin the canonical value-to-series mapping, output period label, numeric unit, decimal policy, and event-source type. Add parser-to-ingest integration tests asserting the written `series_id`, `period_end`, `value_text`, and unit. |
| 75 | P1 | §5.2, §5.8 | D1’s catalog contract requires `firstPeriod`, release-lag semantics, and six new rows, but `macro_series` has no `first_period` column and the migration only changes `native_frequency`. The catalog loader’s persistence mapping for `firstPeriod` and the six rows is therefore undefined, so D1 cannot persist its own normative data. | Decide whether `firstPeriod` is code-only or persisted. If persisted, add the exact column, backfill/verification procedure, loader mapping, and round-trip tests. If code-only, state that the catalog loader validates it against source metadata and provide the six concrete values before D1 begins. |
| 76 | P1 | §4.4 | The preset memo key is shared across all presets but contains no preset ID or canonical preset-spec hash. If the key maps to one cached object rather than a map keyed by preset, a request for another preset can receive the first preset’s result; if it stores a map, the contract does not say so. | Define the memo value as a map keyed by `preset_id`, or include `preset_id` and a canonical preset-spec hash in the key. Include preset-spec and event-derivation versions; add cross-preset cache tests. |
| 77 | P1 | §4.4 | The preset route’s `computed_at` contract says “首次计算 UTC 时刻,” but the memo key does not include the preset and the response defines `created_at:computed_at` for an unpersisted preset. The response also omits an explicit `computed_at` field even though the prose says the response contains it, so the public DTO is contradictory. | Make the DTO normative: include `computed_at` with the actual first-computation timestamp; remove `created_at` or define it as the same value; state whether presets are persisted. Ensure memo entries store per-preset first-computation timestamps. |
| 78 | P1 | §3.3, §3.4 | `regime_status` remains computed from `uncovered_weight` and `denominator` even after reconciliation failure. This is inconsistent with the no-number failure contract and can classify a corrupt record from values that failed reconciliation. | Persist a coarse immutable `classification_status` in the result, or derive `regime_status` only from the stored `regime` field and a separately validated stored coverage state. On `reconcile_failed`, expose only a safe enum such as `unknown`; add cross-product tests for corrupt and null-regime records. |
| 79 | P1 | §3.3, §3.4 | The row-state rules do not cover a catalog-active scoring row whose latest observation exists but whose numeric value is invalid. `classifyRegime` treats such a row as unmatched, while the clock rule would classify it as `not_matched`; the draft has no explicit invalid-value state or policy. | Add a frozen numeric-validity flag and define invalid values as `not_matched` with a reason, or add a dedicated row state. Ensure manifest construction and clock projection use the same finite-number test; add invalid-value fixtures. |
| 80 | P1 | §5.3 | The LPR event contract says “相邻比较,” but does not define whether adjacent means adjacent stored quote dates or adjacent expected policy dates. Missing quote periods can therefore silently become multi-month “changes,” contrary to the event’s effective-date semantics. | Require consecutive comparable quote dates from the source’s quote calendar or explicitly mark and reject gaps. Define whether unchanged quotes produce events and how the previous quote is selected across missing periods; add missing-date fixtures. |
| 81 | P2 | §3.2 | The route budget still says each F4 request has a three-second timeout and the phase is at most six seconds, while not defining cancellation of the second request when the first times out. This can exceed the intended phase budget and produce inconsistent partial results. | Apply one phase deadline to both requests using a shared `AbortSignal`; stop after the first timeout and return `f4_unavailable`. Test timeout during list and detail and assert the second call is cancelled when the phase deadline expires. |
| 82 | P2 | §3.6 | The status matrix’s textual count remains wrong: it says 13 card-level states while the table contains the numbered card states plus the transport-only loading/load-failed states, and the count wording differs across §3.6 and §8. | Enumerate every distinct public state exactly once and state the total separately for persistent card states versus transport states. Align §3.6, §8, and the test names. |
| 83 | P2 | §4.4 | The preset route computes up to six groups with “≤4 reads” each, but the memo header `X-Macro-Presets-Memo` has no defined hit/miss value or whether it describes the whole route, an individual preset, or all presets. This prevents benchmark interpretation and cache validation. | Define the header as a machine-readable enum, such as `hit`, `miss`, or `partial`, and specify whether it reflects route-level storage of all preset results or per-preset status. Add hot/cold/partial tests. |
| 84 | P2 | §5.2 | The weekly freshness rule says the next period is “previous period_end + 7 days” for calendar-week data, but does not define the representative date for holidays or weeks whose source period is not exactly seven days apart. The table says “Wednesday,” while `releaseLagDays` may represent publication delay rather than a stable observation weekday. | Define the source period key independently from the representative date, specify holiday/week-number behavior and the expected publication deadline, and treat `releaseLagDays` as publication lag only. Test ordinary weeks, holiday-shifted weeks, and delayed releases. |
| 85 | P2 | §5.7 | Retiring v1 is said to make old judgments unavailable and then be voided by the existing settlement cron, but no explicit relationship is defined between “catalog_version_mismatch” and lifecycle transition. A settled historical judgment may not be voided by that cron, while an open card may remain indefinitely. | Define the exact transition by starting lifecycle: void or supersede open/pending cards, preserve settled historical judgments with an explicit version-mismatch status, and specify the audit event and verification query. Add tests for open, settled, and pending judgments. |
| 86 | P2 | §5.8 | The constraint-discovery regex is anchored to one exact PostgreSQL rendering (`^CHECK \(\(adapter = ANY`) and performs no verification after replacing the constraint. A formatting difference or additional restrictive constraint can leave the intended state unenforced or falsely pass migration tests. | Discover constraints by `pg_get_constraintdef` structure with a tolerant parser, list and verify all affected constraints in a migration precondition, and after replacement query `pg_constraint` to assert the new constraint and absence of obsolete adapter/frequency checks. Add tests using equivalent constraint spellings and an extra restrictive constraint. |
| 87 | P2 | §4.2 | The event marker identity remains `effective_date` for derived events, so multiple same-date derived events are collapsed even though the new CN event contract can produce separate 1Y and 5Y changes on the same date. The claim that `derivePolicyEvents` guarantees one per day covers only US target-range events, not CN LPR events. | Give every event a stable ID, including tenor/series scope, and deduplicate by that ID. If multiple events share a date, render separate markers or an explicit grouped marker; add same-date 1Y/5Y and US-event fixtures. |

not ready