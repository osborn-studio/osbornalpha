# Wave169 release closeout — release170 deployed, broader acceptance degraded

Release snapshot: 2026-11-08 UTC, incorporating release170 final evidence and parent authenticated observations at 05:08:50 UTC. **Recorded main `2d3c5ad5b754891ac579b08111398473f6d2d94a` is deployed; scoped anonymous and authenticated GET checks pass; overall production acceptance remains DEGRADED / NOT GRANTED.** This documentation task records supplied evidence and performs no production, browser, migration, merge or deployment action.

## Current release and migration boundary

[PR #170](https://github.com/osborn-studio/osbornalpha/pull/170), “bypass materialized manifest RPC arguments,” merged at `fbf9501e3a49800695eba0b735016dc5926923ab`; [documentation PR #171](https://github.com/osborn-studio/osbornalpha/pull/171) merged at `2d3c5ad5b754891ac579b08111398473f6d2d94a`. #170 adds a single unnamed JSONB argument transport wrapper delegating to the original persistence RPC. Merge and deployment do not establish resolution of all persistence cases.

Production migration `supabase/migrations/20261121090000_macro_manifest_json_transport.sql` is **APPLIED_AND_VERIFIED**, with exact file/history SHA-256 `8a142a55b7269f4d43c45e1c70ce988addd83cd05af0d5821b49a3af7a9a3dcd`. Parent evidence records atomic apply/history readback, matching digest, one unnamed JSONB argument, SECURITY INVOKER, search_path `pg_catalog, public`, service execution allowed, anon/authenticated execution denied and schema reload. Readiness at 04:52:23.847 UTC passed: service-role HTTP 400/P0001 and anon HTTP 401/42501. These invalid empty envelopes were rejected before legacy persistence; readiness did not submit a valid manifest. Migration/readiness preceded deployment; do not reapply it. An application rollback does not automatically revert this migration.

Exact candidate `2d3c5ad5b754891ac579b08111398473f6d2d94a` deployed to READY [`dpl_5ARPEjdR3a3ztxUNb8bJCEK6YVww`](https://vercel.com/gilosbornhellos-projects/stock-monitor/5ARPEjdR3a3ztxUNb8bJCEK6YVww). Both `osbornalpha.com` and `www.osbornalpha.com` independently inspected to this deployment; HTTP sampling used www. Release owner records CLI exit 0, Node 22, explicit deploy-time VERCEL_GIT_COMMIT_SHA matching candidate, exact runtime SHA and remote main matching before deployment and after verification. Final state at 05:09:28 UTC records clean release checkout and matching main.

Exact [Application CI 42448637595](https://github.com/osborn-studio/osbornalpha/actions/runs/42448637595) and [fixture CI 42448637754](https://github.com/osborn-studio/osbornalpha/actions/runs/42448637754) completed success before deployment, every job and step successful, including build, audit and database/runtime checks. These are supplied exact-candidate CI results, not reruns by this documentation task; prior-release test counts are not assigned to this candidate.

All nine post-deployment anonymous checks PASS: methodology and US/CN judgments report exact candidate runtime SHA; macro_regime v2 is active/publishable with formula hash `dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`; US/CN cards use v2. Transmission, cycle-table and policy-response each returned expected 401/no-store/error-only responses twice, without Set-Cookie. Registration code_version remains registration provenance. These checks do not grant authenticated or performance acceptance.

Previous f01 deployment `dpl_FLG4pd7YKYu5ixiErabGj1BH9SNj` remains independently inspected READY as rollback; no rollback performed. READY does not mean acceptance-clean. No flag, rights, Wind, calibration, publication or cron gate change is part of this documentation update.

## Current authenticated GET success and UI limits

Parent `browser-acceptance170.json` records existing logged-in Chrome same-origin fetches after refreshing production, exact runtime `2d3c5ad5b754891ac579b08111398473f6d2d94a`, and current deployment ID. Timings include completed JSON bodies. All following requests returned HTTP 200 with private, no-store:

| Request | Memo state | Time |
| --- | --- | --- |
| transmission, US | miss | 2,676 ms |
| transmission, US | hit | 1,153 ms |
| transmission, CN | hit | 1,166 ms |
| policy-response, window=3 | hit | 872 ms |
| cycle-table, boundary=event_day | hit | 935 ms |

The cycle manifest GET returned 200 for `c297fab4-b614-480b-a2cd-cf207213a087`, hash `d1b2f3cdce60a32fb5095c5008416b85125bc34843b29ff613cff0243e194139`, with **22,451 inputs**, kind cycle_table, codeVersion exactly `2d3c5ad5b754891ac579b08111398473f6d2d94a` and cutoff `2026-11-08T05:00:51.795Z`. Policy-response identifies manifest `edf94710-cdf5-4dee-9cc2-0107c034277c`. This is evidence of the current new-manifest path succeeding and complete recorded input count, not all write/replay cases being resolved. The manifest GET/hash field is not a new independent canonical-body hash recomputation by this documentation task.

At viewport width 375, the CN clock displayed coverage 0.6 and “Input snapshot is stale relative to the active overview; no current quadrant,” with Stagflation / Recession tied at 0pp. This is an observed stale-snapshot guard; the independent clock-freshness investigator reports a production producer-wiring gap (publish callsites use the default no-op hook, while settlement compensation is separately scheduled). Fix work is in progress separately; this is an investigator finding, not a deployed fix or completed clock acceptance. Chrome again returned `cgWindowNotFound` after the screenshot and before the breakdown click completed. The breakdown button was visible; activation and full UI acceptance were not verified on this deployment.

The first batched console result was truncated; only visible methodology/US results and subsequent individually logged CN/policy/cycle samples are retained. Memo labels and individual timings do not establish p95/SLO, controlled cold starts, TTL, cross-instance or cross-account isolation. Login/logout/account switching and the full production mobile matrix remain unaccepted. Parent explicitly records overallAcceptanceComplete=false and timeoutResolved=false.

## Unresolved persistence replay and separate read incident

The bounded existing-manifest replay in `write-replay/evidence.json` used a fixed **10,000 ms client abort**, no retries, and failed with TimeoutError. The prior GET completed HTTP 200 in 2,510 ms, 6,775,461 response bytes; existing manifest identity, canonical body/hash, metadata and 22,451-input checks passed. The replay request was 6,345,793 bytes. The client deadline is not a measured server duration or proof of the server cancellation cause.

Independent production error evidence at **04:58:26.673 UTC** confirms SQLSTATE `57014` through the **new RPC**: PostgREST calls `macro_put_manifest_json($1::jsonb)` without json_to_record; context is legacy `macro_put_manifest(...)` line 10 at IF and wrapper line 13 at RETURN. Production prosrc readback identifies line 10 as `if v_body is distinct from p_body then raise exception 'payload_conflict'; end if;`. This localizes where cancellation surfaced, not which operation consumed the cumulative statement budget. Earlier envelope parsing/extraction, INSERT constraints/conflict handling, row fetch/TOAST and comparison remain candidates requiring attribution. Transaction ID 0 does not prove that no INSERT path was attempted. Exact request correlation beyond the singleton replay window is not established. **The write incident remains OPEN; #170 did not resolve every replay case.**

Parent staged read-only reconstructed-envelope profiles B/C completed successfully, with materially different timings; these are SQL-editor profiles, not the exact HTTP envelope/gateway execution. They do not prove intrinsic equality slowness, a collation cause or a production fix. Preserve complete canonical-body/hash/metadata checks, immutable provenance, fail-closed errors, and full-body concurrent-insert conflict validation. Caller-supplied hash alone is insufficient for reuse.

The earlier f01 observation-read incident is separate: authenticated cycle-table event_day returned 500/strategy_failed in 6,493 ms, with exact-deployment build_manifest logs. Production observation GETs failed with 57014; PostgreSQL context was `macro_batch_eligible`, with a filtered/ordered page plus identical-filter exact-count CTE. LIMIT 1000 did not bound count work. This localizes an observation-read cancellation without proving which component dominated. Current successful cycle GET supersedes that sample as the latest observed outcome, but does not establish universal read-timeout resolution or validate an unmerged remediation.

[PR #172](https://github.com/osborn-studio/osbornalpha/pull/172) is now a formal open PR (not draft), head `da08069808905c7d6e4fc4230cc9cd2edaea6dcc`, for shared read limit/completeness and failure-drain handling. It is unmerged and outside deployed `2d3c5ad5`. Owner reports local merged-head full-suite PASS: 772 files, 8,787 passed, 7 skipped; 124 focused tests, lint/typecheck and production build pass, with full GET fixture identity comparisons. These are local/simulated-backend checks, not hosted-gateway or production acceptance. At the documentation status check, fixture/provider-date checks passed but remote Application CI remained in progress; do not claim all-green remote CI or deployment of #172.

[PR #169](https://github.com/osborn-studio/osbornalpha/pull/169) remains open at `d767208eeba95b868b0a9d4f07a3483c9dc40b35`. Its CI inventory fix registers the new integration suite without relaxing the guard; owner reports 8,770 local passes, 7 noncritical skips, lint/typecheck and targeted frozen-replay checks passing. The newer owner report records all three remote checks PASS at this exact head, including [Application CI 42448882603](https://github.com/osborn-studio/osbornalpha/actions/runs/42448882603), industry ingress and macro fixtures. Remote CI success does not establish merge or deployment. PRs #169 and #172 remain open and unmerged; overall closeout is not complete.

## Historical release and acceptance evidence

Before release170, f01 `f01b73f003bab20707642b48036ca5e36ea626f8`, including merged #162–#168, deployed READY to the current rollback ID. Exact [Application 42446190181](https://github.com/osborn-studio/osbornalpha/actions/runs/42446190181) and [fixtures 42446190197](https://github.com/osborn-studio/osbornalpha/actions/runs/42446190197) passed; owner reported 772 files, 8,765 passed, 7 skipped and nine anonymous checks passing. #166 stage diagnostics and #168 persistence regression coverage were deployed there, neither a timeout fix.

Earlier b0cdc `b0cdc71de4a33f3bbf55f4e511371cfb26edea0c` deployed READY `dpl_8zEftbarP7hQY6xC2hkHqcooiqpn`; its exact [Application 42445329901](https://github.com/osborn-studio/osbornalpha/actions/runs/42445329901) and [fixtures 42445330061](https://github.com/osborn-studio/osbornalpha/actions/runs/42445330061) passed, with reported 8,756 passed/7 skipped. Previous a4faf `a4fafbab0190604f282f3c101a7312fe4b1db415` was READY `dpl_FNzodKrBGDGKatGHpe1hjuPufDdJ`. No new migration was applied by those application release sessions; migration #154 had already been applied/verified by the parent. That historical statement does not describe migration170 as pending. See [wave162 closeout](2026-11-07-launch-closeout/README.md) and [sanitized evidence](2026-11-07-launch-closeout/wave162-release-evidence.json).

**Strict Wind acceptance remains unresolved.** The single b0cdc strict probe failed despite HTTP 200 and fallback quotes: AAPL and 600519.SH selected Eastmoney, datagateway-wind attempted 2/succeeded 0/failed 2. No repeat is reported for f01 or release170. Gateway/config was unchanged versus b0cdc; the symptom existed in wave162, so causal regression attribution is unsupported.

Historical persistence 57014 at 00:43:25.732 UTC through `macro_put_manifest` remains confirmed. The 04:10 DB profile reported definition parity, SECURITY DEFINER/owner postgres/search_path public and no function timeout override; authenticator configured timeout/lock_timeout 8s versus SQL-editor 120s, without effective gateway capture. Successful-call aggregates and temporary blocks did not identify failure cost. The 04:11:29 active sample had no wait event/zero blockers at 7.793s; no PID association ties it to the same-window 17,966 ms cycle500. These observations prove neither CPU saturation nor absence of intermittent waits or spill-caused cancellation.

The parent verified **one original evidence download** at 04:26:03 UTC: raw ArrayBuffer HTTP 200, 6,118 bytes, SHA-256 `24c03d8062d14e2574c81cfd054b3e3f1d661e05714a564907685dfcd1d0f8e8`, matching displayed hash. No signed URL was persisted. This supersedes earlier metadata-only non-verification for that artifact only, not every download. Earlier b0cdc mobile/source-drawer observations and f01 authenticated partial successes retain their historical deployment boundaries; they do not complete current UI acceptance.

## Evidence ledger

These local coordination artifacts are not committed portable evidence. Read observations by deployment and timestamp; stale draft/pending labels are superseded only by the specific evidence above.

| Artifact under `/tmp/osstack/osbornalpha-wave169/` | Use and limit |
| --- | --- |
| `migration170/plan.json`, `readiness.json` | Exact migration/history digest, ACL and invalid-envelope readiness; not valid-write acceptance |
| `release170/REPORT.md`, `production-evidence.json`, `production-verification.json`, `ci-*.json`, `final-state.json` | Exact CI, READY deployment/aliases, nine anonymous passes, f01 rollback; no full acceptance |
| `browser-acceptance170.json` | Current authenticated GET success, new 22,451-input manifest, CN stale guard and interrupted UI acceptance |
| `write-replay/evidence.json`, `write-followup/production-error.json`, `PARENT_UPDATE.md` | Client abort, independent new-RPC 57014 and attribution limits; no resolved write incident |
| `clock-freshness/PARENT_UPDATE.md` | Separate freshness investigation/producer-wiring finding; no deployed fix |
| `manifest-build/REPORT.md`, `PR_STATUS.json` | #172 local verification and owner status; remote checks require current-head verification |
| `lock-tests/CI-FIX-REPORT.md` | #169 inventory fix/local verification and exact-head remote CI PASS; not merge evidence |
| `latest-release/REPORT.md`, `release/REPORT.md`, `browser-acceptance.json`, `db-profile.json` | Historical f01/b0cdc releases, partial acceptance and bounded DB observations |
| `incident-review/REPORT.md`, `production-reassessment.md` | Independent historical incident findings and investigation limits |
| `/tmp/osstack/osbornalpha-wave162/cycle500/supabase-cua-errors.json` | Historical production persistence cancellation |

Earlier MiniMax-M2.5 claim audits under `release-docs/` and the superseded proposal under `release-doc-plan/` returned actual `end_turn` with no blocking findings for their snapshots. Their pending-release wording is superseded by release170 final evidence. Current update MiniMax-M2.5 audit and follow-up returned actual `end_turn`; both accuracy findings were corrected and the final verdict was **NO BLOCKING FINDINGS**. Requests, raw responses, final text and dispositions are retained under `/tmp/osstack/osbornalpha-wave169/closeout170/`; critique does not replace production acceptance.
