# Public market-data & search API

Unauthenticated REST quote snapshots documented in `docs/REALTIME_MARKET_DATA_API.md`: `GET /api/quote/<ticker>`, `GET /api/quote/batch?tickers=a,b,c` (≤40), plus the security search `GET /api/search?q=&limit=` used by the watchlist.

## Sub-features
- Single quote: `{source, ticker, name, market, currency, price, change_pct, …, updated_at}`. Source chain is DataGateway/Wind (if configured) → Eastmoney → Sina/Tencent.
- Batch: `{quotes: {<ticker>: quote|null}, …}`, capped at 40 tickers.
- Unknown ticker → 404 `{"error":"No data source returned a quote", …}`.
- Search: an empty `q` gives `{source:"empty"}`; `limit` outside 1–30 gives 400 `invalid_limit`; `q` over 80 chars gives 400 `invalid_query`. Without Supabase it returns `developer-fallback` in dev, or 503 `security_master_unavailable` in production. With an unreachable Supabase it returns 503.

## How to get to it (user POV)
An external integrator curls the endpoints (see the README "实时行情 API" section). The web UI consumes the same routes.

## Driving it with HTTP
`node $S/drive.mjs quote-api`. It calls `/api/quote/600519.SH` (200, price>0, name/currency/updated_at), `/api/quote/batch?tickers=600519.SH,00700.HK,AAPL` (all three priced), `/api/quote/NOTAREAL999.SH` (4xx), `/api/search?q=腾讯` (guest: 00700.HK in results; gate: 503 `security_master_unavailable`), and `/api/search?q=AAPL&limit=99` (400). The bodies are saved as `api-*.json`. For a manual probe use `curl -s http://127.0.0.1:3107/api/quote/batch?tickers=600519.SH,AAPL`.

## Gotchas
- `tushare_configured:false` and DataGateway absent are normal locally. Results then come from public sources and are marked delayed.
- Batch silently truncates to 40 tickers instead of returning an error, so callers sending more lose tickers without being told.
- Responses are cached 30–60 s, so two calls in a row can return identical `updated_at`.
