<!-- 14_DECISIONS — osbornalpha 关键技术与产品决策的 ADR 记录及理由 — 最后更新 2026-06-20 -->

# 14 · 决策记录（Architecture Decision Records）

> ADR 风格记录关键决策与**理由**。术语以 [`00_TERMINOLOGY_CONSISTENCY.md`](./00_TERMINOLOGY_CONSISTENCY.md) 为准。引用的 spec 在 `docs/superpowers/specs/`。

---

## ADR-001 · 鉴权后端选用 Supabase Auth
- **状态**：已采纳（2026-06-21 spec，已并入 main）
- **背景**：从单用户私人工具升级为可售卖的多租户 SaaS，需要账号体系 + 数据隔离。
- **决策**：**扩展现有 Supabase Auth**（已在用），不另起鉴权栈。原生支持邮箱密码/重置/OAuth + Postgres RLS 数据隔离 + SSR 会话中间件。
- **理由**：复用已有 Supabase client/server、middleware session、`/auth/callback`、watchlists/user_preferences 的 RLS，避免重复造轮子；RLS 天然提供多租户隔离；迁移成本最低。
- **后果**：账号、隔离、计费钩子全部围绕 `auth.uid()` 与 `profiles` 表展开；Apple Sign-in 需 $99/年开发者账号，列为可后置。
- **依据**：`docs/superpowers/specs/2026-06-21-multi-tenant-auth-design.md`、`docs/AUTH_SETUP.md`、迁移 `supabase/migrations/20260621000000_profiles_and_billing_hooks.sql`。

## ADR-002 · 摒弃 guest 模式与 SITE_PASSWORD，改为产品全门禁
- **状态**：已采纳（2026-06-20 spec，已并入 main，PR #22）
- **背景**：早期 middleware 只刷新会话、**不拦截任何路由**（注释明文 "the app is publicly browsable (guest mode)"），陌生人访问 osbornalpha.com 即可使用完整产品 + 演示数据。多租户阶段曾另有 SITE_PASSWORD 共享密码门。
- **决策**：**纠正此前的 guest-mode 逻辑错误**——上线产品全门禁：仅营销落地页 + 认证页公开，其余需登录；同时删除 SITE_PASSWORD 共享密码门。
- **理由**：RLS 虽保证用户间不泄露私有数据，但一个对外售卖的 SaaS 不应让陌生人随意浏览整个产品，付费墙/门禁应在最前。SITE_PASSWORD 是单口令共享门，与多租户账号体系冲突。
- **后果**：guest localStorage 卖点取消；`mock.ts` 仅保留作空态/演示；登录成为进入前提。
- **依据**：`docs/superpowers/specs/2026-06-20-osbornalpha-auth-gate-and-landing-design.md` §1–2、§6；`docs/superpowers/specs/2026-06-21-multi-tenant-auth-design.md` §3.5。

## ADR-003 · 路由组 `(app)` 拆分受保护产品页（Approach A）
- **状态**：已采纳（2026-06-20）
- **背景**：需要"公开落地页 + 全门禁产品"，且不想大改 URL 结构。
- **决策**：用 Next.js 路由组 `src/app/(app)/` 收纳所有受保护页（dashboard/watchlist/radar/briefs/backtest/settings/stock），由 `(app)/layout.tsx` 服务端守卫（`getUser()`，无会话 `redirect('/login')`）统一拦截；原工作台从 `/` 迁到 `/dashboard`；根 layout 只留 `<html>`/全局样式，使落地页/登录页不带 app 外壳。
- **理由**：路由组**不改变 URL**（`/watchlist` 等保持原样），只统一套上守卫与外壳；与 middleware 形成"双保险"（中间件被绕过时服务端守卫仍守得住）。
- **后果**：app 外壳（TopBar/TabBar）从根 layout 下沉到 `(app)/layout.tsx`；middleware 公开白名单与之对应。
- **依据**：`docs/superpowers/specs/2026-06-20-osbornalpha-auth-gate-and-landing-design.md` §3–4；`src/app/(app)/layout.tsx`、`src/middleware.ts`。

## ADR-004 · 对外品牌 osbornalpha（代号仍为 stock-monitor）
- **状态**：已采纳（2026-06-20）
- **决策**：全站统一对外品牌 `osbornalpha`（app 头部 StockMonitor → osbornalpha，副标「AI 投资监控工作台」/「你的 AI 投资 PM」），域名 osbornalpha.com；仓库/工程代号保留 `stock-monitor`（package.json、Supabase 项目名、git 仓库）。
- **理由**：代号承载工程历史、品牌承载市场认知；分离二者避免改名波及配置与迁移；alpha 隐含"超额收益"定位。
- **后果**：文档包需双名并存（见术语表 §1）。
- **依据**：`docs/superpowers/specs/2026-06-20-osbornalpha-auth-gate-and-landing-design.md` §2；`src/app/page.tsx`。

## ADR-005 · Free / Pro 两档定价，Stripe 列为 Phase 2
- **状态**：已采纳（落地页展示，未实付）
- **决策**：落地页展示 Free（¥0，已上线）/ Pro（标「即将上线」）；`profiles.plan` ∈ {free, pro}；能力映射在 `src/lib/billing/entitlements.ts`，**Phase 1 只读、不强制**；Stripe checkout+webhook+enforcement = Phase 2。
- **理由**：先验证产品价值与 DARR，再投入支付集成；预留 `plan/role/usage/stripe_customer_id` 钩子使 Phase 2 无需改库结构。YAGNI：不提前做实付与功能闸。
- **后果**：当前任何套餐上限均不强制；Pro 卖点（无限委员会/完整回测+导出/PM 决策）在落地页先立预期。
- **依据**：`entitlements.ts`、`profiles` 迁移、auth-gate spec §2/§8、multi-tenant spec §3.4/§7。

## ADR-006 · LLM 选用 DeepSeek（默认）+ Anthropic Claude（回退）
- **状态**：已采纳
- **决策**：统一 LLM facade（`src/lib/data/sources/llm.ts`）按解析顺序 `DEEPSEEK_API_KEY` → `ANTHROPIC_API_KEY` 自动选 provider，可用 `LLM_PROVIDER` 钉住。DeepSeek 为默认（按成本优先），Claude 为高级推理回退。
- **理由**：DeepSeek 单价显著低（deepseek-chat ~$0.27/$1.10 每百万 token vs claude-sonnet ~$3/$15），契合"单日成本 ≤ $5"护栏；Claude 在需要更强推理/分析时作回退，并仍作为分析来源之一（`src/lib/data/sources/anthropic.ts`）。
- **后果**：委员会/雷达/简报等调用方通过 `chat()` 与 provider 解耦；缺 key 时优雅降级（返回 no-key 提示而非崩溃）。

## ADR-007 · 部署在 Vercel（Next.js 14 App Router）
- **状态**：已采纳
- **决策**：生产部署 Vercel，域名 osbornalpha.com（DNS 在阿里云）；前端 Next.js 14 App Router + TypeScript + Tailwind。环境变量（`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`）在 Vercel Production 配置，已删 `SITE_PASSWORD`/`SITE_AUTH_SECRET`。
- **理由**：Vercel 与 Next.js App Router 一等公民集成（middleware、SSR、cron）；与 Supabase SSR 鉴权配合顺畅；cron（`/api/cron/daily-radar`、`/api/cron/daily-brief`）由平台调度。
- **后果**：API 路由 `maxDuration` 受平台限制（委员会/回测设 60s）；曾评估 EdgeOne（见 `docs/EDGEONE_DEPLOY.md`、`docs/CLAUDE_EDGEONE_OSBORNALPHA_HANDOFF.md`），现状以 Vercel 为生产。
- **依据**：`docs/AUTH_SETUP.md` §0/§3、各 `src/app/api/cron/*`。

## ADR-008 · Agent 产品线与 Web 共用数据、单一事实源
- **状态**：已采纳（2026-06 起）
- **决策**：John Cameron / Hiphon PM agent（CLI + Hermes）叠加在 Web 数据架构之上，**复用 Web 端数据 API、不改 Web 栈**；技能权威内容在 `skills/`，Hermes 端 `hermes/skills/` 只是符号链接薄壳（一处改两端生效）；战绩命中由 `score-calls.sh` 确定性计算，LLM 不得自评命中率；战绩 journal append-only。
- **理由**：避免数据/逻辑分叉；确定性裁定防止 LLM 过拟合/过度自信；append-only 使战绩可信、可校准。
- **依据**：`docs/superpowers/specs/2026-06-02-hiphon-pm-design.md`、`docs/superpowers/specs/2026-06-12-hermes-integration-design.md`、`docs/ARCHITECTURE.md` §9、`skills/hiphon-pm/references/doctrine.md`。
