# Deal Memo（一级市场兼容 IC Memo）Implementation Plan

> Spec: `docs/research-os/2026-07-06-ic-memo-deal-variant-spec.md`（4 点已拍板：判别列/独立 deal 门/UI 估值一等露出/估值八字段结构化预留；一级市场优先，二级仅 crosscheck）。
> Research OS 在 stock-monitor 仓库、admin 门控、Supabase `research_*`。现有 §4.4 thesis memo **零改动**。教义移植自本地 osborn-skill-catalog `research/ic-memo`（只读）。

**Goal:** Research OS memo 引擎加 `memo_type='deal'` 类型——一级市场兼容的投委会上会报告：8 段叙事 + 结构化一级市场估值体系 + verdict/回报/退出，独立 deal 门。

**禁触:** KlineChart.tsx / composer.ts。分支 `feat/deal-memo`。

---

### T0: 迁移（判别列，coordinator 落生产）

**Files:** `supabase/migrations/20260706120000_deal_memo.sql`

```sql
alter table public.research_memos
  add column memo_type text not null default 'thesis' check (memo_type in ('thesis','deal')),
  add column deal_context text,
  add column sections jsonb not null default '[]',
  add column recommendation jsonb not null default '{}',
  add column valuation jsonb not null default '{}';
```
`supabase db push --yes`。thesis memo 现状不变（新列有默认）。

### T1: deal-memo-prompt.ts（纯函数 TDD）

**Files:** `src/lib/research/deal-memo-prompt.ts`（+test）、`src/lib/research/types.ts`

- types.ts 加：
  - `DealSection { id:string; title:string; body_md:string; tags:{facts:string[];assumptions:string[];inferences:string[]} }`
  - `DealValuation { valuation_basis:string[]; entry_valuation:{pre_money?:number|null;post_money?:number|null;ev?:number|null;equity_value?:number|null;per_share?:number|null;transaction_value?:number|null;currency?:string|null}; ownership_and_dilution:{stake_pct?:number|null;dilution?:string|null;swap_or_raise_note?:string|null}; return_profile:{irr?:number|null;moic?:number|null;payback?:string|null;scenarios?:{base?:string|null;upside?:string|null;downside?:string|null}}; exit_assumptions:{paths:Array<{type:string;window?:string|null}>}; sensitivity:Array<{variable:string;effect:string}>; valuation_risks:Array<{risk:string;mitigant:string}>; public_market_crosscheck:{applicable:boolean;comps:Array<{ticker?:string|null;name?:string|null;multiple?:string|null}>;note?:string|null} }`
  - `DealRecommendation { verdict:'invest'|'pass'|'conditional'; conditions:string[]; rationale:string }`
  - `DealMemoDraft { title:string; sections:DealSection[]; recommendation:DealRecommendation; valuation:DealValuation }`
- `DEAL_MEMO_SCHEMA`（导出常量字符串，注入 prompt——8 sections + recommendation + valuation 八字段的 JSON schema 说明）。
- `buildDealMemoPrompt({target, deal_context, sources}) → {system, user, source_document_ids}`：system 注入 ic-memo 8 段框架 + **一级市场估值体系逐字段要求**（能填则填、无依据置 null 或进段落"待核实"；deal_context 权威；二级市场仅 crosscheck 不覆盖一级逻辑；引用材料带来源；fact/assumption/inference 分级；人工门声明；估值不手算——引 DCF/可比）。user 注入 target/deal_context/材料清单。
- `validateDealMemoDraft(parsed) → DealMemoDraft`：强制 8 段存在（缺段补空壳）、recommendation.verdict 枚举校验、valuation 八字段结构补全（缺字段填空结构，值 null）。
- **纯函数 TDD**：schema 组装含估值八字段；validate 补全缺失段/估值结构；verdict 枚举拒非法值；一级市场估值口径在 prompt 文本中在场（断言关键词 pre_money/可比交易/退出倍数）。
- Commit: `feat(research): deal-memo prompt with primary-market valuation schema`

### T2: generateDealMemo 服务 + deal 门（TDD）

**Files:** `src/lib/research/deal-memos.ts`（+test）

- `class DealMemoError extends Error { status }`。
- `dealGate(draft) → { ok:boolean; missing:string[] }`：verdict 有 + return_profile 至少一项(irr/moic/payback/scenarios) + exit_assumptions.paths 至少一条。缺→missing 列出。**不套 thesis axiom**。
- `generateDealMemo(ctx, {target, deal_context?, entity_id?}) → { memo? , error? }`：
  1. 校验 target 1..100、deal_context ≤2000。
  2. sources：entity_id 给了 → `listSourcesForEntity`? **注意**：该函数 jsonb contains 在真库报错（见 diligence.ts 教训）——改用 `listSources` 全量 + JS 过滤 entity_ids.includes(entity_id)（或复用 diligence 的绕法）；否则 target 无材料也可生成（研究对象）。
  3. LLM（复用 memos.ts 的 llm 调用模式：`chat` + extractJson，provenance {model, prompt_sha256, generated_at, source_document_ids}）→ validateDealMemoDraft。
  4. dealGate：不通过 → 仍落库但 status 保持 DRAFT + recommendation.incomplete 标记？**决策**：落库 DRAFT（草稿允许不完整），门只在 review/导出时提示；生成阶段不 422（deal memo 是 AI 初稿，人工补全）。gate 结果进返回供 UI 提示。
  5. 落 research_memos：memo_type='deal', title, company_ids（entity_id 有则[entity_id]）, deal_context, sections, recommendation, valuation, llm_provenance, status='DRAFT'；thesis 列留默认空。
  6. audit('memo.generate_deal')。
- LLM 未配/失败 → 结构化 {error} 不崩（照 thesis memo）。
- **TDD（mock ctx + 注入 llmCall）**：完整 draft 落库形状（memo_type/sections/valuation 齐）；dealGate 三件齐/缺项；缺材料仍生成；LLM 失败结构化返回。
- Commit: `feat(research): generateDealMemo service + deal gate (verdict/return/exit)`

### T3: API

**Files:** `src/app/api/research/memos/generate-deal/route.ts`

- 照 generate/route.ts：`requireResearchUser` → 校验 target → `generateDealMemo` → 201（memo）/502（LLM 失败结构化）/400（校验）/403（非 admin）/MEMO_ERROR。
- Commit: `feat(research): POST /api/research/memos/generate-deal`

### T4: types 落库映射 + listMemos 分流

**Files:** `src/lib/research/types.ts`（InvestmentMemo 加 `memo_type?:'thesis'|'deal'; deal_context?:string|null; sections?:DealSection[]; recommendation?:DealRecommendation; valuation?:DealValuation`）、`src/lib/research/memos.ts`（rowToMemo 透传新列；listMemos/getMemo 带回）

- rowToMemo：`memo_type: row.memo_type ?? 'thesis'`，sections/recommendation/valuation 从 jsonb 透传（缺则空）。
- 现有 thesis memo 读取不受影响（新字段可选）。
- Commit: `feat(research): memo row mapping carries deal fields`

### T5: UI（Memos 页 tab + deal 渲染 + 估值一等卡）

**Files:** `src/app/(app)/research/memos/page.tsx`、`src/app/(app)/research/memos/[id]/page.tsx`

- 列表页：新建区 tab「论点 memo | 上会 deal memo」；deal tab = target + deal_context 输入 → POST generate-deal。列表项 memo_type='deal' 加「📋 上会」徽章。
- 详情页：memo_type='deal' 时渲染 8 段（body_md + fact/assumption/inference 分色）+ **recommendation 卡**：verdict 徽章(投/条件投/不投) + rationale + conditions。+ **估值一等卡**（spec §5）：valuation_basis 标签行、entry_valuation（pre/post-money·EV·equity·per-share·transaction·currency）、ownership_and_dilution、return_profile（IRR/MOIC/回收期 + base/upside/downside）、exit_assumptions（路径+时间窗）、sensitivity 表、valuation_risks（风险→缓释）、public_market_crosscheck（若 applicable，标"仅交叉验证 · 不覆盖一级逻辑"）。**空字段显式"待核实/未提供"不隐藏**。+ 人工门声明。导出 markdown 含 8 段+估值块+免责。
- research 命名空间 zh 硬编码沿用既有惯例（不强制 i18n，注明）。
- Commit: `feat(research): deal-memo tab + 8-section render + primary-market valuation card`

### T6: 终审 + 合并（coordinator）

- T0 迁移 `supabase db push --yes` 落生产确认。
- gates：tsc / npm test（528+新）/ build / e2e。
- 真跑云端冒烟（service-role 脚本）：generateDealMemo 一个测试 target（deepseek-v4-flash，若无 key 走结构化 no-key）→ 落库 memo_type='deal' + valuation 八字段结构齐 → 读回校验 → 清理测试行。
- 改动面审计（仅 research + memos，thesis memo 未回归）。
- merge main + push + 记忆更新。

**不做（YAGNI，spec §7）:** 自动 DCF/估值计算、IRR 计算器、outline.mjs 移植、deal memo→playbook、re-fund-ai 后端。估值八字段结构必须齐。
