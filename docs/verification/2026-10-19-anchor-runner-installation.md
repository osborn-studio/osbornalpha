# Anchor runner installation (2026-10-19)

First installation of the I1b runner and its independent checkpoint registry, authorized by the owner on 2026-10-19 under ADR `2026-10-18-anchor-runner-and-checkpoint.md` §8. **State: installed and running in disabled mode.** Production `ALPHA_S4`/`ALPHA_S6` remain closed, so every cycle drains zero rows; this is the "runner deployed paused, APIs closed" step that 04 §release gate 3 requires before any enablement.

## What differs from the ADR, and why

| ADR | Installed | Reason |
|---|---|---|
| C1 on the Shanghai managed PostgreSQL | Singapore `postgres-nujo9j7v` (PG 18, private 10.60.2.10), database `alpha_anchor_checkpoint` | The Shanghai instance is only retained; the Singapore instance is the one the Brain ledger runs on, privately routed from the host with verified TLS, and millisecond latency instead of 2.5–4.5 s. Approved by the owner before installation. |
| Node via package manager | Node v22.23.3 tarball from nodejs.org, SHA256-verified, under `/opt/alpha-anchor/node` | No Node, bun or psql on the host; no system repository change. |
| Direct database host | Supabase pooler `aws-1-ap-northeast-1.pooler.supabase.com:5432` (session mode), user `alpha_anchor_app.mzfcaabhuwtfvsvadvsv` | The direct host resolves to IPv6 only and the host has no IPv6. |
| B1 backup key | Reuse `/etc/osborn-brain/backup-recipient.pem` | Owner's choice; private key stays on the owner's Mac. |

## Host (`lhins-cafjip8t`, Daoplatform, ap-singapore)

All host actions ran as root through Tencent TAT from the operator's Mac (`tccli`), never SSH. Created: user `alpha-anchor`, `/var/lib/alpha-anchor/store` (0700), `/etc/alpha-anchor` (manifest 0600 owned by the runner user; `runner.env` 0640 root:alpha-anchor; `registry-ca.pem` from the ledger release; `supabase-ca.pem` pinned, see below), `/opt/alpha-anchor` (Node and the esbuild bundle of `scripts/anchor/runner.ts`, 545 KB, built from `main` at the #98 merge), `alpha-anchor-runner.service` (enabled, `--watch` every 60 s, exit status 2 not auto-restarted), `alpha-anchor-export.{service,timer}` (daily 03:40 host time; first export `anchor-20261019T231013Z.cms`, 1080 bytes). Manifest: `store_id 47939775-b654-4139-abad-feffdb7fea8f`, `database_identity fe1c12c5-e095-44a2-81cd-6e9a06a2b37d`, `deployment_generation 1`, one owner scope.

## Registry (C1)

Installed from the host with `psql` as `brain_admin`: database `alpha_anchor_checkpoint`, NOLOGIN roles `alpha_checkpoint_owner` and `alpha_checkpoint_client`, `ops/anchor-checkpoint/schema.sql` applied under `SET ROLE alpha_checkpoint_owner`, `register_identity` → `{"registered": true, "generation": 1}`, login `alpha_checkpoint_app` (connection limit 2) created from a SCRAM verifier. Verified as the client: `identity_state` returns the registered identity with `durability_ready: true`; `select` on `anchor_private.checkpoints` is permission denied.

## Alpha database (Supabase `stock-monitor`)

Through the Management API as `postgres`: migration `20261018150000_anchor_runner_cache_read.sql` applied with its history row (the ownership change needs `CREATE` on `public` for the function owner on this non-superuser platform, granted and revoked inside the same transaction); the platform's default `EXECUTE` grants to `anon`, `authenticated` and `service_role` revoked from all seven anchor functions so only `alpha_anchor_runner` can call the five public ones; login `alpha_anchor_app` (member of `alpha_anchor_runner`, connection limit 2, zero table grants) created from a SCRAM verifier; `research_s4_runtime_identity` (generation 1) and the principal row (`session_role alpha_anchor_app`, environment production, valid to 2027-04-16) registered.

## Secret handling

No password or token was typed, displayed or stored by the operator model. Runner and registry passwords were generated on the host into `runner.env`; both database logins were created from SCRAM-SHA-256 verifiers computed on the host; the instance administrator credential was encrypted on the owner's Mac to a one-time RSA-4096 key generated on the host, decrypted there into a 0600 pgpass, used for the registry installation and shredded together with the key. Supabase SQL ran with the CLI token already in the macOS keychain.

## TLS findings fixed before the first green cycle

- Supabase pooler chain: `*.pooler.supabase.com` ← `Supabase Intermediate 2021 CA` ← `Supabase Root 2021 CA` (self-signed, not in system stores). The root was captured from two independent networks (the owner's Mac and the host) with identical SHA-256 fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`, pinned as `/etc/alpha-anchor/supabase-ca.pem`, and `ALPHA_ANCHOR_DB_CA_FILE` support added (#97).
- Registry certificate from `TencentDB for PostgreSQL CA` with `IP Address:10.60.2.10` as SAN: node-postgres sets no SNI for an IP host, so Node reported `ERR_TLS_CERT_ALTNAME_INVALID`; verified with a raw STARTTLS probe on the host and fixed by binding `checkServerIdentity` to the configured IP (#98). Pooler-style login names and no startup `options` (#93).

## Cycles

| Attempt | Bundle | Result |
|---|---|---|
| 1 | #93 merge | `SELF_SIGNED_CERT_IN_CHAIN` (Supabase root not trusted) |
| 2 | #97 merge | Supabase passed; registry `ERR_TLS_CERT_ALTNAME_INVALID` |
| 3 | #98 merge | `status: drained`, 0 appended / 0 acknowledged / 0 remaining, `phase_a_ms` 152, journal created at `store/<owner-scope>/receipts.jsonl` (0 bytes), `confirmed: null` because nothing was anchored |

The unit has been cycling every 60 s since 2026-10-19T23:10 UTC with `NRestarts=0`.

## Still closed or not done

- Production `ALPHA_S4`/`ALPHA_S6` stay closed; no outbox rows exist, so the end-to-end anchor → registry → cache path has only been exercised in the local suites. I1.7 (staging with a synthetic owner and V09–V14 injections) is the next step.
- The owner's Mac does not yet pull `/var/backups/alpha-anchor/*.cms`; restoring the journal from an export has not been rehearsed (D4).
- Supabase pooler session-mode behaviour for `pg_advisory_xact_lock` inside `research_s4_anchor_ack` is only proven once real rows flow.
- Generation advance has been tested locally only; the operational order is registry → manifest → `research_s4_runtime_identity` → principal row.
