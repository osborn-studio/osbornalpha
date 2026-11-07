# Macro launch acceptance — 2026-11-07

## Pre-deployment baseline

- Existing authenticated Chrome profile successfully renders `/intel/macro` (US and CN). No credential extraction or account changes.
- US snapshot 2026-11-07, verified 6/8; missing ISM and restricted VIX visibly explained.
- CN snapshot 2026-11-07, verified 8/11; LPR, MLF and financing stock gaps visibly explained.
- `/macro` is 404 before deployment of PR #130.
- Browser console reports `Manifest: Line: 1, column: 1, Syntax error.` for `/manifest.json`.
- Anonymous HTTP request confirms 307 to `/login?next=%2Fmanifest.json`; static file exists. P2 existing defect.

## Manifest fix

- Codex CLI explicitly invoked with `-m gpt-6.1-sol`.
- Local commit `67df3c62f2f67ac5538fc898f357b2bb9a186a73`: exact `/manifest.json` bypass before authentication; no prefix-wide exception.
- 23 focused tests pass; focused eslint and diff checks pass.
- MiniMax-M3.1-Flash final review approves; query handling concern checked against `request.nextUrl.pathname`.
- Publishing blocked: git credential retrieval `-25308`; gh credential helper unavailable; GitHub connector create_tree/create_branch both 403 `Resource not accessible by integration`.

## Post-deployment acceptance

Deployment verified: codeVersion `01308b44347421f061cc03cef36a0f172df41bc6` from public `/api/methodologies`, HTTP 200. v2 publishable true, formula hash `dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`; v1 remains publishable false.

Authenticated native Chrome checks passed for `/macro` US and CN, source drawer, `/macro/CN_CPI_YOY`, `/macro/transmission`, `/macro/history`, `/macro/review`, `/macro/review/US/2026-10`. `/today` resolves to `/macro`; old `/intel/macro` child links resolve to the new paths. Source drawer displays publisher, public-domain rights, fetch URL, SHA-256, CSV line/column and transform/code provenance. CN detail chart renders with cycle bands and table alternative. Review correctly says insufficient data because no snapshot existed at cutoff. No unsupported probability displayed. No explanation-generation action invoked.

Authenticated same-origin GET results (one sample, not p95):

| Endpoint | HTTP | milliseconds |
|---|---:|---:|
| transmission US | 200 | 2213 |
| transmission CN | 200 | 1158 |
| policy-response window=3 | 200 | 2458 |
| cycle-table event_day | 200 | 13106 |
| reviews US | 200 | 1415 |
| reviews CN | 200 | 1111 |
| deviations US | 200 | 1150 |
| methodologies | 200 | 342 |

Limitations: transmission US/CN report `judgment_status: unavailable`; overview F4 says `No judgment yet`. Production agent confirms empty card set and is investigating initial settle error. Judgment-chain acceptance NOT passed. Cold cycle route still misses latency target. Console retains the preexisting manifest syntax error; patch is not published due GitHub write access. Static description still says judgment layer off by default although feature flag now enables its panel. Screenshots are retained in native CUA tool outputs (no local screenshot path exposed).

Read-only console snippet authored by `gpt-6.1-sol`: `read-only-smoke.js`. It does not inspect authentication material and sends only same-origin GET requests.
