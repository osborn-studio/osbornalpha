# Wave162 manifest persistence timeout investigation

Production acceptance remains BLOCKED. SQLSTATE 57014 (`canceling statement due to statement timeout`) in `/rest/v1/rpc/macro_put_manifest` is confirmed by the parent's Supabase controlplane evidence. The underlying production slowdown remains UNKNOWN. This PR adds focused regression coverage; it is not a production timeout fix.

## Evidence and limits

Production deployed revision: a4fafbab0190604f282f3c101a7312fe4b1db415. Parent evidence: `/tmp/osstack/osbornalpha-wave162/cycle500/supabase-cua-errors.json`, browser-evidence.json, replay.json, probe.json, and Vercel failure telemetry. Earlier probe's persistence took 18,792 ms; that number includes network/adapter metadata verification and is not a database execution profile. Earlier replay verified identical old/new complete view hashes. No cycle route or routes.test.ts changes are included here.

One existing manifest was fetched by a read-only anonymous table SELECT using the existing CLI environment. No production RPC invocation, write, migration, SQL setting, compute change, browser control or browser credential access occurred. The temporary environment file was mode 0600 and deleted after fetching. Credentials were never printed. No production payload is committed.

Fixture: manifest `1aec335b-5920-4659-8715-a3be51e08fcc`; canonical body SHA-256 `dd4f7741747e193044bd703c4bc4cb4e34399ecb569ee2b3537c3a8f8950e10b`; **22,451 input observations in one 6,345,486-byte manifest**. Hash independently verified before replay. Full body readback equals the canonical input after local gateway tests.

Local environment: Node 22.22.1, PostgreSQL 17.10 Homebrew, PostgREST 14.5 official macOS arm64 release. All repository migrations replayed to disposable loopback clusters; original repository RPC unchanged. Production function definition, PG minor version, effective settings, concurrent workload, hardware/storage and exact failing payload were not independently obtained. The fixture is from the successful request; no failed request body was captured. These are not production-equivalent benchmarks.

| Local exact-body operation | Milliseconds |
| --- | ---: |
| JSONB parse and stringify | 52.8 |
| Typed json_to_record conversion and stringify | 73.9 |
| Direct service-role first RPC insert | 64.5 |
| Direct service-role RPC replay | 41.0 |
| Modeled PostgREST lateral record/scalar replay, two samples | 64.4 / 62.7 |
| Real PostgREST 14.5 first insert | 177.1 |
| Real PostgREST 14.5 replay, three samples | 144.5 / 139.6 / 138.5 |

These are individual elapsed samples, not latency percentiles or an SLA. EXPLAIN ANALYZE BUFFERS of the modeled gateway statement: planning 0.164 ms, execution 47.729 ms; JSON record source executes once. Temporary read/write blocks: 891 each (about 7 MB each). The spill is observable but not shown to cause the production timeout. No repeated-evaluation or payload-size-only timeout reproduced locally. Actual gateway query captured from local pg_stat_activity confirms the modeled lateral json_to_record/LIMIT 1/scalar call shape; production full SQL text was unavailable.

Actual gateway role denials: anon HTTP 401, authenticated HTTP 403, both SQLSTATE 42501. Under a deliberately held local ACCESS EXCLUSIVE table lock, pg_stat_activity showed Lock/relation for the RPC. A 1,500 ms timeout configured only for the disposable gateway login yielded HTTP 500 / 57014 at 1,601.7 ms; after releasing the lock, exact replay returned the original ID at 178.3 ms and complete body/hash matched. This demonstrates one possible mechanism, **not evidence of production lock contention**. Initial harness setup attempts (root OpenAPI readiness query timeout; service-role timeout not applied to the connection) were corrected and are excluded from the successful final benchmark evidence.

No optimization, retry, validation reduction, timeout increase, migration or adapter change is justified by these measurements. Parent should collect the complete failing statement/context, effective role/transaction timeouts, existing pg_stat_statements timing/plan counts, and same-window wait events/blockers and CPU/I/O metrics through its authorized controlplane. Do not replay production writes or infer historical contention from a later snapshot. Parent owns any production migration and browser acceptance.

## Regression and review

The existing critical `strategy.integration.test.ts` now creates a synthetic >6 MB manifest with 22,451 full provenance inputs, passes it through the real adapter and a typed lateral JSON record SQL boundary, concurrently persists the same body, verifies one identity/row and full canonical readback/hash, then changes the final input under the original hash and requires payload_conflict with unchanged stored body. This test does not include a real HTTP gateway; that separate exact-payload experiment is preserved in scratch.

Mutation validation: locally disabling the RPC's body equality/conflict check made the new test fail at the final-input payload_conflict assertion. Restoring the original function passed. No production or repository SQL was mutated. This proves the guard catches provenance-validation loss; it does not prove a timeout fix.

MiniMax-M2.5 design and audit each completed with actual stop_reason=end_turn and nonempty final answers. Initial design stopped at max_tokens and was not counted; the shorter design retry completed. Audit: NO BLOCKING FINDINGS, explicitly retaining production acceptance BLOCKED. Raw requests/responses and final texts are in scratch. Code review also checked parameterization, role context, complete body checks and scope.

## Verification

Node 22 PATH used for every npm/tsx command. Local CI commands: full lint and typecheck; F6 gold/lock/redaction/diff; full test:db; fresh/seeded test:migrations; runtime privileges/TLS; revocation consumer/registration/list/retention; native sharp smoke; Next production build; production dependency audit. Migration inventory validated all 65 migrations, locked history and critical suite discovery during test:db. Full database suite: **8,748 passed / 7 skipped; 54 critical suites, 789 critical assertions, zero critical skips**. The seven environment-gated skips are disclosed; no claim of zero total skips. npm audit high-severity gate passed with one pre-existing moderate fast-uri advisory. Registration smoke also passed. All listed local CI commands exited 0. Remote PR CI completion is not yet claimed.

Scratch: `/tmp/osstack/osbornalpha-wave162/manifest-timeout/`. Key files: fixture.json (restricted local payload), bench.ts/bench.json/bench.log, gateway.ts/gateway.json/gateway.log, mutant.ts/mutant.log, full-db.log, other check logs, mmx-design-retry.json, mmx-audit.json. Local cluster cleanup confirmed by successful harness exits. No merge/deploy performed. Parent retains production acceptance ownership.
