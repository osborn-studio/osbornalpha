# Investment clock production acceptance — 2026-11-07

Target: `e0b82b25d3f63cc45ac808aadc0de63541504e32`.

## Method

Existing signed-in Chrome session, native CUA. No cookie/token/storage extraction; no explanation generation or financial actions. API script authored with Codex CLI `gpt-6.1-sol` (`corrected.js`), reviewed before execution.

Three sequential rounds use same-origin GET with browser cache `no-store`, preserving server-side cache behavior. Round 1 means **first observed**, not guaranteed cold. `X-Macro-Strategy-Memo` describes the per-process memo result, not proof of cross-instance durable-cache hits. Three samples are insufficient for p95 claims. Page entry/refresh/leave-return observations are recorded separately from API samples.

Account-switch isolation and production TTL/version mutation experiments are not performed; they would require additional accounts or changing production inputs. Anonymous access and current deployed version are checked read-only.

## Final deployment observed

Production deployment `dpl_EUnPvGFah2xHt3zJE58KhcQtPRGb`, aliased to `https://www.osbornalpha.com`, target SHA above. Public API responses independently reported this exact codeVersion.

### Passed read-only HTTP checks

- `/manifest.json`: 200, valid JSON (`manifest.json`, `manifest-headers.txt`).
- Anonymous `/api/macro/overview?region=US&compact=1`: 401, `unauthenticated`, sign-in required (`anonymous-overview.json`, `anonymous-overview-headers.txt`).
- `/api/methodologies`: `macro_regime@v2` publishable true; formula hash `dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba` (`methodologies.json`).
- US public latest card: open, retrospective false, Overheat; judgment `e751d25c-69a3-88f8-947b-2fe5a8fb21f1`; snapshot `693b2539-783c-4844-bf65-e2598f23e9a5` (`us-card.json`).
- CN public latest card: open, retrospective false, Stagflation; judgment `2fc6cdb9-95ca-883a-982f-824a398b9731`; snapshot `a256aa8c-7188-4fbf-97c3-42250d688899` (`cn-card.json`).

### Passed existing-session native Chrome checks

After final deployment, refreshed `/macro` in existing signed-in Chrome session. No credential or cookie extraction.

- Visible four-quadrant investment clock, expanded by default, with Current classification: Overheat.
- Visible Input coverage: 60% — not probability.
- Visible Missing axis data: Growth. No XY position is available.
- Visible classification based on input snapshot, no score or probability implied; primary category explicitly uncalibrated.
- Visible as-of 2026-11-07 00:00 UTC and exact US snapshot ID above.
- Opened Basis: exact bound snapshot link and source observation references shown for US_DFF, US_DGS10, US_CPI_YOY, US_PPI_FD_YOY; human rules and weights/contributions visible. Examples: 2.5% ≤ policy rate <4.5%, yield 3mo within ±25bp, 3%<inflation≤4%, inflation>4%.

### Not yet verified / handoff

Final production CN visual/tie presentation, screenshots, console-error absence, first-entry/refresh/leave-return timings, and the 18 API measurement samples were NOT completed. `corrected.js` is prepared and syntax-checked but has NOT been run on final production. Do not cite preview screenshots or old deployment timings as final-production evidence.

Root took over Chrome for user-requested visual redesign/comparison with ChaosAI; acceptance agent stopped UI operations to avoid conflict. User explicitly rejected the current visual design, so functional US checks above do not constitute visual acceptance. Further UI changes will require fresh final-deployment validation.
