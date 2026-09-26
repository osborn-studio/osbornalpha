# A10：hiphon-pm 战绩一次性映射进台账（设计）

日期：2026-09-26。来源：总纲 WP-A10、§8.2 表「个人战绩 calls.jsonl 保留，映射进台账，不迁移」。分支 `codex/wp-a10-calls-import`，基于 `main`。常设授权下按默认方案执行。

## 决定（默认）

1. 只读 `~/.hiphon-pm/calls.jsonl` 与 `scorecard.json`，路径由操作员在命令行传入；**文件内容不进仓库、不外发**，测试全部用合成 fixture。
2. 每条 `call` → 一条**历史 thesis**（`DRAFT`，标题 `[hiphon-pm] <call_id>`，正文 = 原 thesis 一句话 + 信号/证据等级；失效条件 = 止损；观察指标 = 目标与持有上限）+ 一条 `human_baseline` 决定：`frozen_at = ts_utc`、`week_of` = 该周周一、`card_id = hiphon:<call_id>`、`action`：buy/add/strong_buy → adopt，hold → shadow，trim/sell → reject；`reason` = 原 thesis 文本。DRAFT 不进 fan-out、不出卡片，只作台账历史。
3. `event`（manual_close）→ 追加 `research_outcomes`（`decision_id` 指向该 call 的决定，`window_weeks = ceil(horizon_days/5)`，`price_result = {state:'closed', reason:'manual', note}`，`judged_by = 'hiphon-pm-journal'`）。scorecard 只有聚合、没有逐条裁决，所以自动裁决（hit_stop/hit_target/expired）不能逐条映射；本次 25 条无 closed，无自动裁决可导入。
4. 不创建 observation：E3 真实行情路径尚未打开，且 A 股不在 XNYS 政策内。
5. 幂等：按 `card_id = hiphon:<call_id>` 查已有决定 → 跳过；thesis 按标题查重。
6. 一致性校验：导入摘要给出 `calls`、`by_rating`、`imported/skipped`，并与 scorecard 的 `closed.n + open.n` 及 `closed.by_rating` 比较，输出 `consistent:true|false` 与差异；不一致不阻断导入，只报告。

## 交付

- `src/lib/research/ledger/calls-import.ts`：`parseCallsJournal(text)`（拒绝未知 kind、缺字段、非法时间/rating）、`mapCall(call)`（纯）、`weekOfMonday`、`compareWithScorecard(summary, scorecard)`（纯）、`importCalls({actor, journal, scorecard?, dryRun, theses: {find, create}, ledger: {existingCardIds, recordDecision, recordOutcome}})`。
- `scripts/import-calls.ts <calls.jsonl> [--scorecard scorecard.json] [--dry-run]`：`RESEARCH_OWNER_USER_ID` + Supabase service ctx（thesis）+ S4 池（台账）。
- 测试：纯函数（映射、周一、动作映射、事件→结果、scorecard 比较）；运行器 mock 端到端（幂等、dry-run 不写）；真库集成（决定 `frozen_at` 与 `card_id`、outcome 挂接）。
