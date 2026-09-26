# 判断台账表实施计划（WP-A3） / Judgment Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落 `research_judgments` / `research_labels` / `research_decisions` / `research_outcomes` 四张只追加表，加内容寻址 id 生成器、写入函数与 `replayJudgments`。

**Architecture:** 一份可重放迁移沿 S4 加固模式建表；`src/lib/research/s4/ledger.ts` 走 `transaction()`（顾问锁 + admin 校验 + RLS 运行时角色）写表并记审计；纯函数 id 生成器与真库集成测试分开。规格：`docs/superpowers/specs/2026-09-26-judgment-ledger-design.md`。

**Tech Stack:** PostgreSQL 17（`scripts/s4/local-db.ts`，需 `LC_ALL=en_US.UTF-8`）、pg、vitest、`pa-v1/json.js` 的 `canonicalize/digest/fail`。

---

### Task 1: 纯函数 id 生成器（TDD）

**Files:** Create `src/lib/research/s4/ledger.ts`, Test `src/lib/research/s4/ledger.test.ts`

- [ ] 写失败测试：`judgmentId` 同输入同输出、字段顺序无关、任一字段变则 id 变、格式为 uuid 且第 3 组首位为 `8`；`snapshotId` 等于 `digest(snapshot)`，缺字段/非 uuid 抛 `invalid_schema`。
- [ ] `npx vitest run src/lib/research/s4/ledger.test.ts` → FAIL（模块不存在）。
- [ ] 实现 `snapshotId`、`judgmentId`（sha256 前 32 hex → 版本位 8、变体位 8–b）。
- [ ] 测试 PASS。提交 `feat(ledger): content-addressed judgment ids`。

### Task 2: 迁移与集成测试骨架

**Files:** Create `supabase/migrations/20260926000000_research_judgment_ledger.sql`, Test `src/lib/research/s4/ledger.integration.test.ts`

- [ ] 写失败测试：四表存在、RLS `relforcerowsecurity`、迁移重放无错、admin `update`/`delete` 四表被 `immutable_record` 拒绝。
- [ ] `LC_ALL=en_US.UTF-8 npx tsx scripts/s4/local-db.ts` 起库；`S4_TEST_STATE=… npx vitest run …ledger.integration` → FAIL（表不存在）。
- [ ] 按规格写迁移；对运行中库 `psql`/admin 执行迁移；测试 PASS。提交 `feat(ledger): append-only judgment ledger tables`。

### Task 3: recordJudgment / addLabel

- [ ] 写失败测试：首写 `{id, duplicate:false}`；同输入再写 `duplicate:true` 且行数不变；同 id 不同 `selected` → `idempotency_conflict`；他用户 `replayJudgments` 看不到；`addLabel` 引用不存在判断 → `scope_denied`；审计 `ledger.judgment`/`ledger.label` 各一条。
- [ ] FAIL → 实现 → PASS。提交 `feat(ledger): record judgments and labels`。

### Task 4: recordDecision / recordOutcome

- [ ] 写失败测试：合法 decision 落表；引用不存在/他人判断 → `scope_denied`；`human_baseline` 无 `frozen_at` → `invalid_schema`；非法 arm/action → `invalid_schema`；outcome 引用不存在决定 → `scope_denied`；合法 outcome 落表。
- [ ] FAIL → 实现 → PASS。提交 `feat(ledger): record decisions and outcomes`。

### Task 5: replayJudgments

- [ ] 写失败测试：两条 Source（`available_at` 分别为 T−2d、T+2d）各一判断；`replay(thesis, T)` 只含前者；`replay(thesis, T+3d)` 含两条且顺序按 `snapshot_id,…,id`；连续两次结果 `JSON.stringify` 相同；非法 `as_of` → `invalid_schema`。
- [ ] FAIL → 实现 → PASS。提交 `feat(ledger): deterministic replay filtered by availability`。

### Task 6: 全量验证与评审

- [ ] 新库 `S4_TEST_STATE=… npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] `codex review --base codex/wp-a1-source-extension`（中等）；修 P1/P2；补 mutation 检查。
- [ ] 推送分支，开 PR（base `codex/wp-a1-source-extension`）。
