# F6 offline diagnostics

Run from the repository root:

```sh
npx tsx scripts/evals/validate.ts --gold --lock --redact --availability
```

This reads local gold bytes, checks their schema and lock, scans F6 evidence paths,
and inventories the actual F6 kind registry and F4 methodology registry. It opens
no database connection and writes no report or evaluation rows. Exit 0 means the
selected checks completed successfully; `availability.scope=diagnostic_only` is
not an evaluation gate, licence approval, calibration evidence, or production readiness.
`--gold` schema success does not mean `ready=true`: inspect each set's ready field.
The synthetic set tests machinery, not human transcription accuracy.

Current blockers and follow-up ownership:

- `extraction_gold`: D8 licence decision pending. Keep disabled until the owner
  approves the gold licence/provenance and supplies real independently reviewed
  labels. F3 adapter tests use synthetic examples, not human gold.
- `judgment_calibration`: no registered probability methodology. F4 currently
  registers categorical `macro_regime@v2`. Its private `recommendation_call@v1`
  self-assessment is not a settled, auditable probability export. F4 must supply
  a visible, eligible settled-forecast read boundary and thresholds before F6
  can map it. A future probability registry entry still reports
  `probability_export_unavailable` until that boundary exists.
- Legacy `facts/plan2` remains `ready=false`; pending source/page/recorder
  provenance requires independent human work. Do not derive labels from facts
  fixtures or turn this diagnostic's exit 0 into an accuracy claim.
- `dual_source` and `reference_regression` retain their existing registry
  blockers. This bounded closeout does not infer enablement from sibling code.

The F3 adapter requires a complete, unique one-based current extraction page set.
Settled candidate citation boxes must fit both PDF page dimensions before F6
converts bottom-left PDF points to top-left points. Missing/invalid page sets or
out-of-bounds citations return whole-document read errors, never guessed locators.

The root `TODOS.md` has no F6 items. The implementation log's Task 15 describes
pure extraction/calibration logic as complete while explicitly disabled; that
completion does not resolve the external blockers above. No task or gate is
relaxed by this diagnostic.
