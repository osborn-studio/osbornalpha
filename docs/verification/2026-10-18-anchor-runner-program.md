# I1.4c: anchor runner program (2026-10-18)

Composes the three merged pieces of I1b into the process the Lighthouse host will run: the I1.4a `AnchorStore` and manifest (#86), the I1.4b scoped functions and gate (#83), and the I1.5 registry client and reconciliation (#88). **Disabled state**: nothing is installed; the unit and notes under `ops/anchor-runner/` are for the owner's host, and no environment holds the runner login or registry credentials.

## Program (`src/lib/research/s4/anchor-runner-program.ts`)

`runAnchorCycle` runs as the runner login, which has no table privilege; every database access is one of the SECURITY DEFINER functions. Per owner and cycle:

1. Fence and reconcile: registry `identity_state` (store id and current generation), `research_s4_anchor_tail`, `research_s4_anchor_checkpoint_cache` (new function, `20261018150000_anchor_runner_cache_read.sql`), the outbox receipt at the registry sequence, and the manifest, through `reconcileCheckpoint`. Any `paused` verdict ends the owner's cycle with nothing written.
2. Phase A outside any lock: every outbox row (paged through `research_s4_anchor_read_outbox`) is checked against the journal exactly as the two-phase drain does; recovered entries (journaled, unacknowledged) and pending rows are collected; a moved tail or any mismatch stops the cycle.
3. Phase B: new receipts are appended and fsynced first; then one transaction acknowledges every recovered and appended entry through `research_s4_anchor_ack` (the first call takes the owner advisory lock), each I/O leg under the watchdog. Expiry destroys the session, pauses the owner for the process and exits the cycle with `paused`.
4. After commit: `confirm` in the registry with a deterministic request id derived from (identity, owner scope, sequence, hash), retried once on `unknown`, then `research_s4_anchor_confirm_checkpoint` mirrors it into the Alpha cache. Only then does `assertCheckpointed` admit those sequences to evaluation.

Reconciliation rule corrected while building this: the authoritative generations are the registry identity, the database identity and the manifest, which must agree exactly; checkpoint rows written under an earlier generation remain valid after a legitimate advance, while a row from a later generation pauses.

## Operator surface

- `src/lib/research/s4/anchor-runner-config.ts`: explicit fields for the runner database and the registry, TLS verified by host name, loopback plaintext only via an explicit test flag, administrative user names refused, secrets non-enumerable, interval 5–3600 s, watchdog 100–30000 ms.
- `scripts/anchor/runner.ts`: `--once` / `--watch`, one JSON line per owner per cycle (sequences, hashes, counts, codes), exit 0 when every owner drained, 2 otherwise, 1 on configuration error.
- `ops/anchor-runner/alpha-anchor-runner.service` (hardened like the deletion-ledger unit; exit status 2 is not auto-restarted) and `README.md` (install, environment, generation advance, status table).

## Tests

- `anchor-runner-config.test.ts`: 3 cases.
- `checkpoint-reconcile.test.ts`: 9 cases after the generation-rule correction.
- `anchor-runner-program.integration.test.ts` (critical suite, own disposable cluster plus a registry database inside it): full drain through the functions with journal, registry and cache all consistent and the gate admitting the observations; idempotent second cycle; incremental anchoring with chain continuity; owner outside manifest scope and unrecognised principal refused with nothing written; registry generation advance pauses until database, mapping and manifest agree; tampered journal reported as integrity failure with journal and outbox untouched.
- `anchor-runner.integration.test.ts` (I1.4b) moved to its own disposable cluster as well: registering the singleton runtime identity in the shared harness database switched the checkpoint gate on for concurrent suites, which #86 observed and this run reproduced.

## Local verification

Mac arm64, Node 26, owned PostgreSQL 17.10, `LC_ALL=C`.

| Gate | Result |
|---|---|
| unit suites (reconcile, registry client, runner config) | 36 passed across reconcile, registry client, runner config, manifest and store suites |
| runner program + runner functions + registry + S6 store suites in one run | 63/63 after the generation-rule and tail-read fixes (first run 62/63: the tampered-journal case escaped the integrity handler because the checkpoint read sat outside it) |
| `tsc --noEmit`, eslint | clean |
| `test:migrations` | PASS: fresh schema equals seeded upgrade (47 migrations) |
| `test:db`, `npm run build` | `test:db` 266/267 files, 2306/2307 tests: the one failure was the #86 two-phase suite's V10 concurrent-drain race plus a garbage-collected `FileHandle` from its stalled-fsync case, under three owned clusters and a 200k-row seed running at once on this Mac; that suite passes alone (13/13, no unhandled error) and `main` CI stayed green through #88, #90 and #91; `npm run build` pass |

## Not covered

- Quarantine after an integrity failure still requires the web role (`quarantineOwner`); the runner only reports. A scoped quarantine function is a follow-up.
- The web role keeps `UPDATE(anchored_at, receipt_hash)` on the outbox for the local `drainOutbox`; revoking it waits for the local worker to move onto the functions.
- No run on the Lighthouse host or against Supabase and the Shanghai instance; latency, TLS chains and semi-sync behaviour remain the owner's staging acceptance (I1.7).
