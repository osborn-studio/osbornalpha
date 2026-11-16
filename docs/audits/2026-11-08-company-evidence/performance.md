# Evidence validator lookup profile

The evidence validator now resolves a globally unique `fact_id` through its primary key, then checks issuer and market ownership. This removes a plan choice that can scan the stream index once for every input fact. The existing rejection detail, validation order, scope lock, revision and attempt fences, whole-stream replacement, and function grants remain intact.

This is a local performance result. Production receipts confirmed statement timeouts; they did not establish this execution plan as their cause.

## Controlled measurements

PostgreSQL 17, isolated loopback cluster created by `scripts/s4/local-db.ts`; Node 22.22.1. No developer environment files or production data were used. Synthetic US/EDGAR and CN/Tushare filings/facts were staged and published through the existing integration fixture helpers. Each evidence row had valid snapshot hash/locator lineage, source and path, and the complete field schema. Input sizes were about 55 KB, 550 KB, and 2.8 MB. Each full RPC was run three times per size; table below reports median client wall time including parameter serialization and writes. Default planner settings; newly populated tables without explicit ANALYZE.

| Market | Input rows | Before (ms) | After (ms) |
|---|---:|---:|---:|
| US | 100 | 8.5 | 6.1 |
| US | 1,000 | 231.5 | 57.2 |
| US | 5,000 | 4,698.2 | 316.1 |
| CN | 100 | 7.5 | 5.8 |
| CN | 1,000 | 203.6 | 56.5 |
| CN | 5,000 | 4,635.9 | 357.2 |

Nested `auto_explain` isolated the old validator lookup: `financial_facts_read_idx` scanned issuer/market rows and filtered by `fact_id`. Individual inner plans removed thousands of rows. The modified validator used `financial_facts_pkey`. A validation-only 5,000-row baseline took about 4.4 seconds. The old deletion statement took only 7–9 ms and used a hash anti join; it was not changed.

An explicit ANALYZE of the populated fact/filing/scope tables reduced an old-code 5,000-row US RPC to 286 ms (validation alone 138 ms). This is strong evidence that the poor baseline is planner/statistics sensitive, not inherent cost for every large stream. The change eliminates the competing issuer/market access path rather than relying on a timeout increase or a specific statistics refresh. Measurements are not a production latency estimate or an SLO.

## Correctness and contention

The real PostgreSQL regression adds a 1,000-row replacement in each market and checks foreign issuer, foreign market and missing fact rejection with exact `invalid_evidence` detail. Rejected calls preserve all prior evidence and verification timestamps. Separate two-connection cases hold the scope row or an existing evidence row, observe `pg_blocking_pids`, release the lock and verify replacement succeeds. These demonstrate genuine lock waits separately from the uncontended CPU/planner experiment; they do not establish production contention.

Partial and empty replacements retain whole-stream deletion semantics. Existing tests continue to cover stale revision/attempt rejection, digest ownership and grants. Function replay tests now replay the new migration after the older fence migration.

Validation: all 36 company test files passed against disposable PostgreSQL: 370 passed, 3 pre-existing skips. Scoped ESLint, migration inventory (67 files), and `git diff --check` passed. Repository typecheck remains blocked by missing shared `pdfjs-dist/legacy/build/pdf.mjs` and the resulting implicit-any error in unrelated document code.
