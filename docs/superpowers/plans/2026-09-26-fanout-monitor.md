# fan-out 监控实施计划（WP-A6） / Fan-out Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新模块 `src/lib/research/fanout/` 让每条新 Source × 活跃 thesis 由 rule / llm_deepseek / jev 三后端并行作答并写入判断台账，带弃权带、升级、预算硬停与冻结集报告；不改 thesis 状态。

**Architecture:** 纯函数（问题集、rule 后端、解析、预算、报告统计）与 I/O（deepseek 调用、jev HTTP、run 编排写台账）分层；所有外部调用可注入；台账写入复用 A3 `recordJudgment`。规格：`docs/superpowers/specs/2026-09-26-fanout-monitor-design.md`。

**Tech Stack:** TypeScript、vitest、pg（S4 `transaction`）、Supabase JS（读 Source/thesis/实体）、fetch（Jev HTTP）。

---

### Task 1 问题集与弃权判定（TDD）
Create `src/lib/research/fanout/questions.ts`, Test `questions.test.ts`
- [ ] 失败测试：`QUESTIONS.Q2.options` 精确；`decide('Q1',{true:0.5,false:0.5},null)` → abstained；`decide('Q2',dist,0.55)` → abstained；`decide('Q3',dist,0.4)` → selected `unknown`；`decide('Q4',dist,0.3)` → `not_applicable`；`decide('Q1',{true:0.9,false:0.1},null)` → selected `true`。
- [ ] RED → 实现 → GREEN → 提交。

### Task 2 rule 后端（TDD）
Create `backends/types.ts`, `backends/rule.ts`, Test `rule.test.ts`
- [ ] 失败测试：含别名"恒生电子"与失效条件片段的 NEWS → Q1 P(true) ≥0.65、Q2 `trigger_invalidation`、Q3 `analyst_or_media`（域名 news.example）、Q4 由词表；sec.gov FILING → Q3 `filing_or_regulator`；无命中 → Q1 0.05；同输入两次结果相同；`backend_model==='rules-v1'`。
- [ ] RED → 实现 → GREEN → 提交。

### Task 3 deepseek 后端（TDD）
Create `backends/deepseek.ts`, Test `deepseek.test.ts`
- [ ] 失败测试：注入 `LlmFn` 返回合法 JSON → 每 thesis Q1/Q2/Q4 + Q3；返回缺 thesis → 该 thesis 全部弃权；概率和 1.3 → 弃权；非 JSON → 全部弃权且 `skipped` 未设置；prompt 含材料截断标记；`prompt_sha256` 为 64 hex 且同输入稳定；`LlmFn` 抛错 → `skipped:'error'`。
- [ ] RED → 实现 → GREEN → 提交。

### Task 4 jev 后端（TDD）
Create `backends/jev.ts`, Test `jev.test.ts`
- [ ] 失败测试：`createJevBackend({apiKey:undefined,fetch})` → `skipped:'disabled'`，fetch 零调用；有 key → fetch 一次，URL/Bearer/`model:'jev-1.13.0'`/questions 键集合精确；夹具响应映射（Noul 0.5 → 弃权；Choice confidence 0.55 → Q2 弃权；Q3 一次复制到每 thesis；`input_token_count` 来自 usage；cost = tokens×单价）；HTTP 500 → `skipped:'error'`；响应缺 `answers` → error。
- [ ] RED → 实现 → GREEN → 提交。

### Task 5 预算与报告纯函数（TDD）
Create `budget.ts`, `report.ts`, Tests `budget.test.ts`, `report.test.ts`
- [ ] 失败测试：`budgetState(4_999_999, 5_000_000).stopped===false`、`budgetState(5_000_000,…).stopped===true`；`microsForTokens(1000, 45)===45`；`summarize(rows)` 的 accuracy/abstain_rate/ece/p50/p95/cost_per_1k/Q3 去重。
- [ ] RED → 实现 → GREEN → 提交。

### Task 6 run 编排（真库集成）
Create `run.ts`, Test `run.integration.test.ts`
- [ ] 失败测试（规格"测试"节六个断言：三后端写入、私有零外发、幂等、thesis_events 不变、预算硬停、jev_escalated）。
- [ ] RED → 实现（snapshot、thesis_version、entity_table_version、并行后端、recordJudgment、审计、RunSummary）→ GREEN → 提交。

### Task 7 脚本与 smoke
Create `scripts/research-fanout.ts`, `scripts/fanout-report.ts`
- [ ] 参数解析 + 调用 + 打印 RunSummary/报告；若 `TYPESAFE_API_KEY` 存在，本地库 smoke 一次并写 `docs/handoffs/alpha-a6/smoke-<date>.json`（无密钥）。
- [ ] 提交。

### Task 8 全量验证与评审
- [ ] 新库 `S4_TEST_STATE=… npm test`、typecheck、lint、build；`codex review --base origin/codex/wp-a3-judgment-ledger`（中等）；修 P1/P2；推送；开 PR（base `codex/wp-a3-judgment-ledger`）。
