# Securities Master Data Production Rollout

Date: 2026-07-15 (Asia/Shanghai)

osstack card: `card_d3e2dd44`

## Scope

This release moves search and watchlist writes onto a verified local securities master. It covers active A shares, A-share exchange-listed funds, active convertible bonds, Hong Kong Main Board securities, NASDAQ market-cap Top 500, and U.S.-listed Chinese common stocks and ADRs on NYSE/NASDAQ/AMEX. S&P 500 activation remains fail-closed until an authorized constituent snapshot is configured.

## Release Gates

| Gate | Evidence | Status |
| --- | --- | --- |
| Focused tests | Source, sync, search, resolver, watchlist, admin suites | Passed |
| Full tests | 81 files, 670 tests | Passed |
| Type safety | `tsc --noEmit` | Passed |
| Production build | Next.js optimized build, 33 static pages | Passed |
| Database lint | Clean reset through both migrations; no schema errors | Passed |
| Search benchmark | Exact P95 45.35 ms; name/pinyin P95 50.06 ms | Passed |
| Browser regression | 10 auth/public smoke tests plus desktop 1440x900 and mobile 390x844 search flows | Passed |
| osstack policy/contracts | No governance findings; six contracts aligned | Passed |
| Preview | Search, watchlist, admin, resolver auth, cron auth | Pending |
| Production | Migration, snapshots, Vercel deploy, public and authenticated canaries | Pending |

## Data Evidence

| Universe | Dry-run count | Apply result | Checksum |
| --- | ---: | --- | --- |
| A shares | 5,528 | Local apply: 5,518 inserted, 10 updated | `b2ca7c6f...1429efe` |
| A exchange funds | 2,142 | Local apply: 2,142 inserted | `ab0ecf36...109e517` |
| Active convertible bonds | 325 | Local apply: 325 inserted | `59e9c260...fe39b5e` |
| HK Main Board | 2,444 | Local apply: 2,437 inserted, 7 updated | `c4345461...593eb4a` |
| S&P 500 | Blocked: authorized source required | Not applied | N/A |
| NASDAQ Top 500 | 500 | Local apply: 489 inserted, 11 updated | `88dadd17...954902` |
| U.S.-listed China/ADR | 324 | Local apply: 311 inserted, 13 updated | `cba8cd95...ef65c7` |

Canaries observed during local source verification: `002463.SZ`, `00700.HK`, `AAPL`, `BABA`, and `PDD`.

Local benchmark used 20 discarded warmups plus 200 measured calls per query class. Exact search measured P50 42.24 ms/P95 45.35 ms; name or pinyin measured P50 45.18 ms/P95 50.06 ms.

## Migration Order

1. Create a production database checkpoint and record migration state.
2. Apply `20260715130000_security_master_data.sql`.
3. Dry-run and apply every authorized universe independently.
4. Confirm historical watchlist rows all resolve to an identity.
5. Apply `20260715140000_watchlist_security_fk.sql` and validate the foreign key.
6. Keep `SECURITY_MASTER_SEARCH_ENABLED=false` through backfill and preview verification.
7. Enable database-first search and deploy production.

## Rollback Rehearsal

- Search rollback: set `SECURITY_MASTER_SEARCH_ENABLED=false` and redeploy. This restores the isolated legacy search route without deleting master data.
- Import rollback: disable the two securities cron schedules. Search continues from the last committed snapshots.
- Data rollback: restore the pre-migration Supabase checkpoint only if additive schema rollback is required. A rejected or failed scope never deactivates its previous membership snapshot.
- Application rollback: promote the previous Vercel production deployment.

Preview rehearsal evidence: Pending.

## Production Evidence

- Commit SHA: Pending.
- Migration versions: Pending.
- Preview URL: Pending.
- Production URL: Pending.
- Browser screenshots: `test-results/security-search-desktop.png`, `test-results/security-search-mobile.png` (visually inspected).
- Search latency and canaries: Pending.
- Sync health observation: Pending.

## Deferred Scope

S&P 500 is intentionally disabled until an authorized official constituent snapshot is supplied and passes the source authorization gate. This is a truthful external dependency, not a silent partial import. The osstack card must remain blocked rather than done while this required scope is unresolved.
