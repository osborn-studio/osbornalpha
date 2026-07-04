# Research OS Phase 3：Playbook Runner + 人工审批 Implementation Plan

> Spec: `docs/research-os/product-technical-spec.md` §3.4/§4.6/§4.7/§10 Phase 3。Phase 1+2 已上线（main=cc315be，466 测试，schema v2）。

**Goal:** 把 memo/thesis 转成可审计行动：LLM 建议动作 → axiom 门（无失效条件不得入场）→ 风险分级 → 高风险动作强制人工审批 → 批准后执行受限效果（thesis 转移复用守卫）→ 全程 audit。**验收线（spec §10）**：没有失效条件的 thesis 不能进入 playbook；所有高风险动作需要人工审批。

**Architecture:** 沿既有全部约定（门控/懒加载/:memory: 测试/audit/provenance/免责声明）。playbook_runs 表 Phase 1 已建（proposed_action 五枚举 + approval_status 四态），无需迁移。风险策略与审批规则=数据驱动常量表（纯函数可测），不散落在路由里。

**Branch:** `feat/research-os-phase3`。禁触 KlineChart.tsx / composer.ts；不碰 SaaS 文件。

---

### T1: Playbook 服务 + 风险策略 + axiom 门（TDD）

**Files:** `src/lib/research/playbooks.ts`（+test）

- 风险策略表：`const ACTION_POLICY: Record<ProposedAction, {approval: 'REQUIRED'|'NOT_REQUIRED'}> = { PAPER_TRADE:{REQUIRED}, CLOSE_THESIS:{REQUIRED}, UPDATE_THESIS:{NOT_REQUIRED}, WATCHLIST:{NOT_REQUIRED}, RESEARCH_MORE:{NOT_REQUIRED} }`——高风险=纸面交易与关闭 thesis。
- `checkPlaybookAxioms(input, sourceObj, axioms) → AxiomCheckResult[]` 纯函数：AX001 源 memo/thesis 无 invalidation_conditions → BLOCK（**spec 验收线 1**）；AX003 源是 memo 且无反方观点、动作需审批 → BLOCK；AX005 rationale 含"必涨|保证|稳赚|无风险" → BLOCK。复用 axioms 表种子（Phase 1），按 rule.applies_to 或 code 白名单适配 playbook 语境（实现从简：按 code 硬映射，注释说明）。
- `createPlaybookRun(db, input)`：校验（memo_id/thesis_id 二选一且存在、action 枚举、rationale 非空、risks≥1）→ 跑 axiom 门（BLOCK 存在 → 抛 `AxiomBlocked`，API 转 422，**不落库**）→ approval_status 按策略表（REQUIRED→PENDING，否则 NOT_REQUIRED）→ 落库 + audit_log('playbook.create')。
- `approvePlaybook(db, id, {decision, reviewAt?})` / `rejectPlaybook(db, id, {decision})`：仅 PENDING 可批/驳（否则 422）；写 human_decision/review_at + audit_log('playbook.approve'|'playbook.reject')。
- **批准后的受限执行**（`executeApproved`，approve 内联调用）：UPDATE_THESIS→无自动效果（记录意图，用户手工改）；CLOSE_THESIS→`transitionThesis(...,'CLOSED', reason=playbook)` 复用 Phase 2 守卫（非法转移=执行失败落 audit，playbook 仍 APPROVED 但 detail 记 execution_error）；PAPER_TRADE/WATCHLIST/RESEARCH_MORE→仅留痕（无交易表=MVP 有意，注释+报告说明）。**任何路径都不接真实交易**。
- TDD：策略表每动作审批归属；axiom 门三规则通过/拦截各例；PENDING 状态机（重复 approve、REJECTED 后 approve 均 422）；CLOSE_THESIS 执行成功与守卫拒绝两例。
- Commit: `feat(research): playbook service with risk policy + axiom gate`

### T2: LLM 动作建议器（TDD）

**Files:** `src/lib/research/playbook-prompt.ts`（+test）、`playbooks.ts` 追加

- `buildPlaybookSuggestPrompt(sourceObj, recentSignals, axioms)` 纯函数（TDD）：注入 memo/thesis 全文 + 近 7 天相关 signals + 五公理文本；要求输出 {proposed_action∈五枚举, rationale, risks[]≥2, confidence_note}；明示"不确定时选 RESEARCH_MORE；禁止任何真实交易措辞；这是研究辅助非投资建议"。
- `suggestPlaybookAction(db, {memo_id?|thesis_id?})`：LLM → 枚举校验（非法 action → 降级 RESEARCH_MORE 并记 metadata）→ 返回建议（**不落库**，由用户在 UI 编辑后走 create）+ provenance。audit_log('playbook.suggest')。
- Commit: `feat(research): llm playbook action suggester`

### T3: API + 页面 + Dashboard

**Files:** `src/app/api/research/playbooks/route.ts`（GET 列表/POST 创建）、`suggest/route.ts`、`[id]/route.ts`、`[id]/approve/route.ts`、`[id]/reject/route.ts`、`src/app/(app)/research/playbooks/page.tsx`、layout/dashboard 修改

- 页面 /research/playbooks 三区：①发起（下拉选 thesis（ACTIVE/WATCH/AT_RISK）或 REVIEWED memo →"🤖 生成建议"→ 可编辑表单（action 下拉/rationale/risks 多行）→ 创建；axiom 422 时红条显示违规项）；②待审批（PENDING 列表：来源摘要+rationale+risks+axiom 结果 → ✅ 批准（decision 必填）/ ❌ 驳回）；③历史（状态徽章+human_decision+时间线）。页脚免责声明。
- layout 导航 Playbooks 从灰置转正；dashboard 加"📋 待审批 playbook"卡（计数+最近 3 条链接）。
- Commit: `feat(research): playbook api + review ui + dashboard card`

### T4: 终审 + 验收（coordinator）

- 真跑：对现存 WATCH thesis "NVIDIA 推理需求可持续增长" suggest（真 DeepSeek）→ create（若建议 PAPER_TRADE 应 PENDING）→ approve 带 decision → 验证 audit 链；再造一条**无失效条件的 thesis 走 create 必须 422 AXIOM_BLOCKED**（spec 验收线 1 实证）；REJECTED 路径一例。
- gates：tsc / npm test（466+新）/ build（无门控）/ e2e 10+1。
- merge main + push + 记忆更新（Phase 3 完成，Phase 4 Eval 待）。

**不做（YAGNI）:** 纸面交易台账表与损益跟踪（Phase 4 后再议）；playbook→memo 反向生成；审批多级流；通知推送。
