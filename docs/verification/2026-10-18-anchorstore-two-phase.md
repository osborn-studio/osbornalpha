# I1.4a: AnchorStore interface, runner manifest and two-phase anchor drain (2026-10-18)

Status: **local-only code. No production path exists.** Nothing in this change touches a migration, a feature flag, a host, a role, a secret or any deployment configuration. `s4Pool()` still rejects production, the worker loop (`scripts/s4/anchor-worker.ts`) still calls the single-transaction `drainOutbox`, and the only callers of the two-phase path are its own tests. The owner decisions in ADR `docs/adr/2026-10-18-anchor-runner-and-checkpoint.md` §8 remain open; this is the step that ADR §7 item 1 allows to proceed before they are taken.

Inputs: ADR 2026-10-18 §4 and §7, plan 02 §3 (interface shape, identity, recovery states) and 06 §D (two-phase algorithm, caps, watchdog, fencing), verification rows V09 and V10.

## What was added

| File | Role |
|---|---|
| `src/lib/research/s4/anchor-store.ts` | `AnchorStore` interface with exactly `readCheckpoint`, `readReceipts`, `appendExpected`, `flush`, `verify`, and the file implementation `fileAnchorStore(root, ownerScopeHash)`. Same `<root>/<owner scope hash>/receipts.jsonl` layout and line format as before, 0700 directories and a 0600 journal owned by this uid, `O_NOFOLLOW`, fsync of the file and of `dir`, `root` and `dirname(root)`, ZERO genesis. `appendExpected` is a compare-and-append on `(bytes, last_sequence, last_hash)`; a moved tail throws `anchor_tail_moved`. Appends and flushes go through one in-process critical section per journal. The shared `controlledDirectory` and `journalEntries` helpers moved here from `anchor.ts`. |
| `src/lib/research/s4/anchor-manifest.ts` | `RunnerManifest` (`store_id`, `database_identity`, `deployment_generation`, `authorized_owner_scope`, `format_version`) with `parseRunnerManifest` (strict parser: exact key set, UUIDs, non-negative safe integer generation, 1–1024 distinct 64-hex scope hashes, `format_version === 1`, 64 KiB cap, duplicate keys rejected) and `readRunnerManifest(path)` (absolute path only, regular non-symlinked file owned by this uid with no group/other bits). The path is operator configuration; nothing takes it from a request. |
| `src/lib/research/s4/anchor-two-phase.ts` | `drainOutboxTwoPhase(actor, options)` and the exported Phase A `verifyAnchorChain`. |
| `src/lib/research/s4/anchor.ts` | `drainOutbox` is exported unchanged in behaviour and signature and stays the regression oracle. Its receipt body, per-row ACK and quarantine block are now exported helpers (`receiptBody`, `acknowledgeRow`, `quarantineOwner`) so both paths run the same code. |
| `scripts/ci/research-checks.ts` | `s4/anchor-two-phase.integration.test.ts` added to `criticalSuites` (16 suites). |

## Two-phase algorithm as implemented

**Phase A** (`verifyAnchorChain`, no owner lock): reads the fence generation and refuses if it is above the manifest (`generation_fenced`); reads the store tail; opens a `repeatable read read only` session (privilege assertion, transaction-local owner claim, admin profile check, **no** advisory lock) and streams the outbox in sequence order against the journal with the oracle's per-entry checks (event hash, export window, canonical body equality, receipt hash agreement). It classifies rows as recovered (journal entry present, SQL not yet acknowledged) or pending (no entry yet), rejects a journal longer than the outbox or an acknowledged row without an entry, and finally checks that the scanned tail still equals the tail read before the scan; otherwise it retries.

**Phase B** (`shortTransaction`, one owner transaction): takes the advisory lock, then re-reads the fence generation, the SQL tail `(last anchored sequence and receipt hash, unanchored count)` and the store checkpoint. Any difference from Phase A aborts back to A (`anchor_tail_moved`, at most 3 attempts, then `anchor_tail_unstable`). Recovered rows are re-read under the lock and must still be unacknowledged with the same event hash. New rows are taken in sequence order after the journal tail, capped at **500 rows and 1 MiB** per batch (options may lower the caps, never raise them). The batch is appended with `appendExpected` against Phase A's tail, flushed, acknowledged row by row through the oracle's `acknowledgeRow`, and committed.

**Watchdog**: the flush and the ACK+COMMIT leg each run under an injectable deadline (`watchdogMs`, default 5 000 ms). On expiry the runner destroys the pooled client (the server rolls the transaction back and releases the owner lock), records the owner as paused for the rest of the process, and resolves with `{status:'paused', reason:'flush_timeout'|'ack_timeout', appended:0, acknowledged:0}`. Every later `drainOutboxTwoPhase` for that owner in the same process throws `anchor_paused`; recovery is a restart whose first Phase A reconciles the journal tail against the outbox (a completed append becomes recovered and is acknowledged once; a torn line fails closed and quarantines).

**Fencing**: the authoritative generation comes from an injectable `fence` that stands in for the C1 checkpoint registry and for `research_s4_runtime_identity`; by default it returns the manifest's own generation, so local mode has no external authority. I1.4b (PR #83, merged while this branch was open) created that identity table and the runner's SECURITY DEFINER functions in a disabled state, but nothing registers an identity in any environment, and this drain does not call those functions yet (see below). Generation movement between A and B aborts to A; a generation above the manifest refuses both append and ACK. The journal has no generation header because the file format is frozen; the ADR's three-way comparison is therefore two-way until I1.4b/I1.5 add the SQL and C1 sides.

**Quarantine**: an `anchor_integrity_failed` from either phase runs the same `quarantineOwner` as the oracle (integrity row, every observation `integrity_failed`, one ControlEvent per observation).

**Concurrency**: drains for the same owner journal in one process are serialized in order; across processes the owner advisory lock serializes Phase B and the store's compare-and-append rejects a tail another writer moved.

## Tests

`src/lib/research/s4/anchor-manifest.test.ts` (9), `src/lib/research/s4/anchor-store.test.ts` (8) run without a database. `src/lib/research/s4/anchor-two-phase.integration.test.ts` (13) needs `S4_TEST_STATE` and is a critical suite. All were written before the implementation and failed on the missing modules first.

| Row | Case | Assertion |
|---|---|---|
| V09 | crash between append and ACK (BEFORE UPDATE trigger aborts the ACK) | first run rejects, journal has the entries, no row acknowledged; second run `appended 0, acknowledged = entries, remaining 0`; third run `0/0` with the file byte-identical |
| V09 | stalled fsync (injected file handle whose `sync()` never resolves, `watchdogMs 300`) | `paused/flush_timeout`, no row acknowledged, the owner lock is free (a normal transaction completes), a second drain and a drain with a healthy handle both throw `anchor_paused`, `sync` was called once |
| V09 | ACK outliving the watchdog (`pg_sleep(1.5)` trigger, `watchdogMs 300`) | `paused/ack_timeout`, rollback leaves rows unacknowledged, the journal keeps the flushed batch unchanged, second writer refused |
| V09 | fence generation above manifest, before A and moving between A and B | `generation_fenced`, no journal bytes, no ACK; a fence equal to the manifest drains |
| V09 | 20 000 and 200 000 tiers | Phase A completes while another session holds the owner advisory lock for its whole duration and reports `scan_ms`; the drain then appends and acknowledges exactly 500 in one attempt and the oracle accepts the resulting journal |
| V10 | partial last line | `anchor_integrity_failed`, integrity row, the oracle rejects the same journal |
| V10 | damaged hash (body rewritten with a recomputed receipt hash) | `anchor_integrity_failed`, no `receipt_hash` written, exactly one integrity row, repeat still rejected |
| V10 | observation chain + `{broken}` line | every observation `integrity_failed`, one ControlEvent each, AnchorReceipt records equal the observation count before damage |
| V10 | two concurrent two-phase drains; two-phase racing the oracle | exactly one appends; sequences unique |
| parity | journals cross-accepted | oracle accepts a two-phase journal with `0/0`; two-phase accepts an oracle journal with `0/0`; both directions after further appends |
| caps | 1001 rows | `[500, 500, 1]`; `batch.bytes 1200` gives 1–2 rows per batch; `rows 501` and `bytes 1 MiB + 1` are `invalid_schema` |
| manifest | strict rejection | missing/extra field, non-UUID, negative/float/string generation, empty/non-hex/duplicate scope, `format_version ≠ 1`, duplicate key, oversize, relative path, symlink, 0644 file |
| store | interface and format | exactly the five methods on a plain object; genesis; canonical lines; stale tail, broken chain, wrong scope, bad hash, re-ordered entries rejected with the file unchanged; relative root, group-readable directory, symlinked and 0640 journal refused; injected handle stalls `flush` |

## Measured capacity tiers

Mac mini (arm64, Node 26.5.0, owned PostgreSQL 17 on loopback, APFS on the external SSD), `LC_ALL=C`. One owner; the tier rows are bulk-inserted synthetic ControlEvents with a journal built to match, the last 500 left pending. Numbers are wall-clock from one run of the suite on its own disposable cluster with nothing else running; they are evidence for the Mac, not for the Lighthouse disk, where the ADR's p99 < 2 s lock-hold threshold must be measured again.

| Tier | Journal | `store.verify()` | Phase A under a foreign owner lock | Phase A inside the drain | Phase B lock hold (500 rows, fsync, 500 ACKs, COMMIT) | Attempts |
|---|---|---|---|---|---|---|
| 20 000 | 19 501 entries, 11.5 MB | 0.20 s | 0.49 s | 0.49 s | **0.046 s** | 1 |
| 200 000 | 199 501 entries, 117.8 MB | 2.03 s | 10.63 s | 10.46 s | **0.064 s** | 1 |

An earlier run of the same tiers on a cluster shared with other suites and with the full vitest run loading the machine measured 2.7 s / 17.5 s for Phase A and 0.64 s / 0.17 s for the Phase B hold; the hold stayed under the 2 s threshold even then, and the ordering (20 000 slower than 200 000) shows it is dominated by cache state and machine load, not by journal size. Phase B reads the last line of the file, not the file. Phase A grows linearly and never touches the owner lock, which the foreign-lock column demonstrates directly. The 200 000 tier is the ADR's 10× stress case and its scan stays inside a single runner cycle on this machine; journal rotation per generation (ADR §4) is not needed for the first canary.

### Why the suite owns a cluster

The first full `LC_ALL=C npm run test:db` with this suite on the shared harness database failed 13 tests across five files. Two mechanisms, both caused by this suite: its BEFORE UPDATE triggers on `research_s4_outbox` (abort, `pg_sleep`) are table-wide, so the DDL queued behind other workers' outbox transactions and then slowed or aborted their ACKs, while the oracle suite's own abort trigger hit this suite's ACKs (`abort_ack` in the caps test); and 200 000 rows with the highest sequences sit on the path of every other owner's `sequence > $after` page scan (the primary key is on `sequence` alone), which turned 5 s tests into timeouts. The suite now starts and stops its own cluster in `beforeAll`/`afterAll` (about 6 s on this Mac), so neither its triggers nor its rows exist for any other suite. The `S4_TEST_STATE` variable is only the enable switch for it.

## Verification

| Gate | Result |
|---|---|
| `npm run lint` | 0 warnings |
| `npm run typecheck` | pass |
| `vitest` manifest + store + two-phase suites against the local cluster | 9 + 8 + 13 passed |
| `src/lib/research/s4/integration.test.ts` (oracle) | 12 passed, file unchanged |
| `LC_ALL=C npx vitest run` (no database) | 244 files / 2094 tests passed; the one failure, `fanout/calibration.test.ts` "near-linear time" (6 s timeout), ran while the 200 000 tier was loading the machine and passes alone (35/35) |
| `LC_ALL=C npm run test:db` | exit 0: 260 files / 2227 tests, 16 critical suites / 133 critical tests / 0 skipped, 44 migrations, PostgreSQL 17.10 (second run, after the suite moved to its own cluster; the first run's 13 failures are explained above) |
| `npm run build` | exit 0 |

## Relation to I1.4b (main after PR #83)

`docs/verification/2026-10-18-anchor-runner-functions.md` adds the roles `alpha_anchor_fn_owner` / `alpha_anchor_runner`, the tables `research_s4_runtime_identity`, `research_s4_anchor_principals`, `research_s4_anchor_checkpoints`, the functions `research_s4_anchor_tail` / `_read_outbox` / `_ack` / `_confirm_checkpoint` and the evaluation gate, all inactive until operations register an identity. This branch is the runner side and was developed in parallel: the two-phase drain still reads the outbox directly under the web role's RLS and acknowledges through the oracle's `acknowledgeRow` (the web role keeps `UPDATE(anchored_at, receipt_hash)` on the outbox), so it reaches parity with `drainOutbox` on today's privileges. Wiring Phase A to `research_s4_anchor_tail` / `_read_outbox`, Phase B to `research_s4_anchor_ack` under a runner login, replacing the injected fence with the registered generation, and the post-commit `_confirm_checkpoint` call are the next step, after which the web role's outbox UPDATE grant can be revoked as that doc anticipates. The merge touched only `criticalSuites` (now 17); both suites create their own owners and the runner suite uses the shared harness database while this one owns a cluster.

### Full gate on the merged tree

After the merge with main, `LC_ALL=C npm run test:db` on this Mac ran 261 files: 260 passed and `s6/store.integration.test.ts` failed 11 tests with `anchor_checkpoint_pending` from `assertCheckpointed`. That is the I1.4b evaluation gate switching on: `s4/anchor-runner.integration.test.ts` inserts the singleton `research_s4_runtime_identity` row in its `beforeAll` and never removes it, so on the shared harness database every S6 evaluation that runs after it is gated and fails. Reproduced on a fresh cluster: the S6 store suite alone passes 43/43; run after the runner suite on the same cluster, all 43 are skipped because its setup hits the gate. Main's CI passed PR #83 because the Linux runner happened to schedule the suites in the benign order. This branch does not change either suite; the identity cleanup belongs in the runner suite (delete the identity, principal and checkpoint rows in `afterAll`) and is recorded as a follow-up, not fixed here.

## Not covered and deliberately absent

- No production path from this branch: no migration, no flag, no host, no C1 client, no worker change. The fence is an injected interface; the default fence is the manifest itself. The I1.4b objects on main are not called here.
- `store_id` and `database_identity` are validated for shape and carried into results; nothing compares them with `research_s4_runtime_identity` or a C1 registration yet (I1.5).
- `provenance_level` stays `local_receipt`; a local file is not WORM and not a third-party timestamp.
- A stalled fsync leaks the stuck file handle for the life of the process; the pause makes that process disposable by design.
- Timings are from one Mac run; CI on Linux reruns the same assertions but records no thresholds.
