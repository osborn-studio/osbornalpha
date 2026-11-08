# Manifest persistence JSON transport remediation

Production acceptance remains pending. This change removes measured JSON argument conversion overhead; it does not establish that every production timeout is resolved.

The parent's authenticated Supabase SQL profile on 2026-11-08 UTC confirms that the deployed `macro_put_manifest` definition and source digests match the unmodified repository migration. `authenticator` configures statement and lock timeouts of 8 seconds, with no reported `service_role` override. The dashboard's 120-second statement timeout describes another session. Pooled settings and request hooks were not independently observed, so configured values are not asserted as a complete live gateway settings measurement.

The candidate service-role query has 55 completed calls, mean 1,275.32 ms and maximum 7,543.34 ms. These statistics are cumulative since June, can omit canceled executions, and cannot identify a specific failure. During a concurrent failing cycle request, the parent observed one active candidate statement at 7.79 seconds, with no wait event or blockers at that instant. This weakens a lock explanation for that sample; it does not exclude contention elsewhere. The manifest relation reports 24 live tuples, zero dead tuples and about 8.54 MB total size.

Paired production **read-only component profiles**, over the same constructed JSON payload selected by one known public manifest hash, measured:

| Component | Execution ms | Temp blocks read | Temp blocks written |
| --- | ---: | ---: | ---: |
| Typed `json_to_record`, including payload construction | 2,115.642 | 891 | 1,718 |
| Direct JSONB extraction, including payload construction | 861.557 | 0 | 827 |

Both plans reported 186 shared buffer hits. The record function executed once; its own temporary reads/writes were 891 each. The shared payload CTE accounts for 827 temporary writes in each profile. These separate observations are subject to cache and workload differences. They demonstrate a removable component cost, not an end-to-end latency guarantee or a replay of the historical failing payload. An earlier ID-selected roundtrip and hash-selected record profile reported different body sizes and are not treated as a paired comparison.

The forward migration adds `macro_put_manifest_json(jsonb)` with one **unnamed** argument, the documented PostgREST mechanism for accepting the raw JSON request body. PL/pgSQL prevents SQL-function inlining. The security-invoker wrapper checks the request envelope and delegates all seven arguments to the unchanged original RPC, preserving table constraints, full JSONB body equality on hash conflict, concurrent identity and complete provenance. PUBLIC, anon and authenticated execution are revoked; service_role alone receives execution. Supabase transport selects the new endpoint with the same complete JSON body. Other transports and the original RPC remain available. No cache, retry, timeout, compute, route diagnostic or evidence-reduction change is included.

A metadata-only pre-read was rejected: the SQL API accepts caller-supplied hashes, so matching the stored hash alone cannot replace the existing complete-body conflict check. A fully validated pre-read would also reintroduce the large response transfer removed by the earlier metadata optimization. This change instead addresses the measured gateway conversion boundary.

Local verification includes a real PostgREST 14.5 HTTP test using the previously hash-verified 22,451-input manifest: insert, replay, matching legacy/new identity, anon/authenticated SQLSTATE 42501 denial, final-input conflict, and complete canonical readback/hash all passed. The loopback login used the reported 8-second caps, 2,184 kB work_mem and disabled JIT; hardware, PostgreSQL minor version and workload differ from production. These checks establish dispatch and correctness, not production performance. Committed PostgreSQL coverage additionally checks concurrency, malformed requests, service-only execution, unnamed argument metadata, unchanged constraints and migration replay. The adapter routing regression failed before implementation.

MiniMax-M2.5 independently reviewed the diagnostics and implementation, completing with actual `stop_reason=end_turn` and no blocking findings after diagnostic corrections. Raw requests/responses, SQL requests, local gateway evidence and progress are retained under `/tmp/osstack/osbornalpha-wave169/persistence/`; the parent's production profile is `/tmp/osstack/osbornalpha-wave169/db-profile.json`. No credentials or production manifest bodies are committed.

**Release order:** the parent owns merge and deployment. After this migration is merged, apply `20261121090000_macro_manifest_json_transport.sql` and confirm PostgREST schema reload before exposing the application revision that calls the new endpoint. There is intentionally no fallback retry. No production migration, deployment or write was performed by this task. The parent must verify the merged production large-payload path and complete-view/hash equality before declaring the incident resolved.
