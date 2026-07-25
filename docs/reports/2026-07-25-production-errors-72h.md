# OsbornAlpha Production Error Audit — 72 Hours

Date: 2026-07-25  
Window: approximately 2026-07-22 14:15 to 2026-07-25 14:15 (Asia/Shanghai)  
Scope: production telemetry, service checks, security sync runs, auth-email probes, current API probes, and available Vercel runtime logs.

## Executive Summary

The screenshot error for `688472.SH` was a false negative in the stock-detail UI. The security master and live quote API both recognize the instrument as `阿特斯`, but the detail page decided whether a stock existed using only the limited mock universe. It never called the existing live quote hook.

Three actionable product defects were found:

1. Stock detail pages rejected valid securities absent from mock data.
2. Copilot returned HTTP 400 when a user entered an exact company name instead of a ticker.
3. Batch quote telemetry treated a laptop sleep/wake interval as an 88-minute quote outage and lacked a client retry for transient network/5xx failures.

No production 5xx response was found in the available Vercel runtime logs. Security synchronization and auth-email delivery checks were healthy throughout the window.

## Evidence Coverage

| Source | Records reviewed | Result |
|---|---:|---|
| `user_events` | 743 | 20 event categories classified |
| `ai_runs` | 8 | 8 completed, 0 failed or stuck |
| `service_alert_runs` | 45 | 42 healthy, 3 alerting |
| `security_sync_runs` | 18 | 18 successful |
| `auth_email_probe_runs` | 6 | signup and recovery all delivered |
| GitHub quote-alert workflow | 41 runs | workflow execution all successful |
| Vercel runtime logs | 14 retained/returned | 0 5xx, 0 error-level entries |

The database-backed event and check sources provide the primary 72-hour coverage. Vercel's returned runtime log set was small, so it is supporting evidence rather than a complete request log.

## Findings

### P1 — Valid stock detail falsely reported as missing

- Reproduction: `/stock/688472.SH`
- UI output: `未找到标的 688472.SH` and `本 demo 仅含有限的 mock 数据`
- Production search: exact verified result `688472.SH / 阿特斯`
- Production quote: HTTP 200 with a live Eastmoney/Tushare quote
- Root cause: `src/app/(app)/stock/[ticker]/page.tsx` called only `getStockOrStub(ticker)` and returned the missing state before requesting live data.
- Fix: use `useQuote`, merge live quote fields into optional mock detail, show a loading state, and distinguish a true unknown ticker from temporary quote unavailability.

### P1 — Copilot rejected exact company names

Three `ai_analysis_failed` client events were HTTP 400 before an AI run was created:

| Input | Count | Resolvable ticker |
|---|---:|---|
| 凯赛生物 | 2 | `688065.SH` |
| 阿特斯 | 1 | `688472.SH` |

- Root cause: `/api/copilot` accepted canonical tickers only, while the UI input allowed arbitrary text.
- Fix: preserve the fast path for canonical tickers and resolve only exact, unique, selectable security-master matches for company-name inputs. Ambiguous or inactive results still fail closed.

### P2 — Transient quote failures and one sleep/wake false alert

The window contained four full batch failures and one degraded batch:

- Two 13/13 failures affecting portfolio/watchlist batches.
- One 10/13 degraded watchlist batch.
- One 1/1 failure for `688820.SH` lasting 22.7 seconds.
- One 1/1 failure for `688820.SH` reporting 5,330,247 ms (about 88.8 minutes).

All affected tickers returned HTTP 200 in a fresh production probe. The 88.8-minute duration exceeds the client's 25-second timeout by orders of magnitude and is consistent with a request suspended while the laptop or browser tab slept.

- Root cause: batch requests had no client retry; rejected chunk reasons were discarded; elapsed wall time after sleep was reported as service latency.
- Fix: retry network, timeout, HTTP 408/429, and 5xx failures once; emit stable error codes; classify full failures over 60 seconds as `quote_batch_suspended`, which is excluded from quote-service outage alerts.

### Expected user-facing outcomes

Twelve login failures were not application crashes:

- invalid credentials: 8
- generic auth rejection: 2
- email not confirmed: 2

These remain user-facing authentication outcomes. They should be monitored for UX friction, but they do not indicate server instability.

### Healthy systems

- Security master synchronization: 18/18 successful.
- Auth email probes: `qq.com` and `126.com`, signup and recovery, delivered on July 23, 24, and 25.
- Auth daily checks: 3/3 healthy.
- AI storage ledger: 8/8 runs completed.
- Current production quote probes for all historically affected tickers: HTTP 200.

### Performance signal, not a correctness failure

One successful `stock-bottleneck-picker` AI run took 114,029 ms and caused the daily AI p95 alert to exceed the 90-second threshold. The run completed successfully. This should be handled as a separate method-performance optimization rather than by weakening the alert threshold.

## Verification Results

- Red/green targeted tests: 14 passed.
- Full Vitest suite: 100 files, 731 tests passed.
- TypeScript: `tsc --noEmit` passed.
- Next.js production build: passed.
- Desktop browser: `688472.SH` rendered `阿特斯` with live quote and K-line data; zero console errors or warnings.
- Mobile browser at 390 x 844: live detail rendered without overlap; zero console errors or warnings.
- Negative browser case: `INVALID` retained a real not-found state without the obsolete mock-data explanation.
- Production smoke verification remains required after deployment.

## Tooling Debt

`npm run lint` invokes deprecated `next lint` and opens Next.js's interactive first-time ESLint configuration prompt because the repository has no committed ESLint configuration. This is a pre-existing CI/tooling gap; it should be migrated to a committed ESLint CLI configuration in a separate change.
