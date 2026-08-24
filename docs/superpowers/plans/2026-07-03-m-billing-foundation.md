# M 计费地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans。Spec: `docs/superpowers/specs/2026-07-03-m-billing-foundation-design.md`（政策数字以 spec §0 为准）。

**Goal:** 用量流水 + 每日配额（free 3/5/2，pro ×10，admin 豁免，BYO 不计）+ 三消耗面拦截 + 引导 UX。

**Architecture:** `usage_events` 流水表（当日 count 即配额）；`src/lib/billing/quota.ts` 替换 entitlements stub（纯函数日界/限额 + store 风格 I/O）；`ResolvedLlm.source` 标记 BYO；三路由入口拦截各自的降级形状；`QuotaNotice` 统一引导卡。

**Tech Stack:** 既有 Supabase/RLS 模式（参照 src/lib/portfolio/store.ts）、vitest、ui primitives。

---

## File Structure

- Create: `supabase/migrations/20260703090000_usage_events.sql`（spec §1 原文 SQL + RLS：select own / insert with check auth.uid()=user_id）
- Modify: `src/lib/supabase/database.types.ts`（UsageEvent row + Tables 注册）
- Create: `src/lib/billing/quota.ts` + `quota.test.ts`；Delete: `src/lib/billing/entitlements.ts`（零消费者，grep 确认后删）
- Modify: `src/lib/llm/resolve.ts`（+`source: 'user' | 'env'`）+ `resolve.test.ts` 断言
- Modify: `src/app/api/copilot/route.ts`、`src/app/api/perspectives/[ticker]/route.ts`、`src/app/api/brief/preview/route.ts`
- Create: `src/app/api/usage/today/route.ts`
- Create: `src/components/QuotaNotice.tsx`；Modify: CopilotClient、个股页观点 tab 渲染处、简报预览消费处（BriefGlance 或预览页——grep 实际 fetch 方）、`src/components/AccountSettings.tsx` 或 settings 页（今日用量小节）

## Tasks

### Task 1: 迁移 + 类型

usage_events SQL 照 spec §1 逐字 + RLS 两条策略（policy 命名照 decision_layer 迁移风格）。types：`UsageEvent { id user_id feature ticker|null tokens_in tokens_out byo created_at }` + Tables 注册。Gates: tsc；**`supabase db push`（管道已通）**并 `supabase migration list` 确认 Local=Remote。
Commit: `feat(billing): usage_events ledger migration + types`

### Task 2: quota.ts (TDD) + resolve.source

**纯函数（先写测试 ≥8）：**
```ts
export function dayWindowUtc8(now: Date): { startIso: string; endIso: string }
// Asia/Shanghai 当日 [00:00, 24:00) 的 UTC ISO 区间；测跨界 23:59/00:01（构造 UTC 时刻断言归属日）
export type QuotaFeature = 'copilot' | 'perspectives' | 'brief_preview';
export function limitFor(feature: QuotaFeature, plan: string | null, role: string | null): number
// admin → -1(无限)；pro → base×10；free/null/未知 → base(3/5/2)
```
**I/O（store 模式，requireUser，coerce 不需要——count/int）：**
```ts
export async function checkQuota(feature): Promise<{ allowed; used; limit; plan }>
// profiles 读 plan/role → limitFor；-1 → allowed true used 0；否则 count usage_events
// where user_id+feature+created_at in dayWindowUtc8 且 byo=false
export async function recordUsage(feature, meta: { ticker?; tokensIn?; tokensOut?; byo: boolean }): Promise<void>
// insert；任何错误 console.warn 吞掉（记账失败不拦人）
```
resolve.ts：两个 return 各加 `source: 'user'`/`source: 'env'`；ResolvedLlm 接口加字段；resolve.test 补两断言。删除 entitlements.ts（先 grep 零引用）。
Gates: 红→绿、npm test、tsc。Commit: `feat(billing): quota engine (TDD) + ResolvedLlm.source flag`

### Task 3: 三路由拦截 + 记账

- **copilot**（读现文件再改）：`resolveLlm()` 后：`const byo = llm.source==='user'`；非 byo → `checkQuota('copilot')`，`!allowed` → 开流仅发 `{type:'error', message:'今日平台额度已用完', quota:{used,limit,plan}}` + `{type:'done'}` 后 close（error 事件形状向后兼容——旧客户端仍显示 message 红字，新客户端识别 quota 字段）。loop 正常完成后 `recordUsage('copilot', {ticker, byo})`（cron 不经此路由，无需豁免逻辑）。
- **perspectives**：入口 resolveLlm 判 byo → 非 byo checkQuota，超限 → 200 `{source:'quota', ticker, perspectives:[], quota}`（读现 no-key 响应形状对齐字段名）；成功路径末尾 recordUsage 带累计 tokens（路由已算 totalInput/Output）与 byo。
- **brief/preview**：入口同上，超限 429 `{error:'今日平台额度已用完', quota}`；成功 recordUsage('brief_preview',{byo})。**注意** cron daily-brief 不走此路由（各自独立 route）——grep 确认 preview 路由无 cron 复用后再动。
Gates: tsc + test + build。Commit: `feat(billing): quota intercepts on copilot/perspectives/brief-preview`

### Task 4: UX（QuotaNotice + 今日用量 + 三接入）

- `QuotaNotice.tsx`：props `{used, limit, plan, feature}`；Panel 风格卡：标题「今日平台额度已用完（used/limit）」，正文「填入自己的 API Key 即可不限量使用，或等待明日 00:00（北京时间）重置」，`<Link href="/settings">去设置 →</Link>`；plan==='pro' 文案「Pro 额度也用完了——BYO key 不限量」。
- `/api/usage/today`：GET → requireUser → 对三 feature 各 count（byo=false）+ byo 总数 → `{usage:{copilot:{used,limit},…}, byoCalls}`（limit 用 limitFor 同源）。
- 接入：CopilotClient error 事件含 `quota` → 渲染 `<QuotaNotice>`（读现 error 渲染处替换）；个股页观点 tab：响应 `source==='quota'` → QuotaNotice（读现 no-key 分支照样式加）；简报预览 fetch 方 429 → QuotaNotice；settings 页（AccountSettings 旁）「今日用量」三行 `used/limit` 文本 + BYO 计数（fetch /api/usage/today，limit -1 显示 ∞）。
Gates: tsc + test + build。Commit: `feat(billing): quota notice UX + today usage endpoint + settings section`

### Task 5: 终审 + 合并 + 上线动作

终审重点：日界正确性、BYO 全链路（resolve→route→record.byo）、copilot SSE 兼容、admin 豁免。合并 push 后：迁移已在 T1 push；提醒 owner 在 Supabase 控制台把自己 profile.role 设 'admin'。
