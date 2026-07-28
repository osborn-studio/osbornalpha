<!-- 09 实施计划 · 用途：分阶段落地路线图（里程碑/依赖/退出标准） · 最后更新 2026-06-20 -->

# 09 · 实施计划（Implementation Plan）

osbornalpha（代号 stock-monitor）的分阶段落地计划。技术栈：Next.js 14 App Router + Supabase（Auth + Postgres + RLS）+ Tailwind，部署 Vercel（osbornalpha.com，阿里云 DNS）。LLM 默认 DeepSeek（`ANTHROPIC_API_KEY` 为高级推理回退），数据源 Tushare + Eastmoney/Sina/Tencent 抓取。Supabase 项目 ref：`mzfcaabhuwtfvsvadvsv`。

> 本项目**无单元测试套件**。每个阶段的验收门 = `npm run typecheck` + `npm run build` + 运行时/预览冒烟，详见 `11_TEST_AND_EVAL_PLAN.md`。

---

## Phase 0 — 现状基线（已完成 ✅）

多租户 + 登录门禁已上线（2026-06-20 随 `feat/multi-tenant-auth` 并入 `main`，门禁随路由组 `(app)` 重构落地）。

**已交付：**
- 公开营销落地页 `/`；产品页全部移入受保护路由组 `src/app/(app)/*`（`dashboard / watchlist / radar / briefs / backtest / settings / stock/[ticker]`），URL 不变。
- 双层门禁：`src/middleware.ts`（未登录访问受保护路径 → `302 /login?next=…`；已登录访问 `/login|/register` → `/dashboard`）+ `src/app/(app)/layout.tsx` 服务端 `getUser()` 兜底守卫。Supabase 未配置（本地无 env）时两层均放行，开发不被锁死。
- Supabase：11 表 + 26 条 RLS 策略 + `on_auth_user_created` 触发器（注册自动建默认 watchlist + user_preferences + profiles）。迁移 `20260515000000_initial_schema.sql`、`20260621000000_profiles_and_billing_hooks.sql`。
- 账号体系：`/login`（邮箱密码 + Google/GitHub/Apple 按钮 + magic-link）、`/register`、`/forgot-password`、`/reset-password`、`/settings → 账号`（改邮箱/密码、绑定第三方、登出、显示套餐）。访客模式已移除（`SITE_PASSWORD` 共享密码门已删）。
- 计费 hook：`src/lib/billing/entitlements.ts`（只读，free/pro 能力位，**未强制**）；`profiles.plan/role/usage/stripe_customer_id` 为预留列。
- 数据/简报管线：`src/app/api/*`（quote/kline/financials/flows/holders/radar/signals/backtest/brief…）+ Vercel cron（`/api/cron/daily-radar` 00:00 UTC、`/api/cron/daily-brief` 00:30 UTC）。

**Phase 0 退出标准（已满足）：** 站点公开可访问落地页；产品页需登录；两账号 RLS 互不可见；注册触发器建齐 3 张行；`typecheck` + `build` 双绿。

**待用户在控制台补完（代码已就绪，外部配置阻塞）：**
- Google OAuth Client（Google Cloud → 回调 `https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback` → 填 Supabase Google provider）。
- 注册首测（当前 Confirm email = 开，需邮箱确认）。

---

## Phase 1 — 加固与打磨（Hardening / Polish）

**目标：** 把"代码已就绪"变成"线上可稳定自用"，关闭 Phase 0 残留的外部配置缺口与可观测性盲区。

**里程碑：**
1. **M1.1 OAuth 跑通** — Google OAuth provider 配好；端到端验证一键登录落 `/dashboard`。可选一并开 GitHub（轻量，回调同址）。
2. **M1.2 邮件可达** — 默认 Supabase SMTP 配额低；接自有 SMTP（Resend / SES）保证确认邮件 + 重置邮件稳定送达。自定义确认/重置邮件模板。
3. **M1.3 cron 鉴权加固** — 为 `/api/cron/*` 设置 `CRON_SECRET`（路由已校验 `Authorization: Bearer`），避免简报/雷达 cron 被外部直接触发。
4. **M1.4 可观测性** — 简报/雷达 cron 失败已走 Telegram/Email 告警；补 Vercel 部署日志巡检与一份回归冒烟清单（见 `11`）。
5. **M1.5 落地页与品牌打磨** — 落地页文案/定价区（Free ¥0、Pro「即将上线」）与 `Disclaimer` 文案对齐；移动端响应式回归。

**依赖：** M1.1/M1.2 依赖用户在 Google Cloud / SMTP 服务商建凭证；其余纯代码侧。

**退出标准：** Google 登录线上可用；注册→确认→登录与忘记密码→重置全链路通过；cron 带 secret 且失败有告警；`11` 回归清单全绿。

---

## Phase 2 — Stripe 计费 + Pro 功能闸（Billing & Gating）

**目标：** 把只读的 entitlements 变成可收费、可强制的套餐体系。

**里程碑：**
1. **M2.1 Stripe 接入** — Checkout Session + Customer Portal；webhook 写 `profiles.plan` 与 `profiles.stripe_customer_id`。`plan/role` 列改为非客户端可写（列级 grant 或 trigger 收紧，当前 update 策略为 self-scoped）。
2. **M2.2 enforcement** — 在 `entitlements.ts` 之上落强制：`maxWatchlistItems`（free 50 / pro 无限）、`aiCommitteePerDay`（free 20 / pro 无限）、`canExport`。在 watchlist 写入与简报/委员会生成入口处校验，超限返回升级提示。
3. **M2.3 套餐 UI** — `/settings` 升降级入口、当前用量展示（`profiles.usage` 计数器）、Pro 标识。
4. **M2.4 用量计量** — 把 `aiCommitteePerDay` 等计数写入 `profiles.usage`（jsonb，已预留）。

**依赖：** Stripe 账号 + 价格对象；Phase 1 邮件链路（开票/收据）。需先写独立 spec（AUTH_SETUP §5 已点名）。

**退出标准：** 测试卡可完成订阅→webhook 置 `plan='pro'`→Pro 限额解锁；取消→回落 free 并重新限流；free 用户超限被正确拦截并引导升级。

---

## Phase 3+ — 产品路线图（来自 `docs/ROADMAP.md`）

按现有 ROADMAP 推进，Web 工作台与 Hiphon PM Agent 两条线并行：

**Web 工作台（v1.0「炒股软件级」→ v2.0 演化）：**
- 接真实数据替换 mock；财务 5 年趋势图；券商研报 AI 摘要；财报日历 + 历史 PDF；13F/持仓变动追踪；Sentinel 历史信号回看。
- PWA + iOS Web Push；红涨绿跌配色可切换（`user_preferences.color_scheme` 已建列）。
- v2.0：多 watchlist、双语简报、真实 agent debate（LangGraph）、用户自定义投资人视角。

**Hiphon PM Agent 线（v1.2 已完成 CLI，v1.3 已完成 Hermes 接口融合）：**
- 设计中：Hedge Fund AI（中国私募投资操作系统，PRD v2 + 5 份专家 annex，仅设计未编码）。

**退出策略（ROADMAP 既定红线）：** 30 天打脸率 >50% → 暂停发版优化视角；数据成本 >$100/月 → 砍 Tushare 回退；LLM 成本 >$300/月 → 切 DeepSeek-R1 自托管。

---

## 阶段依赖总览

```
Phase 0 (done) ──> Phase 1 (OAuth/SMTP/cron 加固) ──> Phase 2 (Stripe + 强制 gating)
                                                          │
                                                          └──> Phase 3+ (ROADMAP 功能)
```

Phase 2 的强制限流依赖 Phase 1 把账号/邮件链路打稳；Phase 3+ 的 Pro 专属功能（如 13F、历史回看）应挂在 Phase 2 的 gating 之后。
