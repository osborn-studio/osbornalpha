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
