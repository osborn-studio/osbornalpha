# Macro strategy (P3 + P4) runbook

Spec: `docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md` (draft 5). Plan: `docs/superpowers/plans/2026-11-07-macro-workbench-p3-p4.md`.
Code: `src/lib/macro/strategy/**`, `src/app/api/macro/strategy/**`, `src/app/api/cron/macro-review/route.ts`, `src/components/macro/strategy/**`, `src/app/(app)/intel/macro/{transmission,history,review}/**`.
Storage: migration `supabase/migrations/20261115090000_macro_strategy.sql` (six tables, eight `security definer` RPCs, writes only through the RPCs).

## 1. Switches and the capability matrix (spec §9.1)

| Condition | Pages | Fact APIs (transmission, policy-response, cycle-table, reviews, manifests) | Explanations | Playbook mark / judgment section / deviations |
|---|---|---|---|---|
| `MACRO_STRATEGY_ENABLED` unset | 404 | 404 `strategy_disabled` | 404 | 404 |
| enabled, P1+P2 not wired (`strategyPort()` is `null`) | "宏观数据底座未就绪" | 503 `macro_foundation_unavailable` | 503 (a replay of an existing request still answers) | 503 |
| wired, `MACRO_JUDGMENTS_ENABLED` unset | normal | normal | normal, no judgments | absent; `/deviations` 404 `judgments_disabled` |
| wired, judgments on, F4 unreachable | normal, "判断层暂不可用" | normal (`judgment_status: 'unavailable'`) | normal | `/deviations` 503 `judgments_unavailable` |
| everything available | normal | normal | normal | normal |

Order inside every route: session (401) → `MACRO_STRATEGY_ENABLED` (404) → explanation replay (POST only) → foundation (503) → parameters (400) → judgment layer. Values: `'1'` turns a switch on; anything else is off.

Other variables: `CRON_SECRET` (review cron bearer), `NEXT_PUBLIC_SITE_URL` (F4 client base URL; unset → F4 unavailable), `VERCEL_GIT_COMMIT_SHA` (code version; unset → manifest-writing routes and the cron answer 503 `code_version_unavailable`). No new secrets.

Turn on order: WP-S6 wiring merged and verified → set `MACRO_STRATEGY_ENABLED=1` in Vercel production → redeploy (manual CLI deploy, see the production deploy notes) → open `/intel/macro/transmission`. The judgment layer stays off until the F4 owner turns `MACRO_JUDGMENTS_ENABLED` on.

## 2. Wiring P1 + P2 and F4 (WP-S6)

Until P1+P2 and F4 are on `main`, `strategyPort()` returns `null` and every fact route answers 503. After they merge, in one rebase:
1. Replace the mirrored declarations in `src/lib/macro/strategy/contract.ts` with imports from `src/lib/macro/{types,judgment-contract,events}`; add a type test asserting assignability both ways.
2. Add `src/lib/macro/strategy/wiring.ts` with `macroDbStrategyPort` over P1 `MacroDb` (`snapshotUpTo` pages `snapshotsSince` with a keyset and throws `truncated` when it cannot finish), `rules()` from P1 `RULES`, `derivePolicyEvents` from P2 `events.ts`, `timeliness` from P1 `releaseTimeliness`; make `strategyPort()` return it.
3. Add `US_FED_TARGET_D` to P1 `catalog.ts` inside a `// MACRO-P3` block (new `CATALOG_VERSION`).
4. Add the three link tabs (传导 / 历史 / 复盘) to P1 `MacroWorkbench.tsx` inside a `// MACRO-P3` block, rendered only while `MACRO_STRATEGY_ENABLED` is on.
5. Replace the HTTP F4 client by F4's in-process read functions if F4 ships them.
6. Re-record the replay fixtures only if the real catalog changes the frozen manifests, then run the full gate (section 7).
7. Measure the fact routes against spec §13 (p95 < 500 ms; < 100 ms on a cache hit). The process LRU of spec §4.5 is not built yet (every request rebuilds the manifest and `putManifest` is idempotent by hash); add it in `route-helpers.ts`, keyed by `(kind, both snapshot ids, cutoff, catalog_version, code_version)`, only if the targets are missed.
8. `vercel.json`: P1 also appends `/api/cron/macro-sync`. Merge the `crons` array by hand at rebase and keep both entries.
9. Links that 404 until this step lands: the 宏观工作台 tab (`/intel/macro`), observed-node and watch links (`/intel/macro/<seriesId>`) and the F4 method link (`/intel/methods/<id>/<version>`). Open each once after wiring.
10. Check the F4 read details against the merged F4 routes: the history cursor (`before`), `{cards}` vs `{items}`, the shape of `realized`, `settlement_id`, and the calibration values mapped by `f4.calibrationState.*`.

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
  - `node --env-file=.env.local --import tsx scripts/macro/strategy-reconcile.ts` (dry run: one JSON line per run with its class), then the same with `--apply` (`--limit n`, default 100, max 1000).
  - It reads `usage_events` where `idempotency_key = usage_audit_key` and acts per class:

| Class | `usage_events` row | `--apply` does | Why |
|---|---|---|---|
| `absent` | none | `macro_mark_finalized` | `beginUsageRun` never committed, so the model was never called; nothing to settle |
| `pending` | `status = 'pending'` | `finalizeUsageRun(user_id, usage_audit_key, 'perspectives', finalize_payload)` verbatim, then `macro_mark_finalized` | the earlier finalize never landed; a failure is printed as `finalize_failed` with the wrapper code and the run stays unfinalized for the next pass |
| `settled` | terminal and equal to the stored payload | `macro_mark_finalized` | an earlier finalize succeeded and only the mark was lost |
| `conflict` | terminal and different (for example `failed` with `usage_estimated = true` from `fail_stale_usage_runs`) | nothing (`left_for_review`) | decide by hand with billing; never edit the stored payload |

  - Exit 0 when every line is `dry_run` / `marked` / `finalized_and_marked`; 1 when any run still needs attention. Manual equivalent of the lookup: `select status, provider, model, input_tokens, output_tokens, cost_micrormb, pricing_version, usd_cny_micros, usage_estimated, byo, finalized_at from public.usage_events where idempotency_key = '<usage_audit_key>';`
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

- Every fact route 503 `macro_foundation_unavailable`: WP-S6 not deployed, or `strategyPort()` still returns `null`.
- Transmission 404 `no_published_snapshot`: neither region has an active P1 snapshot.
- A matrix or history column all `missing (history_truncated)`: the history read exceeded `HISTORY_MAX_ROWS`; check P1 observation counts.
- `judgment_status: 'unavailable'` while F4 is up: check `NEXT_PUBLIC_SITE_URL` and that `/api/judgments` answers JSON within 3 s.
- Manifests: `GET /api/macro/strategy/manifests/<id>` returns the full frozen input set of any view (ids in each view's `manifest_id`).

## 7. Verification gate

`npm test`, `npm run typecheck`, `npm run lint`, then with Homebrew PostgreSQL 17 and only for these two commands `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` and `… npm run test:migrations`. Known local flakes under load (pass in isolation; Linux CI is the gate): research suites `s6/store`, `s6/arm-lineage`, `fanout/run`, `s4/ledger`, `s4/checkpoint-registry`, `s4/anchor-two-phase` (5 s timeouts that cascade within the file). Rerun a single DB file with `.claude/scratch/db-one.ts` (handoff doc 2026-11-04 §5).
