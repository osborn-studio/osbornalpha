# Alpha anchor runner (R1 + S1 + B1)

Owner-only installation on the Tencent Lighthouse host per ADR `docs/adr/2026-10-18-anchor-runner-and-checkpoint.md` §4 and §8 items 1, 3 and 4. Status: **program, unit and notes exist; nothing is installed.** The registry side is `ops/anchor-checkpoint/README.md`.

## What the process does

Every cycle, per owner in `ALPHA_ANCHOR_OWNERS`: reconcile registry, database tail, cached checkpoint and manifest generation (any disagreement pauses the owner); verify the whole journal against the outbox outside any lock; append and fsync new receipts; acknowledge them through the scoped functions in one short transaction; confirm the checkpoint in the registry with a deterministic request id; mirror it into the Alpha cache. Only then can evaluation reference those sequences. A watchdog expiry exits with status 2 and the unit does not restart it; an integrity failure is reported and never repaired.

## Install (as root on the host)

1. User, directories, release checkout:

   ```bash
   useradd --system --home /var/lib/alpha-anchor --shell /usr/sbin/nologin alpha-anchor
   install -d -o alpha-anchor -g alpha-anchor -m 0700 /var/lib/alpha-anchor /var/lib/alpha-anchor/store /etc/alpha-anchor
   # /opt/osbornalpha: the release checkout at the deployed main SHA, readable by alpha-anchor, with node_modules installed from the lockfile
   ```

2. Manifest `/etc/alpha-anchor/manifest.json` (0600, owned by `alpha-anchor`): `store_id` and `database_identity` are the UUIDs registered in the registry (`register_identity`) and in `research_s4_runtime_identity`; `deployment_generation` starts at 1; `authorized_owner_scope` holds the SHA-256 of each owner's user id; `format_version` is 1.

3. Environment `/etc/alpha-anchor/runner.env` (0600):

   ```text
   ALPHA_ANCHOR_MANIFEST=/etc/alpha-anchor/manifest.json
   ALPHA_ANCHOR_RECEIPT_ROOT=/var/lib/alpha-anchor/store
   ALPHA_ANCHOR_PRINCIPAL_ID=<principal_id row in research_s4_anchor_principals>
   ALPHA_ANCHOR_OWNERS=<owner uuid>[,<owner uuid>]
   ALPHA_ANCHOR_DB_HOST=<Alpha PostgreSQL host, as in its certificate>
   ALPHA_ANCHOR_DB_PORT=5432
   ALPHA_ANCHOR_DB_DATABASE=<database>
   ALPHA_ANCHOR_DB_USER=alpha_anchor_app
   ALPHA_ANCHOR_DB_PASSWORD=<secret>
   ALPHA_ANCHOR_REGISTRY_HOST=...   # see ops/anchor-checkpoint/README.md
   ALPHA_ANCHOR_REGISTRY_PORT=5432
   ALPHA_ANCHOR_REGISTRY_DATABASE=alpha_anchor_checkpoint
   ALPHA_ANCHOR_REGISTRY_USER=alpha_checkpoint_app
   ALPHA_ANCHOR_REGISTRY_PASSWORD=<secret>
   ALPHA_ANCHOR_INTERVAL_SECONDS=60
   ```

   `alpha_anchor_app` is a login role granted `alpha_anchor_runner` (no table privileges), created by the release executor together with the `research_s4_anchor_principals` row (`session_role = 'alpha_anchor_app'`, the owner, environment, generation 1, `valid_until`).

4. Unit: copy `alpha-anchor-runner.service` to `/etc/systemd/system/`, `systemctl daemon-reload`, then run once by hand before enabling: `sudo -u alpha-anchor env $(cat /etc/alpha-anchor/runner.env | xargs) node --import tsx scripts/anchor/runner.ts --once` from `/opt/osbornalpha`. Expect one JSON line per owner with `"status":"drained"`.

5. Journal backup (B1): export `/var/lib/alpha-anchor/store` daily, CMS-encrypted to the owner's certificate, into `/var/backups/alpha-anchor/`, and pull it with the existing Brain `backup_pull.py` pattern. Without it a host rebuild loses every receipt.

## Generation advance and restore

Advance in the registry first (`advance_generation`), then edit `deployment_generation` in the manifest, then `research_s4_runtime_identity.generation` and the principal row. A runner with a lower manifest generation is refused by all three and reports `generation_mismatch`.

## Exit codes and states

| Status | Meaning | Action |
|---|---|---|
| `drained` | all pending rows anchored and checkpoint confirmed | none |
| `paused` / `generation_mismatch` | registry, database, cache or manifest disagree | finish the generation advance, restart |
| `paused` / `registry_ahead_of_database` | the database was restored to an older copy | D4 recovery procedure; do not restart |
| `paused` / `registry_behind_cache` | the registry was restored to an older copy | restore the registry from its own backup |
| `paused` / `flush_timeout`, `ack_timeout` | watchdog expired | inspect disk and database, reconcile the journal tail, restart |
| `integrity_failed` | journal and outbox disagree | operator investigation; no automatic repair |
