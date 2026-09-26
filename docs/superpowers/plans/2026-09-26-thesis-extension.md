# WP-A7 Thesis 扩展实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落地 spec `2026-09-26-thesis-extension-design.md`：§5.3 字段、supersede、失效条件修订、季度计数、UI、A6 版本兼容、S4 observation 不受影响的证明。

**Architecture:** 迁移加列 + 类型扩展 + `theses.ts` 两个新动作 + 两个 API 路由 + 两页 UI 改动；纯函数季度计数；真库集成测试证明与 S4 解耦。

**Tech Stack:** Next.js 15 / TypeScript / vitest / Supabase mock (`test-support.ts`) / 隔离 PostgreSQL 17（`scripts/s4/local-db.ts`）。

---

### Task 1 类型 + 迁移 + 真库测试 — RED → GREEN → 提交
- [ ] `types.ts`：`OpportunityType`、`ThesisPillar`、`ThesisCatalyst`、`KillConditionRevision`、`Thesis` 新字段、`ThesisEventType` 加 `KILL_CONDITION_REVISED`
- [ ] `src/lib/research/thesis-extension.integration.test.ts`（列、约束、自引用外键、事件 kind、可重放、observation 不受影响、无触发器）→ 先 RED
- [ ] 迁移 `20260926110000_research_thesis_extension.sql` → GREEN
- [ ] 提交 `feat(thesis): §5.3 columns, supersedes FK and KILL_CONDITION_REVISED event kind`

### Task 2 `theses.ts`：创建校验 + rowToThesis 默认 — RED → GREEN → 提交
- [ ] `theses.test.ts` 新增：默认值、非法 opportunity_type/horizon_weeks/pillar 422、T3 允许表不变、transitionThesis 只写三表
- [ ] 实现 → 提交 `feat(thesis): validate and persist opportunity type, pillars, catalysts and horizons`

### Task 3 supersede + reviseKillCondition + 季度计数 — RED → GREEN → 提交
- [ ] 测试：状态门、不继承、NOTE 事件、审计；修订越界/空/相同 422、原版保留、事件、审计；`killConditionRevisionsInQuarter` 与 >2 标记
- [ ] 实现 → 提交 `feat(thesis): supersede path and kill-condition revision with quarterly review flag`

### Task 4 API 路由 + fan-out 版本 — 提交
- [ ] `[id]/supersede/route.ts`、`[id]/kill-condition/route.ts`、`[id]/route.ts` 增加 `review`
- [ ] `fanout/run.ts` `thesisVersion` 含 pillars/opportunity_type；`run.test.ts` 断言
- [ ] 提交 `feat(thesis): supersede and kill-condition API routes; fan-out version covers pillars`

### Task 5 UI — 提交
- [ ] 列表页表单新字段；详情页新区块、取代表单、修订入口、季度标记
- [ ] 提交 `feat(thesis): UI for pillars, catalysts, supersede and kill-condition revision`

### Task 6 全量验证、Codex 评审、PR（base `main`）
- [ ] 新库 `S4_TEST_STATE` 全量测试；typecheck；lint；build
- [ ] `codex review --base origin/main`；修 P1/P2；push；PR；bind + Auto-fix（待用户授权）
