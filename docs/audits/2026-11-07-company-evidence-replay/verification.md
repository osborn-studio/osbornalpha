# Company offline evidence replay verification

Base: `ab11d6e3` (includes #145/#149). Scope: a local reader command for saved company fact-series JSON and downloaded EDGAR bytes. No public API behavior, feature flags, licences, database state or production settings change.

The source drawer already exposes a snapshot download, source locator, JSON pointer and disclosure history. There was no executable reader replay over those artifacts. `scripts/company/replay-evidence.ts` now verifies their selected value offline with the landed EDGAR parser and current mapping. The result is source/value consistency, not metadata authenticity, historical availability or human gold truth. See [usage and limits](../../runbooks/company-evidence-replay.md).

## Executed checks

Node 22 PATH was used (`/opt/homebrew/opt/node@22/bin`). Existing dependencies were linked into the assigned worktree; no install or shared dependency change was made.

| Command | Actual result |
| --- | --- |
| `node_modules/.bin/vitest run src/lib/company/replay-evidence.test.ts --maxWorkers=1` | 27 passed |
| `node_modules/.bin/vitest run src/lib/company --maxWorkers=1` | 317 passed, 55 skipped; 33 passing files, 3 skipped files |
| `node_modules/.bin/eslint src/lib/company/replay-evidence.ts src/lib/company/replay-evidence.test.ts scripts/company/replay-evidence.ts` | Exit 0 |
| `git diff --check` | Exit 0 |
| `npm run typecheck -- --incremental false` | Exit 2: four existing document/PDF dependency diagnostics below; no company replay diagnostics |

The first test attempt could not find dependencies and executed zero tests. After linking dependencies, the initial red run failed collection because the replay module did not exist; no assertion failures are claimed for that run. Subsequent passing counts above are from the implemented module.

The 27 replay tests cover byte mutation; value, source concept, filing, period, unit, locator, pointer, run and fact identity mismatches; current mapping requirements; withheld/missing/duplicated fact IDs and truncated/unsupported inputs; primary/other-unit selection; canonical decimal equality; real parser ambiguous/odd-duration candidates; and a synthetic parser-drift double producing duplicate full-key/value candidates. The duplicate-candidate double tests the fail-closed guard, without claiming current real snapshots produce duplicate locator hashes.

The real CLI child-process test checks JSON success and rejection outputs, exits 0/1/2, invalid JSON and read errors that omit private paths. Source test bytes are recorded repository fixtures or explicitly synthetic parser fixtures, not new financial gold labels.

Project typecheck diagnostics:

- `scripts/documents/smoke-pdf.ts:37`: missing `pdfjs-dist/legacy/build/pdf.mjs`.
- `scripts/documents/smoke-pdf.ts:52`: downstream implicit-any parameter.
- `src/lib/documents/extract/pdf.ts:42` and `:47`: same missing module.

## Completed MiniMax review

`mmx --help` and `mmx text chat --help` were inspected. All three requests used **MiniMax-M2.5**, and each returned `stop_reason=end_turn` with a final text block.

1. Design review: conditional go, requiring independent recomputation, unambiguous selection, fail-closed status/version handling and a narrow claim. The implementation uses parser/pointer helpers directly, avoiding invented FactRow/sidecar metadata. JSON semantics remain those of the landed parser, as the runbook states.
2. Code review: no implementation defect found; blocked on three missing coverage areas (ambiguous/odd candidates, duplicate candidate guard, explicit hash/identity/decimal checks).
3. Re-review after those tests and the primary-unit binding were added: **“PASS — no concrete blocking issues found within the stated offline-reader scope.”**

Sanitized requests, raw responses (including completion reasons), final text and test logs are retained at `/tmp/osstack/osbornalpha-wave-next/company-next/`. This document is the committed review artifact.

## Unrun and external prerequisites

No full repository test run, build, DB suite, browser, live provider/production request, migration, deployment or human gold acceptance was performed. Existing skipped database and pending-manual-fixture tests remain skipped.

- CN public values still require source-backed per-value PDF reconciliation/registration; production `PdfLocatorSource` is empty. F3 document citations alone do not supply row/column reconciliation. No locator or Tushare redistribution grant was invented.
- Issuer judgment methods remain absent and company judgments remain default-off. A stable F4 inbox event DTO is still required for judgment inbox integration.
- Historical parser replay would require the recorded code/tool implementation; the new command explicitly verifies current parser/mapping consistency only.
