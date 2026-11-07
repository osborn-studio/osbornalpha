Prior findings: `not_found` evidence loss and dropped supplementary sources are fixed on both duplicate paths, verified with read-only in-memory probes. The three reported query-parameter bypasses are blocked, but URL credential protection remains incomplete.

| # | Severity | File:line | Finding | Fix |
|---|---|---|---|---|
| 1 | P1 | `src/lib/entities/provenance.ts:23` | **Credentials still reach public provenance.** `https:////bob:pw@example.com/f.csv`, `//bob:pw@example.com/f.csv`, and an absolute URL containing a tab before the password pass sanitization. URL parsing recognizes their username/password. Confirmed `attachSecurity` persists the first URL unchanged. | Parse and normalize URL candidates, including protocol-relative URLs, and reject nonempty username/password. Add regression tests through both sanitization and `attachSecurity`. |

No additional P1/P2 regressions established. SQL parity was inspected statically; PostgreSQL tests were not run.

Verdict: fix required