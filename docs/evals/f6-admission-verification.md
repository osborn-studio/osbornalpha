# F6 admission verification

Scope: follow-up to PR #137, approved F6 §4 and §11.3. All examples used to
exercise the new rules are synthetic tests. No human labels, licence decision,
threshold policy, production source bytes or settlement evidence were created.

## Executed checks

Node v22.22.1 via `/opt/homebrew/opt/node@22/bin`. Dependencies installed from the
committed package lock using `npm ci --ignore-scripts --no-audit --no-fund` in
`/tmp/osstack/f6-evaluation-next/deps`; the worktree only linked that installation.

- Before implementation: gold schema/calibration regression run had 21 failing
  new cases and 106 passing cases, including a missing-settlement crash.
- Final F6 unit run: `vitest run src/lib/evals --exclude '**/*.integration.test.ts'
  --maxWorkers=1`: 48 files, 768 tests passed, no skipped tests in this selection.
- Full repository `tsc --noEmit --incremental false`: exit 0.
- ESLint on changed TypeScript files: exit 0, zero warnings.
- `git diff --check`: passed.
- Actual validator `--gold --lock --redact --availability`: exit 0.
- Actual `--gold-admission src/lib/facts/fixtures/gold/plan2.json`: exit 1,
  population 50, pending 50, provenance gaps in 50 cases; legacy/not-ready findings.
- Actual `--gold-admission src/lib/evals/fixtures/gold/facts/synthetic-us.json`:
  exit 1, population 10, synthetic-case findings despite schema/lock validity.

No database integration suites, full-app build, production run, network source
verification or release manifest authentication were performed. The changed code
is pure validation/eligibility and an offline CLI handler. The existing disabled
registry entries were preserved.

## Independent review

Five independent read-only GPT-6.1 Sol sessions examined gold schema, calibration,
operator admission, approved-spec scope and adversarial test boundaries. The
runtime permits four active sessions including the primary, so reviews ran as
three concurrent reviews followed by two concurrent reviews, not five simultaneous
sessions. Their concrete date/locator/identity and calibration metadata findings
were addressed. Their scope checks preserved legacy inspection, synthetic CI,
optional review semantics and disabled production kinds.

Actual mmx CLI discovery used `mmx --help` and `mmx text chat --help`.

The first two MiniMax-M3.1-Flash attempts exhausted 12,000 and 8,000 output tokens
with thinking-only responses (`stop_reason=max_tokens`); neither is counted as a
completed audit. A bounded MiniMax-M2.5 admission review returned a final text
block with `stop_reason=end_turn`:

> Correct for the stated dataset-contract-only scope. No concrete P1/P2
> correctness bugs found.

It noted imprecise diagnostics for unexpected lock-check exceptions and unknown
non-public artifact classes; parsed GoldSet inputs constrain those cases and the
function fails closed. These are not false-admission paths. The reviewer received
source text and claimed test results; it did not independently run tests or
inspect production evidence.

A separate MiniMax-M2.5 schema/calibration patch review returned final text
(`end_turn`) requesting changes for one P2: allegedly `2024-13-01` and
`2024-01-00` could reach `toISOString()` and throw. The unchanged `DATE_SHAPE`
guard rejects those month/day values before conversion. Exact counterexamples
were added to recording/review parsing tests: the expanded schema suite passed
113 tests, returning `gold_invalid` rather than `RangeError`. No production
change was needed for that finding. This test-only follow-up adds two cases to
the earlier 768-test selection; the broad selection was not rerun unnecessarily.

After receiving the complete date guard and regression evidence, MiniMax-M2.5
returned a final text reassessment (`end_turn`): **“Final verdict: P2 withdrawn.”**
It identified no valid counterexample under the guarded year/month/day range.
No mmx P1/P2 finding remains unresolved. Raw responses and final text extractions
remain under `/tmp/osstack/f6-evaluation-next/`; these are review artifacts, not
F6 release-evidence attestations or an independent human approval.
