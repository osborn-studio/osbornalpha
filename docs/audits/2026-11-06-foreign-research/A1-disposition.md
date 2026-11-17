# A1 audit disposition (MiniMax `mmx` + Opus calibration review)

MiniMax reported 31 items (8 P1). The commander's Opus review checked each against the migration, the spec and the real-PostgreSQL run (11/11 integration tests, `test:migrations` PASS):

| ID | Verdict | Reason |
|---|---|---|
| A1-001 | rejected | spec §4.1 material-change list excludes `source_label` / `evidence_path` |
| A1-002, A1-003 | rejected (false positive) | child guard exempts snippet/summary `status → draft/rejected` on published reports; report guard allows `evidence_ok/disclosure_ok` changes (spec §4.4) — verified in `broker_report_child_guard` / `broker_reports_guard` |
| A1-004, A1-005 | accepted as P3 / by design | `broker.publishing` is a transaction-local GUC set only inside `broker_report_publish` (A2); only service_role (trusted server) can write base tables; anon/authenticated have no table grants (tested) |
| A1-006, A1-007 | rejected | confirmation semantics are enforced by `confirmed_version = version` + clearing on material change (tested); visibility is the view's job (A3) |
| A1-008 | rejected | replay verified by `test:migrations` PASS and the integration replay block |
| A1-009, A1-010 | deferred to A2 | lease CAS / parse-run bookkeeping live in A2 functions per plan |
| A1-011 | rejected | `validating → open` is deliberate (plan P-R1-07) |
| A1-012 | rejected | contract: decimals are strings (plan 契约补充) |
| A1-013, A1-026 | rejected | span verification is rule R1 (B4/C5) and snippet approval checks (C7), not a CHECK constraint |
| A1-014..A1-018, A1-020..A1-022 | deferred / rejected | publication contents, receipt ownership and approval checks are enforced by A2 functions and approval triggers per plan; direct service-role inserts are blocked by the publishing guard |
| A1-019 | rejected | spec §4.13: service_role has all privileges on base tables; append-only triggers block evidence deletes (tested) |
| A1-023 | rejected | settings audit is at the admin route (C2), spec §4.1 |
| A1-024 | rejected | action enum matches spec §4.10 exactly |
| A1-025 | P3, not fixed | extractor format is further constrained by the writers (C5) |
| A1-027 | rejected | spec §10.2: `licence.changed` makes F4 re-check `visibility_ref`; no per-report list required |
| A1-028 | P3, not fixed | cosmetic |
| A1-029 | resolved | commander ran the suite on PostgreSQL 17: 11/11 |
| A1-030 | resolved | lock entry appended in the A1 commit |
| A1-031 | resolved | log note: `broker_storage_writes` is the deliberate 22nd table (plan P-R5/P-R6) |

Calibration note: MiniMax works from a truncated diff and has no repo access; most P1s were false positives. Going forward its findings are verified by the commander before any fix is dispatched.
