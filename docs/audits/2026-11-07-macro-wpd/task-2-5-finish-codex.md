All four requested checks pass. No network requests or commits were made. Protected files and frozen fixtures remain unchanged.

| Command | Final result |
|---|---|
| `npm test -- src/lib/macro/parsers src/lib/macro/events.test.ts src/lib/macro/series-extras.test.ts src/lib/macro/cycles.test.ts` | **138 passed, 2 skipped**, 8 files passed |
| `scripts/macro/.venv/bin/python -m pytest scripts/macro/test_collect.py -q` | **40 passed** |
| `npm run typecheck` | **Passed**, 0 errors |
| `npm run lint` | **Passed**, 0 errors or warnings |

- **Task 2 — LPR parser:** Already implemented the excerpt hashes, exact values and locators, fail-closed cases, duplicate handling, and opt-in replay. No changes needed. Full raw-evidence replay remains skipped by default because `WPD_RAW_EVIDENCE_DIR` is unset.
- **Task 3 — AFRE parser:** Already implemented amendment A3, fixture checks, article cross-checks, and rejection cases. Fixed TypeScript null narrowing for the decoder label and month match. Replaced the declaration-only gb2312 test with an actual encode/decode round trip checking text, points, and locators. Full raw replay remains skipped for the same unset environment variable.
- **Task 4 — Collector:** Already implemented dormant HTTP branches, evidence filtering, claims, redirect rejection, spec versions, host-specific TLS, and unsupported-function outcomes. Added a failing regression test and fixed AFRE discovery’s substring title matching. Strengthened tests for JSON evidence retention, daily versus backfill pages, and the exact TLS host set. No outstanding requirements; the live dry-run was explicitly excluded by amendment A4.
- **Task 5 — Quote events:** Already implemented separately versioned CN quote events, extras integration, and generalized cycle inputs. Added direct coverage for minimal cycle inputs and strengthened the integration test to end cycles on the latest unchanged quote. No outstanding requirements. `EVENTS_VERSION` remains `'macro-events/1'`.

`git diff --check` also passes.