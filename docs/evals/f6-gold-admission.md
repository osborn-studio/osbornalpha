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
