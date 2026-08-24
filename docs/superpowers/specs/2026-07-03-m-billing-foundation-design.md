# M 计费地基（用量计量 + 配额 + 注册政策）— 设计文档

**日期**: 2026-07-03　**状态**: 已获用户逐节批准（§1–§6）
**背景**: 长期目标=多用户付费成熟产品。现状审计：注册全开放、AI 功能全部烧平台 key、entitlements 是零消费 stub、用量不落库——零门禁。
**本期范围**: M1 计量+配额 与 M2 注册政策 合并一期。M3 支付（Stripe/国内渠道）明确不在本期。

## 0. 已确认政策决策

| 决策 | 结论 |
|---|---|
| 注册政策 | **保持开放注册**（OAuth 已通），配额兜底；不做邀请码/等候名单 |
| 免费档额度（每日，UTC+8 日界） | copilot 类 **3** 次 · 九人观点 **5** 标的 · 简报预览 **2** 次 |
| Pro 档（本期仅后台手动赋予） | 平台额度 **×10**（30/50/20）；`role='admin'` 无限豁免（owner 自用） |
| BYO-key | 用户配置自己 API key 的调用**记流水但不占配额不拦截** |
| 永久免费不计 | 行情/K线/雷达/简报正文(cron)/股票池/持仓/决策/复盘（无平台 LLM 消耗或属平台自身行为） |
| 计量存储 | 新表 `usage_events` 流水（审计/面板/M3 对账三用），不用 profiles.usage jsonb |

## 1. 数据模型

```sql
create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null check (feature in ('copilot','perspectives','brief_preview')),
  ticker     text,
  tokens_in  int default 0,
  tokens_out int default 0,
  byo        boolean not null default false,
  created_at timestamptz not null default now()
);
create index usage_events_quota on public.usage_events (user_id, feature, created_at desc);
-- RLS: select own（未来用量面板）；insert with check (auth.uid() = user_id)（服务端路由上下文写入）
```
profiles 表零改动（plan/role 已存在；usage jsonb 继续闲置）。

## 2. 执行层 `src/lib/billing/quota.ts`（替换 entitlements.ts stub）

```ts
type QuotaFeature = 'copilot' | 'perspectives' | 'brief_preview';
LIMITS = { free: { copilot: 3, perspectives: 5, brief_preview: 2 } }  // pro = ×10
checkQuota(feature): Promise<{ allowed: boolean; used: number; limit: number; plan: string }>
  // plan/role 读 profiles；admin → allowed 恒真 limit -1；当日=Asia/Shanghai 日界
recordUsage(feature, meta: { ticker?; tokensIn?; tokensOut?; byo: boolean }): Promise<void>
  // 失败 console.warn 不抛——记账失败宁可少记不可拦人
```
- `ResolvedLlm` 增加 `source: 'user' | 'env'`（resolve.ts 两处 return 各标注）；`source==='user'` → byo=true → 跳过 checkQuota 拦截。
- 日界计算为纯函数（`dayWindowUtc8(now): {startIso, endIso}`）便于 TDD。

## 3. 路由接线（三个消耗面）

| 路由 | 拦截点 | 超限响应 | 成功后 |
|---|---|---|---|
| `/api/copilot` | resolveLlm 之后、SSE 开流前（byo 直放行） | SSE `{type:'error', quota:{used,limit,plan}}` + done（前端识别渲染引导卡） | recordUsage(copilot, tokens 未知则 0) |
| `/api/perspectives/[ticker]` | 路由入口（byo 放行） | 200 `{source:'quota', perspectives:[], quota:{...}}`（沿用 no-key 降级形状） | recordUsage(perspectives, 含 tokens) |
| `/api/brief/preview` | 入口 | 429 + `{error, quota:{...}}` | recordUsage(brief_preview) |

cron 路由（CRON_SECRET 鉴权）不接线。deepdive/向导等所有 copilot 方法共用 copilot 配额。

## 4. 前端 UX

- `src/components/QuotaNotice.tsx`：`{used, limit, plan}` → 提示卡「今日平台额度已用完（used/limit）——填入自己的 API Key 不限量，或明日 00:00 重置」+ 按钮 `去设置`；Pro 文案变体。
- 接入：CopilotClient（quota error 事件→卡）、个股页观点 tab（source:'quota'→卡）、简报预览（429→卡）。
- 设置页新增「今日用量」：GET `/api/usage/today` → 三行 used/limit + BYO 调用数（标注不计配额）。

## 5. 测试

- 纯逻辑 TDD：limits 解析（free/pro/admin/未知→free）、UTC+8 日界跨界（23:59/00:01）、BYO 豁免。
- 路由：三消耗面超限响应形状；recordUsage 失败不阻断。
- E2E 不新增。

## 6. 本期不做

Stripe/支付（M3）· 邀请码/等候名单 · 管理后台 UI（Supabase 控制台手动改 plan/role）· IP 限流（AI 路由全在 auth 墙内，配额即限流）· 完整用量面板页。

## 上线后 owner 手动动作

1. Supabase 控制台执行 usage_events 迁移（或 `supabase db push`，管道已通）。
2. 把自己 profile 的 `role` 改为 `admin`。
