You are Codex gpt-6.1-sol in this repository worktree (OsbornAlpha, Next.js 15 / React 19, macro workbench). Do NOT commit, stash or switch branches. At the end print: files changed, test results, anything you could not do.

Contract: docs/audits/2026-11-16-macro-wpc/spec-section-4.md (written before main moved). Where it disagrees with the code on this branch, the code's structure wins: the route is `/macro` (not `/intel/macro`), keep existing component/file names, reuse existing helpers. Read the existing code first.

Hard rules:
- Failing test first for every behaviour, then implementation. Keep zh and en messages in step (messages/zh/*.json, messages/en/*.json).
- NEVER edit: src/lib/macro/{catalog,regime,regime-selection,types,decimal,judgment-contract}.ts, src/lib/judgments/**, supabase/**, src/lib/macro/providers/**, parsers/**, fixtures/**, scripts/macro/**. No migrations. No new dependencies.
- Never write the literal string MACRO_JUDGMENTS_ENABLED in any file under src/components/macro.
- Missing data stays missing: never draw or print 0 for a missing value; restricted/missing sources are labelled as such.
- No numbers invented; every displayed number comes from the existing API/DTO.
- Styling: existing tokens/CSS variables only, radius <= 6px, no gradients/glow/purple; rise/fall colours only for asset returns.
- Must pass: `npm run typecheck`, `npm run lint`, and `npm test -- src/components/macro src/lib/macro "src/app/(app)/macro" src/app/api/macro` (the test `src/lib/macro/replay.test.ts` may time out locally; ignore only that one).

Parallel-run rules: other Codex runs are working in sibling worktrees on other parts. Stay strictly inside your part. In messages/zh/*.json and messages/en/*.json add new keys ONLY inside one new namespace block named as stated in your task, appended as the LAST top-level-or-section key of the file you extend; do not reorder or reformat existing keys. Prompt/report files live in docs/audits/2026-11-16-macro-wpc/.

TASK C2a (spec 4.1 and 4.2 only; namespace for new messages: `keyCards` and `markers`). Do NOT touch strategy files (src/components/macro/strategy/**), asset tables/bars, or correlation.
1. Overview big chart cards (4.1): `KeyIndicatorCards` on the overview (US: US_DFF, US_DGS10, US_CPI_YOY, US_UNRATE; CN: CN_PMI_MFG, CN_CPI_YOY, CN_CGB_10Y, CN_M2_YOY; verify ids against the catalog and use the real ids; skip ids not in the overview envelope and never fabricate). Header = envelope row (snapshot value, period, change, labelled 快照值); collapsed = existing Sparkline; expanded = existing `IndicatorDetail compact` with asOf = snapshot created_at (use what MacroWorkbench already has, or the existing snapshot route with a component-level cache); chart caption "历史（可得时间 ≤ 快照时刻）"; when the chart's last point differs from the snapshot row show the mismatch hint. First 2 cards expanded by default. Placed above the indicator table, responsive (2 columns desktop, 1 mobile).
2. Marker layers (4.2): `MacroLineChart` gets `layers?: {derived?: boolean; calendar?: boolean}` (default derived on, calendar off); `markersOf(events, calendar, firstPeriod, layers)` dedups only identical identities (derived `kind|region|series_id|effective_date`; calendar `start|end`); two aria-pressed pills in IndicatorDetail; "事件（最近 6 条）" list sorted effective_date desc, derived before calendar on the same day, then identity key; text label on the chart only when |change_bp| >= 25.
Tests per 4.7 for these two parts.


RESUME NOTE: a previous run of this exact task was interrupted. The working tree already contains its uncommitted partial work (see `git status`). Read it, keep what is right, and finish the task on top of it; do not start over and do not revert it.
