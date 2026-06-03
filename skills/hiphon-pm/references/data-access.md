# Data Access — Stock Monitor API (for Hiphon PM skills)

How Hiphon PM skills (`hiphon-pm-pick`, `hiphon-pm-deepdive`) and the `john-cameron`
agent fetch live data. All market data comes from the **existing Stock Monitor API** —
skills never invent numbers.

## Base URL

| Mode | Base URL | When |
|---|---|---|
| **production** (default) | `https://stock-monitor-nu.vercel.app` | normal use |
| **local** | `http://localhost:3000` | dev / when prod unreachable / for testing without site password |

Select via env `STOCK_MONITOR_BASE_URL`; default = production.

## Auth — production is gated by a site password

Production runs a site-password middleware (`src/middleware.ts`). Unauthenticated
requests to `/api/*` get **307 → /unlock**. To use it from the CLI:

1. Set the password in env: `STOCK_MONITOR_SITE_PASSWORD=<your password>`
   (same value as the Vercel `SITE_PASSWORD` env).
2. POST it once to `/api/auth/unlock` to obtain the `sm_auth` HMAC cookie (30-day TTL).
3. Reuse that cookie on every subsequent `/api/*` call.

`/api/auth/*` and `/api/cron/*` are exempt from the gate; everything else needs the cookie.

### Reusable bash helper

```bash
BASE="${STOCK_MONITOR_BASE_URL:-https://stock-monitor-nu.vercel.app}"
JAR="$(mktemp -t sm_cookies)"

sm_unlock() {
  # No password needed for localhost when SITE_PASSWORD is unset there.
  [ -z "$STOCK_MONITOR_SITE_PASSWORD" ] && return 0
  curl -s -c "$JAR" -X POST "$BASE/api/auth/unlock" \
    -H 'content-type: application/json' \
    -d "{\"password\":\"$STOCK_MONITOR_SITE_PASSWORD\"}" >/dev/null
}

sm_get() {  # sm_get /api/quote/AAPL
  curl -s -b "$JAR" -m 25 "$BASE$1"
}

sm_unlock
sm_get /api/quote/00700.HK | jq .
```

> If `sm_get` returns HTML containing "Redirecting" or HTTP 307, the cookie is missing/expired —
> re-run `sm_unlock` (check the password) or switch to `STOCK_MONITOR_BASE_URL=http://localhost:3000`.

### Local dev fallback (no password)

```bash
cd <stock-monitor repo>
npm run dev            # starts on :3000; gate is OFF when SITE_PASSWORD is unset
export STOCK_MONITOR_BASE_URL=http://localhost:3000
```
Local data depth depends on which keys are present in `.env.local`
(`TUSHARE_TOKEN` for A-share financials/flows, `DEEPSEEK_API_KEY`/`ANTHROPIC_API_KEY`
for AI committee). Missing keys → those endpoints return empty/mock; treat as "暂无数据".

## Endpoint catalog

| Need | Endpoint | Coverage | Notes |
|---|---|---|---|
| Resolve name→ticker | `GET /api/search?q=<kw>` | A/HK/US | always call first if ticker uncertain |
| Live quote | `GET /api/quote/{ticker}` | A/HK/US | price, change%, PE/PB where available |
| Batch quote | `GET /api/quote/batch?tickers=a,b,c` | A/HK/US | for candidate pools |
| Signals + backtest | `GET /api/signals/{ticker}` | A/HK/US | triggers[{rule,desc,weight}], bias, hit_rate_5d |
| Per-stock radar | `GET /api/radar/{ticker}` | A/HK/US | quote+flows+signals+markdown, **no LLM, instant** |
| AI 9-persona | `GET /api/perspectives/{ticker}` | A/HK/US | **slow + LLM cost** — call only when needed |
| 5Y financials | `GET /api/financials/{ticker}` | A-share | ROE/margins/cashflow/debt |
| Capital flows | `GET /api/flows/{ticker}` | A-share | 北向 hk_hold, 涨跌停 limit_list |
| Holders / calendar | `GET /api/holders/{ticker}` · `/api/calendar/{ticker}` | A-share | |

### Signal trigger vocabulary (from `src/lib/signals/backtest.ts`)

`large_move`(w3) · `medium_move`(w2) · `anomalous_volume`(w2) · `high_amplitude`(w1) ·
`rsi_overbought`(w2) · `rsi_oversold`(w2) · `momentum_up`(w1). Each event has
`bias: bull|bear|neutral` and the response carries `hit_rate_5d` (historical accuracy).

## Cost & latency discipline

- Prefer `/api/radar` (instant, no LLM) over `/api/perspectives` (slow, costs tokens).
- Fan out independent fetches in parallel; batch quotes via `/api/quote/batch`.
- A-share-only endpoints (financials/flows/holders/calendar) → skip for HK/US, label "暂无数据".
