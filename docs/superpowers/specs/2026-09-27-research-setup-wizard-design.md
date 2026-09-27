# WP-A11 研究设置向导 · 设计

日期：2026-09-27。来源：《实施总纲 2026-09-22》§8.6 阶段 0 非代码任务（圈定 12–15 家公司、写 8–12 条 thesis）、§13 候选名单、WP-A2 / WP-A7 数据表。用户已决定：入口放 Alpha `/research/setup`（Brain 只消费导出，不做第二权威）。分支 `codex/wp-a11-research-setup-wizard`，基于 `main`。常设授权下按默认方案执行。

## 背景

阶段 0 的两项人工任务至今没有输入界面：`/research/theses` 的表单要求把支柱写成 `文本 | 判定 | 日期` 的紧凑行，公司页只读，实体键只能靠脚本灌。用户要的是「固定网页入口 + 每题带提示的简答题」。WP-A2 已把 §13 的 21 家候选全部写进 `research_entity_keys`（`in_scope` 标记），所以「圈定」= 在 21 家里勾选并说明理由，外加少量候选外公司。

## 决定（默认）

1. **一个入口，两条流程**：`/research/setup` 顶部显示两张进度卡（公司 n/12–15、thesis m/8–12），各自进入向导；`/research` 首页加一张「设置向导」卡。
2. **每屏一题**：题目、灰色提示、范例、输入、校验红字；底部「上一题 / 下一题 / 保存草稿」。草稿存浏览器 `localStorage`（`research-setup-draft:v1`，只做续填便利），提交后落权威表。
3. **公司流程**
   - 第 1 屏：21 家候选按 A / HK / US 分组勾选（数据来自 `GET /api/research/entity-keys`），显示已 `in_scope` 的现状；另有「添加候选外公司」。
   - 每家一屏简答：为什么进名单（一句话，必填，≤200 字）；已知实体键（LEI / USCI / 巨潮 orgId / CIK，可留空，留空即进入 `missing`）；纠正名称/别名（可选）。
   - 候选外公司多问三题：中文名 / 英文名、主市场（A/HK/US）、主证券代码（如 `600570.SH` / `0268.HK` / `PLTR`）与上市日期（未知则填今天并标注 `provenance.source = owner-input`）。
   - 汇总屏：表格（名称、市场、代码、缺失键、理由），确认后逐家 `PATCH /api/research/entity-keys/{entity_id}`（`in_scope`、`cohort = "scope-YYYY-MM"`、理由写入 `research_entities.metadata.scope_rationale`）；候选外公司 `POST /api/research/entity-keys`（复用 `upsertEntityKeys` 与其校验）。目标区间外（<12 或 >15）只警告，不阻止。
4. **thesis 流程**（每条 8 题，全部映射到现有 `CreateThesisInput`，不改表）
   1. 一句话论点 → `title`（≤120 字，必填）
   2. 核心逻辑 → `body`（必填）
   3. 机会类型 → `opportunity_type`（B / C / other，单选，附一句解释）
   4. 关联公司 → `company_ids`（从 in_scope 名单多选，≥1）
   5. 支柱 2–4 条 → `pillars[]`：三个小框「可验证的陈述 / 用什么数据判定 / 何时能看到（可选日期）」
   6. 失效条件 1–3 条 → `invalidation_conditions[]`：句式提示「如果 ____ 发生，本 thesis 失效」
   7. 观察指标 ≥1 与催化剂 0–3 条 → `watch_metrics[]`、`catalysts[]`（事件 + 预计日期）
   8. 窗口与复核 → `horizon_weeks`（默认 4,13,26）、`next_review_at`（默认 4 周后）
   - 预览屏渲染 thesis 卡并列出缺项；「保存为草稿」调 `POST /api/research/theses`（DRAFT）；「保存并激活」再调 `POST /api/research/theses/{id}/transition {to:"ACTIVE", reason:"setup wizard"}`。A7 的守卫（无失效条件不允许存在）由现有 `createThesis` 执行，向导只做前置提示。
5. **纯逻辑独立成库**：题目定义、逐题校验、进度计算、草稿序列化、表单 → API 输入的映射放在 `src/lib/research/setup/`（node 环境可测），页面组件只做渲染与请求。
6. **权限**：沿用 `requireResearchUser()`（admin）。新 API 只写 `research_entity_keys` / `research_entities.metadata`，通过既有 `upsertEntityKeys` 校验；不加迁移、不改 S4 只读契约。`entity_table_version` 随之变化，这是预期行为（fan-out 快照会引用新版本）。

## 交付

- API：`GET/POST /api/research/entity-keys`、`PATCH /api/research/entity-keys/[entityId]`（`in_scope`、`cohort`、`scope_rationale`、可选 `names_zh/names_en/aliases/keys`）。
- 库：`src/lib/research/setup/{questions.ts,companies.ts,theses.ts,progress.ts,draft.ts}` + 单元测试。
- 页面：`src/app/(app)/research/setup/page.tsx`、`companies-flow.tsx`、`thesis-flow.tsx`、`wizard.tsx`；`/research` 首页卡片。
- e2e：`e2e/research-setup.spec.ts`（有凭据时跑：进入向导、看到两张进度卡与第一题；只读不提交）。
- 文档：本 spec、plan、`docs/research/setup-wizard.md` 使用说明。

## 非目标

- 不做多用户/审批；不改 thesis 状态机；不新增数据库列；不在 Brain 侧建任何录入。
- 不自动查外部实体键（GLEIF/SEC 仍由 `scripts/entity-keys/*` 脚本补，向导只留空并标 `missing`）。
