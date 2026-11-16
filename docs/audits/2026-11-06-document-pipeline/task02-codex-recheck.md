| ID | CLOSED? | note |
|---|---|---|
| F1 / review atomic writes | CLOSED | Both writers now issue one transactional RPC; oversized calls reject before mutation. |
| F2 asset truncation | CLOSED | SQL and memory enforce 100 assets per version, below the read ceiling. |
| F3 / review reconcile atomicity | CLOSED | Scope rows are validated before mutations; the reported later-row failure leaves no writes. |
| F4 timestamp ordering | NOT CLOSED | Mixed offsets work, but normalization destroys microseconds, producing ordering and cursor behavior different from SQL. See N1. |
| Opus: approval numeric reads | CLOSED | `precision::text` and `recall::text` are supported [PostgREST select syntax](https://docs.postgrest.org/en/v12/references/api/tables_views.html#casting-columns). |
| Opus: null concepts | CLOSED | Null elements remain null and auto approval fails closed. |
| Opus: exact-decimal threshold | CLOSED | Boundary comparisons are exact; however, accepted numeric syntax regresses. See N2. |
| Opus: insertDocumentVersion check order | CLOSED | Asset bound and duplicate-key checks precede the lease check. |
| Opus: null line_count | CLOSED | Validation and storage both coalesce null/missing values to zero. |
| Opus: extractionsOf cursor validation | CLOSED | Timestamp/UUID syntax is checked before PostgREST filter interpolation. |
| Opus: scopeAll keyset | CLOSED | Pagination advances with `issuer_id > last`, avoiding offset shifts. |

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P2 | `src/lib/documents/memory-documents-db.ts:56` | `Date.parse()`/`toISOString()` truncate timestamps to milliseconds **before storage and sorting**. Reproduction: 12 documents at `.000001Z` through `.000012Z` collapse to one timestamp and sort by UUID rather than chronological order. SQL preserves distinct instants and cursor boundaries. | Preserve microseconds in internal timestamp sort keys and cursors; normalize display values separately. Add shared sub-millisecond ordering/pagination cases. |
| N2 | P2 | `src/lib/documents/memory-documents-db.ts:439` | The new plain-decimal regex rejects valid exponent notation such as precision `'9.5e-1'`. This previously passed, is supported by `canonicalDecimal`, and remains accepted by PostgreSQL `numeric`. Reproduced `invalid_input: ea_threshold` in memory. | Canonicalize the numeric string before exact comparison; add exponent-form acceptance and boundary tests. |

Verification: read-only runtime reproductions plus SQL/diff inspection; no live PostgreSQL/PostgREST execution.

Coverage limits: `WRITE_MAX` is enforced only by the TypeScript adapters; SQL remains unbounded but transactional. The shared contract currently runs only against memory—PostgreSQL wiring is deferred to Task 3. New assertions are substantive, but the three-row atomicity case alone would not catch the former 500-row chunk boundary.

VERDICT: fail (0 P1, 2 P2)