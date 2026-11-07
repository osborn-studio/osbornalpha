# Current integration closeout — 2026-11-07

Merged `origin/main` `aaec7c796af37b115b7839f9b8967f8bac4ef727` safely into the existing PR152 branch (integration merge `12357a04de6b17f724c63213733bfec8dba66b71`). PR142 and PR144 are now in that baseline. Production/widget files have no PR diff against this main revision.

The first current-integration run passed 42 non-browser checks and 10/13 browser checks. Three strategy destination tests failed with `process is not defined`: latest main's real strategy fetch hook imports the browser Supabase auth client, which the standalone bundle had not isolated. The harness now stubs that auth boundary explicitly while retaining the actual hook, page functions, client components, API request assertions, meaningful rendered-content assertions and zero-page-error assertion. The stub emits no auth callbacks; transitions, cleanup and session storage remain untested here. No product check was weakened.

Fresh verification with Node22, exact `npm ci` dependencies installed in `/tmp/osstack/source-tests-closeout/deps`, headless Chromium and one worker: **55 targeted checks pass** (26 handler, 15 transport, one lineage, 13 browser including two registry checks). Scoped TypeScript, root ESLint and root TypeScript pass. A first root typecheck against a stale shared dependency tree lacked the lockfile's `pdfjs-dist`; the exact scratch installation resolved that environment failure without editing product code or shared dependencies. Commands, exit codes and timings are in `/tmp/osstack/source-tests-closeout/verification.json`; raw logs and browser attachments are alongside it. No local full suite was run.

The existing Application checks workflow did not discover any of these 55 tests. New `.github/workflows/macro-source-integration.yml` runs their four explicit configurations, installs Chromium before transport tests, runs scoped static checks and uploads browser evidence. Application checks and branch protection are unchanged. This is synthetic fixture CI, not deployed E2E. Historical scratch-only mutation controls below are separate audit evidence and are not claimed as workflow steps. The source target resolver now requires the named scenario's target; Playwright rejects focused tests in CI.

Five new independent read-only `gpt-6.1-sol` CLI audits completed (raw JSONL and recovered detailed reports under `/tmp/osstack/source-tests-closeout`):

| Audit | Scope | Session ID |
| --- | --- | --- |
| 1 | Actual handlers and identity | `01a1b6a1-2f5e-7dc3-b604-e155e35c7c94` |
| 2 | Source preview navigation/provenance | `01a1b6a1-2fa2-75c3-a666-ceeaea9a3da1` |
| 3 | Destination rendering/integration | `01a1b6a1-2f85-7b50-ac15-026d972043b4` |
| 4 | Harness/transport/portability | `01a1b6a1-2f89-7bb3-859e-0395adcc1732` |
| 5 | CI discovery/failures | `01a1b6a1-2f79-7df0-9d94-5ecb8b062d37` |

The destination audit independently identified the auth-boundary regression; the CI audit identified the discovery gap. Other audits established no additional substantive defect. These sessions inspected code; fresh execution belongs to the coordinating session. MiniMax-M2.5 returned real final text (`stop_reason: end_turn`) in `mmx-response.json` / `mmx-audit.md`. Its initial verdict required current root checks, explicit auth limitations, fail-fast target resolution and clearer separation of historical mutation evidence; those are addressed. Its proposed fixed-count CI guard and committing historical mutation tools were not adopted: the actual current run establishes 55 passes with no skips, the normal runners remain authoritative as test counts evolve, and historical controls are explicitly outside workflow claims. Follow-up MiniMax-M2.5 closure returned `stop_reason: end_turn`, **Approved for closure within the declared synthetic test-harness scope**, with no remaining actionable defects (`mmx-closure-response.json`, `mmx-closure-audit.md`). Final browser rerun remains 13/13, and scoped TypeScript/lint pass after the target-resolution and focused-test safeguards.

The source checks navigate real SHA anchors to exact synthetic metadata, then navigate the returned local download URL and compare exact bytes/digest. Positive destination checks execute/render actual pages and meaningful content; href-only, redirect-only and 404-only outcomes cannot satisfy them. Browser fixtures and actual GET-handler memory tests remain complementary layers, not browser-to-real-handler E2E. Framework routing/capability/auth boundaries and redirects are modeled. No production Next runtime, provider authenticity, cookies, SQL/RLS, real signing expiry, widget click-target integration or native Chrome coverage is claimed. Full detail and historical negative controls follow.

---

## Historical initial delivery (prior baseline; superseded by current verification above)

# Macro source and destination verification findings

Verified baseline: fetched `origin/main` `dc47ba2eb0768971f7362750bf504a90ceb68026` (rechecked before publication). PR142 was inspected read-only at `fb692b4c2b1d0ac976dd0a8f45f03dedd25021a3`; the audited drawer, view model, evidence/versions handlers and macro destination page functions match that baseline. All repository changes are confined to `tests/macro-source-integration`.

## Final verification

Node22; headless Playwright Chromium; one worker per targeted suite; no retries or full suite. Final integrated browser run used alternate local port3157, including source metadata/download navigation.

| Check | Result |
| --- | --- |
| Actual evidence/versions handler contracts and browser-fixture bridge | 26 passed |
| Registered browser transport and byte integrity | 15 passed |
| Cross-response observation identity consistency | 1 passed |
| Actual source drawer and destination components | 11 passed |
| Server registry method/query isolation | 2 passed |
| Strict scoped TypeScript | Passed |
| Scoped ESLint, zero warnings | Passed |

**55 targeted tests passed.** Commands are reproducible from README. Exact command arguments, exit codes and timings: `/tmp/osstack/macro-source-integration/final-verification.json`; raw outputs: `final-{api,transport,lineage,browser,typecheck,eslint}.txt`. Browser JSON, traces and screenshots: `/tmp/osstack/macro-source-integration/final/macro-source-integration/`.

Four scratch-only in-memory route mutations were detected by failing behavioral assertions: bypass session guard, sign for600 instead of60 seconds, drop missing input identity, substitute another ancestor. These deliberately failing controls are separate from the green baseline. Two additional regression tests failed against a scratch copy of the old URL-only server registry, then passed after method isolation was fixed (`method-red.txt`). No production source file was mutated.

## What the tests establish

- The real SourceDrawer keeps captured derived observation `11111111-1111-4111-8111-111111111111` v1/2.5% despite newest-first v2/2.75%. It renders the exact captured raw ancestors, transform, availability, retrieval details, SHA, locator and revision selection without newer-proof leakage.
- Both derived-input SHA anchors and a raw-observation anchor navigate to successful metadata JSON. Tests assert captured SHA/receipt, follow the local download URL, compare exact synthetic CSV content and independently recompute SHA256. Missing input stays visible and has no invented link. A separately registered missing-evidence response requires the exact404/error code/message and visible error content; status alone cannot pass. A versions503 preserves the published value and explicit read error.
- Actual macro detail, history, transmission, review-index and review-detail server page functions render and hydrate their production clients/messages. Tests exercise the actual chart canvas/table, month-end episode/return, boundary switching, CN/US transmission switching, generated review facts/counts, and a real review fact link into indicator detail. Invalid-series/month404 cases are negative controls, separate from positive destination passes.
- The harness records labeled simulated308 aliases from `/intel/macro/*` to canonical `/macro/*`, preserving queries. Registered transport redirect hops have a separate explicit simulation marker. API method/path/query matching, unknown-response rejection, external redirect rejection and popup interception are tested.
- The actual evidence and versions GET exports execute with real memory DB/store, real validation/session/error helpers, injected sessions and signing boundary. Browser evidence fixtures are additionally passed through that real handler contract. The browser itself receives registered fixture responses; these are two complementary layers, not browser-to-real-handler E2E.

## Findings resolved in this change

1. **False-positive risk: empty review shell.** The original destination test failed4/5 because review facts were empty. Typed release/count facts were added and the exact fact/link assertions retained; final destination checks pass5/5.
2. **Invalid fixture archive path.** The independent handler bridge caught `synthetic/<sha>.csv`; fixtures now use validated `fred_csv/<sha>.csv`, and all26 handler tests pass.
3. **Conflicting fixture identity.** A new invariant first failed when history reused a raw-input ID for another series/value/period. History now has distinct IDs, and captured availability agrees across responses. This invariant compares fields present in fixture objects; mandatory proof completeness is checked by the separate handler/UI assertions.
4. **Registry method ambiguity found by MiniMax.** Server registrations formerly matched only URL. They now key method plus URL; GET and POST responses cannot substitute for each other. Both regression cases failed on the old scratch server and pass on the final server.
5. **Fixture quality issues corrected:** actual CSV-derived SHA/length, correct collection dataset type, origin-relative archive URLs, frozen review clock, correct alias direction, explicit redirect simulation and egress rejection.

No new application defect was established within these covered scenarios. The prior PR144 mobile navigation-focus finding remains with the widget owner; this change does not claim to repair or reverify that widget.

## Independent sessions and audits

Five independent CLI coding/testing sessions used exactly `gpt-6.1-sol`. Each read applicable instructions/skills, owned separate files, ran targeted checks and wrote its own report.

| Session | Role | CLI session ID |
| --- | --- | --- |
| 1 | Fixtures and registered transport | 01a1b68b-ce82-7781-b312-22ce7645b89d |
| 2 | Source drawer browser tests | 01a1b68b-ce7f-72b2-83fb-2ba78ebe748d |
| 3 | Real destination browser tests | 01a1b68b-cf39-7bf1-81a1-830d4d718913 |
| 4 | Real-component/server-page harness | 01a1b68b-ce87-7920-a3a0-4cef5549a3e1 |
| 5 | Actual handler tests and adversarial audit | 01a1b68b-ce8a-7581-b44c-6e6733cb659a |

Reports/logs are `/tmp/osstack/macro-source-integration/session-N-result.md` and `session-N.log`. Early session reports intentionally retain their red findings; the final integrated run above verifies their corrections.

MiniMax-M3.1-Flash returned real final text (`end_turn`) for test-design and code audits: `mmx-design-final.md` and `mmx-final-audit.md`, with exact request/response JSON alongside. Its code verdict was conditional pass for fixture coverage, pending handler rerun and registry-method correction; both are now verified green. Its separate-layer and present-field-lineage limitations are explicitly preserved here. The initial design attempt exhausted its budget with thinking only and is not counted as an audit pass. A subsequent MiniMax closure audit returned real final text (`end_turn`), **ACCEPTABLE CLOSURE**, and no remaining test defects after reviewing method isolation, regression tests and final reruns (`mmx-closure-audit.md`, with exact request/response JSON).

## Evidence boundaries and handoff

All values, receipts, sessions, signing URLs and raw bodies are synthetic fixtures. SHA verifies fixture-byte integrity, not provider authenticity. Framework navigation/Link/server-translation and capability gates are stubbed; actual components, messages, page functions and API handlers are used as described. There is no claim of production Next runtime, middleware, cookies/auth integration, SQL/RLS, real signing expiry, live provider availability, deployed redirects, or native-Chrome coverage. Browser request guards reject external HTTP traffic; the API suite rejects global fetch. This is not a claim of OS-level network isolation.

The harness directly renders source/destination components. It does not mount or edit the PR142 widget; widget click-target integration remains a separate owner's responsibility. Boundary fixtures prove selected requests/rendering, not production recomputation. Fixture diff uses decimal subtraction but does not certify production predecessor-range semantics.

Only tests are delivered. No widget files, shared root configuration, global task documents, cookies or production secrets were changed; no merge or deployment is authorized or performed. Root can attach the PR and this report without a separate attachment wait.
