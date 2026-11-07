# F6 integrity-lock registration verification

The bounded follow-up to #148 adds an explicit operator command to register
completed human-authored gold bytes in the existing lock. The command is an
integrity operation; independent human gold acceptance and release verification
remain separate requirements. See [usage and limitations](f6-gold-admission.md#register-reviewed-human-gold-in-the-integrity-lock).

Actual local verification on Node v22.22.1:

- The initial test-first run failed because the new module did not exist.
- The final F6 non-DB selection passed: **49 files, 790 tests**, including 20 new
  lock-operation cases. No skips in that selection. New successful-path fixtures
  are synthetic contracts in temporary directories, never human gold evidence.
- Full repository TypeScript, changed-file ESLint and diff whitespace checks passed.
- Actual CLI attempts to register current synthetic-us and pending legacy plan2
  both exited 1. Existing `--gold --lock --availability` exited 0, as a diagnostic.
- Gold fixtures, recorder registry, integrity lock and kind registry are unchanged.

MiniMax-M2.5 supplied a completed design review. Its conditions concerning
concurrent writers, input consistency, paths and approval claims are addressed by
exclusive staging, pre-rename input checks, symlink refusal and explicit
`integrity_lock_only` output. Final code-review disposition is recorded in the PR.

No DB integration, app build, source verification, real transcription/review,
production evaluation, release acceptance, merge or deployment was performed.
Real gold remains dependent on human transcription/review; calibration remains
disabled without F4's probability methodology, settlement export and thresholds.
Extraction gold retains its D8 licensing prerequisite.
