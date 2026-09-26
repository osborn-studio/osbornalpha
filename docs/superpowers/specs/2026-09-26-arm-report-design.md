# E4：四臂观察报表与决定↔观察关联（设计）

日期：2026-09-26。来源：总纲 WP-E4、§7.2 四臂、§10.1 ③ 市场结果。分支 `codex/wp-e4-arm-report`，基于 `main`。常设授权下按默认方案执行。

## 决定

总纲把 E4 写在 evaluator 仓（strategy/observation 加 `arm/workspace/analyst_id`）。按《Alpha 组件化方案 v4》，臂与分析师归属属于 Alpha 台账（`research_decisions` 已有 `arm/workspace/analyst_id`，A3），S4 观察契约已冻结（1.0/2.0 都不含 arm）。因此 E4 落在 Alpha：**用台账决定承载臂，用 `observation_id` 把决定关联到 S4 观察，报表从 S6 评价结果按臂分组。** 引擎不改。

## 数据

迁移 `20260926130000_research_decisions_observation.sql`：`research_decisions` 增 `observation_id uuid`（可空），外键 `(user_id, observation_id) → research_s4_observation_state(user_id, observation_id)`，索引 `(user_id, observation_id)`。只追加，不改既有约束。

## 台账

`DecisionInput.observation_id?: string|null`；`recordDecision` 校验 uuid，并在事务内确认该观察属于 owner（`research_s4_observation_state`），否则 `scope_denied`。审计 detail 增 `observation_id`。

## 报表（`src/lib/research/s6/arm-report.ts` 纯函数 + `arm-report-db.ts` 读库）

- 行：`{decision_id, thesis_id, week_of, arm, action, observation_id, evaluation: EvaluationResult|null}`，评价取该观察最新 revision 的 `research_s6_evaluations.result`。
- `summarizeArms(rows)`：对 `human_baseline / ai_candidate / collab` 各出 `{decisions, with_observation, evaluated, windows: {[trading_sessions]: {n, resolved, open, pending_start, data_insufficient, mean_price_return, mean_benchmark_difference, mean_max_drawdown}}}`；只有 `resolved` 窗口进入均值。
- `averaged` 臂：按 `(thesis_id, week_of)` 配对 `human_baseline` 与 `ai_candidate` 的同窗口 resolved 结果，取简单平均（对照基线，§7.2）；无配对 → n=0。
- 不算 Deflated Sharpe、不算成本、不做行业基准（基准只有政策规定的 SPY）；这些在报表中显式标 `not_computed`。
- `renderArmMarkdown(summary)`：事实表格 + 固定说明「事实区；未接模型解释；样本不足时均值为 —」。
- 脚本 `scripts/arm-report.ts [--since YYYY-MM-DD] [--json]`。

## 测试

- `arm-report.test.ts`：分组、resolved 才计均值、averaged 配对（缺一臂不配、同周同 thesis 才配）、空输入、窗口缺失。
- `ledger.integration.test.ts`：迁移列存在且可重放；带 `observation_id` 的决定写入成功；他人/不存在的观察 → `scope_denied`；audit 含 observation_id。
- `arm-report-db.integration.test.ts`：合成决定 + 合成评价行，loader 取最新 revision 并按 since 过滤。
