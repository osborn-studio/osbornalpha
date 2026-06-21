# 多租户账号体系 — 部署/配置指南 (Phase 1)

> 代码已实现（`feat/multi-tenant-auth`，已并入 `main`）。要真正跑通登录，需在各控制台完成以下**外部配置**（代码无法独力完成）。

## ✅ 本次已落地实例（2026-06-20）
- **Supabase 项目**：`stock-monitor`（gilosbornhello's Org / Free / Tokyo）
  - Project ref：`mzfcaabhuwtfvsvadvsv`
  - Project URL：`https://mzfcaabhuwtfvsvadvsv.supabase.co`
  - **OAuth 回调地址（Google/GitHub 都填这个）**：`https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback`
  - Key 体系：新版 `sb_publishable_…`（= anon，已写入 Vercel）/ `sb_secret_…`（= service_role，代码当前未用，按需自取）
- **DB 迁移**：✅ 已通过 SQL Editor 应用（11 表 / 26 RLS 策略 / `on_auth_user_created` 触发器）
- **Auth URL**：✅ Site URL = `https://www.osbornalpha.com`；Redirect = `www.osbornalpha.com/**`、`osbornalpha.com/**`、`localhost:3000/**`
- **Auth 开关**：✅ 允许注册、✅ 允许 manual linking（第三方绑定）、Confirm email = 开
- **Vercel(Production)**：✅ `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 已设；已删 `SITE_PASSWORD` / `SITE_AUTH_SECRET`；已重新部署并 alias 到 osbornalpha.com
- **待办**：① 用户在 Google Cloud 建 OAuth Client → 填 Supabase Google provider；② 注册首测（需邮箱确认）；③ 可选自有 SMTP / 关 Confirm email 便于测试

## 0. 已实现（代码侧）
- 页面：`/login`（邮箱密码 + Google/GitHub/Apple + magic-link 次要）· `/register` · `/forgot-password` · `/reset-password`
- 设置 `/settings → 账号`：改邮箱、改密码、绑定/解绑第三方、登出、显示套餐
- DB：`profiles` 表（plan/role/usage/stripe_customer_id，注册触发器自动建）+ 全表 RLS 按 `auth.uid()` 隔离
- 计费钩子：`src/lib/billing/entitlements.ts`（只读，未强制）
- **已移除** `SITE_PASSWORD` 共享密码门（middleware/unlock/site-password.ts 全删）

## 1. 推送 DB 迁移
```bash
supabase link --project-ref <YOUR_REF>   # 若未链接
supabase db push                          # 应用 20260621000000_profiles_and_billing_hooks.sql
```
> 该迁移会建 `profiles`、扩展 `handle_new_user()` 触发器、回填已有用户的 profile。

## 2. Supabase Auth 配置（Dashboard → Authentication）
- **URL Configuration → Redirect URLs** 加：
  - `https://www.osbornalpha.com/auth/callback`
  - `https://www.osbornalpha.com/reset-password`
  - （以及 EdgeOne/Vercel 预览域名同样两条，按需）
- **Email**：默认 SMTP 有低配额；正式上线建议配自有 SMTP（Resend/SES）。确认/重置邮件模板可在此自定义。
- **Providers**：开下面几个。

### 2a. Google（点 3 核心）
1. Google Cloud Console → APIs & Services → Credentials → 建 **OAuth 2.0 Client ID**（Web）。
2. Authorized redirect URI 填 Supabase 的回调：`https://<project-ref>.supabase.co/auth/v1/callback`。
3. 把 Client ID / Secret 填进 Supabase → Auth → Providers → **Google** → Enable。

### 2b. GitHub（轻量，可一起）
GitHub → Settings → Developer settings → OAuth Apps → 新建；callback 同上 Supabase 回调；Client ID/Secret 填 Supabase GitHub provider。

### 2c. Apple（可后置）
需 **Apple Developer 账号（$99/年）** → 建 Service ID + Key + 域名验证 → 填 Supabase Apple provider。v1 可先不开（按钮在，但未配则点击报错）。

## 3. 环境变量（Vercel + EdgeOne 部署）
必需：
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY       # 高权限密钥，由你填，勿入库
```
移除（不再使用）：
```
SITE_PASSWORD
SITE_AUTH_SECRET
```

## 4. 验收清单
1. 邮箱注册 → 收确认邮件 → 确认 → 密码登录成功。
2. 忘记密码 → 收重置邮件 → 设新密码 → 新密码登录。
3. Google 一键登录跑通（配好 provider 后）。
4. 两个账户互相看不到对方 watchlist（RLS 隔离实证）。
5. `/settings → 账号`：改密码、绑定/解绑 Google 生效；登出。
6. 移除 SITE_PASSWORD 后站点公开可访问；私有数据仍受会话+RLS 保护。

## 5. Phase 2（后续）
Stripe 计费：checkout + webhook 写 `profiles.plan/stripe_customer_id`；在 `entitlements.ts` 加 enforcement；套餐升降级 UI。设计另起 spec。
