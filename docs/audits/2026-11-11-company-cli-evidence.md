# Company digest CLI evidence correlation

Direct development resumed in OsbornAlpha on 2026-11-11 UTC. The operator CLI now uses the production digest client with the existing evidence response observer. Ticker resolution uses the same client. For a failed evidence POST, a valid upstream request ID appears in the private stage log. The JSON receipt carries structured outcome fields and omits raw per-stream error messages. The persisted batch still records its diagnostic messages.

Five CLI tests run the script with the real Supabase SDK and fixture responses. They cover request ID correlation, one evidence POST per attempt, the existing failure-marking call that schedules backoff, no digest replacement after evidence failure, invalid IDs, transport failures, successful ticker-scoped writes, and dry-run behavior. The tests inspect the backoff call and leave the timing calculation to the existing database function.

## Production observation

An anonymous read of the production freshness endpoint at 00:16:03 UTC on November 11 reported the following results. [Production freshness](https://www.osbornalpha.com/api/companies/freshness)

| Dataset | Status | Last successful attempt (UTC) |
| --- | --- | --- |
| `facts.us` | fresh | 2026-11-11 00:08:01.119 |
| `facts.cn` | fresh | 2026-11-10 20:35:31.019 |
| `company.events` | fresh | 2026-11-10 23:20:34.404 |

The failure cohort and its backlog were not independently queried in this check. The P0-1 retry-selector migration was excluded from Wave223 and its production catalog and migration history remain unverified. P0-3 recovery remains open pending durable writer and coverage readback for the affected streams. [Wave223 production verification](2026-11-10-wave223-production.md)
