# Plan 3 (identifiers + reconciliation) — Codex findings disposition

Spec: `docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md` (3rd draft).
Rounds: `01-codex-round1.md` (35 findings N1–N35 on the 1st draft, verdict "not ready"); `02-codex-round2.md` (28 new findings M1–M28 on the 2nd draft plus a status line per N, verdict "not ready"). The owner rule allows two Codex rounds; the 3rd draft implements every ACCEPT below but has not been re-audited by Codex. Decisions are the architect's (Fable 5.1); **owner** items need the owner's call.

Codex round-2 verdict (quoted): "Verdict: not ready — claim targeting, lineage consistency, disclosure binding, calendar constraints, and omission-sensitive gates still prevent a reliable implementation contract." Each of those five areas is addressed by the M-items marked ACCEPT below (M2–M4, M11–M13, M14, M22–M24, M15); the owner should weigh that the fixes are unaudited by a third round.

## Round 1 (N1–N35)

| # | Decision | Reason / where in 3rd draft |
|---|---|---|
| N1 stale plan-2 baseline | ACCEPT | Rewritten against plan 2 8th draft (`state_rev`, jsonb envelope, `resolve_facts_quarantine`); §12 pins the draft and lists every touched contract. |
| N2 migration fails on populated data | ACCEPT | §3.1: legacy backfills (`unrecorded`/`curated`, `op='legacy'`), no "resolved must have timestamp" constraint; §3 requires populated-upgrade rehearsal. See M1 for replay safety. |
| N3 writers don't persist contract | ACCEPT | §4.2.1/§10 F3-0: `IssuerSecurityInput` method fields, `attachSecurity`, `fileClaim(op, detail)`, existing callers. |
| N4 claim acceptance can hit wrong target | ACCEPT | §4.2.1 op/target table; §3.1 function asserts `target.issuer_id = claim.issuer_id`, op/id_type pairing, active issuer, `row_count = 1`. |
| N5 Form 25 action inverted | ACCEPT | §4.3.3: Form 25/8-A become `evidence_only` claims; closure needs reviewer-supplied security and effective date. |
| N6 claims auth/transaction | ACCEPT | §3.1 `resolve_identifier_claim` (one transaction, row lock); §7.1 order of checks. |
| N7 OpenFIGI mapping order-dependent | ACCEPT | §4.1.2: `ticker` field, composite/venue grouping, permuted-order fixture. |
| N8 provenance cannot replay | ACCEPT | §3.1 provenance keys with `evidence_sha256`, copied source row values; OpenFIGI/GLEIF/HKEX evidence in bucket. |
| N9 8-A as proxy for ownership | ACCEPT | No backdating from 8-A; `evidence_only`, non-executable until amended (§4.3.3, §4.2.1). |
| N10 listing-date gate unmeetable | ACCEPT | §4.3.2 equality upgrades method; earliest-window rule; both SQLSTATEs; E2 denominator = backfillable rows. |
| N11 missing-ticker detection | ACCEPT | §4.3.4: reset on reappearance, `fetched_at`, hash, second source (submissions `tickers[]`), replacement retained. |
| N12 lineage reader incompatible | ACCEPT | §3.2: 9 args incl. `p_include_non_ok`, envelope, single-issuer wrapper field-identical (suppression only for >1 issuer, `ok` rows only). |
| N13 lineage concurrency token | ACCEPT | `replace_financial_metrics_lineage` with sorted scope locks and revision vector; `set_merge` joins the lock protocol. |
| N14 lineage conflict by created_at | ACCEPT | Conflicts excluded from current value; `resolve_lineage_conflict` atomic with persisted choice honoured by `promote_quarantined`. |
| N15 candidate retry unsafe | ACCEPT | `adopt_candidate` single transaction, no `begin_sync_run`, hook state written in-transaction. |
| N16 generation relabel | ACCEPT | Candidate generation must equal filing's active generation (> 0). |
| N17 `reconcile_quarantine` lacks lock/rev | ACCEPT | Scope row lock, published-run filter, `state_rev + 1`. |
| N18 cannot recheck quarantined fact | ACCEPT | Left side resolved by natural key incl. quarantined rows; `latest_result`/`inputs_hash`; `restore_reconciled`. |
| N19 CN periods/vintages | ACCEPT | INSTANT for BS; left bound to the exact announcement (`document_ref` + report_type 1). |
| N20 extra 20 CN companies unprovisioned | ACCEPT | N = min(30, in-scope issuers); no provisioning promise; N=0 blocks F3-6. |
| N21 gates gameable | ACCEPT | Independently enumerated US expected keys from raw snapshots; CN exact product check; every key one outcome; non-compared outcomes count as `failed`. |
| N22 printed-precision tolerance | ACCEPT (partial) | Interval model (§5.4), exact decimal cross-multiplication, per-side precision recorded; left-side uncertainty beyond decimal text is explicitly out of scope (§1.2). |
| N23 iXBRL tag scope | ACCEPT | Left `source_concept` first, fallback per period/unit, canonicalised contexts. |
| N24 parser contract | ACCEPT | Namespace-aware bounded tokenizer, documented regex per format, fail-closed on any segment/scenario content, nil → unsupported. |
| N25 20-F/40-F | ACCEPT | `report_kind` includes them; 40-F → `no_rule`. |
| N26 SRC / unknown deadlines | ACCEPT | SRC-only → `unknown` → `no_rule`; no bound stored as a due date. |
| N27 period generation | ACCEPT | Six completed periods through today; estimated periods never `overdue`; profile effectivity 15 months. |
| N28 disclosure vs ingestion | ACCEPT | `upstream_lookup`, `filed_not_ingested`, `unknown_upstream`, received requires published run + `mapping_gen > 0`; schedule matched by exact `end_date`. |
| N29 exit criteria unprovable | ACCEPT | E1–E9 each with a query/artifact; 20-F sample rule; F3-1 exit = numbers reported, owner decision I on shortfall. |
| N30 cron cursor | ACCEPT | §5.5 cycles with frozen membership, claimed cursors, retries; `sec.filer_category` registered. |
| N31 tests cannot exercise behaviour | ACCEPT | Anon exemption for lineage reader; mismatch fixtures injected before ingestion. |
| N32 private scope leakage | ACCEPT (owner) | Code names only, no selection reasons, bucket/provenance sanitisation tests; **owner decision H** authorises the sample export. |
| N33 invented confidence decimals | ACCEPT | `confidence` nullable; categorical `evidence_kind`. |
| N34 HKEX ISIN files / China attribution | ACCEPT | Three HKEX files evaluated; attribution corrected to "ANNA member numbering agency". |
| N35 regex dataset discovery | ACCEPT | Typed `DATASETS` registry, producers import it. |

## Round 2 (M1–M28)

| # | Decision | Reason / where in 3rd draft |
|---|---|---|
| M1 replay destroys evidence | ACCEPT | §3: all backfills run only when the column is first added; rehearsal = upgrade, write evidence, replay, assert untouched. |
| M2 claim payloads disagree | ACCEPT | §4.2.1 single `claim/1` schema validated in TS and SQL; `evidence_only` + `p_amend` as the repair path. |
| M3 target binding not enforced | ACCEPT | Function asserts target issuer = claim issuer, pairing table, active issuer, `row_count = 1`; `legacy` claims non-executable. |
| M4 8-A/25 prefilled ownership | ACCEPT | `evidence_only` claims carry no security/date; reviewer supplies both via `amend`. |
| M5 queue cannot complete workflow | ACCEPT | `correct_identifier` with `expected_current`; dedup key includes `op` and `target_key`. |
| M6 search_path / provenance / source | ACCEPT | `set search_path = public`, static branches, `source` required, allow-listed provenance written atomically, sanitisation tests. |
| M7 venue fallback order dependence | ACCEPT | Group by venue `figi` when composite missing; more than one group → ambiguous claim; no venue preference. |
| M8 adoption rules evaluated outside lock | ACCEPT | `p_expected_rev` compared under lock (`stale_evaluation`); admin run fields defined; candidate field validation. |
| M9 adoption post-commit gap | ACCEPT | Hook state written inside the adoption transaction; `--pending-hooks` recovery; dispatch exceptions enumerated. |
| M10 single-issuer reader not identical | ACCEPT | Suppression only when `array_length > 1` and only among `ok` rows; three-mode field-by-field test. |
| M11 merge writers outside lock protocol | ACCEPT | `set_merge` takes the same sorted scope locks (creating missing scope rows), bumps `state_rev`; `scope_missing` otherwise. |
| M12 vector not integrated | ACCEPT | `replace_financial_metrics` becomes a wrapper; existing rows backfilled; `FactsDb` methods listed; materialisation target `T(i)`; `/metrics` reports `stale`. |
| M13 lineage resolution not atomic | ACCEPT | `resolve_lineage_conflict` one transaction, exactly one survivor, persisted choice enforced in `promote_quarantined`; merge registers the cursor. |
| M14 announcement date not unique | ACCEPT | Bind by `document_ref = cninfo_announcement_id` and `source_ref` containing `:1:`; `left_unlinked` outcome; type-5 row separate. |
| M15 gates omission-sensitive | ACCEPT | US keys enumerated from raw snapshot independent of DB state, ≥ 4 keys per filing; CN exact product; cap/ordering rule; N=0 handled. |
| M16 fact IDs not portable | ACCEPT | Manifest stores natural keys; resolved to local ids at run time. |
| M17 constraints reject non-numeric pairs | ACCEPT | `kind` column with two conditional constraints; `legacy` outcome for pre-existing rows (table is empty in production). |
| M18 comparison certainty overstated | ACCEPT (partial) | Interval model with cross-multiplication; fail-closed on any segment/scenario content and on unmatched transformation grammar; deeper source-rounding modelling declared out of scope (§1.2). |
| M19 restoration not bound to passing result | ACCEPT | `restore_reconciled` requires `latest_result.passed` and `inputs_hash == inputs_hash_current`; `promote_quarantined` clause blocks other paths; pending quarantine work retried. |
| M20 cycle id unreliable | ACCEPT | `dq_reconcile_cycles` with frozen members, claimed cursors with `claim_until`, attempts/retries, completion rule. |
| M21 receipts/freshness contradict policy | ACCEPT | `weekly` cadence added to `dq_freshness` and `freshness.ts`; every outcome mapped to a counter; calendar has no cursor, ordered continuation. |
| M22 `no_rule` receipt contradicts schema | ACCEPT | Orthogonal `deadline_state` / `disclosure_state`, `detail` column, rewritten constraints. |
| M23 absence/receipt not established | ACCEPT | Received requires published run + `mapping_gen > 0`; `upstream_lookup` state; pagination when `recent` does not reach the period. |
| M24 estimates in statutory overdue | ACCEPT | SRC-only → `no_rule`; `estimated` never `overdue` (constraint); atomic `replace_filing_expectations`; profile effectivity window. |
| M25 unequal hashes ≠ observation | ACCEPT | `--fetched-at`, 90% row-count completeness, submissions `tickers[]` as second source, reappearance-after-closure rule. |
| M26 coverage gates vs writers | ACCEPT | E1 exact queries, E2 restricted to backfillable rows, owner decision I for shortfall, 600519 example made conditional. |
| M27 replayability/privacy gaps | ACCEPT | PDF in bucket allowlist, `gold-pdf.ts --upload`, immutability (`upsert:false`), copied source row values, bucket role tests, owner decision H names the authorising user. |
| M28 calendar structural gaps | ACCEPT | Profiles keyed `(issuer_id, market)`; admin API returns `noRuleRows`; both market crons listed. |

## Owner decisions carried in the spec (§13)

A OpenFIGI public display (default yes) · B no derived A-share ISIN · C gold-set recorder/reviewer (code names) · D tolerance rule (printed-precision interval vs flat 0.5%) · E sample rules · F quarantining public facts on mismatch · G ticker-change closure threshold · H sample export authorisation (`RESEARCH_OWNER_USER_ID`) · I handling of an unmet E1 coverage gate.

## Still open (OPEN-verify, §14)

Official A+H list URL; OpenFIGI exchCode/securityType/compositeFIGI actual values; HKEX file headers; SEC `category` string variants; 52/53-week estimate adequacy; other iXBRL transformation formats in practice; Tushare `disclosure_date` entitlement and `modify_date` semantics; `document_ref` format alignment with cninfo announcement ids; submissions `files[]` pagination structure; `fact_sync_scope` placeholder rows for out-of-scope issuers in `set_merge`.

## Round 3 (`04-codex-round3.md`, on the 3rd draft) — disposition in the 4th draft

Codex round-3 verdict (quoted): "Verdict: not ready for an implementation plan—blocking items remain in restoration/current-evidence validation, lineage topology and conflict locking, candidate scope binding, evidence-reader and expected-key completeness, cycle success accounting, and unsupported historical deadline/ownership assertions, alongside R1–R3 above."

| # | Decision | Reason / where in 4th draft |
|---|---|---|
| R1 restoration blocks itself | ACCEPT | §3.2 `restore_reconciled`: validate evidence → resolve the item first → then promote under the remaining checks (same order as plan 2 `resolve_facts_quarantine`); returns `{promoted, skipped}`; §5.6 route surfaces `no_rows_promoted`; R1 regression test in §9.2. |
| R2 all-missing cycle reports success | ACCEPT | §3.1/§5.5: per-cursor `compared_passed/compared_failed/not_compared` (checked to sum to `expected` on `done`), cycle totals, `complete` only when `not_compared = 0` and no member exec failure, otherwise `complete_with_gaps` → freshness `ok:false`. Mismatches that were quarantined/reviewed do not make a cycle incomplete (they are findings, not gaps). |
| R3 `set_merge` cannot repoint referrers | ACCEPT | §3.2 `set_merge` locks source, target and all referrers of both, repoints referrers (row_count = n), retires source (row_count = 1), bumps every affected `state_rev`; `issuers_topology_guard` trigger (§3.1) blocks any other `status/merged_into` write; `set_dissolved` added; A→B then B→C regression test. |
| M8 candidate scope binding | ACCEPT | `adopt_candidate` derives issuer/market from the filing located by the candidate's `source_ref`, checks batch existence/status/dataset (`batch_mismatch`), locks that scope; route does the same lookup (§4.6). |
| M11 topology write path | ACCEPT | Trigger + `set_merge`/`set_dissolved` as the only path (§3.1/§3.2/§4.4). |
| M13 lineage conflict locks | ACCEPT | `resolve_lineage_conflict` locks the **current full lineage** of T (recomputed in-transaction), requires payload issuers ⊆ lineage (`lineage_changed`), re-queries the conflict group under lock, survivor check lineage-wide. |
| M14 evidence reader | ACCEPT | New `read_filing_facts(filing, include_non_ok)` (all generations, all statuses); used for CN/US left-side binding and adoption duplicate checks (§3.2, §5.3, §5.4). |
| M15 expected keys from the adapter under test | ACCEPT | §5.3: expected keys = union of adapter-derived and iXBRL-derived keys (`origin` recorded); one-sided keys stay in the denominator and surface as `left_missing`/`right_missing`; ≥ 4 keys per side. |
| M18 rounding-to-nearest assumption | ACCEPT | §5.4: automatic quarantine only when the printed value is exact (元, 2 decimals); rounded printings create a non-quarantining `reconcile_review` item for a human. |
| M19 hash equality cannot detect change | ACCEPT | §5.6: `inputs_hash_now` computed by the route at request time from current inputs via the same `computeInputsHash`; function compares it with `latest_result.inputs_hash`; `inputs_hash_current` removed. |
| M20 one running cycle / ownership on completion | ACCEPT | Partial unique index on `(pair) where status='running'`; `done/failed` updates require `claimed_by = p_batch and claim_until > now()` (`lease_lost` otherwise). |
| M21 calendar single full-range run | ACCEPT | §3.1/§6.2: `dq_calendar_passes` with `cursor_after`; a pass may span runs; freshness ok on pass completion, `ok:false` when a pass exceeds 2 days. |
| M24 current category applied historically | ACCEPT | §6.1: per-fiscal-year categories from each 10-K cover (`dei:EntityFilerCategory`, `issuer_filer_categories`); FY N periods use FY N−1's cover category (Rule 12b-2 effectivity); no N−1 row → `no_rule`; submissions `category` is reference-only. |
| M25 absences asserted as ownership boundary | ACCEPT | §4.3.1/§4.3.4: `sec_file_absent` is defined as an observation bound (not an effective date); no automatic `ticker_change`; replacement tickers recorded in provenance plus an `evidence_only` claim for a human with 8-K evidence. |

Not re-audited beyond round 4's scope: round 4 (`05-codex-round4.md`) was limited to new defects introduced by the 4th draft plus a final verdict, per the coordinator's instruction.

## Round 4 (`05-codex-round4.md`, on the 4th draft, scope = new defects only) — implemented in the 5th draft

Codex round-4 verdict (quoted): "Verdict: not ready — the new topology guard and reconciliation lease handling permit untracked business mutations; the remaining prescribed fixes are required before planning."

R1, R2, R3 confirmed RESOLVED by Codex. On the coordinator's instruction, S1–S7 were implemented in the 5th draft exactly as Codex prescribed; **no further Codex round was run**.

| # | Severity | Status | Where in 5th draft |
|---|---|---|---|
| S1 topology guard fails open; flag not restored | P1 | implemented per Codex's prescribed fix (round 4), not re-audited | §3.1: `IS DISTINCT FROM 'on'`; both topology functions save the previous setting and restore it on normal and exception paths; §9.2 tests on a fresh connection and after `set_merge` returns within the same transaction. |
| S2 `read_filing_facts` binding ambiguous across generations | P2 | implemented per Codex's prescribed fix (round 4), not re-audited | §3.2 `read_filing_facts` binding rule: active generation + published runs (`ok`/`quarantined`); rechecks bind to `payload.fact_ids`; multiple eligible rows → new outcome `left_ambiguous` (§3.1 enum); adoption duplicate check uses the full plan-2 candidate key incl. `mapping_gen`. |
| S3 lease loss discards counters but not business effects | P1 | implemented per Codex's prescribed fix (round 4), not re-audited | §3.1 fence token `{pair, cycle_id, issuer_id, market, batch_id, attempt}`; `reconcile_quarantine(…, p_fence)` and new `apply_reconcile_result(p_fence, action, args)` lock the cursor row and validate ownership/attempt/expiry in the same transaction; `fence_failed` applies no mutation; §5.5 only accepted attempts contribute results or settlement counters. |
| S4 failed cursors never claimable | P2 | implemented per Codex's prescribed fix (round 4), not re-audited | §5.5 claim predicate: `pending`, or `claimed and claim_until < clock_timestamp()`, or `failed and attempts < 3`; atomic claim replaces ownership, increments attempts, clears last error; three attempts terminal. |
| S5 `drc_done_accounted` accepts NULL counters | P2 | implemented per Codex's prescribed fix (round 4), not re-audited | §3.1: `expected >= 0`, counters non-negative when present, `done` requires all three `IS NOT NULL` and sum = `expected`; settlement asserts the invariant and never coalesces to zero. |
| S6 `reconcile_review` contradicts exhaustive dispatcher | P2 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.6 dispatch table: `reconcile_review` → generic guarded status transition (accept and reject), no promotion/materialisation; five branches enumerated; tests in §9.1. |
| S7 calendar pass lacks frozen membership/ownership | P2 | implemented per Codex's prescribed fix (round 4), not re-audited | §3.1 `dq_calendar_passes.members/next_index/failed_members/claimed_by/claim_until/status`; §6.2 one leased worker per market/pass, `replace_filing_expectations(…, p_pass_token)` fenced, advance only after successful replacement, finish only when every frozen member completed, additions enter the next pass, failures retried and block successful completion. |

## Round 5 (`06-codex-round5.md`, on the 5th draft; scope = S1–S7 verification + new defects + landed plan-2 code vs spec assumptions) — implemented in the 6th draft

Codex round-5 verdict (quoted): "Verdict: not ready — S2, S3 and S7 remain partial, and the landed-code incompatibilities require the prescribed spec changes before implementation planning."

S1, S4, S5, S6 confirmed RESOLVED. All T1–T15 implemented as prescribed (2026-11-05, plan-3 commander session):

| # | Severity | Disposition | Where in 6th draft |
|---|---|---|---|
| T1 S2 conflicting binding text | P2 | ACCEPT | §3.2 `read_filing_facts` (filter to active generation + published runs, then cardinality), `adopt_candidate` (full candidate key incl. `mapping_gen`, across statuses), §5.1 outcome list `left_ambiguous`, §5.3, §5.4, §9.2 |
| T2 S3 mutation chain | P1 | ACCEPT | §3.1 per-key atomic commit; `dq_reconciliations.cycle_id/issuer_id/market/attempt` + unique accepted-result marker; §3.2 `apply_reconcile_result(p_fence, p_result)` replaces `reconcile_quarantine` and the multi-action variant; `claim/complete/fail_reconcile_member`; counters derived from accepted keys; no superseding; §5.5, §5.6, §8, FactsDb list |
| T3 calendar retry protocol | P2 | ACCEPT | §3.1 `dq_calendar_pass_members` with per-member state; fenced `claim_calendar_pass`/`replace_filing_expectations` (4-arg only)/`fail_calendar_member`/`finish_calendar_pass`; §6.1, §6.2 |
| T4 dataset casing | P2 | ACCEPT | `DATASETS.facts(m)` = `facts.us`/`facts.cn`; adoption, reconciliation items |
| T5 candidate schema | P1 | ACCEPT | §3.2 `adopt_candidate` explicit `FactCandidate` adapter; generation from anchored run; `mapping_version` from retained rows else `replay_required`; generated `run_id`/`fact_id`; `filing_not_found` |
| T6 promotion layer | P1 | ACCEPT | §3.2 predicates in `fact_promote_rows`; `IS DISTINCT FROM true`; every entry point tested |
| T7 non-ok window behaviour | P1 | ACCEPT | §3.2 `read_facts_lineage` preserves landed semantics |
| T8 metrics stale guard | P1 | ACCEPT | §3.2 `based_on_lineage` through `MetricRow`/adapters/pagination; §4.4 before/after vector read, `metrics:[]` + `stale:true` |
| T9 helper contracts | P2 | ACCEPT | `findFilingBySourceRef`, `filingsForCalendar`; extended `materialize` contract (§4.4); §6.2 input |
| T10 dispatcher/recovery | P2 | ACCEPT | §4.6 extend `resolveFactsItem`; pending hooks for all new visibility decisions; new `materialize.ts --pending-hooks`; §9.1 |
| T11 filings update grants | P2 | ACCEPT | §3.2 `filings` new-column paragraph; §2 row |
| T12 upstream baseline | P2 | ACCEPT | header "上游" paragraph; §12 row |
| T13 catalogue count | P2 | ACCEPT | header paragraph (35, `MAX_READ_CONCEPTS`, `monetary_funds`, CN `cash` missing) |
| T14 CN document relationship | P2 | ACCEPT | §5.4 gold row `tushare_source_ref` (independently verified), `document_ref` cross-check only, type-5 own row; validator; §14-8 struck |
| T15 evidence baseline | P2 | ACCEPT | E5; §5.1 `us.companyfacts_vs_gold` `incomplete_gold`; §5.4 CI gate creation + deploy gate; §6.1 CN `disclosure_date` raw retention, `unknown_upstream` until verified |

## Round 6 (`07-codex-round6.md`, confirmation of the 6th-draft diff) — implemented in the 6th draft before commit

Codex round-6 verdict (quoted): "Verdict: not ready — calendar claim preconditions, isolation-hook recovery, and the adoption conflict guard require correction". T1, T4–T9, T11–T15 RESOLVED; T2, T3, T10 PARTIAL only via U1/U2.

| # | Severity | Disposition | Where |
|---|---|---|---|
| U1 calendar claim blocked by token precondition | P2 | ACCEPT as prescribed | §3.1: `claim_calendar_pass` own protocol (advisory xact lock per market, lock unfinished pass, create or take over idle/expired lease, return token); live-owner check only for replace/fail/finish |
| U2 isolation-hook recovery | P2 | ACCEPT as prescribed | §5.6 `detail.issuer_id/market` persisted with the hook; §4.6 `--pending-hooks` scans resolved visibility decisions AND open `reconcile_mismatch` items, target re-resolved via `T(i)`; crash-after-commit test |
| U3 adoption conflict guard conjunction | P1 | ACCEPT as prescribed | §3.2 `adopt_candidate`: `conflict_exists` when either a differing `ok` value or an applicable open dispute exists, checked under the scope lock; test |

No further Codex round: the three fixes are the prescribed text, applied verbatim (the task brief asks for one incremental round; this second round was a confirmation of that round's diff). The plan audits re-check these sections.
