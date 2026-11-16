# Independent MacroWorkbench regression checks

These checks run against the **real MacroWorkbench component tree** with captured
US/CN snapshot and judgment DTOs. They do not edit or bundle application source.
The fixture transport is a separate process maintained by the widget owner;
start that harness before running these checks. No production credentials or
native Chrome session are used.

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test -c tests/macro-integration/playwright.config.ts
```

Defaults:

- `MACRO_INTEGRATION_URL=http://127.0.0.1:3121`
- `MACRO_FIXTURE_ROOT=/tmp/osstack/widget-full-fixtures`
- JSON results, failure traces and screenshots: `/tmp/osstack/macro-integration-audit`
- One headless worker, no retries, 20-second test timeout.

The fixture harness originally lives in the widget branch at
`scripts/preview/workbench-server.ts`; its entry renders the real workbench with
judgments and strategy links enabled. The main app's production backend, auth,
account chrome and destination pages are outside this fixture's scope. Run
against a rebuilt, fixed target bundle when comparing changes; a server rebuilt
during a run can invalidate provenance.

Coverage includes exact observation selection despite a conflicting newer
revision, published value retention on evidence failure, wrong snapshot
rejection, late US response after a China switch, keyboard drawer close/focus
return, region switching while evidence is open, overview/indicator/method tabs,
strategy/history hrefs, and four clock disclosure controls at mobile widths.
Mobile navigation is traversed with Tab. A scrollable nav is allowed, but a
focused control must become fully visible without manual scrolling.

As audited on 2026-11-07, six checks pass and the mobile focus visibility checks
at 320px and 390px fail: Method & sources remains partially clipped. These tests
are deliberately retained as regression reproductions. They are opt-in and do
not alter the default Vitest or Playwright suites.

A successful href assertion is **not** a destination-page pass. The fixture
server returns 404 for unimplemented history, strategy and indicator destinations;
no source-preview404 result is considered a pass. This is integration coverage,
not a complete WCAG audit or a production release gate. English is tested with
both US/CN data; Chinese localization and screen-reader behavior remain outside
this suite.
