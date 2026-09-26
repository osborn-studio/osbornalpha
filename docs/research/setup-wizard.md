# 研究设置向导 `/research/setup`（WP-A11）

阶段 0 两项人工输入的固定入口：圈定 12–15 家公司、录入 8–12 条 thesis。每题一屏，带提示与范例；随时中断，草稿留在本浏览器（`localStorage` 键 `research-setup-draft:v1`），提交后写入权威表。需要 admin 角色。

## 公司名单

| 步骤 | 做什么 | 写到哪里 |
|---|---|---|
| 勾选候选 | §13 的 21 家候选按市场分组，已在名单的带绿色标记；可添加候选外公司 | — |
| 每家一屏 | 一句理由（必填，≤200 字）；已知的 LEI / USCI / 巨潮 orgId / CIK（可留空）；名称纠正（可选） | `PATCH /api/research/entity-keys/{entity_id}` → `research_entity_keys.in_scope/cohort/keys/names`，理由写入 `research_entities.metadata.scope_rationale` |
| 候选外公司 | 中文名、英文名、主市场、主证券代码、上市日期（未知留空 = 今天，来源 `owner-input`） | `POST /api/research/entity-keys` → 复用 `upsertEntityKeys` 全套校验 |
| 汇总确认 | 表格 + 目标区间提醒（不阻止）；未勾选但当前在名单的公司以「本轮未入选」移出 | 如上 |

圈定后 `entity_table_version` 变化，是预期行为：fan-out 的快照会引用新版本。缺失的实体键仍由 `scripts/entity-keys/*` 从 GLEIF / SEC 补齐。

## thesis

八题依次对应 `CreateThesisInput`：论点（≤120 字）→ 核心逻辑 → 机会类型 → 关联公司（≥1，只能选 in_scope）→ 支柱 2–4 条（陈述 / 判定数据 / 日期）→ 失效条件 1–3 条 → 观察指标 ≥1 与催化剂 ≤3 → 窗口与复核日期。预览后「保存为草稿」（DRAFT）或「保存并激活」（再调 `transition` 到 ACTIVE）。A7 的守卫仍由服务端执行。

## 代码

- 题目与校验（纯函数，vitest）：`src/lib/research/setup/`
- 名单写路径：`src/lib/research/entity-keys/scope.ts`（`setScope`、`addOwnerCompany`）
- 页面：`src/app/(app)/research/setup/`
- e2e（有凭据时）：`e2e/research-setup.spec.ts`
