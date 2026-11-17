Completed C2a on top of the resumed work. No commit, stash, or branch switch.

Files changed:

- Macro components: `KeyIndicatorCards`, `IndicatorDetail`, `MacroWorkbench`
- Models and tests: `view-model`, `detail-model`
- Chart and tests: `MacroLineChart`
- Component tests: `KeyIndicatorCards.test.ts`, `IndicatorDetail.test.ts`
- `messages/{zh,en}/macro.json`
- `docs/runbooks/macro-sync.md`
- [Acceptance report](docs/audits/2026-11-16-macro-wpc/pr-c2a-acceptance.md)

Tests: typecheck and lint passed; 39 focused tests passed. Full-range rerun with two workers passed **1402 tests**, with 83 skipped, excluding only the permitted replay timeout file.

Could not complete browser screenshots/live visual verification: Chromium launch was blocked by sandbox MachPort permissions. The known limitation that expanded history is not fully frozen is documented in runbook §14.