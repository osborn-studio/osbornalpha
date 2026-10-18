# I1.4b: anchor runner roles, functions and checkpoint gate (2026-10-18)

Implements the database side of ADR `2026-10-18-anchor-runner-and-checkpoint.md` §4 after the owner approved R1 and C1. **Disabled state**: the migration creates NOLOGIN roles, tables and functions only. No login role, no principal mapping and no runtime identity row exist until operations register them during a release, so nothing in production can acknowledge, and the evaluation gate stays inactive wherever no identity is registered (every current environment).

## Migration `20261018120000_anchor_runner.sql`

- Roles `alpha_anchor_fn_owner` (function owner: NOLOGIN, no BYPASSRLS, not a table owner) and `alpha_anchor_runner` (NOLOGIN group for the future runner login; usage on `public` only, no table privileges).
- Tables `research_s4_runtime_identity` (singleton `database_identity`, `generation`), `research_s4_anchor_principals` (operator mapping `session_role` → owner, environment, generation, `valid_until`), `research_s4_anchor_checkpoints` (per-owner cache of the last checkpoint confirmed in the independent registry). All three RLS enabled and forced.
- Function-owner policies on outbox, observation state, records, candidates, checkpoints and the audit log require **both** the transaction-local scope set by the principal check and a live mapping row for the real `session_user`; a caller-preset GUC alone opens nothing. Column-limited UPDATE on outbox and observation state; INSERT only on records, checkpoints and audit log.
- Functions (SECURITY DEFINER, owner `alpha_anchor_fn_owner`, fixed `search_path`, fully qualified names, no dynamic SQL, PUBLIC EXECUTE revoked, EXECUTE granted to `alpha_anchor_runner`): `research_s4_anchor_tail`, `research_s4_anchor_read_outbox` (limit 1–500), `research_s4_anchor_ack` (same owner advisory lock as the web runtime; chain order and hash checks; duplicate vs conflict; writes `AnchorReceipt` with `execution_principal_id` and an audit row), `research_s4_anchor_confirm_checkpoint` (anchored sequences of the registered identity only, monotonic, one store per owner). `research_s4_anchor_principal` is internal and not executable by the runner.
- Generation fencing: a call fails with `anchor_generation_fenced` unless the caller's generation, the mapping's generation and the registered identity's generation all agree.

## Runtime gate

`src/lib/research/s4/anchor-gate.ts`: `anchorGateActive` is true only when an identity row exists; `assertCheckpointed` then requires the observation's outbox event to be anchored and its sequence ≤ the owner's cached checkpoint, else `anchor_checkpoint_pending`. `inputFor` in `src/lib/research/s6/store.ts` calls it after `observationFor`, so evaluation input cannot be built for unconfirmed sequences once an identity is registered. Reads, reports and replay are not gated. Web runtime gets SELECT on the identity row and its own checkpoint row only.

## Tests

`src/lib/research/s4/anchor-runner.integration.test.ts` (registered in `criticalSuites`), 7 cases on a real PostgreSQL 17 cluster with a dedicated inheriting login role granted `alpha_anchor_runner`: no table privileges and no `SET ROLE`; gate inactive before registration; mapping, expiry, owner scope, preset-GUC and generation negatives (V13); bounded outbox read; chain-ordered acknowledgement from the first outbox row including the import's own events, hash conflict, duplicate, re-acknowledgement conflict, observation state, receipt record and audit row with the execution principal; checkpoint unanchored/hash/identity/regression/store negatives; evaluation gate for confirmed, anchored-but-unconfirmed and cross-owner observations; generation advance fences the old runner.

Red run (migration file absent): the suite fails at setup because `alpha_anchor_runner` does not exist. Green run: 7/7.

## Local verification

Mac arm64, Node 26, owned PostgreSQL 17.10, `LC_ALL=C`, worktree `node_modules` linked to a lockfile-fresh install.

| Gate | Result |
|---|---|
| `anchor-runner.integration.test.ts` on a fresh cluster | 7 passed |
| `test:migrations` | PASS: fresh schema equals seeded upgrade |
| `tsc --noEmit`, eslint on touched files | clean |
| `test:db`, `npm run build` | `test:db`: 255/256 files, 2150 passed / 43 skipped (non-critical env-gated suites); the one failure was a `beforeAll` hook timeout in `s6/store.integration.test.ts` under the parallel run, which passes alone on a fresh cluster (46 tests across the S6 store and arm-lineage suites); `npm run build`: pass |

## Not covered

- Nothing runs the functions in production: no runner, no login role, no mapping, no identity. The runner itself (Phase A/B, manifest, store) is I1.4a; the independent registry client is I1.5.
- The web role still holds `UPDATE(anchored_at, receipt_hash)` on the outbox for the existing local `drainOutbox`; revoking it is a follow-up once I1.4a reaches parity.
- Supabase privilege and pooler behaviour for the new roles and SECURITY DEFINER functions is not proven here; `test:runtime-privileges` covers the web role, and the real platform check remains a release gate.
