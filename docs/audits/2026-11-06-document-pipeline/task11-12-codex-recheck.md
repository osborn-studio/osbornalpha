| ID | CLOSED? | note |
|---|---|---|
| T11-01: malformed extraction cursor | CLOSED | Reported `["x"]` case now returns 400. A remaining timestamp-validation gap is covered by N1. |
| T11-02: bounded successor scan | CLOSED | All three adapters use ascending versions with exclusive `source_version > cursor`; limit 1 retrieves the immediate successor without including current. |
| Opus: cursor-only error mapping | NOT CLOSED | Message matching misses PostgreSQL cursor cast errors; see N1. |
| Opus: page-number syntax | CLOSED | Rejects leading zeros, zero, negatives, fractions, and numbers above 999999. |
| Opus: citation permission | CLOSED | Public response requires a public document; owner fallback remains audited and private. |
| Opus: unknown parameters | CLOSED | Allowlists match §9, including list `asOf/limit/cursor`, detail `extractionsCursor`, and page `layout/extraction`. No frontend caller requiring `lang` found. |
| Opus: missing file object | CLOSED | `object_not_found` maps to 404. |
| Opus: upload conflict | CLOSED | Permission/license differences produce `upload_conflict`. Database deduplication keys include owner UUID; another owner’s identical bytes produce a separate row. |
| Opus: batch finalization | CLOSED | Finalization failure returns `batchError` without counting the stored upload as failed. |
| Opus: filename format characters | CLOSED | Filename validation rejects `\p{Cf}`. |
| Opus: license length | CLOSED | Trimmed reference measured in Unicode code points. |
| Opus: cross-owner extraction | CLOSED | Extraction/document association checked before page loading or auditing; regression test added. |
| Anonymous visibility | CLOSED | Public permission checks, anonymous RLS reads, owner authorization, and private cache headers remain intact. |

Opus labels follow the supplied summary and commit changes.

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P2 | `src/lib/documents/read-route.ts:52` | `cursor=WyJ4IiwieCJd` (`["x","x"]`) passes list validation and reaches SQL casts. PostgreSQL returns `22007` without “cursor” in its message; the narrowed mapper returns **500**, previously 400. Likewise, extraction cursors containing `2026-99-01T00:00:00Z` pass the timestamp regex and produce an unmapped `22008`. | Validate cursor UUIDs and timestamp values before querying, or normalize errors specifically at cursor conversion boundaries to `invalid_cursor`. Add regressions for malformed two-element list cursors and out-of-range extraction timestamps. |

Read-only verification: inspected diffs, tests, adapters, SQL, and §9; executed in-memory validation/error-mapping probes with simulated PostgreSQL errors. Full suites and live database tests were not run.

VERDICT: fail (0 P1, 1 P2)