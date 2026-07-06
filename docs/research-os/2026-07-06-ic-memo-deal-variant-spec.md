# Deal Memo / IC Memo（一级市场兼容的投委会上会报告）轻量 Spec

> 用户决策（2026-07-06）：deal memo = **一级市场兼容的投委会上会报告**，服务 PE / 并购 / 融资 / Pre-IPO 场景，**一级市场估值体系是一等公民**。作 Research OS memo 引擎的独立 memo 类型（现有 §4.4 二级市场 thesis memo 零改动）。
> 本期可不接自动估值模型、不算复杂 IRR，但 **schema / prompt / UI 必须结构化承载一级市场估值概念，避免后续重构**。教义移植自 osborn-skill-catalog `research/ic-memo`（只读本地 catalog，不调 osbornhub API），并扩展一级市场估值结构。

## 0. 定性

- **deal memo = 推荐文档（有 verdict）**，与 company-diligence（无判断简报）相反；也不同于 thesis memo（二级市场论点）。它是**一级市场 deal 的上会材料**：投/不投/有条件投 + 一级市场估值体系 + 回报 + 退出。
- 8 段叙事框架（移植自 ic-memo section-framework）：项目概述与交易标的 / 交易结构与条款 / 行业与市场 / 标的公司 / 财务表现与估值 / 投资亮点与协同 / 风险与缓释 / **投资建议+回报测算+退出路径**。
- 铁律：尊重给定条款（deal_context 权威，公开研究只补充）、引用材料带来源、fact/assumption/inference 分级、估值不手算（引 DCF 等）、人工门（"AI 初稿，关键数据/估值人工复核后用于投委会决策"）。
- **一级市场优先，二级市场只做交叉验证**：若标的为上市公司或有可比上市公司，用二级市场做 crosscheck，但**不得让二级市场价格逻辑覆盖一级市场估值逻辑**（pre/post-money、稀释、退出倍数才是主轴）。

## 1. 一级市场估值体系（本 spec 的核心，必须结构化承载）

deal memo 带一个结构化 `valuation` 对象，八个概念位置必须存在（值可空/待核实，结构不可缺）：

| 字段 | 含义 | 结构 |
|---|---|---|
| `valuation_basis` | 估值依据（可多选） | `string[]`：DCF / 可比公司 / 可比交易 / 资产法 / SOTP / 收入倍数 / EBITDA 倍数 … |
| `entry_valuation` | 进入估值 | `{ pre_money?, post_money?, ev?, equity_value?, per_share?, transaction_value?, currency? }`（全可空） |
| `ownership_and_dilution` | 持股与稀释 | `{ stake_pct?, dilution?, swap_or_raise_note? }`（换股/增资影响） |
| `return_profile` | 回报画像 | `{ irr?, moic?, payback?, scenarios?: { base?, upside?, downside? } }` |
| `exit_assumptions` | 退出假设 | `{ paths?: [{ type: 'IPO'|'并购转让'|'回购'|'二级转让'|string, window? }] }` |
| `sensitivity` | 敏感性 | `[{ variable, effect }]`：收入增长 / 利润率 / 退出倍数 / 折现率 / 终值倍数 … |
| `valuation_risks` | 估值风险 | `[{ risk, mitigant }]` |
| `public_market_crosscheck` | 二级交叉验证 | `{ applicable?: bool, comps?: [{ ticker?, name?, multiple? }], note? }`——**校验非主轴** |

本期：prompt 要求 LLM 尽量填、无依据置 null 或进 `待核实`，**不自动接 DCF 引擎**；但类型/列/UI 全就位。

## 2. 存储（research_memos 加判别列，不建新表）

迁移 `20260706xxxxxx_deal_memo.sql`——research_memos 加：
- `memo_type text not null default 'thesis' check (memo_type in ('thesis','deal'))`——thesis 现状不变。
- `deal_context text`——用户给定交易条款（≤2000 字，权威）。
- `sections jsonb not null default '[]'`——8 段叙事：`[{ id, title, body_md, tags:{facts[],assumptions[],inferences[]} }]`。
- `recommendation jsonb not null default '{}'`——决策：`{ verdict:'invest'|'pass'|'conditional', conditions?:[], rationale? }`。
- `valuation jsonb not null default '{}'`——§1 的一级市场估值体系（八字段）。
- thesis 专属列（one_line_conclusion/thesis/supporting_evidence…）对 deal memo 留空，反之亦然。`supabase db push`。

## 3. 生成（新 prompt + 新 generate 路径，不改 thesis）

- 新 `src/lib/research/deal-memo-prompt.ts`（纯函数 TDD）：`DEAL_MEMO_SCHEMA`（8 sections + recommendation + valuation 八字段）+ `buildDealMemoPrompt({target, deal_context?, sources})`——注入 8 段框架 + 一级市场估值体系要求（逐字段填/置空规则、二级仅 crosscheck）+ 材料清单。
- 新 `generateDealMemo(ctx, {target, deal_context?, entity_id?})`：
  1. 给 entity_id → 取其 sources 作材料（**吃 company-diligence 存进研究脑的尽调 source**——闭环复用）；否则 target 作研究对象、可选 search 解析。
  2. LLM → 校验 → 落 research_memos(memo_type='deal', sections, recommendation, valuation, deal_context, llm_provenance, status='DRAFT')。
  3. audit('memo.generate_deal')。
- **deal 专属门**（不套 thesis axiom）：verdict + return_profile（至少一项 IRR/MOIC/回收期或情景）+ exit_assumptions（至少一条路径）三件齐，缺则 422/标 incomplete（"Section 8 是灵魂"）。valuation 八字段结构必须完整（值可空）。

## 4. API

- `POST /api/research/memos/generate-deal`（admin 门）：body `{target, deal_context?, entity_id?}`。校验 target 1..100 字、deal_context ≤2000 字。
- 现有 `/api/research/memos/generate`(thesis) 不动。listMemos 返回带 memo_type，前端据此分流。

## 5. UI（Research OS Memos 页）

- 新建区 tab 切换：thesis memo（现状）| **deal memo**（target + deal_context 输入 → 生成）。
- 列表：memo_type='deal' 加「📋 上会」徽章。
- deal memo 详情：8 段（body_md + fact/assumption/inference）+ **recommendation 卡**——verdict 徽章 + **一级市场估值口径一等露出**：valuation_basis 标签、entry_valuation（pre/post-money·EV·per-share）、ownership_and_dilution、return_profile（IRR/MOIC/回收期·base/upside/downside）、exit_assumptions、sensitivity、valuation_risks、public_market_crosscheck（若适用，标注"仅交叉验证"）。空字段显式显示"待核实/未提供"而非隐藏（结构可见）。+ 人工门声明。
- 导出 markdown：8 段 + 估值体系块 + 免责。

## 6. 与现有闭环协同（复用，不额外做）

- deal memo 的 entity_id 天然吃 company-diligence 存脑的尽调 source →**个股页跑尽调→存脑→生成上会报告**一条线，零新代码。
- 估值段引 DCF：本期 prompt 要求引用/留结构位，**不自动接线**（用户明确）。

## 7. 明确不做（YAGNI）

- 不改 thesis memo；不建独立 deal memo 表；不接自动 DCF/估值模型计算；不做 IRR/终值计算器；不移植 ic-memo-outline.mjs（prompt 内联 8 段）；不做 deal memo→playbook 自动接线；不接 re-fund-ai 后端。**但估值八字段结构必须齐**（避免重构）。

---
本 spec 已按用户 4 点拍板定稿（判别列/独立 deal 门/UI 含估值一等露出/估值结构化预留）。下一步：writing-plans 出实施计划。
