# I1.5: independent checkpoint registry schema, client and reconciliation (2026-10-18)

Implements candidate C1 of ADR `2026-10-18-anchor-runner-and-checkpoint.md` after the owner's approval. **Nothing is installed or enabled**: the schema is an operator script for the Shanghai managed PostgreSQL instance (`ops/anchor-checkpoint/`), the client has no production configuration, and no code path calls it yet. The runner (I1.4a) will call `confirm` after each acknowledged batch and `reconcileCheckpoint` at start.

## Registry schema (`ops/anchor-checkpoint/schema.sql`)

- Installed once as the NOLOGIN schema owner `alpha_checkpoint_owner` in a dedicated database; the script refuses login or superuser roles. Tables `registry`, `identities`, `generations`, `checkpoints` in schema `anchor_private`; `generations`, `checkpoints` and `registry` carry statement-level triggers that refuse UPDATE, DELETE and TRUNCATE for everyone, the owner included.
- Client role `alpha_checkpoint_client` holds USAGE on the schema and EXECUTE on exactly `identity_state`, `latest_checkpoint`, `confirm_checkpoint`; every table privilege and the operator functions `register_identity` / `advance_generation` are withheld.
- `confirm_checkpoint`: refuses when `fsync`, `full_page_writes` or recovery state cannot promise durability (SQLSTATE 58000); serializes per (identity, owner) with an advisory lock; identity must be registered with the same store and the current generation; idempotent per request id (`anchor_request_conflict` if the same id carries different fields) and per (sequence, hash); never backwards (`anchor_checkpoint_regression`); same sequence with a different hash is `anchor_hash_conflict`. Denials use SQLSTATE 42501, conflicts the default P0001, so the client can classify without reading messages beyond their leading token.

## Client (`src/lib/research/s4/checkpoint-registry.ts`)

Explicit host/port/database/user/password only; a URL is refused; TLS verifies against the host name; plaintext only for an explicit loopback test flag; the password is a non-enumerable property so serialized configuration never carries it; pool of one with a 5 s connect timeout and a 4.5 s statement and client deadline (the latency measured from Singapore to Shanghai). Outcomes: `unknown` for deadline, lost connection or any unclassified transport error; `denied`, `conflict`, `unavailable` from SQLSTATE plus the function token. Malformed requests are refused before the transport. Logging is SQLSTATE-only.

## Reconciliation (`src/lib/research/s4/checkpoint-reconcile.ts`)

Pure function over the three views (registry latest, Alpha cache, Alpha database tail and receipt hash at the registry sequence) plus the manifest generation. Verdicts: `consistent` with `pendingFrom`, or `paused` with `generation_mismatch`, `registry_ahead_of_database`, `registry_behind_cache` or `hash_mismatch`. A cache lagging the registry is allowed (cache write lost after a successful confirm). Detection is scoped to the last confirmed checkpoint, exactly as the ADR states.

## Tests

- `checkpoint-reconcile.test.ts`: 8 cases covering the recovery matrix and malformed input.
- `checkpoint-registry.test.ts`: 7 cases: configuration rules, typed parameters, deadline/lost-connection → `unknown`, SQLSTATE mapping without leaking the message, request validation before transport, read functions.
- `checkpoint-registry.integration.test.ts` (critical suite): a second database in the owned cluster, schema applied under `SET ROLE alpha_checkpoint_owner`, a dedicated inheriting login; client privilege negatives; unregistered identity; owner registration and mismatches; monotonic, idempotent, owner-isolated confirmation; append-only even for the owner; generation advance fencing with history; deadline → `unknown`.

## Local verification

Mac arm64, Node 26, owned PostgreSQL 17.10, `LC_ALL=C`.

| Gate | Result |
|---|---|
| unit suites | 15 passed |
| integration suite on a fresh cluster | 7 passed (first run 6/7: the deadline case failed on fixture plumbing only, fixed) |
| `tsc --noEmit`, eslint on new files | clean |
| `test:db`, `npm run build` | `test:db` 260/261 files, 2183 passed / 43 env-gated skips; the one failure was the known `beforeAll` hook timeout in `s6/store.integration.test.ts` under the parallel run, which passes alone on a fresh cluster (43 tests); `npm run build` pass |

## Not covered

- No run against the real Shanghai instance: TLS chain, security group, managed semi-sync behaviour and actual latency remain owner-side acceptance (ADR §8 item 2). `durability_ready` checks `fsync`, `full_page_writes` and recovery only; it does not assert a synchronous standby.
- The runner that calls this client is I1.4a; the Alpha-side cache write after a registry confirm is `research_s4_anchor_confirm_checkpoint` from I1.4b.
