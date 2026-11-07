# Industry research spec — Codex round 5 disposition (2026-11-06)

Round 5 = incremental audit of the 5th draft (new defects + incompatibility with landed plans 1/2 + verdict). Report: `01-codex-spec-round5.md` (verdict: not ready; V1–V3 blocking). All twelve findings applied in the 6th draft as prescribed:

| ID | Sev | Disposition | Spec location |
|---|---|---|---|
| V1 | P1 | Applied, by the alternative the landed code already uses: no `industry_publisher`; tables and SECURITY DEFINER functions owned by the migration role (table owner, RLS not forced), `service_role` writes revoked. This removes the need for a publisher privilege matrix and per-table publisher policies; tests assert `prosecdef`, owner = table owner, and every RPC succeeds when called as `service_role`. | §4.3 opening |
| V2 | P1 | Applied: run tables revoke-all + select; create/fail/coverage/license/source-record/SIC RPCs; parent run row locked before every status check; legal transitions; immutable metadata trigger. | §4.3 functions + common rule |
| V3 | P1 | Applied: union into `desiredCn` with per-issuer reason merge, historical ticker rule, paging, snapshotAt; gated by `FACTS_CN_INDUSTRY_UNIVERSE`. | §4.10 |
| V4 | P2 | Applied: CN activation dependency; production aggregation off. | §4.10 |
| V5 | P2 | Applied: manifest `derived` keeps `MetricRow.inputs`; `stateRev` mapped explicitly; filing lookup for source_ref/citation. | §5.1, §5.3 |
| V6 | P2 | Applied (option 1): one `readFacts` envelope per issuer per run, union of concepts. | §5.1, §5.3, §5.4 |
| V7 | P2 | Applied: `industry_observation_receipts` + payload hash; A/E1→A/E2→B/E3→retry E2 test. | §4.3, §6.1 |
| V8 | P2 | Applied: prune is the only delete path; freeze trigger allows delete only for superseded/failed runs. | §4.3 |
| V9 | P2 | Applied: `20261111090000_industry_research.sql`, `20261111091000_industry_research_functions.sql`. | §2, §4.3 |
| V10 | P2 | Applied: full call signatures. | §4.4, §4.7, §5.4, §4.3 dq row |
| V11 | P3 | Applied: reuse `issuers_cninfo_idx`. | §4.3, §4.7, §13.2 |
| V12 | P3 | Applied. | opening table |
| (self) | P3 | Manifest GC split into candidate listing + TS bucket delete + index delete (migrations cannot reference `storage.objects`). | §4.3 |

Per the coordinator's instruction ("one incremental Codex round on the spec"), no further spec round is run; the plan rounds re-check the spec through the plan.
