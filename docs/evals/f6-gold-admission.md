# F6 gold admission and calibration preparation

This follows the approved F6 specification §0 R5-1, §4 and §11.3. It extends
PR #137's availability inventory with dataset admission and stricter evidence
contracts. It does not change the kind registry or activate production evaluation.

## Offline dataset contract admission

Use Node 22 from the repository root:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/evals/validate.ts \
  --gold-admission src/lib/facts/fixtures/gold/plan2.json
```

The command reads the candidate, recorder registry and gold lock. It performs no
network or database access and writes nothing. Exit 0 means the parsed F6 public
dataset contract matches the lock and has a nonempty active population of
transcribed cases without pending values or known provenance gaps. Exit 1 means
blocked or unreadable/invalid evidence; exit 2 means CLI usage error.

The JSON includes exact dataset byte hash/version, active case identities,
case-level pending/provenance gaps, blocking findings and `not_verified` limits.
`scope=dataset_contract_only` is deliberately separate from an evaluation gate.
It cannot authenticate a human identity, independent PR approval, source bytes,
transcription accuracy, licence/retention permission, or release readiness.
A matching lock is integrity evidence, not proof of human truth.

The `prerequisites` block counts active (non-retracted) cases with pending values
or recorder evidence, synthetic provenance, and any known provenance gap. Its
`provenance_gaps` object counts cases per missing field, with sorted keys and no
zero-count entries; duplicate mentions in a case count once. These counts overlap
and must not be summed as a number of cases. Empty counts do not bypass set-level
findings (for example, empty population, lock mismatch or restricted licensing).
The counts describe parsed metadata; even zero gaps cannot authenticate human
transcription, review or permission. Retracted cases contribute to neither the
population nor these counts.

At baseline `b0a67adb`, the actual 50-case legacy set (2 required US cases and 48
optional CN cases) has 50 pending cases and 50 cases with provenance gaps:

| Missing prerequisite | Active cases |
| --- | ---: |
| Canonical value | 48 |
| Source URL | 49 |
| Source document ID | 50 |
| Source SHA-256 | 50 |
| Source locator | 50 |
| Printed value | 50 |
| Recorder ID | 50 |
| Recording timestamp | 50 |
| Reviewer | 50 |

The two existing US canonical numbers do not establish human gold: both lack
recorder evidence. The set still requires F6 migration and `ready` completion
through actual human transcription/review, then version/history and lock
registration. Do not fill those requirements from replay fixtures. The separate
10-case F6 synthetic set has 10 synthetic cases and cannot provide human gold.
Neither set is admitted. These are case-field counts, not counts of unique source
documents or licence approvals. D8 licence/retention approval remains an external
prerequisite; no number of missing licences can be inferred from these metadata.
The current registry has four disabled kinds; calibration availability reports
`no_probability_methodology` (zero registered probability methods), so eligible
real forecast sample counts cannot yet be established from an F4 export. The F4
export, threshold approval and runner/release integration prerequisites below
remain outstanding.

Current repository candidates both fail admission:

- `src/lib/facts/fixtures/gold/plan2.json`: legacy format, `ready=false`, pending
  transcription and per-case source/recorder/reviewer provenance gaps. Its owning
  module must supply human transcription and migrate to the approved F6 format.
- `src/lib/evals/fixtures/gold/facts/synthetic-us.json`: synthetic. It verifies
  machinery in CI and can never supply human gold evidence.

Existing `--gold --lock --redact --availability` remains a diagnostic command:
legacy parsing and synthetic CI are still permitted. No existing gold bytes,
review identities or licences have been invented or changed.

Gold schema parsing now rejects impossible calendar/clock dates in provenance,
blank locator keys/values, nonpositive/fractional numeric pages, and noncanonical
implementer IDs that could bypass recorder exclusion. HTML row locators and
printed page names such as `F-28` remain supported. Review remains mandatory only
where the approved contract requires it.

## Calibration evidence contract and activation blockers

The pure calibration evaluator now excludes rows missing nonblank forecast ID,
methodology version, claim, settlement evidence reference, or a valid nullable
revision reference. Forecast and input snapshot hashes must be lowercase SHA-256.
Malformed/missing settlement objects become `evidence_contract_invalid`, rather
than throwing or contributing to Brier/reliability. Tests use synthetic rows.

These are structural checks. F6 cannot authenticate those hashes or references
until F4 supplies the actual visible, eligible settlement read boundary. Existing
probability/time/duplicate/revision eligibility rules and Brier arithmetic remain
in force. No probability is derived from categorical judgments.

`judgment_calibration` remains disabled. Before activation, F4 must provide:

1. A registered probability methodology and visible, auditable settled-forecast
   export binding forecast bytes, input snapshot bytes and settlement evidence.
2. Eligible real samples satisfying §11.3, including the registration lead time,
   horizon and unique-settlement/revision rules.
3. Approved calibration-specific threshold semantics. Current generic
   `Thresholds` only governs case counts/coverage; passing it to the pure helper
   does not establish that Brier or reliability meets an approved F4 threshold.
4. A runner and release evidence integration reviewed against that contract.

The older C1 refit design (`2026-09-26-calibration-refit-design.md`) concerns
research fanout labels/isotonic fitting. It does not supply F4 settled forecasts
or authorize F6 thresholds. `recommendation_call` self-assessment also remains
insufficient.

`extraction_gold` remains disabled pending D8 owner licence/retention permission,
real independently reviewed labels and authenticated document provenance. CN
production gold still needs real Tushare/CN replay evidence. Other disabled kinds
retain their registry prerequisites. No production report, manifest approval,
source verification, production write or activation is claimed here.

## Register reviewed human gold in the integrity lock

After a human has completed transcription and the required independent review,
register the exact candidate bytes with:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/evals/lock-gold.ts \
  src/lib/evals/fixtures/gold/facts/reviewed-us.json
```

This is an explicit local write to `lock.json`, replacing or appending just the
candidate's entry and preserving unrelated entry values. It reuses the admission
contract, refusing synthetic, legacy, restricted, empty and invalid candidates.
The candidate must be under the F6 gold directory; the original
`src/lib/facts/fixtures/gold/plan2.json` path is also supported **after** its owner
migrates it to F6. Changed locked bytes require a strictly higher version and the
schema-required history, including legacy migrations and formatting changes.
Identical entries leave the lock unchanged. Exit codes: 0 updated/unchanged,
1 refused, 2 invalid CLI arguments.

The command acquires `lock.json.pending` exclusively, validates one snapshot of
each input, stages a complete replacement, and checks that candidate, recorder and
lock bytes still match before atomic rename. Symlinked inputs are refused. A
second cooperating writer fails closed. If a process crashes and leaves
`lock.json.pending`, first establish that no updater is running and inspect the
staged file before an operator removes it and retries. Do not edit inputs while
running this command; arbitrary concurrent editors cannot be locked out by this
local tool. Atomic replacement protects against partial lock writes; power-loss
durability is filesystem-dependent.

The output says `scope=integrity_lock_only` and retains admission's `not_verified`
list. It does not establish source accuracy, authenticate recorder identities or
independent PR approval, grant licensing, or accept gold for release. Submit the
candidate, history and lock diff through independent human PR review; retain
`--gold-diff` CI and authenticated release-manifest checks. No acceptance flags,
values, recorder identities, licences or disabled evaluation kinds are changed.
The current repository candidates remain blocked; the updater does not fill them.

## Runner lock preflight

The official reconciliation CLI validates the entire lock file before comparing
its candidate entry and opening runner dependencies. Duplicate paths, unknown
fields, malformed entries and invalid JSON are refused with `gold_invalid`
(exit 2), including corruption in an unrelated entry. A matching first entry
cannot bypass those checks. Candidate bytes that differ from a valid lock still
produce `gold_lock_mismatch` (exit 2).

The registration lifecycle tests use isolated, clearly marked synthetic contract
fixtures with test recorder/reviewer metadata. They exercise required-review
refusals, exact-byte registration, a matching CI run, idempotence, version/history
changes, stale-byte refusal and overlapping registrations. These checks verify
machinery only; they do not establish actual human transcription, independent
human review, source authenticity or production gold acceptance.
