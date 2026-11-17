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

TASK C1 (spec 4.5, 4.6 + link fix):
1. Transmission: fix the duplicated prefix "机制假设：机制假设：" (edge text in src/lib/macro/**/transmission-v1.ts is already prefixed; `flow.edge` message in TransmissionFlow.tsx adds it again). Implement 4.5: node card default shows badge, short label, value + unit, data period; the rest inside <details>; in the flow draw only arrows; below the flow a <details> "机制假设（N 条）" listing each stage edge text for the locale; remove the `flow.edge` message key and assert its absence in the strategy messages test. Do not edit the transmission data file if it is in the forbidden list; strip nothing from data, just stop double-prefixing.
2. Column toggle (4.6): pure helpers `visibleColumns(view, mode)` and `visibleDims(view, mode)` with mode 'available' | 'all', returning {id,label,hidden_reason}; CycleReturnsTable and PolicyResponseMatrix get a two-state toggle (aria-pressed pills) "仅可得 / 全部目录"; default 'available'; persisted in localStorage key `macro.strategy.columns.v1` (try/catch); when columns are hidden show "已隐藏 N 列（受限/未入目录）" and a link "补齐计划" to `/macro?tab=methodology#data-gaps`. If the methodology tab has no `data-gaps` anchor, add a small section there listing catalog entries whose status is missing or restricted (read from the existing catalog exports, read-only) with their stated reason. `cycleScale` must not change (test it).
3. Fix stale link in strategy-links.ts (`/intel/macro/history` → current history route under `/macro`; check the actual route in src/app).


RESUME NOTE: a previous run of this exact task was interrupted. The working tree already contains its uncommitted partial work (see `git status`). Read it, keep what is right, and finish the task on top of it; do not start over and do not revert it.
