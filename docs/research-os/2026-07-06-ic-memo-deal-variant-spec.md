# IC-Memo Deal-Memo 变体 轻量 Spec

> 用户决策（2026-07-06）：全量 deal memo 变体——照搬 osborn-skill-catalog `research/ic-memo` 完整 8 段框架（含交易结构/对价/退出）作 Research OS memo 引擎的**独立 memo 类型**，为将来 PE/并购/一级市场角度铺路（与 re-fund-ai 交叉）。
> 现有 memo 引擎=source 驱动的 §4.4 十段 thesis memo（二级市场论点）。deal memo 是另一种类型，不改现有 thesis memo 行为。

## 0. 定性

- **ic-memo = 推荐文档（有 verdict）**，与 company-diligence（无判断简报）相反。8 段：项目概述/交易结构条款/行业/标的公司/财务估值/投资亮点协同/风险缓释/**投资建议+回报测算(IRR/MOIC/回收期)+退出路径**。第 8 段是灵魂——无 verdict+回报+退出不成 memo。
- 教义移植自 catalog `research/ic-memo`（references/section-framework.md），模式同 company-diligence/industry-chain 的"SKILL.md→prompt"。**只读本地 catalog，不调 osbornhub API**。
- 铁律带过来：尊重给定 deal 条款(deal_context 权威，公开研究只补充)、引用材料带来源、fact/assumption/inference 分级、估值不手算(引 DCF)、人工门("AI 初稿，投委会前人工复核")。

## 1. 存储（research_memos 加判别列，不建新表）

迁移 `20260706xxxxxx_deal_memo.sql`——research_memos 加：
- `memo_type text not null default 'thesis' check (memo_type in ('thesis','deal'))`——thesis 现状不变。
- `deal_context text`——用户给定交易条款(≤2000 字)。
- `sections jsonb not null default '[]'`——deal memo 的 8 段内容：`[{id, title, body_md, tags:{facts[],assumptions[],inferences[]}}]`。
- `recommendation jsonb not null default '{}'`——第 8 段结构化：`{ verdict:'invest'|'pass'|'conditional', return_math:{irr?,moic?,payback?,scenarios?}, exit:{path?, window?}, conditions?:[] }`。
- thesis 专属列(one_line_conclusion/thesis/supporting_evidence/…)对 deal memo 留空；deal 列对 thesis memo 留空。`supabase db push`。

## 2. 生成（新 prompt + 新 generate 路径，复用不改 thesis）

- 新 `src/lib/research/deal-memo-prompt.ts`（纯函数，TDD）：`DEAL_MEMO_SCHEMA`(8 sections + recommendation JSON) + `buildDealMemoPrompt({target, deal_context?, sources})` 注入 ic-memo 8 段框架 + 材料清单。
- 新 `generateDealMemo(ctx, {target, deal_context?, entity_id?})`（memos.ts 追加或 deal-memos.ts）：
  1. 若给 entity_id → 取其 sources 作材料（**能吃 company-diligence 存进来的尽调 source**——闭环复用）；否则 target 作研究对象、可选 search 解析。
  2. LLM → 校验（8 段齐全 + recommendation.verdict 必填，缺则 `DealMemoError` 或标 incomplete）→ 落 research_memos(memo_type='deal', sections, recommendation, deal_context, llm_provenance, status='DRAFT')。
  3. audit('memo.generate_deal')。
- **deal 专属门**：第 8 段无 verdict → 拒绝(422)或标记不完整（"Section 8 is the point"）。thesis axiom 门不套用 deal（结构不同）；deal 门=verdict+回报+退出三件齐。

## 3. API

- `POST /api/research/memos/generate-deal`（admin 门）：body `{target, deal_context?, entity_id?}` → generateDealMemo。校验 target 1..100 字、deal_context ≤2000 字。
- 现有 `/api/research/memos/generate`(thesis) 不动。listMemos 返回带 memo_type，前端据此分流渲染。

## 4. UI（Research OS Memos 页）

- 新建区加 tab/切换：thesis memo(现状) | **deal memo**(target + deal_context 输入 → 生成)。
- 列表：memo_type='deal' 加「📋 上会」徽章。
- deal memo 详情：渲染 8 段(body_md + fact/assumption/inference)+ recommendation 卡(verdict 徽章 + IRR/MOIC/回收期 + 退出路径)+ 人工门声明。
- 导出 markdown 带 8 段 + 免责。

## 5. 与现有闭环的协同（顺带确认，不额外做）

- deal memo 的 entity_id 输入天然吃 company-diligence 存进研究脑的尽调 source → **个股页跑尽调→存脑→生成 deal memo** 一条线（复用已有闭环，无新代码）。
- deal memo 的估值段引 DCF（现有 copilot dcf 方法/工具），不手算。本期 prompt 里要求引用，不做自动接线。

## 6. 明确不做（YAGNI）

- 不改 thesis memo 任何行为；不建独立 deal memo 表；不做 deal memo→playbook 自动接线；不做 ic-memo-outline.mjs 确定性脚手架移植(prompt 内联 8 段即可)；不做多币种/复杂 IRR 计算器(LLM 出数+人工复核声明)；不接 re-fund-ai 后端。

---
**审阅点**：① research_memos 加 memo_type+sections+recommendation+deal_context 判别列 vs 新建 research_deal_memos 表——选哪个(spec 默认前者)？② deal 门=verdict+回报+退出三件齐、不套 thesis axiom——可以吗？③ 本期 UI 就做 Memos 页 tab 切换+8 段渲染+recommendation 卡，够吗？④ 估值段本期只在 prompt 要求"引 DCF"、不自动接线——可以吗？
