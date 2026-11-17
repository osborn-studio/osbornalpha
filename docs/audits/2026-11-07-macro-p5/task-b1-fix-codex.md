The v4 fix round is complete. `buildClockView` now uses the exported `gateSnapshot`, `gateObservations`, `gateRecord`, and `clockMeta` helpers. The added tests cover `invariant.4.coverage`, a separate `invariant.7.selected`, `invariant.9.misclassified`, the helpers, and US/CN classifier fixtures. The `invariant.8.rule_id` case still changes only `rule_id`.

**Files changed:** `src/lib/macro/clock-view.ts`, `src/lib/macro/clock-view.test.ts`.

**Verification:** `Tests 34 passed (34)`; `npm run typecheck` and `npm run lint` passed.

**Deviation:** The misclassification test uses the existing manifest fixture. It does not include the specified three liquidity display rows because the current US catalog does not provide three such `type: null` rows. No commit was attempted, as requested.