# Stock Monitor 多租户账号体系 — 设计文档 (Phase 1)

> 状态: Approved · 2026-06-21 · 分支 `feat/multi-tenant-auth` · OSStack 作 PM
> 目标: 把 osbornalpha (stock-monitor) 从"私人工具 + SITE_PASSWORD 共享门"升级为**面向售卖的多租户 SaaS** 的账号底座。

## 1. 决策（已确认）

| 项 | 决定 |
|---|---|
| Auth 后端 | **扩展现有 Supabase Auth**（已在用，原生支持密码/重置/OAuth + RLS 数据隔离） |
| 登录方式 v1 | 邮箱+密码（注册/忘记/重置）· Google OAuth · Apple/GitHub（更多第三方）；magic-link 旧路由保留不主推 |
| 售卖范围 | 账号体系 + 全表 RLS 多租户加固 + 账号设置页 + **预留计费钩子**（plan/role/usage，不接支付）；Stripe 计费 = Phase 2 |
| SITE_PASSWORD | **摒弃**：删共享密码门，改公开可浏览 + 登录解锁个人数据 |

## 2. 架构

```
访客（公开浏览，guest 模式 localStorage）
  + 登录用户（Supabase Auth 会话）
       │
  Supabase Auth  ── email+password / OAuth(google/apple/github) / magic-link(保留)
       │  session via SSR middleware（已存在）
  Postgres + RLS（owner = auth.uid()）── 每账户独立数据
       │
  profiles 表（plan/role/usage，售卖钩子）
```

不另起炉灶：复用已有的 Supabase client/server、middleware session、/auth/callback、user_preferences/watchlists 的 RLS。

## 3. 组件交付物

### 3.1 认证 UI + 流程
- `/login`：邮箱+密码登录（`signInWithPassword`）+ Google/Apple/GitHub 按钮（`signInWithOAuth`）+ 链到注册/忘记密码。
- `/register`：邮箱+密码注册（`signUp`，发确认邮件）+ 同样的 OAuth 按钮。
- `/forgot-password`：`resetPasswordForEmail`（发重置邮件，redirectTo `/reset-password`）。
- `/reset-password`：从邮件链接进入，`updateUser({password})` 设新密码。
- `/auth/callback`：已存在，复用（OAuth/邮件回跳）。
- 旧 magic-link：`/login` 上作次要选项保留，不删。

### 3.2 数据隔离（多租户加固）
- **审计所有表 RLS**（migration 20260515 起共 10 表）：
  - 公共只读：`stocks_universe`、`financial_history`、市场简报类（`briefs`/`stock_signals`/`perspectives`/`news_items`/`broker_reports` 若为全局数据）→ `select` 对 anon/authenticated 放开，写入仅 service_role。
  - 用户私有：`watchlists`、`watchlist_items`、`user_preferences` → 全部 CRUD policy `owner = auth.uid()`（逐条核对，补缺）。
- 新 migration：`profiles` 表（`id uuid PK references auth.users`, `email`, `plan text default 'free'`, `role text default 'user'`, `usage jsonb default '{}'`, `stripe_customer_id text null`, `created_at`）;RLS 仅本人 select/update;**注册触发器**自动建 profile（沿用现有"注册自动建默认 watchlist"的 trigger 模式，扩展之）。

### 3.3 账号设置页（扩展现有 `/settings`）
新增「账号」分区：改邮箱（`updateUser({email})`，发确认）、改密码（`updateUser({password})`）、**绑定/解绑第三方**（`linkIdentity`/`unlinkIdentity`）、登出所有设备、显示当前套餐（free，只读）。

### 3.4 售卖钩子（不接支付）
`src/lib/billing/entitlements.ts`：`getEntitlements(userId)` 读 `profiles.plan` → 返回能力对象（v1 全 free，**只读不强制**）。Phase 2 接 Stripe 时在此加 enforcement + webhook。

### 3.5 摒弃 SITE_PASSWORD
删 `src/lib/auth/site-password.ts`、`/api/auth/unlock`、`/unlock` 页、`middleware` 的密码门分支、`SITE_PASSWORD`/`SITE_AUTH_SECRET` env（文档标注移除）。middleware 仅保留 Supabase session 刷新。私有页面/数据靠 Supabase 会话 + RLS 保护;公开页可访问（含 guest 模式）。

## 4. 外部前置（需用户提供/配置，非代码）

> 像 ICP 备案一样，这些我无法独力完成，需 osborn 在各控制台操作（我可指路/陪点）。

- **Google OAuth**：Google Cloud Console 建 OAuth 2.0 client → client id/secret 填进 Supabase Dashboard → Auth → Providers → Google;授权回调 = Supabase 的 `…/auth/v1/callback`;授权域含 osbornalpha.com。
- **Apple Sign-in**：需 Apple Developer 账号($99/年) + Service ID + 域名验证 → Supabase Apple provider。**可后置**(v1 先上 Google,Apple 占位)。
- **GitHub OAuth**：GitHub OAuth App → Supabase GitHub provider（轻量，可一起）。
- **Supabase 邮件**：确认/重置邮件需 SMTP（或 Supabase 默认低配额）;把 `https://www.osbornalpha.com/**` 与 `/auth/callback`、`/reset-password` 加进 Supabase Auth → URL Configuration → Redirect URLs。
- **环境变量**：确保 Vercel + EdgeOne 部署有 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`（service_role 由用户填）。移除 `SITE_PASSWORD`。

## 5. 错误处理 / 边界
- 注册重复邮箱、弱密码、未确认邮箱登录 → 明确错误文案。
- OAuth 失败/取消 → 回 `/login` 带错误提示。
- 重置链接过期 → 提示重发。
- RLS 默认拒绝：任何新表无 policy = 默认无人可读，避免漏配泄露。
- guest 模式（localStorage）与登录态切换：登录后不自动吞掉本地数据（保留现有无缝切换逻辑）。

## 6. 测试 / 验收
① 邮箱注册→收确认/重置邮件→密码登录；② Google OAuth 跑通；③ 两账户互相看不到对方 watchlist（RLS 实证）；④ 设置页改密码/改邮箱/绑定第三方生效；⑤ 移除 SITE_PASSWORD 后公开可访问、私有数据仍受保护；⑥ profiles 注册自动创建、plan=free。

## 7. 非目标（Phase 2+）
不接 Stripe/真实支付；不做套餐升级/降级流程;不做用量计费 enforcement;不做团队/组织多成员;不迁移到非 Supabase auth。
