# Macro source integration harness

Reusable, **synthetic local fixture tests**, with no live provider, Supabase, private storage, cookies, or production requests. Run from the repository root with Node 22 and dependencies matching `package-lock.json` (`npm ci` in a fresh checkout, or a read-only link to an exact scratch installation).

The dedicated **Macro source fixture checks** workflow runs all four targeted configurations below on PRs and main, installs headless Chromium, and uploads browser evidence. The existing Application checks workflow retains repository lint/typecheck and its product checks. The root Vitest configuration alone does not discover this harness. Historical scratch-only mutation controls are audit evidence, not steps in the dedicated workflow.

## Run targeted checks

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
node node_modules/vitest/vitest.mjs run --config tests/macro-source-integration/audit.vitest.config.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run --config tests/macro-source-integration/transport.vitest.config.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run --config tests/macro-source-integration/lineage.vitest.config.ts --maxWorkers=1
node node_modules/@playwright/test/cli.js test --config tests/macro-source-integration/playwright.config.ts --workers=1
node node_modules/typescript/bin/tsc --noEmit -p tests/macro-source-integration/tsconfig.json
node node_modules/eslint/bin/eslint.js tests/macro-source-integration --max-warnings=0
```

The Playwright command runs only this harness's `*.pw.ts` files in headless Chromium. To narrow it further, append `source.pw.ts` or `destinations.pw.ts`. The config starts and stops the local fixture server automatically; stop any manual server using the same port before running. Default origin: `http://127.0.0.1:3147`. For simultaneous runs use distinct `MACRO_FIXTURE_PORT` values and, for destination tests, matching `MACRO_FIXTURE_BASE_URL`. Archive download URLs are origin-relative. Use distinct `OSSTACK_SCRATCH_ROOT` values to keep simultaneous browser reports separate.

All generated output belongs under `/tmp/osstack/macro-source-integration` by default (or the configured scratch root for browser output). `audit.vitest.config.ts` selects only `audit.test.ts`, uses one worker, and puts its Vite cache in scratch. This is not a full repository test run.

## What executes

| Files | Real code exercised | Fixture boundaries |
| --- | --- | --- |
| `audit.test.ts` | Actual evidence and versions GET exports, session guard/error helpers, memory DB/store implementations, provenance view model | Session provider, production dependency factory, URL signer; no HTTP server |
| `transport.test.ts`, `transport.ts`, `fixtures.ts` | Browser request registry and deterministic response matching | API bodies, archived raw content, response errors and redirects |
| `source.pw.ts` | Real rendered `SourceDrawer`, captured observation selection, revision/proof display, real anchor navigation | Fixture API and local raw-content responses |
| `destinations.pw.ts` | Actual macro detail/history/transmission/review page functions and their client components | Framework navigation/Link/translation boundaries, capability gates, API responses |
| `server.ts`, `browser.tsx`, `browser-stubs/` | Actual page-function SSR and hydration with real React/Intl/components | Local server dispatch, simulated routing, strategy enabled/port available |

The browser Supabase client is an inert fixture boundary: it emits no auth callbacks and its unsubscribe is a no-op. The real `useStrategyFetch` still performs the registered API fetches, but these browser checks do not cover auth transitions, subscription cleanup, or session storage. No real Supabase client or environment credentials are loaded. Production hook tests own auth-transition behavior.

The independent handler audit computes SHA-256 from exact CSV bytes stored by `memoryEvidenceStore`. It writes two raw revisions and two derived revisions into `memoryMacroDb`, then exercises the actual route exports. It checks authentication, malformed and absent hashes, metadata and receipts, the 60-second signing contract, sanitized failures, captured versus newest lineage, and missing observation/receipt/evidence behavior. An additional bridge test validates the registered browser evidence fixtures through the real memory DB/store and GET contract. Derived fixture rows are explicitly written; these tests do not verify the ingestion calculation or SQL/RLS implementation.

Browser transform responses and boundary-specific strategy results are synthetic. A successful boundary switch proves the selected URL/query and rendered response, not the actual boundary calculation. The fixture registry uses production decimal subtraction but filters its small fixture range before differencing; it does not establish production predecessor-range behavior.

Registry-registered redirect chains are simulated inside the transport because native redirect follow-ups can bypass browser interception. Their recorded simulated hops do not prove browser address changes. The server's `/intel/macro` aliases use separate labeled local HTTP redirects.

The browser registry must be installed before navigation. It records hits and rejects unknown APIs/external requests. Call its `assertNoUnexpectedRequests()` and dispose it when finished. It intercepts at the browser context so evidence popups are covered; service workers are blocked in Playwright config. Use exported scenarios `valid`, `missing-input`, `raw`, and `versions-error`. The valid scenario intentionally lists the newest revision first while the drawer target identifies the older published observation. Missing input identity must remain explicit; another observation's evidence must never stand in for it.

## Evidence links and honest scope

The production SHA anchor opens `/api/macro/evidence/:sha256`, whose successful response is **JSON metadata**, retrieval receipts, and `download: {url, expiresIn: 60}`. It does not render raw bytes or an HTML preview. Browser tests click the actual anchor, require a successful metadata response for the exact captured SHA/receipt, then follow the fixture-local `download.url` and compare meaningful raw content. Missing evidence requires a structured error response; a bare 404 never counts as a successful preview or destination.

The real route files live under `src/app/(app)/macro`. Baseline `next.config.mjs` redirects `/intel/macro/*` to `/macro/*`; component links still use `/intel/macro/*`. The fixture server models that direction with labeled simulated redirects and executes the actual canonical page functions. Its navigation stub also normalizes client URL replacement. This verifies component/page rendering against modeled routing; it does **not** execute Next's router, middleware, session cookies, feature availability, deployed redirects, or production data wiring.

These tests render the drawer and destination pages directly. They do not establish that the PR142 widget opens the right target or that its links are correct; the widget is outside this harness's edit scope. Handler fixtures and browser responses are separate test layers: a browser pass does not imply the browser called the real GET handler, and a handler pass does not prove a production signed URL can be downloaded.

## Results and negative controls

Per-session commands, exact outcomes, limitations, and actionable findings are recorded in `/tmp/osstack/macro-source-integration/session-N-result.md`; browser reports/traces also live in scratch. Record the checked baseline/PR revision with the result because concurrent work can change the final harness.

Integrated verification passes **55 tests**: 26 actual-handler checks, 15 transport checks, one cross-response identity invariant, 11 component browser tests, and two server registry checks. Strict TypeScript and scoped ESLint also pass. The identity invariant first caught conflicting fixture observation IDs; the actual-handler bridge caught an invalid fixture archive path. These fixtures were corrected before the final run. See [FINDINGS.md](./FINDINGS.md) for scope and audit findings.

Session 5 additionally keeps a scratch-only mutation runner/config. It changes the real route module **in memory during test transformation**, without editing source files. Removing the session gate, changing signing TTL to 600, dropping missing ancestors, or substituting another input must each make a selected behavioral assertion fail. A baseline green run alone is weaker evidence than these detected negative controls. The mutation logs are deliberately failing test runs, not product regressions.
