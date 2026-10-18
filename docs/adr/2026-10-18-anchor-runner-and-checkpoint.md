# I1.1: anchor runner, AnchorStore and independent checkpoint

Status: **proposed, awaiting owner decision**. No host, database, role, flag or secret was created or changed for this document. It selects among resources that already exist and are already authorized, and names the two points where only the owner can act. Until the decisions in section 8 are taken, I1b stays `blocked_external` exactly as the 2026-10-04 plan (05 §8) requires, and `s4Pool()` keeps rejecting production.

Inputs: 02 §3 (receipt semantics, identity, recovery states), 06 §D (runner privileges, two-phase algorithm, storage fence, recovery identity), 04 §release gates 1–7, verification rows V09–V14, the current implementation in `src/lib/research/s4/anchor.ts` and `scripts/s4/anchor-worker.ts`, Alpha PRs #69/#70/#73, Brain `docs/deployment/{HOST-REBUILD,CLOUD-BACKUP}.md` and `docs/deployment/deletion-ledger/*`.

## 1. What exists today

- Business writes append to `public.research_s4_outbox` (identity sequence, `event_hash`, `anchored_at`, `receipt_hash`) inside the owner transaction; `research_s4_observation_state.anchor_status` starts at `anchor_pending`.
- `drainOutbox(actor, root)` is the only anchoring path. It runs **inside** the owner transaction: validates the whole `receipts.jsonl` chain, appends up to 500 receipts, fsyncs file and parent directories, then ACKs in the same SQL transaction (`anchored_at`, `receipt_hash`, `anchor_status='anchored'`, an `AnchorReceipt` record with `provenance_level='local_receipt'`). Any chain inconsistency quarantines the owner (`research_s4_integrity`, every observation `integrity_failed`). Regression baseline: `src/lib/research/s4/integration.test.ts` (abort before ACK, broken journal, 500/500/2 batching, concurrent drains) and `scripts/s4/anchor-smoke.ts`.
- `scripts/s4/anchor-worker.ts` is a local operator loop (`--once` / `--watch` daily) driven by `ALPHA_S4_ACTOR_ID` and `ALPHA_S4_RECEIPT_DIR`. It has no runner identity, no generation, no checkpoint and no production configuration.
- I1a (#70) closed the production runtime in code and added `preflight:research`; #73 added the revocation consumer. Nothing in production has an anchor path: Vercel has no durable disk and the plan forbids counting a Vercel file or a same-database table as independent proof.

The gap I1b must close is therefore: a durable AnchorStore outside the Alpha database's recovery domain, a fenced single-writer runner with its own identity, a checkpoint that survives a rollback of **both** the database and the store, and the pending/anchored gate that keeps evaluation from referencing unconfirmed sequences.

## 2. Resource inventory (what is already authorized)

| Resource | Authorization and access | Fault / recovery domain | Fit |
|---|---|---|---|
| Vercel project `stock-monitor` (Alpha web, serverless, CLI-only deploys) | Owner; this session can deploy | No durable disk; functions are short-lived | Business transactions and outbox only. Cannot host runner or store. |
| Supabase (Alpha production PostgreSQL) | Owner; connection details not held by this session | Alpha database domain. D4 recovery (logical dump → isolated restore) still open | Outbox, ACK, `AnchorReceipt`, a **cache** of the last confirmed checkpoint for gating. Never the independent proof. |
| Tencent Lighthouse `lhins-cafjip8t`, ap-singapore ("Daoplatform" host) | Owner (root via TAT/console key); **not** reachable from this session (`osborn@dmserver` denied) | Brain VM domain, shared Caddy with the Daoplatform portal (the 2026-10-14 ledger-site wipe); whole-VM restore boundary; host rebuild tooling exists (Brain #63) but has never run on the real host | Runner host and journal volume. Already runs hardened systemd services under dedicated users (`brain-ledger`), outbound TLS to managed PostgreSQL proven. |
| Tencent managed PostgreSQL, Shanghai (reused from the retired finance project; semi-sync configured; dedicated `brain_deletion_ledger` database) | Owner authorized reuse 2026-09-24; roles created by owner in console | Outside Brain VM and PA backups; its own backup can still lose acknowledged rows (documented) | Independent checkpoint registry. Measured 2.5–4.5 s per request from Singapore, so **not** a journal. |
| Owner's Mac (`~/.osborn/brain-cloud-backup/`, private CMS key, daily `backup_pull.py`) | Owner | Owner custody | Off-host copy of the journal, same pattern as Brain backups. |
| Mac mini (this session), Mac Studio (shared tenancy, other Tailscale account) | Development only | Not owner-controlled always-on hosts | Local mode only. Rejected for production. |
| GitHub Actions | Ephemeral | No persistent volume; plan forbids private backups there | Rejected for runner and store. |

## 3. Candidates

### Runner host

| | Option | Cost | Why / why not |
|---|---|---|---|
| **R1** | New systemd unit `alpha-anchor-runner` on the Lighthouse host, dedicated OS user `alpha-anchor`, hardened like `brain-deletion-ledger.service` (NoNewPrivileges, ProtectSystem=strict, private tmp, no capabilities), outbound only | none | Already approved compute; same operational pattern as the ledger API; the 2026-10-14 Caddy incident does not touch an outbound-only unit. Shares the VM restore boundary, which is why the checkpoint lives elsewhere (C1). |
| R2 | Mac mini local worker | none | Only for local mode and staging rehearsal. Not production. |
| R3 | New dedicated VPS | new monthly cost | Only if the owner rejects co-tenancy with Brain/Daoplatform. Isolates the VM boundary but adds a second host to rebuild and back up. |
| R4 | GitHub Actions scheduled job | none | Rejected: no durable volume, secrets would leave the authorized hosts, no single-writer guarantee. |

### AnchorStore (journal)

| | Option | Why / why not |
|---|---|---|
| **S1** | `/var/lib/alpha-anchor/<store_id>/<owner-scope-hash>/receipts.jsonl` on the runner host, directory owned by `alpha-anchor` 0700, **the runner process is the only writer** (no other principal has write access to the volume; appends go through the runner's in-process lock/CAS, which is the "唯一受控进程" 06 §D demands) | Keeps today's receipt format and `provenance_level=local_receipt`; fsync cost is local disk, so the short transaction's lock-hold target (p99 < 2 s, batch ≤ 5 s) is achievable. Not WORM, not a third-party timestamp; the ADR says so. |
| S2 | Journal rows in the Shanghai managed PostgreSQL | Rejected as the journal: 2.5–4.5 s per round trip would sit inside the owner lock. Kept as the checkpoint (C1). |

### Independent checkpoint

| | Option | Why / why not |
|---|---|---|
| **C1** | Dedicated database `alpha_anchor_checkpoint` on the Shanghai instance, schema owned by a NOLOGIN role, client role `alpha_checkpoint_client` with INSERT/SELECT on one append-only table and EXECUTE on two SECURITY DEFINER functions (`register_identity`, `confirm_checkpoint`); no UPDATE/DELETE/TRUNCATE; same privilege shape as the deletion ledger | Survives rollback of Supabase and of the Lighthouse VM; already-authorized instance; semi-sync durability evidence exists. Latency is acceptable because the checkpoint write happens **after** the SQL ACK commit and outside the owner lock. |
| C2 | Git commits in a repository | Rejected by 02 §3 ("不以普通Git提交或临时文件代替"). |
| C3 | Object storage with object lock | Fallback only if C1 is refused: new cost and a new credential boundary. |

### Journal backup

| | Option | Why / why not |
|---|---|---|
| **B1** | Daily CMS-encrypted export of the journal directory to `/var/backups/alpha-anchor/`, pulled to the owner's Mac by the existing `backup_pull.py` pattern, recipient certificate on host, private key on the Mac | Reuses Brain's proven pattern and the owner's custody; no new storage purchase. A VM replacement then restores the journal from the owner's copy, and the C1 checkpoint tells whether that copy is complete. |
| B2 | No off-host copy | Rejected: a host rebuild would lose every receipt, and `AnchorReceipt` rows hold only hashes, not the receipts. |

## 4. Proposed decision

**R1 + S1 + C1 + B1**, with these fixed identities and rules.

- `store_id`: UUID generated once by the operator when the volume is created; written into the runner manifest and registered in C1 with `database_identity`. `database_identity`: UUID generated at production enablement and recorded in the Alpha database (`research_s4_runtime_identity`, one row, written by migration under the release executor) and in C1. Neither is discovered from uploaded data.
- Runner manifest (operator-owned file, 0600, not a secret but not an authority): `store_id`, `database_identity`, `deployment_generation`, `authorized_owner_scope` (owner-scope hashes), `format_version`, `checkpoint_endpoint_ref`. The runner refuses to start if any field is missing or if C1 reports a different identity or a higher generation.
- Runner database identity: login role `alpha_anchor_runner`, no table privileges, EXECUTE only on functions owned by `alpha_anchor_fn_owner` (NOLOGIN, no BYPASSRLS, not a table owner), fixed `search_path`, fully qualified names, no dynamic SQL, PUBLIC EXECUTE revoked, `principal_scope` mapping keyed by `session_user` maintained by operations. Functions: `anchor_read_outbox(owner, expected_generation, after_sequence, limit)`, `anchor_ack(owner, expected_generation, sequence, event_hash, receipt_hash)`, `anchor_tail(owner)`. None can create Decision/Observation rows or touch grants; `anchor_ack` fails unless the row is still `anchored_at is null` with the same `event_hash`.
- Execution principal: every `AnchorReceipt` and every ACK carries `execution_principal_id` (the runner principal) alongside the existing owner `userId` with `kind=agent`. If the strict record schema cannot take the field, a versioned audit sidecar table keyed by `(user_id, outbox_sequence)` is used instead; the record envelope is not silently changed.
- Generation fencing: `deployment_generation` is advanced first in C1 (`confirm_checkpoint` with `new_generation`), then persisted in the journal header, then in the Alpha database (`research_s4_runtime_identity.generation`). A runner whose manifest generation is lower than any of the three refuses to append or ACK. Replacement of a runner instance therefore proves old-writer rejection before the new one writes.
- Two-phase drain (06 §D): Phase A outside any owner lock: read the journal, verify the full chain, read the outbox tail through `anchor_tail`, compute expected `(sequence, hash)`. Phase B inside a short owner transaction: re-read tail and generation; if either moved, abort back to A; append the batch (count and bytes both capped: 500 rows, 1 MiB), fsync file and directories, then ACK through `anchor_ack` with the same generation and sequences; COMMIT. Only then, outside the lock, write the checkpoint to C1 (`owner_scope_hash, store_id, database_identity, last_sequence, last_hash, generation, confirmed_at`). Watchdog: if fsync or the SQL commit exceeds its budget the runner closes its DB session, marks itself `paused`, and does not start a parallel writer; recovery requires reconciling the journal tail against the outbox before any new append.
- Gate for evaluation: an observation may enter evaluation only if `anchor_status='anchored'` **and** its outbox sequence is ≤ the owner's last checkpoint confirmed in C1. The Alpha database keeps a cached copy of that checkpoint (`research_s4_anchor_checkpoints`, written by the runner through a fourth function after C1 confirms) so routes can gate without calling Shanghai; at runner start the cache is compared with C1 and any divergence pauses the owner. Sequences above the cached checkpoint stay `pending` even when the journal has them.
- Recovery matrix (02 §3) mapped to this topology: Supabase restored to an older copy while the journal and C1 are ahead → runner sees outbox tail < checkpoint → `paused`, both snapshots kept, no automatic ACK; journal restored from an older B1 copy while Supabase and C1 are ahead → runner sees journal tail < checkpoint → `paused`, receipts must come back from the owner's later backup; both rolled back to the same older point → C1 is ahead of both → detected **up to the last confirmed checkpoint**; tails that were never confirmed in C1 are by construction still `pending` and cannot have been evaluated. This is the exact scope the plan asked to state rather than a blanket claim.
- Capacity budget to test before staging acceptance (V09): one beta owner, assumed ≤ 20 000 outbox events in the first year at ≤ 600 bytes per receipt (≈ 12 MB journal); the 10× stress tier is 200 000 events / 120 MB. Phase A scan of the 10× journal must complete in under the runner's cycle budget and must never hold the owner lock; Phase B lock-hold p99 < 2 s with a 500-row batch on the Lighthouse disk is the acceptance threshold, measured, not assumed. If the 10× tier exceeds budget, the journal is rotated per generation with a chained header rather than the lock being lengthened.

## 5. Threat and durability boundary

The journal is append-only at the application level and protected by Unix ownership; root on the host or the hosting provider can alter it. C1 is the only artefact outside that host, and it holds hashes and sequences only, never article or judgment content. `provenance_level` remains `local_receipt`; moving the journal to a cloud host does not upgrade it to a third-party timestamp or WORM, and reports must keep saying so. Cross-region latency to C1 is paid once per batch, after the lock, and a C1 outage pauses **new** anchoring evaluation while business writes, outbox growth and local-mode development continue.

## 6. What this ADR does not decide

- Whether the Lighthouse host is `dmserver` on the owner's tailnet, the Supabase region, pooler mode and the total connection budget (06 §A inventory, D6.2) remain unknown here and must be filled by the owner before I1.7.
- D4 recovery proof (Supabase dump → isolated restore, host rebuild on the real host) is a release gate for I1.8, not satisfied by this document.
- Multi-owner, multi-runner HA, WORM storage and third-party timestamping are out of scope for the first canary (one owner, one runner instance).

## 7. Implementation plan once approved

1. I1.4a (Alpha, local only): `AnchorStore` interface `readCheckpoint / readReceipts / appendExpected / flush / verify` with a file implementation that preserves today's format; `drainOutbox` refactored into Phase A/B with the current single-transaction behaviour kept as a regression oracle; manifest and generation checks; synthetic tests for V09 (crash between append and ACK, stalled fsync via injected handle, generation switch during a batch, scan timeout) and V10 (partial rows, hash damage, two writers). No production change.
2. I1.4b (Alpha migration, released only through the single executor): `alpha_anchor_fn_owner`, `alpha_anchor_runner`, `principal_scope`, the four functions, `research_s4_runtime_identity`, `research_s4_anchor_checkpoints`, and the evaluation gate; `test:runtime-privileges` extended with V13 negatives for the runner role.
3. I1.5: checkpoint client for C1 with the two SECURITY DEFINER functions, idempotent `confirm_checkpoint`, V11 synthetic co-rollback tests using two disposable clusters.
4. Operations (owner-only, section 8): create the OS user, unit, volume, manifest and backup export on the Lighthouse host; create the C1 database and roles; register identities.
5. I1.7: staging run with a synthetic owner through import → decision → observation → anchor → checkpoint → synthetic evaluation → replay, with V09–V14 injected; evidence recorded under `docs/verification/`.

## 8. Decisions and actions only the owner can take

| # | Decision or action | Where | Cost | Needed before |
|---|---|---|---|---|
| 1 | Approve R1: the anchor runner shares the Lighthouse host with Brain and the Daoplatform portal (or choose R3 and name the budget) | Reply here | none / new VPS | I1.4b |
| 2 | Approve C1: a dedicated `alpha_anchor_checkpoint` database plus two roles on the Shanghai managed PostgreSQL instance | Tencent console, as the instance administrator | none | I1.5 |
| 3 | Approve B1 and choose the recipient key: reuse the Brain backup certificate or generate a second pair for Alpha | Owner's Mac | none | I1.7 |
| 4 | Create `alpha-anchor` user, unit, `/var/lib/alpha-anchor` and the manifest on the host; this session has no SSH access to that host | Host root session (TAT or console key) | none | I1.7 |
| 5 | Fill the S0 inventory fields this ADR could not: Supabase region and pooler mode, connection budget, whether `dmserver` is the Lighthouse host | D6.2 STATUS table | none | I1.7 |

Until items 1 and 2 are answered, I1.4a proceeds as local-only code with synthetic tests, which the plan explicitly allows, and nothing else in I1b moves.
