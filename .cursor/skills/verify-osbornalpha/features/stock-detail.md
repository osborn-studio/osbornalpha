# Stock detail + K-line chart

`/stock/[ticker]` (src/app/(app)/stock/[ticker]/page.tsx) shows the quote header, a TradingView lightweight-charts K-line (`KlineChart`, `data-testid="kline-chart"`) fed by `/api/kline/<ticker>?range=…`, and tabs.

## Sub-features
- Quote header with live price. When quotes fail it shows `Live quote unavailable` / `—`.
- K-line range buttons `1D 5D 1M 6M YTD 1Y 5Y All` (`aria-pressed` marks the active one). Each one refetches `/api/kline/<ticker>?range=<r>`.
- Provenance strip (source / currency / volume unit / cache status), a hover tooltip (`data-testid="kline-tooltip"`), and `Reset view`.
- Not yet driven: tooltip hover values, the retry-after-provider-failure path (covered with stubs by `e2e/kline-chart.spec.ts`), and the AI / financials / news tabs.

## How to get to it (user POV)
Click any card or row on the watchlist (`a[href="/stock/<ticker>"]`), or open `/stock/00700.HK` directly. `/en/stock/…` gives the English UI.

## Driving it with CDP browser
`node $S/drive.mjs stock`. It uses an en-US context: `goto('/en/stock/00700.HK')`, records every `/api/kline/00700.HK` response (range, status, bar count) into `stock-kline-requests.json`, and asserts that the chart and its `canvas` are visible, there is no `Live quote unavailable`, and the page names Tencent/腾讯. Then it clicks `1Y` and expects a `range=1y` request with 200 and >0 bars, plus `aria-pressed=true` on 1Y. Screenshots `stock-1-default.png`, `stock-2-1y.png`.

## Gotchas
- Live data: bar counts and prices change. Assert presence and shape only.
- JP/KR ranges are only enabled when `NEXT_PUBLIC_DATAGATEWAY_ENABLED=true`; the disabled buttons carry the reason in their `aria-label`. HK/A/US tickers are fine without DataGateway.
- With no outbound internet the chart shows a retry state and these checks fail. Doctor warns about this up front.
