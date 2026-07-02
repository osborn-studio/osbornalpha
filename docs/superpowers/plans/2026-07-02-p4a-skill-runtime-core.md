# P4a Skill Runtime 核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 技能运行时地基 + 归因闭环第一环：artifacts 存档、copilot 多方法（hiphon-pm-deepdive）、`record_decision`/`get_portfolio`/`save_artifact` 三个 agent 工具、技能库启动入口 + 研究档案。

**Architecture:** copilot 请求加 `methodId?`（默认 john-cameron-5step 不变）；registry 增加 `AGENT_METHODS: Record<id, AgentMethod>`；新工具的 handler **直接调用 store 函数**（不走内部 fetch——`getServerSupabase` 在路由执行上下文里带用户 cookie，天然过 RLS；现有工具走 `${origin}/api/...` 是因为那些路由无需登录）。deepdive 方法跑出 verdict 后由 route 服务端自动 `createArtifact` 存档。

**Verified facts:** AgentTool `{name, description, category, inputSchema, aShareOnly?, handler(args, ctx:{origin})}`；TOOLS→TOOL_DEFS/OPENAI_TOOL_DEFS 自动派生；copilot body `{ticker, question?}`；`METHODS[]` 是 UI 列表、`JOHN_CAMERON_5STEP: AgentMethod {id,name,description,steps,systemPrompt}`；artifacts 表已建零代码；CopilotClient 已有 initialTicker/autoStart props。

---

## File Structure

- Create: `src/lib/portfolio/artifacts-store.ts` — createArtifact / listArtifacts / getArtifact
- Create: `src/app/api/artifacts/route.ts`（GET list ?skill_id&ticker&limit / POST create）+ `src/app/api/artifacts/[id]/route.ts`（GET one）
- Create: `src/lib/agent/methods/hiphon-pm-deepdive.ts` — 第二个 AgentMethod
- Modify: `src/lib/agent/methods/registry.ts` — `AGENT_METHODS` map + METHODS 列表加 deepdive 条目（href `/copilot?method=hiphon-pm-deepdive`）
- Modify: `src/lib/agent/tools.ts` — 追加 record_decision / get_portfolio / save_artifact 三工具
- Modify: `src/app/api/copilot/route.ts` — methodId 解析 + deepdive 自动存档
- Modify: `src/app/(app)/copilot/CopilotClient.tsx` — 读 `?method=` 传给 POST；verdict 卡上「采纳→记录决策」按钮（POST /api/decisions，source_type:'copilot'，source_ref:{method, ticker, verdict 摘要}）
- Modify: `src/app/(app)/skills/page.tsx` — 「我的研究档案」区（GET /api/artifacts 列表 + 点击展开 markdown）

---

### Task 1: artifacts store + API

store 照 `src/lib/portfolio/store.ts` 模式（requireUser、`(supabase as any)` 写、错误 throw Error(message)；artifacts 无 numeric 列，无需 coerce）：
```ts
export async function createArtifact(input: { skill_id: string; ticker?: string | null; title: string; content_md: string; params?: Record<string, unknown> }): Promise<Artifact>
export async function listArtifacts(opts: { skill_id?: string; ticker?: string; limit?: number } = {}): Promise<Artifact[]>  // desc, default limit 50
export async function getArtifact(id: string): Promise<Artifact | null>
```
路由错误映射照 /api/decisions（401/500；POST 校验 title/content_md/skill_id 非空 + title≤200/content_md≤64KB → 400）。`dynamic='force-dynamic'`。
Gates: tsc + build。Commit: `feat(skills): artifacts store and API`

### Task 2: 三个 agent 工具 (TDD-able 部分：schema 快照测试跟随 tools.test.ts 现有模式)

追加到 TOOLS（category '研究'，全市场）：
- `record_decision`：desc 强调「须先向用户口头确认再调用」；inputSchema = ticker/action(buy|sell|trim|add|hold|pass)/thesis/confidence(0-100)/target_price/stop_loss（required: ticker, action, thesis）；handler → `parseDecisionInput({...args, market: classifyMarket(args.ticker), source_type:'copilot'})` → ok? `createDecision` : `{error}`。返回 `{ok:true, decision_id, summary}`。
- `get_portfolio`：无参；handler → `getPortfolio()` + `listDecisions({status:'open'})` → 返回 `{positions:[{ticker,shares,avg_cost,realized_pnl}], open_decisions:[{ticker,action,target_price,stop_loss,confidence}], totals}`（裁剪字段，防 token 浪费）。
- `save_artifact`：inputSchema skill_id/title/content_md/ticker?；handler → `createArtifact`。desc 说明「长报告完成后调用存档」。
注意：这三个 handler 直接 import store 函数（本文件将被 copilot 路由 server-side 执行）；`not authenticated` 异常会被 loop 的 runTool catch 包成 tool error 返回给模型——可接受。
更新 `src/lib/agent/tools.test.ts` 快照/计数断言（现 13 → 16 工具）。
Gates: npm test。Commit: `feat(agent): record_decision / get_portfolio / save_artifact tools`

### Task 3: deepdive 方法 + copilot methodId + 自动存档

- `hiphon-pm-deepdive.ts`：AgentMethod；steps = [解析与数据, 商业模式与护城河, 财务质量, 估值与链位, 催化与风险, 委员会结论]；systemPrompt 从 `skills/hiphon-pm-deepdive/SKILL.md` 的 doctrine 提炼（工具优先取数、九人观点必调 perspectives、结论含 rating/position_pct/entry_zone/stop/risks、最后输出 verdict JSON ```json 块 {rating, position_pct, entry_low, entry_high, stop_loss, confidence, summary}```；报告主体用 markdown 输出）。
- registry：`export const AGENT_METHODS: Record<string, AgentMethod> = { [JOHN_CAMERON_5STEP.id]: JOHN_CAMERON_5STEP, [HIPHON_PM_DEEPDIVE.id]: HIPHON_PM_DEEPDIVE }`；METHODS 加条目（icon '🔬', href '/copilot?method=hiphon-pm-deepdive'）。
- AgentMethod 接口加可选 `archive?: boolean`（deepdive 置 true；john-cameron 不动）。
- route：body 加 `methodId?`；`const method = AGENT_METHODS[methodId] ?? JOHN_CAMERON_5STEP`；steps 事件与 systemPrompt 用 method；**按方法标志自动存档**：在 onEvent 包装里累积 token 文本与 verdict；loop 结束后若 `method.archive` 且有实质内容（>200 字符）→ try `createArtifact({skill_id: method.id, ticker, title: `${ticker} ${method.name} ${date}`, content_md: 累积文本, params:{question, verdict}})` catch 忽略（存档失败不影响流）。P4b 的向导方法复用此标志。
- CopilotClient：`useSearchParams` 读 `?method=`（或加 prop）→ POST body 带 methodId；verdict 渲染处加「✅ 采纳 → 记录决策」按钮：POST /api/decisions `{ticker, market: classifyMarket, action: verdict.rating 映射(buy/hold/sell…；无法映射默认 'hold'), thesis: verdict.summary?.slice(0,200), confidence: verdict.confidence, target_price/stop_loss/entry_low/entry_high 从 verdict, source_type:'copilot', source_ref:{method: methodId, run_at}}` → 成功显示「已记录 ✓」。
Gates: tsc + build + test。Commit: `feat(copilot): multi-method support, deepdive method, verdict adoption + auto-archive`

### Task 4: 技能库页 + 档案

`/skills` 页：方法卡片区保持（现在两张卡，deepdive 卡带「启动」→ href）；下方新增「📁 我的研究档案」：GET /api/artifacts（limit 20），列表行 = created_at/skill_id/ticker/title，点击行内展开 `content_md`（pre-wrap 或轻 markdown：直接 `<pre className="whitespace-pre-wrap">` 即可，不引 markdown 库）。空态文案。
Gates: tsc + build + test。Commit: `feat(skills): method launcher + research artifact archive`

### Task 5: 验证 + 合并

/skills 与 /copilot?method= 在 auth 墙内——build+tests 为门禁，生产验收：跑一次 deepdive → 档案出现在 /skills → verdict 点采纳 → /portfolio/decisions 出现 source=copilot 的决策。
