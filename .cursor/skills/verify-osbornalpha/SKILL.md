---
name: verify-osbornalpha
description: Drive the real osbornalpha (stock-monitor) Next.js app locally and prove behavior with evidence — web UI over headless Chrome/CDP (landing + i18n, guest watchlist search/add, stock detail K-line) and its HTTP APIs (/api/quote, /api/search, auth gate). Use when you changed osbornalpha and need to show a user-facing feature works, when reviewing a PR head, or when something "looks off" in the running app.
---

# verify-osbornalpha

osbornalpha (package name `stock-monitor`) is a Next.js 15 app: an AI watchlist/market workstation for A-share / HK / US stocks.
Primary surface: the **web UI**. Secondary: public **HTTP APIs** (`/api/quote/*`, `/api/search`, `/api/kline/*`).
Not covered here: the Hermes / John Cameron CLI skills under `skills/` and `hermes/`, the ops/S4 runner scripts, and every page that needs a real Supabase session (see "Limits").

All helpers live in `.cursor/skills/verify-osbornalpha/scripts/` and are run from the repo root:

```bash
S=.cursor/skills/verify-osbornalpha/scripts
$S/verify.sh all                  # launch → doctor → drive every guest journey → cleanup
OSB_MODE=gate $S/verify.sh all    # same, with the auth gate switched on
```

## Launch

```bash
$S/launch.sh                 # guest mode (default)
OSB_MODE=gate $S/launch.sh   # auth-gate mode
```

What it does (see `scripts/launch.sh`):

1. Picks Node 22 (`package.json` engines `>=22.19 <23`): `$OSB_NODE22_BIN`, else `~/.local/node22/bin`, else PATH. Runs `npm ci` only if `node_modules/next` is missing.
2. Refuses to start if `$OSB_PORT` (default **3107**) or `$OSB_CDP_PORT` (default **9333**) is busy, or if its own run dir already has a live instance.
3. Starts `npx next dev -p $OSB_PORT` with the Supabase env vars **removed**:
   - **guest** mode: no Supabase, so the middleware auth gate and `(app)/layout.tsx` guard are off (by design for local dev), `/api/search` serves `developer-fallback` results from `MOCK_UNIVERSE`, and the watchlist lives in browser `localStorage`. Market data (`/api/quote`, `/api/kline`) is **live** from Eastmoney/Sina/Tencent, so outbound internet is needed.
   - **gate** mode: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399` (nothing listens there) plus a dummy anon key. Neither value is a secret. Every request is therefore "signed out", which turns the real middleware gate on without a real Supabase project.
4. Starts headless Chrome with a throwaway profile in `$OSB_RUN_DIR/chrome-profile`, CDP on `127.0.0.1:$OSB_CDP_PORT`. Do not use Chrome's one-shot `--screenshot` mode, which hangs on this kind of box. Take every screenshot over CDP.
5. Creates the evidence dir `$OSB_EVIDENCE_ROOT/verify-<YYYYmmdd-HHMMSS>/` (default root `~/osbornalpha-verify-evidence`) and records it in `$OSB_RUN_DIR/evidence_dir`.

**Ready** = `GET /` returns HTML that contains `osbornalpha` (the first compile takes 5–60 s) **and** CDP answers `/json/version`. Launch prints `launch: READY mode=… app=… cdp=…`. A bare 200 from the port is not enough.

No database, migrations, or seed data are needed in either mode. The guest watchlist starts from the built-in 39-ticker default list.

Teardown: `$S/cleanup.sh` (see Cleanup).

Isolation: two instances need different `OSB_PORT`/`OSB_CDP_PORT` **and a different checkout/worktree**, because `next dev` writes `<repo>/.next` and two dev servers in one checkout corrupt each other. Port 3000 is deliberately avoided (a human's `npm run dev` / Playwright `webServer` uses it). Never drive someone else's server on 3000.

## Doctor

```bash
$S/doctor.sh    # read-only; exit 0 = HEALTHY
```

Checks: Node major is 22; `node_modules` present; the `next` and `chrome` pids from our run dir are alive; **the port is owned by our next process tree** (not a stranger's server); `/` renders the brand; mode-specific sanity (guest: `/api/search` source is `developer-fallback`; gate: `/today` returns 307); CDP answers; upstream market data reachable (`/api/quote/600519.SH` 200 — only a warning, but the stock/watchlist-price/quote checks will fail without it). Run it first whenever anything looks off.

## Drive

```bash
node $S/drive.mjs all                      # every journey valid for the current mode
node $S/drive.mjs watchlist stock          # a subset
```

Journeys (guest: all five; gate: landing, quote-api, auth-gate). Each is a feature file in `features/`:

| journey | feature file | harness |
|---|---|---|
| `landing` | `features/landing-i18n.md` | CDP browser |
| `watchlist` | `features/watchlist.md` | CDP browser (guest only) |
| `stock` | `features/stock-detail.md` | CDP browser |
| `quote-api` | `features/market-data-api.md` | HTTP |
| `auth-gate` | `features/auth-gate.md` | HTTP + CDP browser |

Harness facts:
- `drive.mjs` loads `@playwright/test` from the repo's `node_modules` and calls `chromium.connectOverCDP('http://127.0.0.1:$OSB_CDP_PORT')`. Each journey opens a **fresh browser context**, which is a brand-new guest with empty `localStorage`.
- Selectors are the app's own user-facing handles: button names (`📋 看板`, `📊 表格`, `＋ 加入股票`), the search placeholder `/代码 \/ 名称/`, result buttons named `<name> … <ticker>`, `a[href="/stock/<ticker>"]` cards, the post-add panel `aria-label="已开始监控 <ticker>"`, `data-testid="kline-chart"`, and K-line range buttons `1D … 1Y`. Strings come from `messages/zh/*.json` / `messages/en/*.json`. When copy changes, update the selector from there.
- For a one-off probe, write a throwaway `.mjs` **inside the repo root** (so `@playwright/test` resolves), connect over CDP the same way, and delete it afterwards.
- Plain HTTP: `curl -s http://127.0.0.1:3107/api/quote/600519.SH`.

## Evidence

Everything goes into the evidence dir printed by launch:
- `results-<mode>.json`: every journey, every check `{name, pass, detail}`. This is the verdict.
- `*.png`: CDP screenshots before and after each user action (e.g. `watchlist-1-initial` → `-2-search` → `-3-added` → `-3b-table` → `-4-duplicate`).
- Response bodies and side effects: `api-*.json`, `stock-kline-requests.json` (network requests the UI actually made), `watchlist-localStorage-after-add.json` (the persisted watchlist), `watchlist-post-add-insight.txt`.
- `logs/next.log`, `logs/chrome.log`, copied in by cleanup.

Proof standards:
- Drive the real user path: click the buttons, type in the search box. Do not set `localStorage` or call internal setters to fake state. The one exception is opening a fresh context to be a fresh guest.
- Capture the action **and** the resulting state, and verify the side effect too: the watchlist journey checks the DOM card, `localStorage` `stock-monitor:watchlist:v2`, persistence after reload, and the quote network round trip.
- No mocks. Unlike `e2e/security-search.spec.ts` / `e2e/kline-chart.spec.ts` (which stub `/api/search`, `/api/quote`, `/api/kline`), these journeys hit the live routes. In guest mode `/api/search` uses the app's own built-in developer fallback; it is not a test stub, but it is **not** the production security master. Say so when you report.
- Gate mode is a stand-in for "real Supabase, signed out". It proves the redirect logic, not login itself.
- Never weaken a check to make it pass. A failing check is reported as failing with its reason (and a `Gotchas` entry if it is environmental).
- Never write passwords, tokens, or keys into evidence, logs, or reports, and do not run helpers under `set -x`.

## Cleanup

```bash
$S/cleanup.sh
```

Kills only what launch started: it reads `next.pid` / `chrome.pid`, and since launch used `setsid` those are process-group ids, so the whole `npx → next → next-server` / Chrome tree goes. It never kills by process name. It first copies `*.log` into `<evidence>/logs/`, then deletes `$OSB_RUN_DIR` (pids, Chrome profile). It **never touches `$OSB_EVIDENCE_ROOT`**, and it ends by printing `cleanup: evidence kept at …`. Run it after every failed iteration too. `verify.sh` runs it via `trap` automatically.

## Helpers

| script | invocation | purpose |
|---|---|---|
| `scripts/env.sh` | sourced by the others | ports, run dir, evidence root, Node 22 / Chrome discovery |
| `scripts/launch.sh` | `[OSB_MODE=gate] $S/launch.sh` | start next dev + headless Chrome, wait for READY, create evidence dir |
| `scripts/doctor.sh` | `$S/doctor.sh` | read-only health check |
| `scripts/drive.mjs` | `node $S/drive.mjs <journey…\|all>` | run journeys, write evidence + `results-<mode>.json`; exit 1 on any failed check |
| `scripts/cleanup.sh` | `$S/cleanup.sh` | stop our processes, keep evidence |
| `scripts/verify.sh` | `[OSB_MODE=gate] $S/verify.sh [journey…\|all]` | all of the above in one go |

Env overrides: `OSB_PORT`, `OSB_CDP_PORT`, `OSB_RUN_DIR`, `OSB_EVIDENCE_ROOT`, `OSB_EVIDENCE_DIR` (drive only), `OSB_NODE22_BIN`, `OSB_CHROME`, `OSB_MODE`.

## Limits (what this skill cannot prove locally)

- Real sign-in/registration, the signed-in product pages (`/today`, `/portfolio`, `/research/*` with data, `/admin` incl. `/admin/dq`), Supabase-backed watchlist sync, the production security-master search, Stripe, and LLM/copilot features all need real Supabase/LLM/Stripe credentials. The `e2e/authed.spec.ts` and `e2e/research-setup.spec.ts` suites cover some of this when `E2E_EMAIL`/`E2E_PASSWORD` are provided. Never put those values in files.
- Disclosure facts / issuer public reads (`/api/facts/[ticker]`, `/api/facts/[ticker]/metrics`, `/api/filings/[ticker]`, `/api/entities/resolve`) need a migrated Supabase with issuers + financial facts seeded (see `docs/runbooks/data-foundation.md`). Guest/gate launch strips or fakes Supabase, so `getAnonSupabase()` fails closed — do not invent a local drive. #104 enabled the CN sync path (Tushare fixtures, cron) but did not make these reads driveable locally. Deprecated `/api/financials/[ticker]` needs `TUSHARE_TOKEN` and points successors at `/api/facts/{ticker}`. Ops cron `POST /api/cron/facts-sync` (US+CN) needs the cron secret and is not a user journey.
- DataGateway/Wind quotes need `DATAGATEWAY_*`. Without them the quote chain falls back to Eastmoney/Sina/Tencent, which is what these journeys exercise.
- Market data is live, so prices differ run to run. Checks assert shape and presence, not values.

Keep the feature map honest as the app changes: run `/maintain-verification-skill`.
