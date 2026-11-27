---
name: verify-osbornalpha
description: Drive the real osbornalpha (stock-monitor) Next.js app locally and prove behavior with evidence — web UI over headless Chrome/CDP (landing + i18n, guest watchlist search/add, Portfolio K-line, guest Macro Workbench allocation template + research footer + strategy-off tab row, shared research chain, /intel research hub cards + Topics switched-off state incl. topic summary admin POSTs, signed-out refusals of admin-only /admin/sources and the Gildata industry vendor API/cron) and its HTTP APIs (/api/quote, /api/search, auth gate). Use when you changed osbornalpha and need to show a user-facing feature works, when reviewing a PR head, or when something "looks off" in the running app.
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
3. Starts `npx next dev -p $OSB_PORT` with explicit Supabase environment values that take precedence over checkout dotenv files:
   - **guest** mode: empty URL and keys disable Supabase. This turns off the middleware auth gate and `(app)/layout.tsx` guard (by design for local dev). `/api/search` serves `developer-fallback` results from `MOCK_UNIVERSE`, and the watchlist lives in browser `localStorage`. Market data (`/api/quote`, `/api/kline`) is **live** from Eastmoney/Sina/Tencent, so outbound internet is needed.
   - **gate** mode: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399` (nothing listens there) plus a dummy anon key. The service-role key is empty in both modes. Every request is therefore "signed out", which turns the real middleware gate on without a real Supabase project.
   - both modes also pin `MACRO_JUDGMENTS_ENABLED=` (empty), so `/macro` always shows the static allocation template card rather than the DB-backed judgment slot, `MACRO_STRATEGY_ENABLED=` (empty), so the `/macro` tab row has only its four view tabs and `/macro/{transmission,history,review}` render the 404 page (#300), and `TOPICS_ENABLED=` / `TOPICS_E2E_FIXTURES=` (empty), so topics stay switched off (no synthetic fixture mode, which guest mode would otherwise satisfy): `/intel/topics` renders the 404 page and chain step 05 / hub card 05 are "not served". `FEISHU_SIMULATION_INGEST_ENABLED=` (empty) keeps the Feishu simulation import (#317) off, so `POST /api/integrations/feishu/simulation` answers 404 `{"error":"not_found"}` and the middleware never skips the gate for it. `INDUSTRY_CN_VENDOR_ENABLED=` / `GILDATA_API_KEY=` (empty) keep the admin-only Gildata industry ingestion (#324) off and away from the vendor, and `CRON_SECRET=` (empty) makes every cron route unreachable from this instance, so `GET /api/cron/industry-vendor-sync` answers 503 `cron_unavailable`.
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

Checks: Node major is 22; `node_modules` present; the `next` and `chrome` pids from our run dir are alive; **the port is owned by our next process tree** (not a stranger's server); `/` renders the brand; mode-specific sanity (guest: `/api/search` source is `developer-fallback`; gate: `/macro` redirects to login with `next=/macro`); CDP answers; upstream market data reachable (`/api/quote/600519.SH` 200 — only a warning, but the stock/watchlist-price/quote checks will fail without it). Run it first whenever anything looks off.

## Drive

```bash
node $S/drive.mjs all                      # every journey valid for the current mode
node $S/drive.mjs watchlist stock          # a subset
```

Journeys (guest: all seven; gate: landing, quote-api, auth-gate). Each is a feature file in `features/`:

| journey | feature file | harness |
|---|---|---|
| `landing` | `features/landing-i18n.md` | CDP browser |
| `watchlist` | `features/watchlist.md` | CDP browser (guest only) |
| `stock` | `features/stock-detail.md` | CDP browser |
| `quote-api` | `features/market-data-api.md` | HTTP |
| `auth-gate` | `features/auth-gate.md` | HTTP + CDP browser |
| `macro` | `features/macro-workbench.md` | CDP browser (guest only) |
| `intel-hub` | `features/research-hub-topics.md` | CDP browser + HTTP (guest only) |

Harness facts:
- `drive.mjs` loads `@playwright/test` from the repo's `node_modules` and calls `chromium.connectOverCDP('http://127.0.0.1:$OSB_CDP_PORT')`. Each journey opens a **fresh browser context**, which is a brand-new guest with empty `localStorage`.
- Selectors are the app's own user-facing handles: button names (`📋 看板`, `📊 表格`, `＋ 加入股票`), the search placeholder `/代码 \/ 名称/`, result buttons named `<name> … <ticker>`, `a[href="/stock/<ticker>"]` cards, the post-add panel `aria-label="已开始监控 <ticker>"`, `data-testid="kline-chart"`, and K-line range buttons `1D … 1Y`. Strings come from `messages/zh/*.json` / `messages/en/*.json`. When copy changes, update the selector from there.
- For a one-off probe, write a throwaway `.mjs` **inside the repo root** (so `@playwright/test` resolves), connect over CDP the same way, and delete it afterwards.
- Plain HTTP: `curl -s http://127.0.0.1:3107/api/quote/600519.SH`.

## Evidence

Everything goes into the evidence dir printed by launch:
- `results-<mode>.json`: every journey and check `{name, pass, detail}`, with the verifier checkout HEAD and the product checkout HEAD recorded at launch. The product SHA is null if the driver runs without launch metadata. These SHAs identify commits, so run from a clean checkout for commit-specific verification. This file is the verdict.
- `*.png`: CDP screenshots before and after each user action (e.g. `watchlist-1-initial` → `-2-search` → `-3-added` → `-3b-table` → `-4-duplicate`).
- Response bodies and side effects: `api-*.json` (incl. `api-topics-guest.json`, `api-admin-topics-guest.json`, `api-admin-topics-summary-guest.json`), `intel-hub-cards-<lang>.json` (the five hub cards as rendered), `stock-kline-requests.json` (network requests the UI actually made), `watchlist-localStorage-after-add.json` (the persisted watchlist), `watchlist-post-add-insight.txt`.
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

- Real sign-in/registration, Company Research data at `/stock/[ticker]` (guest only proves its fail-closed issuer-unavailable state), signed-in product data (`/macro` data: investment clock, judgment slot, indicators, Fed liquidity / CN policy-rate series; portfolio positions, `/research/*` with data, `/admin` incl. `/admin/dq`; Industry/Company research data under `/intel/*`; foreign broker research `/intel/foreign-research` + `/admin/broker-research`, closed by default — #252/#260; Topic research with data — directory, dossier, admin editor/publish, summary generate/approve/discard (#287), Copilot `topic_dossier` tool (#290), chain step 05 / hub card 05 as links — needs `TOPICS_ENABLED=1` + topic tables + session/admin (+ LLM for summaries/Copilot), #270–#290; judgment card labels and Company Research replay controls (#286, leftovers #298) need judgment/issuer data; macro strategy screens with `MACRO_STRATEGY_ENABLED=1` (#299/#302); topic version licence masking (#297); Company Research merged-issuer lineage (#303/#304); broker-research R15 fixes (#305–#307); US industry aggregation `dual_currency` exclusion, `industry-agg-us/1.1` (#310)), Supabase-backed watchlist sync, the production security-master search, Stripe, and LLM/copilot features all need real Supabase/LLM/Stripe credentials. The `e2e/authed.spec.ts` and `e2e/research-setup.spec.ts` suites cover some of this when `E2E_EMAIL`/`E2E_PASSWORD` are provided. Never put those values in files.
- Disclosure facts / issuer public reads (`/api/facts/[ticker]`, `/api/facts/[ticker]/metrics`, `/api/filings/[ticker]`, `/api/entities/resolve`) need a migrated Supabase with issuers + financial facts seeded (see `docs/runbooks/data-foundation.md`). Guest/gate launch strips or fakes Supabase, so `getAnonSupabase()` fails closed — do not invent a local drive. #104 enabled the CN sync path (Tushare fixtures, cron) but did not make these reads driveable locally. Deprecated `/api/financials/[ticker]` needs `TUSHARE_TOKEN` and points successors at `/api/facts/{ticker}`. Ops cron `POST /api/cron/facts-sync` (US+CN) needs the cron secret and is not a user journey.
- Analyst workspace and the Feishu simulation import (#316–#320): `/analyst` pages, recommendation/receipt times in Beijing time, paginated score refresh with skip reasons, the switched-on `POST /api/integrations/feishu/simulation` and its migration all need a signed-in user over a migrated Supabase (plus the ingest token / owner / analyst env for the import); only the switched-off 404 is driven (`auth-gate`). The local `demos/analyst-replay` Feishu connector / demo is not a product surface.
- Admin-only data-source and Chinese-industry vendor surfaces (#322–#332): the `/admin/sources` page content (source catalogue, routing checks, freshness, licences — #325/#331), the Gildata vendor read `GET /api/admin/industries/vendor` with data and its admin-only page read layer (#332), the SW2021 Chinese industry pages with vendor data and the public vendor replay (#333/#335; guest only shows the licence-pending notice, driven in `auth-gate`), and a switched-on vendor sync (`INDUSTRY_CN_VENDOR_ENABLED=1` + `GILDATA_API_KEY` + `CRON_SECRET`, migration locked in #328; the `job_disabled` 403 branch needs a cron secret, which launch pins empty) all need an admin session over a migrated Supabase. Only the signed-out refusals are driven (`auth-gate`): `/admin/sources` → `/login?next=/admin/sources`, vendor API 403 `unlicensed`, vendor cron 503 `cron_unavailable`.
- Analyst report board with data and the switched-on Feishu overview (#338/#339/#341): need a signed-in owner of the bound Feishu group, the `FEISHU_SIMULATION_*` env and a migrated Supabase; only the signed-out / switched-off states are driven (`auth-gate`). CSI 300 / STAR 50 facts-scope universes (#336/#337/#340) are cron/admin-only.
- DataGateway/Wind quotes need `DATAGATEWAY_*`. Without them the quote chain falls back to Eastmoney/Sina/Tencent, which is what these journeys exercise.
- Market data is live, so prices differ run to run. Checks assert shape and presence, not values.

Keep the feature map honest as the app changes: run `/maintain-verification-skill`.
