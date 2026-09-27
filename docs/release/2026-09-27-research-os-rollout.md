# Research OS Production Rollout (2026-09-27)

## Scope
Production had run `403a7cf` (deployed 2026-09-23) while `main` advanced through Phase 1–2 of the implementation plan. This rollout ships `main` at `3a7f4c7` (merge of #66, WP-A11 setup wizard) and applies the 14 pending Supabase migrations.

## Release Gates
| Gate | Evidence | Result |
|---|---|---|
| Backup | `pg_dump` custom archive of `public` + `supabase_migrations` (1.95 MB, 46 tables with data), plain schema, migration versions before | Passed |
| Rehearsal | Disposable local PG17 restored from the backup; 14 migrations applied in order, one transaction each; tables 45 → 68 | Passed |
| Preview build | `stock-monitor-hgrc9qdzt` (Vercel preview of `3a7f4c7`), build output lists `/research/setup` and `/api/research/entity-keys` | Passed |
| Migration dry run | `supabase db push --dry-run` listed exactly the 14 rehearsed files | Passed |
| Release preflight | `scripts/release-preflight.ts` with production env in memory: deepseek / deepseek-v4-flash, pricing `deepseek-2026-04-24`, service role configured | Passed |

## Migration Order
`20260922090000_research_s4` → `20260922100000_research_s6` → `20260922101000_research_s6_hardening` → `20260922102000_research_s6_session_clock` → `20260922103000_research_s6_receipt_clock` → `20260922104000_research_s6_rel_fixture` → `20260925230000_research_source_extension` → `20260926000000_research_judgment_ledger` → `20260926010000_research_entity_keys` → `20260926100000_research_source_entity_alignments` → `20260926110000_research_thesis_extension` → `20260926120000_research_cards` → `20260926130000_research_decisions_observation` → `20260926140000_research_analyst_identities`.

Production also carries `20260904090000` (watchlist decision metadata) from the unmerged branch `codex/sync-stock-watchlist-20260917` (Feature-promising). It was already applied before this rollout; the push ran from a scratch copy containing that file so the CLI history stayed consistent. It must land on `main` when that branch merges.

## Production Evidence
- Migrations: 39 rows in history, last `20260926140000`; 68 public tables, 35 `research_*`; RLS enabled on all 9 new owner tables; existing rows intact.
- Deployment: `stock-monitor-81kletdol`, aliased to `osbornalpha.com`.
- Regression: `/api/research/entity-keys` 404 → 401; `/api/research/{theses,cards,sources}` 401; `/research/setup`, `/research`, `/today` 307 to login; `/`, `/login` 200.
- Backups: local, owner-only (`_release-backups/osbornalpha/2026-09-27/`), not uploaded.

## Rollback
- Application: `vercel rollback https://stock-monitor-7ashqp3bl-gilosbornhellos-projects.vercel.app` (403a7cf).
- Database: the 14 migrations are additive (new tables/columns/policies); the previous build ignores them. Restore the pre-rollout archive only if an additive change itself must be undone.

## Deferred
- ~~`research_entity_keys` is empty in production~~ — resolved the same day, see *Addendum: entity-keys seed*.
- S4 runtime (`ALPHA_S4_*`) is not configured in production; S4/S6 routes stay dormant.

## Addendum: entity-keys seed (2026-09-27, owner-authorized)
- Pre-check (read-only, production env injected in memory via `vercel env run`): `RESEARCH_OWNER_USER_ID` exists in `auth.users` and is the single admin profile.
- Snapshot of the owner's `research_entities` before the write (26 rows) saved to `_release-backups/osbornalpha/2026-09-27/research_entities.before-seed.json` (not committed).
- Dry run of the seed's entity matching: 18 new entities; 3 existing ones updated (Palantir, ServiceNow, Salesforce), tickers unchanged, only aliases and metadata merged; no other existing row touched.
- `scripts/entity-keys/seed.ts`: upserted 21 companies, 21 securities; `entity_table_version=f6e6472627500e98c970a441c2d04203a7cdfed05b6241a7e491a7cd034e5d38`.
- After: `research_entities` 26 → 44, `research_entity_keys` 0 → 21 (all `in_scope`), `research_entity_securities` 0 → 21 (all primary).
- All 21 start `in_scope`, which is above the wizard's 12–15 target; the owner prunes in `/research/setup`.
- Rollback: delete the owner's `research_entity_keys` / `research_entity_securities` rows and the 18 created entities, then restore the three updated entities from the snapshot.
