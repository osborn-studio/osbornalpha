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
