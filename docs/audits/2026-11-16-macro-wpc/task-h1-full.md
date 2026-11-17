You are Codex gpt-6.1-sol in this repository worktree (OsbornAlpha, Next.js 15 / React 19, macro workbench). Do NOT commit, stash or switch branches. At the end print: files changed, test results, anything you could not do.


Hard rules:
- Failing test first for every behaviour, then implementation. Keep zh and en messages in step (messages/zh/*.json, messages/en/*.json).
- NEVER edit: src/lib/macro/{catalog,regime,regime-selection,types,decimal,judgment-contract}.ts, src/lib/judgments/**, supabase/**, src/lib/macro/providers/**, parsers/**, fixtures/**, scripts/macro/**. No migrations. No new dependencies.
- Never write the literal string MACRO_JUDGMENTS_ENABLED in any file under src/components/macro.
- Missing data stays missing: never draw or print 0 for a missing value; restricted/missing sources are labelled as such.
- No numbers invented; every displayed number comes from the existing API/DTO.
- Styling: existing tokens/CSS variables only, radius <= 6px, no gradients/glow/purple; rise/fall colours only for asset returns.
- Must pass: `npm run typecheck`, `npm run lint`, and `npm test -- src/components/macro src/lib/macro "src/app/(app)/macro" src/app/api/macro` (the test `src/lib/macro/replay.test.ts` may time out locally; ignore only that one).


TASK H1 (history page per-cycle 解读 / key observations, deterministic template sentences).
Goal: on the history screen (`HistoryScreen` in src/components/macro/strategy/StrategyScreens.tsx, data = `CycleTableView` from src/lib/macro/strategy/contract.ts, built by cycle-table.ts) show, for each policy episode, a short "关键观察 / Key observations" block made of FACT SENTENCES rendered from fixed zh/en templates with slots filled only from the CycleTableView cells already on the page. No model call, no API change, no DB, no migration.
Rules:
- New pure module src/components/macro/strategy/cycle-notes.ts: `cycleNotes(view, locale, t) → {episodeKey, title, sentences: {key, text, refs}[]}[]`, version constant `CYCLE_NOTES_VERSION='macro-cycle-notes/1'` shown in the UI footer of the block.
- Sentence templates (each only when its inputs exist; a missing/out_of_coverage/restricted cell produces the sentence "X：缺失（原因）" using the cell's existing reason label, never a number and never 0):
  1. episode span and direction: start date → end date, number of policy events, cumulative policy move in bp (from the episode fields that already exist; if the view has no such field, omit that slot rather than computing a new statistic from raw data that is not in the view), flags ongoing / left-censored / gap-after using existing labels.
  2. per visible column: the interval change exactly as the table cell formats it (reuse the existing cell formatter, e.g. cycleCell/formatRaw; same rounding, same unit % or bp), stated as "from boundary A to boundary B".
  3. largest rise and largest fall among % columns and, separately, among bp columns (never compare % with bp); ties → column order; fewer than two available values in a unit → sentence omitted.
  4. coverage line: "n / N 列有数据".
- Forbidden words in any template or output (add a test that scans both message files' new namespace and rendered output for a fixture): 复苏, 过热, 滞胀, 衰退, recovery, overheat, stagflation, recession, 概率, probability, 预测, forecast, 建议, recommend, 买入, 卖出, buy, sell, 因为, 导致, because, caused. These are observations of what happened in the interval, not causes, regimes or advice.
- Every sentence carries `refs` = the ObsRef lists of the cells it used, and the UI lets the reader open the existing EvidencePairDrawer for a sentence (same drill the table cell uses).
- UI: new component src/components/macro/strategy/CycleNotes.tsx mounted in HistoryScreen below the table (one <details> per episode, the most recent episode open by default), labelled "关键观察（模板生成，非模型撰写）" with a one-line note "由表中数值按固定模板生成；不解释原因，不构成投资建议" (this fixed disclaimer line is the ONLY place the word 建议/advice may appear; exclude that one key from the forbidden-word scan explicitly and by key name). Keep edits to StrategyScreens.tsx to the import and the mount; do NOT edit CycleReturnsTable.tsx, strategy-view-model.ts (import from it only), TransmissionFlow.tsx or PolicyResponseMatrix.tsx — other branches are changing those.
- Messages: add keys only in a new `cycleNotes` block at the end of messages/{zh,en}/macroStrategy.json.
- Also fix `router.replace('/intel/macro/history?...')` in HistoryScreen to `/macro/history?...` if it is still the old path.
Tests: cycle-notes.test.ts (templates, missing cells, unit separation, ties, forbidden words, refs present, zh/en parity).


RESUME NOTE: a previous run of this exact task was interrupted. The working tree already holds its uncommitted partial work (see git status). Read it, keep what is right and finish on top of it; do not start over, do not revert it.
