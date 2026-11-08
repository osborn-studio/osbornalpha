# Wave169 release closeout — deployed, broader acceptance degraded

Release snapshot: 2026-11-08, incorporating final f01 release evidence, parent authenticated observations at 04:32:22 UTC and subsequent PostgreSQL error detail. **Latest recorded main is deployed; scoped anonymous HTTP checks pass; overall production acceptance remains DEGRADED / NOT GRANTED.** This task records supplied evidence and performs no production/browser/merge actions.

## Final release boundary

`f01b73f003bab20707642b48036ca5e36ea626f8`, including merged #162–#168, is deployed to READY production deployment [`dpl_FLG4pd7YKYu5ixiErabGj1BH9SNj`](https://vercel.com/gilosbornhellos-projects/stock-monitor/FLG4pd7YKYu5ixiErabGj1BH9SNj). Both `osbornalpha.com` and `www.osbornalpha.com` inspect to it; HTTP sampling used www. Release owner reports CLI exit 0, exact runtime SHA and main matching before deploy and after verification.

Exact-SHA [Application CI 42446190181](https://github.com/osborn-studio/osbornalpha/actions/runs/42446190181) and [fixture CI 42446190197](https://github.com/osborn-studio/osbornalpha/actions/runs/42446190197) completed success before deployment, every job/step successful. Reported results: 772 test files, 8,765 tests passed, 7 skipped, including build, production dependency audit, real DB and migration/runtime checks. These are supplied CI results, not reruns by this documentation task.

Nine post-deployment anonymous checks pass for f01: methodology and US/CN judgments report exact runtime SHA; v2 is active/publishable with formula hash `dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`; US/CN cards use v2. Transmission, cycle-table and policy-response each return expected anonymous 401/no-store/error-only responses twice, without Set-Cookie. Registration code_version remains registration provenance. These are bounded public/anonymous checks, not authenticated or performance acceptance.

**Strict Wind acceptance remains unresolved.** The intermediate b0cdc deployment's single probe FAILED: HTTP 200 and successful fallback quotes, but AAPL and 600519.SH both selected Eastmoney; datagateway-wind attempted 2, succeeded 0, failed 2. No retry. Gateway code/config is unchanged versus b0cdc; latest release did not repeat the probe and does not establish current Wind success. The symptom also existed in wave162; no causal regression attribution is supported.

## Intermediate release and migration history

`b0cdc71de4a33f3bbf55f4e511371cfb26edea0c` deployed earlier to READY `dpl_8zEftbarP7hQY6xC2hkHqcooiqpn`, with both aliases and nine anonymous checks passing. Its exact [Application CI 42445329901](https://github.com/osborn-studio/osbornalpha/actions/runs/42445329901) and [fixture CI 42445330061](https://github.com/osborn-studio/osbornalpha/actions/runs/42445330061) passed; reported 772 files, 8,756 tests passed, 7 skipped. This was an intermediate deployment: the user merged #166/#168 during its build. The final f01 release retains b0cdc as rollback, independently inspected READY afterward; no rollback performed.

Previous production was `a4fafbab0190604f282f3c101a7312fe4b1db415`, with its nine-check baseline passed at 04:07 UTC. Its READY deployment `dpl_FNzodKrBGDGKatGHpe1hjuPufDdJ` was retained as rollback for the intermediate b0cdc release. No new migration exists for b0cdc versus a4faf or f01 versus b0cdc; neither release session applied one. Migration #154 was already applied and verified in parent native CUA evidence; migration access is not a reopened blocker. Upcoming parent optimization migration is excluded from this f01 release. Historical details remain in [wave162 closeout](2026-11-07-launch-closeout/README.md) and [sanitized evidence](2026-11-07-launch-closeout/wave162-release-evidence.json).

[PR #166](https://github.com/osborn-studio/osbornalpha/pull/166) (`04d3ea13`, fixed stage diagnostics) and [PR #168](https://github.com/osborn-studio/osbornalpha/pull/168) (`f8641da4`, full-body/concurrent/conflict persistence regression coverage) were initially ready/unmerged and excluded from b0cdc. Both are now merged and deployed in f01. The incident reviewer’s findings identify their limited scopes and no blocking defect, using prior CI rather than rerunning it. Neither is a production timeout fix. Intermediate report wording that they remain unmerged is superseded by parent merge evidence and the final release record.

## Current read timeout and historical write timeout

Current parent evidence in `/tmp/osstack/osbornalpha-wave169/manifest-build/production-errors.json` identifies **build_manifest / observation-read timeout** on f01 deployment `dpl_FLG4pd7YKYu5ixiErabGj1BH9SNj`. Five database errors at 04:32:01–02 UTC report SQLSTATE `57014`, “canceling statement due to statement timeout”; the HTTP record is GET `/rest/v1/macro_observations` 500 at 04:31:57 UTC. PostgreSQL detail at 04:32:02.843 UTC records authenticator context `SQL function "macro_batch_eligible" statement 1`. The captured PostgREST SQL includes a filtered/ordered page with LIMIT/OFFSET plus an identical-filter exact-count CTE (`count(*)` / total_result_set). Thus LIMIT 1000 does not bound the count's matching-history work. This localizes the current cancellation to an observation-read query with eligibility/exact-count context; it does not establish which component dominates elapsed time or prove a remediation. Preserve eligibility/RLS and provenance; no bypass is justified.

This is distinct from the historical **persistence-write RPC timeout** below. Both have confirmed statement-timeout cancellation; their underlying performance causes remain open. Draft [PR #170](https://github.com/osborn-studio/osbornalpha/pull/170), “bypass materialized manifest RPC arguments,” is OPEN/unmerged at the documentation check and outside deployed f01. It is a separate persistence follow-up, not evidence that the current observation read or either incident is fixed. This closeout does not wait for #170 or a future build fix.

Parent Supabase `confirmedLogDetail` in `/tmp/osstack/osbornalpha-wave162/cycle500/supabase-cua-errors.json`, timestamp 2026-11-08 00:43:25.732 UTC, records PostgREST calling `public.macro_put_manifest`, SQLSTATE `57014`, and “canceling statement due to statement timeout.” This confirms a production persistence statement timeout. The underlying slowdown remains **UNKNOWN / OPEN**. Historical successful cycle responses do not close the failures.

The supplied wave169 DB profile at 04:10 UTC reports function-definition parity with the unmodified local RPC, SECURITY DEFINER/owner postgres/search_path public, and no function timeout/work_mem override. Authenticator has configured statement_timeout and lock_timeout of 8s. Dashboard timeout 120s is a different session; the profile does not capture the effective gateway timeout. Its 55 cumulative successful service-role calls have maximum 7,543.34 ms and mean 1,275.32 ms, with 11,583 temporary blocks read/written. These aggregate statistics cannot attribute a phase, payload or cancellation cause to a failed request.

At 04:11:29 UTC one active target sample is 7.793s old, has no wait event and zero blockers; a same-window browser cycle-table GET returns 500/strategy_failed after 17,966 ms. There is no PID association establishing that they are the same RPC, and that 04:11 GET has no newly correlated 57014 detail. The sample weakens sustained locking at that instant; it proves neither CPU saturation nor absence of intermittent waits. Temporary blocks do not establish spill-caused cancellation. The fast local replay used a successful fixture in a different environment, not a captured failing payload.

Any proposed manifest reuse must retain complete canonical-body/hash/metadata checks, immutable provenance, fail-closed errors and existing concurrent-insert conflict validation. Metadata-only hash reuse is unsafe because callers supply the hash. No production timeout, RLS, compute or persistence change is justified by this closeout.

## Parent browser evidence and remaining acceptance

The parent record now reports `latest_runtime_authenticated_partial_failure`, verifiedRuntimeSha=f01b73f and latestDeploymentId=dpl_FLG4pd7YKYu5ixiErabGj1BH9SNj, with acceptanceTimestamp=04:32:22 UTC. Browser availability is restored, browserBlocker=null and loginAcceptanceComplete=false. Its older pending-CI/deployment labels are superseded by final release evidence.

Latest-runtime authenticated GET samples: US transmission 200 in 3,962 ms and 1,087 ms; CN transmission 200 in 2,125 ms; policy-response window=3 200 in 3,731 ms, manifest `8416f105-0522-497f-b192-ca105f0eb685`. These successes use private, no-store. Cycle-table event_day returns **500/strategy_failed in 6,493 ms**, no-store. These are individual observations, not p95 or full acceptance.

Parent identifies fixed failure stage **build_manifest** in exact-deployment logs (`latest-errors.jsonl`, timestamp 1794112316676). The subsequent PostgreSQL detail above establishes current observation-read 57014 with macro_batch_eligible/exact-count context, distinct from historical macro_put_manifest/57014. It does not prove remediation. The earlier 500/17,966 ms GET remains explicitly before the new deployment.

Parent intermediate browser observations after b0cdc include width 375 coverage text wrapping without horizontal clipping; US overheat total 19, CPI 3.72/weight 15/contribution 9; and a BLS-via-FRED source drawer with yoy_from_index@1, two inputs, CSV lines 322/310, column 2. The record explicitly scopes these to the intermediate tab, with final-f01 reload acceptance pending at capture. Later f01 authenticated GET observations above supersede that pending status for those requests only. These observations do not establish a full mobile matrix or complete authenticated acceptance.

**Original-byte verification is now supported for one evidence download.** Parent `rawEvidenceCheck` at 04:26:03 UTC fetched metadata, then the download URL as raw ArrayBuffer: HTTP 200, 6,118 bytes, SHA-256 `24c03d8062d14e2574c81cfd054b3e3f1d661e05714a564907685dfcd1d0f8e8`, matching the displayed hash. rawBytesHashVerified=true; no signed URL persisted. This supersedes the earlier metadata-only non-verification for that checked artifact; it is not a claim about every original download.

Authenticated acceptance remains incomplete. Login/logout/account switching, full production mobile matrix, cross-instance/TTL/controlled cold-start behavior and p95 remain unaccepted. Strict Wind remains unresolved, and parent timeoutResolved=false; latest cycle failure remains open. Latest release's earlier snapshot rawBytesHashVerified=false is superseded by the newer parent raw-byte check; its no-login/no-timeout-resolution limits remain valid. No flags, rights, publication or cron gate was changed by these release/documentation tasks.

## Evidence ledger

Local coordination artifacts below are not committed portable evidence. Intermediate or stale labels must be interpreted using the explicit deployment and observation boundaries above.

| Artifact | Use and limit |
| --- | --- |
| `/tmp/osstack/osbornalpha-wave169/latest-release/REPORT.md` and `production-evidence.json` | Final f01 CI, READY deployment, scoped HTTP pass, carried unresolved Wind status; not authenticated acceptance |
| `/tmp/osstack/osbornalpha-wave169/release/REPORT.md` and `production-evidence.json` | Intermediate b0cdc release, anonymous verification and single failed strict probe |
| `/tmp/osstack/osbornalpha-wave169/manifest-build/production-errors.json` | Current build_manifest observation-read 57014, macro_batch_eligible context and exact-count SQL shape |
| `/tmp/osstack/osbornalpha-wave169/db-profile.json` | Parent DB profile/sample; no failure-phase attribution |
| `/tmp/osstack/osbornalpha-wave169/browser-acceptance.json` | Latest f01 authenticated partial failure, earlier intermediate browser observations and verified raw-byte check; overall acceptance incomplete |
| `/tmp/osstack/osbornalpha-wave169/incident-review/REPORT.md`, `findings.md`, `production-reassessment.md` | Independent incident review and bounded investigation limits |
| `/tmp/osstack/osbornalpha-wave162/cycle500/supabase-cua-errors.json` | Historical confirmed production RPC timeout detail |

MiniMax-M2.5 claim audits, sanitized evidence snapshots and evidence-backed dispositions are retained under `/tmp/osstack/osbornalpha-wave169/release-docs/`. The deployed-status audit returned actual `end_turn` and **NO BLOCKING FINDINGS**. The subsequent parent authenticated-status addendum also returned actual `end_turn` and **NO BLOCKING FINDINGS**, confirming current-cycle failure, historical-timeout separation and single-artifact raw-byte scope. The incremental current-read-timeout/#170 claim check likewise returned actual `end_turn` and **NO BLOCKING FINDINGS**. Critique does not replace production acceptance.
