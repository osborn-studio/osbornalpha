# Macro strategy (P3 + P4) runbook

最新生产验收见 [上线闭环记录](../audits/2026-11-07-launch-closeout/README.md)：生产 `98e9a819` 已包含 #142 新时钟与 #144/#145/#148；原生 Chrome 登录态 US/CN 时钟、量化依据及真实来源抽屉核心流程通过，判断开关启用且方法版本未变。这不是用户审美批准，也不包含完整移动端／退出登录验证。此前 `dc47ba2e` 的 18 个 200/private-no-store 样本保留为历史证据；cycle 首次观察 miss 16.114 秒尚未通过新版本重测解除，重复命中不等于 p95/SLA 达标，#150 优化未发布。

路径 2026-11-07 起为 `/macro`（旧路径 `/intel/macro/*` 308 永久重定向）

Spec: `docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md` (draft 5). Plan: `docs/superpowers/plans/2026-11-07-macro-workbench-p3-p4.md`.
Code: `src/lib/macro/strategy/**`, `src/app/api/macro/strategy/**`, `src/app/api/cron/macro-review/route.ts`, `src/components/macro/strategy/**`, `src/app/(app)/macro/{transmission,history,review}/**`.
Storage: migration `supabase/migrations/20261115090000_macro_strategy.sql` (six tables, eight `security definer` RPCs, writes only through the RPCs).

## 1. Switches and the capability matrix (spec §9.1)

| Condition | Pages | Fact APIs (transmission, policy-response, cycle-table, reviews, manifests) | Explanations | Playbook mark / judgment section / deviations |
|---|---|---|---|---|
| `MACRO_STRATEGY_ENABLED` unset | 404 | 404 `strategy_disabled` | 404 | 404 |
| enabled, foundation unavailable (`strategyPort()` is `null`: Supabase environment missing since WP-S6) | "宏观数据底座未就绪" | 503 `macro_foundation_unavailable` | 503 (a replay of an existing request still answers) | 503 |
| wired, `MACRO_JUDGMENTS_ENABLED` unset | normal | normal | normal, no judgments | absent; `/deviations` 404 `judgments_disabled` |
| wired, judgments on, F4 unreachable | normal, "判断层暂不可用" | normal (`judgment_status: 'unavailable'`) | normal | `/deviations` 503 `judgments_unavailable` |
| everything available | normal | normal | normal | normal |

Order inside every route: session (401) → `MACRO_STRATEGY_ENABLED` (404) → explanation replay (POST only) → foundation (503) → parameters (400) → judgment layer. Values: `'1'` turns a switch on; anything else is off.

Other variables: `CRON_SECRET` (review cron bearer), `NEXT_PUBLIC_SITE_URL` (F4 client base URL; unset → F4 unavailable), `VERCEL_GIT_COMMIT_SHA` (code version; unset → manifest-writing routes and the cron answer 503 `code_version_unavailable`). No new secrets.

Turn on: follow the production bring-up procedure in section 8 (prerequisites, data checks, flag, smoke checks, rollback). Section 8 describes the original facts-only release with judgments off. The 2026-11-07 #133–#136 release enables `MACRO_JUDGMENTS_ENABLED=1` after method publication, real registration and merged-commit CI checks; see the release record. A rollback may still turn judgments off without removing fact pages.

## 2. Wiring P1 + P2 and F4 (WP-S6)

Status: P1 + P2 #109 and P3 + P4 #110/#111/#112 are on `main`. F4 (`src/lib/judgments`, `/api/judgments`) uses `macro_regime@v2`; the HTTP F4 client selects v2 cards. #133 fixes production JSONB reads; #135 renders the clock only from qualifying cards bound to the active snapshot. The gate is enabled in the 2026-11-07 release after licence and deployment checks; never infer runtime state from the default flag value alone.

1. DONE. `contract.ts` imports the real types from `src/lib/macro/{types,judgment-contract,events}`: identical types are re-exported (`Region`, `SeriesType`, `ChangeKind`, `Bilingual`, `DeriveRule`, `Timeliness`, `Regime`, `REGIMES`, `EventInput`, `PolicyEvent`); three types the strategy code reads only partly are projections of the real ones (`ObservationRow` = real minus `locator` / `code_version` / `batch_id`; `SnapshotRecord` = real minus `failure_reason`; `MacroSeriesDef` = real with `source` narrowed to `publisher` / `via` / `fetchHost` / `rights`). `RulesView` / `RuleRow` stay this module's own projection of P1 `RULES`. `contract.types.test.ts` pins this: equal both ways for identical types, real-assignable and exact Pick / Omit for projections. No P1 type contradicted the mirror; the differences are only the extra storage fields above (the mirror was a subset), so no strategy code changed. Replay and manifest bodies are unchanged because they never carried those fields.
2. DONE. `src/lib/macro/strategy/wiring.ts` `macroDbStrategyPort(db, {pageSize, maxPages})`: `snapshotUpTo` pages `MacroDb.snapshotsSince` (all regions, ascending by `(created_at, snapshot_id)`, failed rows excluded) with the keyset marker, keeps the last match of the region (greatest id on a `created_at` tie), stops at the first row past the cutoff, and throws `Error('truncated')` after `maxPages` (200 pages x 200 rows). `MacroDbError('truncated')` from `seriesHistory` is normalised to `Error('truncated')` (the strategy code matches `message === 'truncated'`). Rows are projected to the contract shape. `rules()` projects P1 `RULES` in table order, `derivePolicyEvents` is P2 `events.ts`, `timeliness` is P1 `releaseTimeliness`, `catalog()` / `catalogVersion()` are P1 `MACRO_CATALOG` / `CATALOG_VERSION`. No `MacroDb` method was added (so no SQL change). `strategyPort()` builds the port from `macroRouteDeps().db` (anon reads under RLS plus the service-role client, as every P1 route does); it returns `null` only when the Supabase environment is missing, which the capability matrix answers with 503 `macro_foundation_unavailable`. `wiring.test.ts` runs the port on P1's memory `MacroDb` with `memoryStrategyPort` semantics.
3. DONE. `US_FED_TARGET_D` (FRED `DFEDTAR`, `event_source`, weight 0, `immutable`, `daily`) is in `src/lib/macro/catalog.ts` inside `// MACRO-P3` ... `// /MACRO-P3`; `CATALOG_VERSION` is content-addressed, so it changed by construction. The FRED cron picks it up automatically (`collectableOf('fred_csv')`); a recorded fixture `src/lib/macro/fixtures/fred/DFEDTAR.csv` and its manifest entry were added from the public CSV (no key), and the catalog / fixture / cron tests were updated. `DFEDTAR` ends on 2008-12-15 and FRED ignores `cosd` beyond a series' end (verified 2026-11-07: `cosd=2015-01-01` and `cosd=2025-01-01` both return 1982-09-27 .. 2008-12-15, 172 645 bytes), so every daily run re-reads the whole 170 KB series; the rewrites are duplicates (immutable, idempotent) and the first run after backfill also stores 1982-1999.
4. DONE. Link tabs 传导 / 历史 / 复盘 (`/macro/transmission`, `/history`, `/review`) in `MacroWorkbench.tsx` inside a `// MACRO-P3` block (`strategy-links.ts`), shown only when the server page passes `strategyEnabled` (read through `strategyEnabled()`; the client component never sees the env name). Strings: `tabs.transmission|history|review` in `messages/{zh,en}/macro.json`.
5. DEFERRED (optional transport refactor). F4 is on `main` via #117. Keep the tested HTTP F4 client; an in-process replacement is a separate change. No judgments behaviour changed.
6. DONE. Replay tests (`strategy/replay.test.ts`, P1 `replay.test.ts`) pass and no replay fixture or hash was re-recorded: the strategy manifests freeze their own fixture catalog projection (replay never reads the live catalog, spec §4.5 N2), and the P1 replay hashes cover recorded evidence bytes and published snapshots that the new row does not touch. The only recorded file added is the FRED fixture `DFEDTAR.csv` (step 3).
7. BUILT (#128, #136). `strategy/memo.ts` combines a bounded 32-entry process LRU/single-flight layer with Next Data Cache for small pure fact views. The shared entry has a 300-second absolute expiry, even when Next would otherwise serve stale data during background revalidation. The key includes schema, parameters, both regions' active snapshot identities, publish/input revisions, catalog version and deploy SHA; auth, flags and current revision reads happen first. Missing revision evidence bypasses both fact-cache layers. Transmission recomputes judgments on every request. `X-Macro-Strategy-Memo: hit|miss|coalesced` describes the process layer (`coalesced` joined an in-flight build), not proof of a cross-instance Next cache hit. Overview separately caches immutable snapshot facts with current selection/revision checks, leaving collection freshness outside the cache. Run `node --env-file=<env> --import tsx scripts/macro/strategy-latency.ts --memo` to profile reads; browser HTTP `no-store` does not bypass these server caches. The p95 < 500 ms first-call and < 100 ms repeat targets remain targets until representative production measurements demonstrate them; see the release report for actual samples.
8. DONE (verified, guarded by `strategy/vercel-crons.test.ts`). `vercel.json` `crons` holds `/api/cron/macro-sync` (`30 5 * * *`) and `/api/cron/macro-review` (`0 6 3 * *`).
9. DONE. The formerly 404 links resolve to existing routes: `/macro` (`src/app/(app)/macro/page.tsx`) and `/macro/<seriesId>` (`[seriesId]/page.tsx`). F4 method routes are now present via #117; public visibility still depends on method publication.
10. INTEGRATED (#120, #125). The HTTP parser and macro bridge tests cover the merged F4 route contract; deployment smoke checks must still verify: the history cursor (`before`), `{cards}` vs `{items}`, the shape of `realized`, `settlement_id`, and the calibration values mapped by `f4.calibrationState.*`.

### Shared-cache expiry and browser reloads (#138)

An expired shared entry can trigger both Next background revalidation and a foreground hard-expiry fallback. These now reuse a single build promise for that lookup, including a rejection; a later request may retry. This avoids duplicate manifest work without changing the 300-second TTL or version identity.

Authenticated strategy reads return `Cache-Control: private, no-store`, and the strategy client hook requests `cache: 'no-store'`. Same-URL reloads therefore re-enter the server gates rather than relying on a fresh browser HTTP response. Server pure-fact caches remain active after those gates. Verify actual response headers and logged-in reload behavior after deployment; this design alone does not prove every intermediary, account-switch path, cold instance, or latency target.

## 3. Monthly review

- Schedule: `vercel.json` runs `GET /api/cron/macro-review` at `0 6 3 * *` (UTC) for the newest closed month, US then CN.
- Cutoffs (spec §6.2): a review of month M is known as of the 3rd of M+1, 00:00:00Z; its baseline is known as of the 3rd of M, 00:00:00Z. A month is closed once its cutoff has passed, so the scheduled run on the 3rd at 06:00 UTC targets the previous month and a manual `?month=` before its cutoff is a 400. The compared periods stay month end vs month end; timeliness and the F4 judgment section (`asOf`) use the cutoff date.
- Manual run (one unit): `curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/macro-review?month=2026-10&region=US"`.
- Dry run (zero writes): add `&preview=1`; the receipt shows the status and manifest hash the run would publish.
- Receipt: `{ok, month, preview, receipts:[{region, month, outcome, status, manifest_hash, manifest_id, result_id, generation, code?}]}`. `outcome` is `advanced` (pointer moved), `replayed` (same inputs, pointer unchanged), `stale` (another run won the generation, or an older cutoff), `preview`, or `failed` (`code: review_failed`, HTTP 500).
- Recompute: rerun the same month. The result row is immutable per manifest hash; the pointer only moves forward (`generation + 1`). A failure never moves the pointer.
- Failed attempts: service-only table `macro_review_attempts` (`status = 'failed'`, `error` jsonb). Read with the service role: `select region, month, created_at, error from public.macro_review_attempts where status = 'failed' order by created_at desc limit 20;`
- `insufficient`: no non-failed snapshot existed at that month's cutoff. Generate the snapshot in P1, then rerun the month.

## 4. Explanations (LLM)

- Quota and billing reuse the `perspectives` feature: `checkQuota('perspectives')` for platform keys (BYO skips it), `beginUsageRun` / `runMeteredLlmCall` / `finalizeUsageRun` exactly as the perspectives route. A rejected output is a completed call and counts.
- The usage audit key is the explanation_id itself (uuid text; `begin_usage_run` / `finalize_usage_run` declare `p_idempotency_key uuid`) (made by `macro_claim_explanation`). Only the request that got `claimed` bills and calls the model; concurrent duplicates get the existing projection.
- A running claim older than 5 minutes **without a recorded completion** is turned into `abandoned` (projection `failed`, code `abandoned`) by the next claim of the same request, and by `macro_expire_explanations(user_id)`, which `GET /explanations` runs before every read — so a page reload resolves a run whose worker died; the panel then offers a new request.
- Durable completion: right after the provider returns (or throws, or `beginUsageRun` fails) the request stores the raw output and the exact `finalizeUsageRun` body (`finalize_payload`: status, provider, model, tokens, cost, pricing version, FX, `usageEstimated`, `byo`) with `macro_record_completion`, before validation and finish. A successful provider call is stored as a completion envelope `{content, provider, model, prompt_version, validator_version, accounting}`. `macro_finish_explanation` carries the same payload and stores it when none is recorded (never overwriting one). `finalizeUsageRun` then runs in a finally path even when finish fails; `macro_mark_finalized` is called only after it succeeded.
- Completion recovery (no second model call): a run still `running` with a recorded envelope (finish failed after the provider answered) is never abandoned. The next POST with the same `request_id`, or the user's next `GET /explanations` (at most three such runs per read), validates and renders the stored output against the manifest's frozen facts and finishes it as `accepted` / `rejected`; if `VALIDATOR_VERSION` changed since the call it finishes `failed` with `validator_version_changed`. The same step finalizes a recorded, unsettled payload verbatim. List rows waiting for it: `select explanation_id, user_id, claimed_at from public.macro_explanation_runs where state = 'running' and jsonb_typeof(raw_output) = 'object' order by claimed_at;` — a row that stays there means its manifest read or finish keeps failing; check the function logs.
- Settlement reconcile: every run with a recorded payload and `finalized = false`, in any state (final, still `running` after a failed finish, or `abandoned` with a late completion). Do **not** classify a run from a `finalizeUsageRun` error: the wrapper (`src/lib/billing/quota.ts`) retries three times and then throws only `usage_audit_invariant` (SQLSTATE 55000, `usage run finalize conflict`) or `usage_audit_unavailable` (everything else — `usage run not found` (P0002) and a transient outage look the same). Look the usage run up by its key instead. Run the script with the service-role environment:
  - `node --env-file=.env.local --import tsx scripts/macro/strategy-reconcile.ts` (dry run: one JSON line per run with its class), then the same with `--apply` (`--limit n` is the page size, default 100, max 1000; the sweep walks the whole backlog page by page by keyset over `(claimed_at, explanation_id)`, so `conflict` rows never block later rows; each line is printed as soon as its row completes).
  - It reads `usage_events` where `idempotency_key = usage_audit_key` and acts per class:

| Class | `usage_events` row | `--apply` does | Why |
|---|---|---|---|
| `absent` | none | `macro_mark_finalized` | `beginUsageRun` never committed, so the model was never called; nothing to settle |
| `pending` | `status = 'pending'` | `finalizeUsageRun(user_id, usage_audit_key, 'perspectives', finalize_payload)` verbatim, then `macro_mark_finalized` | the earlier finalize never landed; a failure is printed as `finalize_failed` with the wrapper code and the run stays unfinalized for the next pass |
| `settled` | terminal and equal to the stored payload | `macro_mark_finalized` | an earlier finalize succeeded and only the mark was lost |
| `conflict` | terminal and different (for example `failed` with `usage_estimated = true` from `fail_stale_usage_runs`) | nothing (`left_for_review`) | decide by hand with billing; never edit the stored payload |

  - A failed `usage_events` read for one row prints `class: unknown, action: lookup_failed` with the error and the sweep carries on; rerun later for that row.
  - Exit 0 when every line is `dry_run` / `marked` / `finalized_and_marked`; 1 when any run still needs attention (`left_for_review`, `finalize_failed`, `mark_failed`, `lookup_failed`). Manual equivalent of the lookup: `select status, provider, model, input_tokens, output_tokens, cost_micrormb, pricing_version, usd_cny_micros, usage_estimated, byo, finalized_at from public.usage_events where idempotency_key = '<usage_audit_key>';`
  - Never recompute the payload from current pricing or FX and never rerun the model; `finalize_usage_run` is idempotent for identical arguments, so repeating a settled payload is safe.
- Runs with `finalize_payload` null: since `macro_finish_explanation` stores the payload too, this happens only when both `macro_record_completion` and finish failed. The run expires to `abandoned` (it has no recorded output) and its usage run stays `pending` until `fail_stale_usage_runs` marks it failed. List them with `select explanation_id, usage_audit_key, state from public.macro_explanation_runs where finalize_payload is null and finalized = false and state = 'abandoned';`, look each key up in `usage_events` as above and settle by hand with billing; `macro_mark_finalized` refuses them.
- Failure codes shown to users:

| Code | Meaning | Action |
|---|---|---|
| `parse` | model output is not JSON | none; user may regenerate |
| `schema` | JSON shape, counts or lengths wrong | none |
| `unknown_fact` | cites a fact id outside the frozen fact list | none |
| `numeral` | a number token in model text (digits, full-width, circled, Chinese numerals in a quantity context, English number words, %, bp, pp) | none; this is the lexical policy working |
| `forbidden_term` | a term from `FORBIDDEN_TERMS` | none |
| `regime_term` | a regime name (v1 explanations carry no judgment) | none |
| `provider_error` | the model call failed | check provider status; user retries with a new request |
| `validator_version_changed` | a recorded output was recovered after a validator release, so it was not judged again | none; user may regenerate |
| `abandoned` | the claim timed out | check function timeouts |
| `usage_audit_unavailable`, `usage_audit_invariant`, `daily_cost_exhausted`, `pricing_unavailable`, `budget_unavailable`, `budget_invariant_violation` | metering refused the run (same codes as perspectives) | see the billing runbook entries for the code |

- Error responses: 409 `payload_conflict` (same request id, different subject or locale), 429 `quota_exceeded`, 503 `llm_not_configured`, 404 `subject_not_found`, 422 `no_facts`.
- Raw model output lives only in the service-only `macro_explanation_runs.raw_output`; users read `macro_explanations` (their own rows, RLS).

## 5. Catalog additions

New series (owner item A: RRP `RRPONTSYD`, TGA `WTREGEN`, Fed total assets `WALCL` for the QE / QT row) go through P1's catalog process first (rights, adapter, fixtures, `CATALOG_VERSION`). Then:
1. transmission: change the node from `not_in_catalog` to `observed` in `data/transmission-v1.ts` → new `macro-transmission/2` version string in `contract.ts` `VERSIONS` (a plan change);
2. response matrix: QE / QT needs a balance-sheet event definition first; it stays `missing` until the spec defines it;
3. rerun the replay fixtures and record the new manifests.
Restricted series (VIX, SP500 / NASDAQ / DJIA, CSI 300) stay `restricted` until owner item C confirms redistribution rights.

## 6. Troubleshooting

- Every fact route 503 `macro_foundation_unavailable`: `strategyPort()` returned `null`, i.e. `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing in that deployment.
- Transmission 404 `no_published_snapshot`: neither region has an active P1 snapshot (run the checks of section 8.1 and 8.2).
- A fact route 500 right after enabling: read the function log; a `truncated` thrown outside the routes' own handling means a bounded read ran past its cap (`snapshotsSince` paging in `wiring.ts`, or `HISTORY_MAX_ROWS`).
- A matrix or history column all `missing (history_truncated)`: the history read exceeded `HISTORY_MAX_ROWS`; check P1 observation counts.
- `judgment_status: 'unavailable'` while F4 is up: check `NEXT_PUBLIC_SITE_URL` and that `/api/judgments` answers JSON within 3 s.
- Manifests: `GET /api/macro/strategy/manifests/<id>` returns the full frozen input set of any view (ids in each view's `manifest_id`).

## 7. Verification gate

`npm test`, `npm run typecheck`, `npm run lint`, then with Homebrew PostgreSQL 17 and only for these two commands `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` and `… npm run test:migrations`. Known local flakes under load (pass in isolation; Linux CI is the gate): research suites `s6/store`, `s6/arm-lineage`, `fanout/run`, `s4/ledger`, `s4/checkpoint-registry`, `s4/anchor-two-phase` (5 s timeouts that cascade within the file). Rerun a single DB file with `.claude/scratch/db-one.ts` (handoff doc 2026-11-04 §5).

## 8. Production bring-up (for the `prod-bringup` session)

Run after the WP-S6 branch is merged to `origin/main`. Production is the Supabase project `stock-monitor` (ref `mzfcaabhuwtfvsvadvsv`, PostgreSQL 17; the hosted `postgres` role is not a superuser) and the Vercel project `stock-monitor` (not connected to Git, manual CLI deploys). The helper `q` (Management API SQL endpoint with the Supabase CLI token from the keychain), the migration method and the cron call pattern are exactly those of `docs/runbooks/macro-sync.md` §13.1-§13.4; this section only adds what P3 + P4 need. The token and `CRON_SECRET` stay in shell variables, never printed or written to disk.

Defaults that do not change: `MACRO_STRATEGY_ENABLED` unset until 8.3; **`MACRO_JUDGMENTS_ENABLED` stays unset** (judgment layer off) until the current method is registered, publishable and deployment checks pass; no flag default changes in code.

```bash
mount | grep -q AIMATE_WORK || echo "SSD NOT MOUNTED — stop"
cd ~/Developer/CodeX/OsbornAlpha && git fetch origin main && git log origin/main --oneline -8 | cat   # the WP-S6 merge must be here
REF=mzfcaabhuwtfvsvadvsv
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
q(){ jq -n --arg q "$1" '{query:$q}' | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @-; }
BASE=https://osbornalpha.com
```

### 8.1 Prerequisites (all must hold; stop at the first that does not)

1. **P1 migration `20261114090000_macro_workbench.sql` applied, with its history row** (macro-sync §13.1). Check: `q "select version, name from supabase_migrations.schema_migrations where version in ('20261114090000','20261115090000') order by 1"` must list `20261114090000` now and `20261115090000` after item 2.
2. **P3 migration `20261115090000_macro_strategy.sql` applied, with its history row, in one request (one transaction)**. The file is locked (`supabase/migrations.lock.json`): do not edit it. It has no `alter … owner`, no extension, no reference to P1 or F4 tables, so it runs under the non-superuser role and is replayable.
   ```bash
   SQL="$(cat supabase/migrations/20261115090000_macro_strategy.sql)
   insert into supabase_migrations.schema_migrations(version, name, statements) values ('20261115090000','macro_strategy', array[]::text[]) on conflict (version) do nothing;"
   OUT=$(jq -n --arg q "$SQL" '{query:$q}' | curl -sS -w '\n%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @-)
   echo "HTTP $(printf '%s' "$OUT" | tail -1)"; printf '%s' "$OUT" | sed '$d' | head -c 400; echo   # 2xx and []
   q "select version from supabase_migrations.schema_migrations where version='20261115090000'"          # exactly 1 row; otherwise stop, never back-fill the history by hand
   ```
   Verify the schema (expected values in the comments):
   ```bash
   q "select count(*) from pg_tables where schemaname='public' and tablename in ('macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations')"   # 6
   q "select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname in ('macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations') order by 1"   # 6 rows, all true
   q "select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') and grantee in ('anon','authenticated','service_role','public')"   # []
   q "select p.proname, has_function_privilege('anon',p.oid,'execute') anon_x, has_function_privilege('authenticated',p.oid,'execute') auth_x, has_function_privilege('service_role',p.oid,'execute') svc_x from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('macro_put_manifest','macro_publish_review','macro_record_review_attempt','macro_claim_explanation','macro_record_completion','macro_finish_explanation','macro_mark_finalized','macro_expire_explanations') order by 1"   # 8 rows: svc_x true, anon_x and auth_x false
   ```
   If a grant differs, do not edit the migration: add the missing `revoke execute … from public, anon, authenticated` on production and record it in `docs/audits/`.
3. **`MACRO_INGEST_SECRET` set** in Vercel production (macro-sync §13.2; unset means ingest answers 503 and the owner's AKShare run cannot upload). `vercel env ls production | grep -E 'MACRO_INGEST_SECRET|CRON_SECRET'` lists both.
4. **`CRON_SECRET` present** (with it unset `/api/cron/macro-review` answers 401 `unauthorized`, because the bearer check can never pass; no 503 is returned, so a 401 on a correct bearer means the secret is missing in the deployment).
5. **`VERCEL_GIT_COMMIT_SHA` present in the deployment.** Vercel does **not** fill it for CLI deploys of this project (no Git connection; observed 2026-11-07, `data-foundation.md` §10.7): deploy from the clean `origin/main` worktree of macro-sync §13.2 **and** pass it explicitly, `vercel deploy --prod --yes --env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)`. Without it, manifest-writing routes and the review cron answer 503 `code_version_unavailable`.
6. **The first `macro-sync` run published an active US snapshot** and the owner ran AKShare and published a CN snapshot (macro-sync §13.3 and §13.4). The CN snapshot is the owner's step on the owner's Mac; the strategy pages degrade without it (a region with no snapshot shows its nodes missing) but the transmission route answers 404 `no_published_snapshot` only when neither region has one.
7. **`US_FED_TARGET_D` (DFEDTAR), `US_FED_TARGET_UPPER_D` and `US_FED_TARGET_LOWER_D` are loaded.** They come from the same macro-sync run once the WP-S6 code is deployed (the catalog gained `US_FED_TARGET_D`, so a deployment that predates WP-S6 never fetched it: rerun `GET $BASE/api/cron/macro-sync` with the bearer after the deploy and read a `success` receipt).

### 8.2 Data checks (read-only; all before the flag is set)

```bash
# snapshots: one active per region (CN only after the owner's run), catalog version = the deployed one
q "select region, snapshot_id, revision, as_of, status, catalog_version, created_at from macro_snapshots where status='active' order by region"   # US row required; CN row after the owner's run
# the three policy-event sources: each has rows, DFEDTAR ends 2008-12-15, UPPER/LOWER start 2008-12-16
q "select series_id, count(*) n, min(period_end) first, max(period_end) last from macro_observations where series_id in ('US_FED_TARGET_D','US_FED_TARGET_UPPER_D','US_FED_TARGET_LOWER_D') and status='ok' group by 1 order by 1"   # 3 rows; D: n > 2000 and last 2008-12-15; UPPER/LOWER: last within a few days of today
# the 2008 switch evidence the history views need
q "select series_id, period_end, value_text from macro_observations where status='ok' and ((series_id='US_FED_TARGET_D' and period_end='2008-12-15') or (series_id in ('US_FED_TARGET_UPPER_D','US_FED_TARGET_LOWER_D') and period_end='2008-12-16')) order by 1"   # D 1 (1.0000 raw → 1), UPPER 0.25, LOWER 0
# no open macro quarantine items on those series
q "select count(*) from dq_quarantine where dataset like 'macro.%' and status='open'"   # 0
# freshness
q "select dataset, last_ok_at, consecutive_errors, status from dq_freshness where dataset like 'macro.%' order by 1"   # macro.fred has last_ok_at; macro.akshare after the owner's run
# P3 tables start empty
q "select (select count(*) from macro_strategy_manifests) manifests, (select count(*) from macro_review_results) reviews"   # 0 0
# the flag matrix is as intended
vercel env ls production | grep -E 'MACRO_(STRATEGY|JUDGMENTS)_ENABLED' || echo "both unset (expected)"
```

If `US_FED_TARGET_D` has no rows, stop: run `curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-sync?preview=1" | jq '.series[] | select(.series_id|test("TARGET"))'` first (fetch + parse only; `points > 0` for all three), then the real run.

### 8.3 Turn the flag on

```bash
vercel env add MACRO_STRATEGY_ENABLED production      # enter: 1   (any other value is off)
vercel env ls production | grep -E 'MACRO_(STRATEGY|JUDGMENTS)_ENABLED'   # STRATEGY present, JUDGMENTS absent
# manual CLI deploy from a clean origin/main checkout (macro-sync §13.2): env changes need a redeploy
git fetch origin main
D=~/Developer/CodeX/.worktrees/OsbornAlpha/deploy; mkdir -p "$(dirname "$D")"
git worktree add --detach "$D" origin/main
mkdir -p "$D/.vercel" && cp .vercel/project.json "$D/.vercel/project.json"
( cd "$D" && vercel deploy --prod --yes --env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) )   # --env required, see 8.1 item 5
git worktree remove "$D" && git worktree prune
```
Then run 8.4 (the cron answers 404 `strategy_disabled` before this step, so the preview can only run now) before the smoke checks of 8.5.

### 8.4 Review cron preview (`&preview=1`, zero writes) — after 8.3, first thing after the deploy

```bash
# no `month`: the server picks the newest closed month (a month is closed once the 3rd of the next month 00:00:00Z has passed,
# so on the 1st-2nd of a month the previous month is NOT closed yet and an explicit month=<previous> is a 400)
R=$(curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-review?preview=1"); echo "$R" | jq .
M=$(echo "$R" | jq -r .month); echo "server-selected month: $M"   # reuse exactly this month for the real run below
```
Expect HTTP 200, `ok: true`, `preview: true`, one receipt per region with `outcome: 'preview'`, a `status` of `ok` (or `insufficient` for a region with no snapshot at that month's cutoff, which is a data gap, not a failure) and a 64-hex `manifest_hash`. A 503 `code_version_unavailable` means 8.1 item 5 failed; a 503 `macro_foundation_unavailable` means the Supabase environment is missing in the deployment. Only after the preview is clean (and the 8.5 smoke checks pass), publish the first review for real (one unit at a time): `curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-review?month=$M&region=US" | jq .` (with the `month` read from the preview receipt, not a locally computed one) then `region=CN`; receipts `advanced`, rerun gives `replayed`.

### 8.5 Smoke checks (flag on, `MACRO_JUDGMENTS_ENABLED` still unset)

Fact routes need a session (401 without one; `/api/*` is not covered by the middleware). From a logged-in browser tab on `$BASE` (DevTools console), expected 200 and never 503:

```js
const u=['/api/macro/strategy/transmission?region=US','/api/macro/strategy/transmission?region=CN','/api/macro/strategy/policy-response?window=3',
 '/api/macro/strategy/cycle-table?boundary=event_day','/api/macro/strategy/reviews?region=US','/api/macro/strategy/reviews?region=CN'];
console.table(await Promise.all(u.map(async x=>{const r=await fetch(x);return {url:x,status:r.status,body:r.status===200?'ok':(await r.text()).slice(0,120)};})));
const t=await (await fetch('/api/macro/strategy/transmission?region=US')).json();
console.log(t.judgment_status, t.transmission.manifest_id);                                // 'disabled' while judgments are off
console.log((await fetch('/api/macro/strategy/manifests/'+t.transmission.manifest_id)).status);   // 200: the frozen inputs of that view
console.log((await fetch('/api/macro/strategy/deviations?region=US')).status);             // 404 judgments_disabled (expected: the judgment layer is off)
```
- Any `503 macro_foundation_unavailable` (Supabase environment) or `503 code_version_unavailable` (no `VERCEL_GIT_COMMIT_SHA`): stop and fix; do not roll forward. `404 strategy_disabled`: the deploy predates the flag. `404 no_published_snapshot`: 8.1 item 6.
- Pages (logged in): `/macro/transmission`, `/macro/history`, `/macro/review` render content (not the "宏观数据底座未就绪" state); on `/macro` the tabs 传导 / 历史 / 复盘 are visible and each link opens its page; there is no judgment UI anywhere (`document.body.innerText.match(/象限|得分|margin|概率|置信度/)` is `null`); `/macro/US_UNRATE` opens (formerly a dead link).
- Latency (runbook section 2 step 7): note the time of the transmission and policy-response calls from the Network panel; the targets are p95 < 500 ms and < 100 ms on a repeat. Record the numbers in `docs/audits/`; build the LRU only if missed.
- Next 05:30 UTC cron and 3rd-of-month 06:00 UTC review cron: read the receipts in the Vercel logs the first time they run.

### 8.6 Rollback

1. Unset the flag and redeploy: `vercel env rm MACRO_STRATEGY_ENABLED production` then the 8.3 deploy. Pages, fact routes, explanations and the review cron answer 404 again; the six P3 tables and any published reviews stay (inert and read-only through the RPCs; never drop them).
2. A bad published review: rerun that month after the fix (the pointer only moves forward, section 3); do not edit rows.
3. Data problems are P1 problems: roll the snapshot back with macro-sync §8 / §13.6. Record every rollback in `docs/audits/`.
