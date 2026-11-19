# Portfolio quote and K-line chart

The `stock` journey opens the Portfolio cockpit with Tencent selected at `/portfolio?s=00700.HK`. The FocusPanel shows its live quote and renders the `KlineChart` component.

## Sub-features

- Focused quote and company name from the live batch quote.
- K-line range buttons `1D 5D 1M 6M YTD 1Y 5Y All`. The active range has `aria-pressed=true`, and choosing 1Y fetches `/api/kline/00700.HK?range=1y`.
- Provenance strip, hover tooltip, and Reset view. These controls need their own verification.
- Company Research entry `/stock/[ticker]` without Supabase: issuer-unavailable state (guest only).
- Shared research chain (#254, `src/components/research-ui/ResearchChain.tsx`) under the top bar on `/stock/*` (also `/macro`, `/intel/*`; not on `/portfolio` or `/watchlist`): `01 Macro strategy → 02 Industry research → 03 Company research` are links, with 03 `aria-current=page` on `/stock/*`; `04 Foreign research` and `05 Topic research` are `Not served` spans without a link (guest has no service-role Supabase, so the foreign-research and topics public flags read false; topics is also switched off by `launch.sh`).

## How to get to it (user POV)

Open Portfolio and select Tencent from the watchlist in the positions rail, or open the focused URL directly. Tencent is in the default guest watchlist.

## Driving it with CDP browser

Run `node $S/drive.mjs stock` with a fresh en-US guest context. The driver checks the focused route, chart, canvas, successful Tencent quote with a positive price, and visible Tencent name. It clicks 1Y and checks the resulting response for nonempty bars and the button's pressed state. It then opens Company Research at `/stock/600519.SH` and checks the guest fail-closed state: HTTP 200 with `Issuer lookup failed (internal).` / `发行人信息读取失败（internal）。` and no `kline-chart`. The journey records K-line responses in `stock-kline-requests.json` and screenshots in `stock-1-default.png`, `stock-2-1y.png` and `stock-3-company-unavailable.png`. On that page it also checks the research chain (03 current, 04/05 not served).

## Gotchas

- Company Research at `/stock/[ticker]` uses the issuer and coverage tables in a migrated Supabase project. Its design removed the quote row and K-line. Without public-read Supabase config the entry fails closed (#205): 200 with the issuer-unavailable (`internal`) message and a retry button, never a 500 and never an invented issuer, quote or K-line. Guest verification proves only that state; it cannot establish Company Research identity, coverage, or replay behavior. Run those checks separately with a migrated and seeded environment.
- The loaded Company Research page (`src/app/(app)/stock/[ticker]/CompanyPage.tsx`: `CompanyHeader` action row, `ViewTabs` tab row with More + replay, freshness wording and the SIC `仅当前值` / `Current only` badge — #264 unified UI, #280 phone layout below 1024 px / 640 px) renders only after an issuer resolves, so the guest unavailable state never shows it. The repo's `e2e/company-fixture.spec.ts` covers it on synthetic fixtures; this skill does not.
- The Portfolio chart requires a live quote and live K-line data. A provider failure remains a failed check.
- The default range is 1D. Without `DATAGATEWAY_*` intraday config, HK (and US) minute ranges (1D/5D) have a single provider, Eastmoney `push2his` (`src/lib/data/kline/reliability.ts`); A-shares also fall back to Sina. If the `push2his.eastmoney.com` K-line endpoint drops the connection (seen 2026-11-17 from the verification box: TLS `unexpected eof` on `/api/qt/stock/kline/get` while the host root still answers 404), `/api/kline/00700.HK?range=1d` returns 503 `provider_unavailable`, the chart shows `Market-data providers are temporarily unavailable` with Retry, and `chart canvas drawn` fails while the 1Y (Eastmoney → Tencent) check still passes. Confirm with `curl -s -m 15 -o /dev/null -w '%{http_code}\n' 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=116.00700&klt=1&lmt=3'` (`000` = dropped) and report it as an upstream reachability failure; do not switch the journey off 1D to make it pass.
- Why `chart canvas drawn` is intermittent (investigated 2026-11-20 on main `db737985`): from the verification box, **new** TLS connections to `push2his.eastmoney.com` (resolves to the box's proxy fake-IP `198.18.0.1`) mostly fail — curl 1/40 OK (33 `SSL_read unexpected eof`, 6 timeouts), Node `fetch` in fresh processes 0/15 (11 `UND_ERR_SOCKET`, 4 timeouts) — but once one connection succeeds, keep-alive reuse answers 20/20 in ~200 ms. Cold `next dev` + empty `.next/cache/fetch-cache` → `stock` journey failed 7/8 (1D → 503, 1Y → 200 every time). It is not a timing race: the 503 lands in ~6 s (2 Eastmoney attempts × 2.8 s, `reliability.ts` 9 s budget) and the driver already waits 30 s for the canvas.
- The pass rate also depends on the checkout's `.next/cache/fetch-cache`: `unstable_cache` serves a previously stored 1D series stale-while-revalidate (`cacheStatus: shared-swr`), so a reused checkout can draw the chart from an older run's bars while push2his is unreachable, and a fresh worktree cannot. Treat a PASS there as "chart renders", not as proof the upstream is up.
- When the canvas is missing the driver waits (≤15 s more) for the 1D response and, if it is `503 provider_unavailable`, prints `FAIL[upstream-unavailable]`, stores `upstreamUnavailable: true` on the check in `results-<mode>.json`, and the summary line names how many failures are upstream-unavailable. They still count as failures and still set exit 1. Any other missing-canvas cause prints a plain FAIL with the 1D response.
- The unprefixed protected URL uses the context's Accept-Language. The middleware strips the `/en` prefix on protected paths.
