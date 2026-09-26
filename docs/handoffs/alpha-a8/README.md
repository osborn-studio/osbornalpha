# WP-A8 handoff — 变化卡生成器（2026-09-26）

范围：《实施总纲 2026-09-22》§7.1.2、§7.5、WP-A8。分支 `codex/wp-a8-change-cards`，基于 `main`。Spec：`docs/superpowers/specs/2026-09-26-change-cards-design.md`。

## 交付

- `src/lib/research/cards/`：`evidence.ts`（相关 / 首发 / 非转述 / 可外发 四重过滤，方向归类，独立来源 = 去重 (origin, host)，陌生来源 = 本周前未见的主机）、`select.ts`（≤4 evidence 卡 + 1 counter 卡：反证最多 → 陌生来源 → 无）、`generate.ts`（七字段 JSON、断言必须引用 source@version、无引用断言丢弃计数、空字段「待研究」、AX005/AX006 拦截 → `blocked`）、`run.ts`（`runCards`：台账走 S4 池，Source/thesis/卡走 Supabase；幂等；审计 `card.generate` / `cards.run`；`--dry-run` 不调模型不写库）。
- `axioms.ts`：`checkCardAxioms` + AX006「变化卡不得含买卖建议」（种子已加）。
- 迁移 `20260926120000_research_cards.sql`：唯一键 `(user_id, week_of, thesis_id, kind)`，owner RLS，jsonb 形状约束，owner 范围外键到 thesis。
- 脚本 `scripts/research-cards.ts [--week YYYY-MM-DD] [--dry-run]`（本地执行；台账池只接受本地库）。
- `GET /api/research/cards?week=`、页面 `/research/cards`（只读，按周分组；blocked 卡只显示拦截原因；断言链接 `/research/sources#src-<id>`，Sources 页行已加锚点）；导航加 `Cards`。

## 本地验收（不接触生产、不调外部模型）

`acceptance-2026-09-26.json`：隔离 PostgreSQL 17 + S4 运行时池读台账 + 本机 PostgREST 网关；一次性 owner；3 条 thesis、6 条合成 Source、一周合成台账；假 LLM。

| 步骤 | 结果 |
|---|---|
| dry-run | 选卡 3（2 evidence + 1 counter，原因 counter_evidence），有证据 thesis 2，私有材料排除 1，模型调用 0 |
| 第一次生成 | 写卡 3，blocked 0；每卡 2 字段「待研究」（受益/受损无断言 + 无引用断言被丢弃） |
| 第二次生成 | 写卡 0，跳过已存在 3（幂等） |
| 买卖建议卡 | 写卡 1，blocked 1（AX006） |
| 审计 | `cards.run` 3 条，`card.generate` 4 条 |

未进卡的合成材料：私有 Source（只计数）、`cluster_first=false` 的转载、上周材料（只贡献「熟悉主机」集合）。

## 已知限制

1. 生成模型为现有平台模型（DeepSeek）；卡片评审用另一家模型是 A9/B3 的事。
2. 不能上 Vercel cron：台账在 S4 池，`s4Pool` 只接受本地库，与 fan-out 一致；周五需本地运行脚本。
3. 支柱（A7 `pillars`）在提示词里按结构读取；A7（#54）合并后类型自动统一。
4. 独立来源按 (Q3 类别, 主机) 去重；无 URL 的 Source 主机为空，全部并入同一独立来源桶。
