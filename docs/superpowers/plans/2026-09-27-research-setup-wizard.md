# WP-A11 研究设置向导 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Alpha 提供 `/research/setup`：公司名单圈定与 thesis 引导式录入，每题带提示，写入权威表。

**Architecture:** 纯逻辑库（题目、校验、进度、草稿、映射）+ 两个小 API（entity-keys 列表/新增/修改）+ 三个客户端组件；thesis 走既有 API。

**Tech Stack:** Next.js App Router、React 客户端组件、vitest（node）、Playwright。

---

### Task 1: 纯逻辑库（RED → GREEN）

**Files:** `src/lib/research/setup/{questions.ts,companies.ts,theses.ts,progress.ts,draft.ts}`；测试 `src/lib/research/setup/setup.test.ts`

- [ ] 测试：题目定义完整（两条流程各题都有 `prompt/hint/example`）；thesis 表单逐题校验（标题长度、支柱 2–4、失效条件 1–3、公司 ≥1、日期格式）；`thesisFormToInput` 产出合法 `CreateThesisInput`；公司理由必填、候选外公司映射成合法 `CohortCompany`（`missing` 四键、`provenance.source = owner-input`）；进度计算（目标区间与警告）；草稿 round-trip 且拒绝坏版本。
- [ ] 运行 `npx vitest run src/lib/research/setup` → FAIL。
- [ ] 实现 → PASS。

### Task 2: entity-keys API（RED → GREEN）

**Files:** `src/lib/research/entity-keys/scope.ts`（`setScope`、`addOwnerCompany`）+ 测试；`src/app/api/research/entity-keys/route.ts`、`[entityId]/route.ts`

- [ ] 测试（用内存 supabase 替身，沿用 `store.test.ts` 的写法）：`setScope` 更新 `in_scope/cohort` 与 `research_entities.metadata.scope_rationale`；非法 entity → 404；`addOwnerCompany` 走 `upsertEntityKeys` 校验。
- [ ] 路由：GET 列表、POST 新增、PATCH 修改；错误经 `withResearch`。

### Task 3: 页面与入口

**Files:** `src/app/(app)/research/setup/{page.tsx,wizard.tsx,companies-flow.tsx,thesis-flow.tsx}`；修改 `src/app/(app)/research/page.tsx`

- [ ] 向导壳：进度条、单题卡、上一题/下一题/保存草稿、校验红字。
- [ ] 公司流程与 thesis 流程按 spec 题目渲染；提交调用 API；预览卡。
- [ ] 首页加「设置向导」卡（公司 n/12–15、thesis m/8–12）。
- [ ] `npm run typecheck`、`npm run lint`、`npm run build` 通过。

### Task 4: e2e 与文档

- [ ] `e2e/research-setup.spec.ts`（无凭据跳过）。
- [ ] `docs/research/setup-wizard.md`。
- [ ] 全量 `vitest run`；提交（显式路径）；`codex review --base origin/main` 直到无 P1/P2；PR；bind + monitor。
