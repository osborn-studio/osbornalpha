# Owned-pool teardown guard (2026-10-17)

## What failed

The `main` run for the #73 merge commit (`afa59b7`, CI run 39001710702) passed lint, typecheck, `test:db` (246 files / 2086 tests, 14 critical suites / 113 critical tests / 0 critical skips, 42 migrations), the migration rehearsal, runtime privileges, runtime TLS and the revocation consumer step, then failed in **Candidate approved binding registration** after the script had already printed its success line:

```
Registration acceptance passed: missing approval, freshness/scope, rollback, concurrent idempotency, consumer revoke and tombstone denial.
node:events:497
      throw er; // Unhandled 'error' event
error: terminating connection due to administrator command
    at Client._handleErrorMessage (pg/lib/client.js:433)
Emitted 'error' event on BoundPool instance
##[error]Process completed with exit code 1.
```

The tree is byte-identical to the PR head `919ee2d`, whose run 39000511131 passed the same step. Of the last 60 CI runs, this is the only one with this signature.

## Mechanism

`registration-smoke.ts` tears down with `await closeS4Pool(); await db.end();` and then stops the owned cluster synchronously (`pg_ctl -m fast -w stop`).

- `pg-pool` resolves `pool.end()` as soon as `_clients` is empty, which happens inside `_remove()` *before* each client's socket has closed; `client.end()` only writes the Terminate message and half-closes the socket (pg-pool 3.14.0 `_pulseQueue`/`_remove`).
- A fast stop sends `FATAL 57P01 terminating connection due to administrator command` to every backend that has not yet processed its Terminate. The half-closed client still reads, `_handleErrorMessage` finds no active query and emits `error` (pg 8.23.0 `client.js` 416-436).
- pg-pool's idle listener re-emits that error on the pool. No pool in the scripts or in `src/lib/research/s4/db.ts` had an `error` listener, so Node threw, after the acceptance had already passed.

Whether the FATAL wins the race depends on scheduling between the last Terminate and `pg_ctl`; it is rare on a loopback and showed up once under the Linux runner.

## Reproduction

A 20-round loop of `pool.end()` immediately followed by a synchronous fast stop did not trigger on the Mac loopback (0/20). Inserting a TCP proxy that delays only the client's Terminate (`X`) frame by one second makes the ordering deterministic:

| Pool `error` listener | Outcome |
|---|---|
| none | `uncaughtException` with SQLSTATE 57P01, process exit 1 |
| attached | listener receives 57P01 once, process exits 0 |

The proxy script lives outside the repository (session scratchpad); it only ever talked to an owned cluster on 127.0.0.1.

## Change

- `scripts/s4/local-db.ts`: `ownedPool(config)` creates a `pg.Pool` with an `error` listener that logs `owned pool idle client error { code }`, SQLSTATE only, never the message, host or credentials. The harness's own admin pool uses it, so the failure path (`admin.end()` directly followed by `stopLocalDatabase`) is covered too.
- `scripts/ci/migration-rehearsal.ts`, `scripts/s4/runtime-privileges-smoke.ts`, `scripts/revocation/{consumer,registration,list,retention}-smoke.ts`: every `new Pool(` for an owned cluster is now `ownedPool(`.
- `src/lib/research/s4/db.ts`: the research pool attaches the same SQLSTATE-only listener. Without it an idle connection dropped by the server would crash the process rather than fail the next query; this is the standard `pg` requirement and does not change any query, transaction or privilege behaviour.

Nothing here changes migrations, CI steps, production configuration or dormant feature flags. A listener does not mask failures inside a test: a backend terminated mid-query still rejects that query, and the scripts still exit 1 on any assertion or cleanup error.

## Tests

- `src/lib/research/s4/owned-pool.test.ts`: `ownedPool` has exactly one `error` listener; emitting a 57P01 error whose message carries a synthetic secret and the loopback host logs only the code; an error without SQLSTATE logs `unknown`.
- `src/lib/research/s4/db.test.ts`: `s4Pool()` in local mode has one `error` listener and the same redaction.

Both fail on `main` (`listenerCount('error')` is 0; `ownedPool` does not exist) and pass with this change.

## Local verification

Mac arm64, Node 26.5.0, owned PostgreSQL 17.10 (Homebrew), `npm ci` from the lockfile (trade evaluator 0.3.0), `LC_ALL=C` because this shell's locale makes the postmaster refuse to start.

| Gate | Result |
|---|---|
| `vitest` new tests + `runtime/config.test.ts` | 3 files / 26 passed |
| `npm run lint`, `npm run typecheck`, `npm run build` | pass |
| `test:migrations` | PASS: fresh schema equals seeded upgrade; both clusters stopped |
| `test:runtime-privileges`, `test:runtime-tls` not rerun (TLS has no pool), `test:revocation-consumer`, `test:revocation-retention`, `test:revocation-list`, `test:revocation-registration` | all exit 0; registration prints its acceptance line and exits cleanly |
| `test:db` | first run 247/248 files, 2087/2088 tests: the one failure was `owned-process-group.test.ts` (`kill EPERM`, process-group signalling under the parallel run), which passes in isolation on this branch and on untouched `main`; second full run recorded below |

Three full `test:db` runs on this Mac (load average above 4 throughout):

| Run | Result | Failures |
|---|---|---|
| 1 | 247/248 files, 2087/2088 tests | `owned-process-group.test.ts` `kill EPERM`; passes alone on this branch and on untouched `main` |
| 2 | 247/248, 2087/2088 | `weekly.integration.test.ts` `deadlock detected`: critical suites share one database and run in parallel workers |
| 3 | 245/248, 2085/2088 | `migration-history.test.ts`, `arm-lineage.integration.test.ts`, `handoff-cli.test.ts`, each `Test timed out in 5000ms` |

No failure repeated, none involves a pool `error` event, and the two CLI suites do not open a database at all. These are pre-existing load and cross-suite flakes on a busy workstation; the same suite passed 246/246 files on the Linux runner for the identical tree (run 39001710702) and for PR #73's head. The `research-db-summary.json` gate therefore stays red locally and this doc does not claim a green local `test:db`.

A Mac run does not prove the Linux runner; the fix is only confirmed once `main` CI passes the registration step again, and the race was rare there to begin with. What this change guarantees is that a late 57P01 can no longer turn a passed acceptance into exit 1.

## Not covered

- The guard removes the crash; it does not make `pool.end()` wait for socket close. If a later harness needs a provably quiet server before stop, that is a separate change.
- Production equivalence is not claimed: the research pool listener was exercised with a synthetic emitted error, not against Supabase.
- The quote-service-alert workflow failures on 2026-10-17 04:17 UTC (HTTP 402 `DEPLOYMENT_DISABLED` from Vercel, cleared by 07:05 UTC when the same routes answered 401/200 from this session) and its ongoing `preferred_source: degraded` classification (DataGateway/Wind unreachable from Vercel, eastmoney fallback serving) are unrelated to this change and are recorded in the session report, not fixed here.
