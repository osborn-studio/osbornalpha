# Securities Master Data Production Rollout

Date: 2026-07-15 (Asia/Shanghai)

osstack card: `card_d3e2dd44`

## Scope

This release moves search and watchlist writes onto a verified local securities master. It covers active A shares, A-share exchange-listed funds, active convertible bonds, Hong Kong Main Board securities, NASDAQ market-cap Top 500, and U.S.-listed Chinese common stocks and ADRs on NYSE/NASDAQ/AMEX. S&P 500 activation remains fail-closed until an authorized constituent snapshot is configured.

## Release Gates

| Gate | Evidence | Status |
| --- | --- | --- |
| Focused tests | Source, sync, search, resolver, watchlist, admin suites | Passed |
| Full tests | 82 files, 671 tests | Passed |
| Type safety | `tsc --noEmit` | Passed |
| Production build | Next.js optimized build, 33 static pages | Passed |
| Database lint | Clean reset through both migrations; no schema errors | Passed |
| Search benchmark | Exact P95 45.51 ms; name/pinyin P95 50.37 ms | Passed |
| Browser regression | 10 auth/public smoke tests; local and live-production desktop/mobile search flows | Passed |
| osstack policy/contracts | No governance findings; six contracts aligned | Passed |
| Preview | Feature-off rollback, Tokyo runtime inspection, feature-on canaries and trace | Passed |
| Production | Migration, snapshots, guarded Vercel deploy, public/authenticated canaries and log observation | Passed for authorized scopes |

## Data Evidence

| Universe | Dry-run count | Apply result | Checksum |
| --- | ---: | --- | --- |
| A shares | 5,528 | Production: 5,517 inserted, 11 updated | `b2ca7c6f...1429efe` |
| A exchange funds | 2,142 | Production: 2,137 inserted, 5 updated | `ab0ecf36...109e517` |
| Active convertible bonds | 325 | Production: 323 inserted, 2 updated | `59e9c260...fe39b5e` |
| HK Main Board | 2,444 | Production: 2,438 inserted, 6 updated | `c4345461...593eb4a` |
| S&P 500 | Blocked: authorized source required | Not applied | N/A |
| NASDAQ Top 500 | 500 | Production: 493 inserted, 7 updated | `88dadd17...954902` |
| U.S.-listed China/ADR | 324 | Production: 311 inserted, 13 updated | `cba8cd95...ef65c7` |

Canaries observed during local source verification: `002463.SZ`, `00700.HK`, `AAPL`, `BABA`, and `PDD`.

Local benchmark used 20 discarded warmups plus 200 measured calls per query class. Exact search measured P50 42.40 ms/P95 45.51 ms; name or pinyin measured P50 45.16 ms/P95 50.37 ms. A direct Shanghai-to-Tokyo production database measurement recorded about 512 ms P95 for both classes; this includes the public internet round trip and is retained as network evidence, not treated as an application-side pass.

The production Supabase project is in Tokyo (`ap-northeast-1`). Vercel Functions are pinned to Tokyo (`hnd1`) so database-backed routes do not traverse the default Washington, D.C. region.

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

Preview rehearsal evidence: with the feature flag disabled, `002463` returned the isolated legacy empty result while resolver, cron, and admin routes rejected unauthenticated requests. With the flag enabled, `002463`, `00700`, `AAPL`, and `BABA` all returned canonical, selectable securities from the master. The pre-locality trace placed the function in Washington, D.C. and spent about 1.0 seconds in the Tokyo database call. The promoted preview ran its functions in Tokyo; a warm trace measured 584.5 ms end to end with 210.0 ms in the Supabase RPC.

## Production Evidence

- Application commit SHA: `4457e6a`.
- Migration versions: `20260715130000`, `20260715140000` (production migration history aligned).
- Pre-migration backups: `/tmp/osbornalpha-pre-security-master-schema-20260715.sql`, `/tmp/osbornalpha-pre-security-master-data-20260715.sql`.
- Preview URLs: rollback `https://stock-monitor-omj1n5m9c-gilosbornhellos-projects.vercel.app`; feature-on pre-locality `https://stock-monitor-3k0mziaa4-gilosbornhellos-projects.vercel.app`; Tokyo `https://stock-monitor-hnfgx2z0g-gilosbornhellos-projects.vercel.app`.
- Production URL: `https://osbornalpha.com` (deployment `dpl_8f75ciFN1FMiFEKpAyYuvvfroKkY`).
- Production feature flag: `SECURITY_MASTER_SEARCH_ENABLED=true`; the same commit was first deployed with the flag disabled and reproduced the legacy empty `002463` result before activation.
- Browser screenshots: `test-results/security-search-desktop.png`, `test-results/security-search-mobile.png`, `test-results/security-search-production.png`, `test-results/security-search-production-mobile.png` (visually inspected).
- Database canaries: `002463.SZ`, `00700.HK`, `AAPL`, `BABA`, and `PDD` selectable; 40 historical watchlist rows have zero orphaned identities.
- Import idempotency: repeated A-share apply made zero inserts, updates, or deactivations.
- Search latency and deployment canaries: production warm trace measured 743.8 ms end to end with 256.0 ms in the Supabase RPC. Exact code and Chinese-name searches returned verified master-data results.
- Authenticated browser canary: a temporary production user added `002463` without a force-add dialog, persisted it through a local-cache clear and reload, and passed desktop/mobile overflow and console checks. The temporary user and its cascaded data were deleted after verification.
- Sync health observation: active memberships remain 5,528 A shares, 2,142 A funds, 325 convertible bonds, 2,444 HK Main Board, 500 NASDAQ Top 500, and 324 U.S.-listed China/ADR. Pending discovery candidates: 0. No production error-level or HTTP 500 Vercel logs were found in the 30-minute post-deploy window.

## Deferred Scope

S&P 500 is intentionally disabled until an authorized official constituent snapshot is supplied and passes the source authorization gate. This is a truthful external dependency, not a silent partial import. The osstack card must remain blocked rather than done while this required scope is unresolved.
