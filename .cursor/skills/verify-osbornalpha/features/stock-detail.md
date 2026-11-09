# Portfolio quote and K-line chart

The `stock` journey opens the Portfolio cockpit with Tencent selected at `/portfolio?s=00700.HK`. The FocusPanel shows its live quote and renders the `KlineChart` component.

## Sub-features

- Focused quote and company name from the live batch quote.
- K-line range buttons `1D 5D 1M 6M YTD 1Y 5Y All`. The active range has `aria-pressed=true`, and choosing 1Y fetches `/api/kline/00700.HK?range=1y`.
- Provenance strip, hover tooltip, and Reset view. These controls need their own verification.

## How to get to it (user POV)

Open Portfolio and select Tencent from the watchlist in the positions rail, or open the focused URL directly. Tencent is in the default guest watchlist.

## Driving it with CDP browser

Run `node $S/drive.mjs stock` with a fresh en-US guest context. The driver checks the focused route, chart, canvas, successful Tencent quote with a positive price, and visible Tencent name. It clicks 1Y and checks the resulting response for nonempty bars and the button's pressed state. The journey records K-line responses in `stock-kline-requests.json` and screenshots in `stock-1-default.png` and `stock-2-1y.png`.

## Gotchas

- Company Research at `/stock/[ticker]` uses the issuer and coverage tables in a migrated Supabase project. Its design removed the quote row and K-line. Guest verification cannot establish Company Research identity, coverage, or replay behavior. Run those checks separately with a migrated and seeded environment.
- The Portfolio chart requires a live quote and live K-line data. A provider failure remains a failed check.
- The unprefixed protected URL uses the context's Accept-Language. The middleware strips the `/en` prefix on protected paths.
