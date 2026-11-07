# PR D (docs→company) — final disposition (commander, 2026-11-07)

Rounds: 04 (21 findings) → Codex fix 1 → 06 re-audit (23) → Codex fix 2 → 07 final (P1s below). PG17: documents-bridge + documents suites 57/57; `test:migrations` PASS.

Final-round P1s checked by the commander against landed code:
| ID | Disposition | Evidence |
|---|---|---|
| DOC-001 | Reject | F3 `read_documents` ranks `partition by d.source, d.source_ref order by d.source_version desc` (20261117090000_disclosure_documents.sql:1220); the RPC mirrors it after exact binding. |
| DOC-003 / DOC-011 | Reject | `filings_source_ref_uniq unique (source, source_ref)` (20261106090000_financial_facts.sql:59): no multiple generations per ref; RPC takes the filing id and applies company_read_snapshot's `mapping_gen>0 and available_date<=asOf`. |
| DOC-004 | Reject | `filings_source_check`: hkex / edgar / tushare only (20261117091000_fact_citations.sql:36); CASE covers all and raises otherwise. |
| DOC-007 | Reject | The browser can only verify the page against the hash the server reads from `fact_citations`; the client recomputes SHA-256 of the page text and requires equality with both. |
| DOC-008 / DOC-009 | Accepted residual | CI has no PostgREST; the PG17 suite runs the RPC and the shared citation query functions the routes call under `set local role anon`. PostgREST translation is covered by route/unit tests. |

Flag: `NEXT_PUBLIC_COMPANY_F3_DRAWER` default on (unset → on; `0`/`false` → off). F3 job flags (`DOCUMENTS_*_ENABLED`) stay off, so in production the drawer shows the honest not_found state until documents are synced.
