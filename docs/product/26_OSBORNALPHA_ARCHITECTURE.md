<!-- 26 osbornalpha 部署与基础设施架构 | 用途：Vercel/环境变量/域名 DNS/Supabase/Google OAuth/EdgeOne 的部署级架构参考 | 最后更新 2026-06-20 -->

# 26 · osbornalpha 部署与基础设施架构（Deployment & Infra）

> 事实源：`docs/AUTH_SETUP.md`、`vercel.json`、`.env.example`、`src/lib/data/sources/*`、`src/middleware.ts`、`docs/EDGEONE_DEPLOY.md` / `docs/CLAUDE_EDGEONE_OSBORNALPHA_HANDOFF.md`。
> 形态：单一 Next.js 14 App Router 应用，部署 Vercel，后端为 Supabase 托管 Postgres + Auth。

---

## 1. 部署拓扑

```
用户 ──HTTPS──▶ osbornalpha.com / www.osbornalpha.com
                        │ (Aliyun DNS → Vercel)
                        ▼
                 ┌──────────────────────────┐
                 │  Vercel（Production）      │
                 │  Next.js 14 App Router     │
                 │   · Edge middleware 认证门  │
                 │   · Route Handlers (Node)  │
                 │   · Static/CDN 资产         │
                 │   · Cron（vercel.json）     │
                 └───────┬─────────┬──────────┘
                         │         │
            ┌────────────▼──┐   ┌──▼──────────────────────┐
            │  Supabase     │   │  外部数据/LLM/投递 API    │
            │  ref=mzfcaab… │   │  Tushare · 东财/新浪/腾讯 │
            │  Auth+PG+RLS  │   │  DeepSeek/Anthropic       │
            │  Tokyo / Free │   │  Telegram · Resend        │
            └───────────────┘   └─────────────────────────┘
```

---

## 2. Vercel 项目

- **生产域**：`osbornalpha.com`（apex）+ `www.osbornalpha.com`；部署后 alias 到 `osbornalpha.com`。
- **构建**：`next build`（脚本 `dev/build/start/lint/typecheck`）。Route Handlers 为 Node serverless function；重路由设 `maxDuration` 30/60s。
- **Cron**（`vercel.json`）：
  - `/api/cron/daily-radar` — `0 0 * * *`（UTC 00:00 = 北京 08:00）。
  - `/api/cron/daily-brief` — `30 0 * * *`（UTC 00:30 = 北京 08:30）。
  - 两者以 `Authorization: Bearer ${CRON_SECRET}` 鉴权。
- **CDN/图片**：Vercel Edge CDN 分发静态产物；`next.config.mjs` 设 `images.unoptimized=true`。

---

## 3. 环境变量

| 变量 | 必需 | 用途 | 客户端可见 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL（`https://mzfcaabhuwtfvsvadvsv.supabase.co`） | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon/publishable key（新版 `sb_publishable_…`） | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 平台计量、成本审计与管理路径使用的 service-role 高权限密钥；仅服务端、勿入库 | 否 |
| `NEXT_PUBLIC_APP_URL` | 建议 | 应用基址（本地 `http://localhost:3000`） | 是 |
| `LLM_PROVIDER` | ✅（推荐显式） | 生产 `deepseek`；显式 provider 缺 key 时失败关闭 | 否 |
| `LLM_MODEL` | ✅（推荐显式） | 生产 `deepseek-v4-flash`（已复核定价） | 否 |
| `DEEPSEEK_API_KEY` | 平台 AI 需 | DeepSeek 服务端 key | 否 |
| `DEEPSEEK_MODEL` / `ANTHROPIC_API_KEY` | 旧 facade 按需 | 旧数据源 LLM facade，不替代平台计量配置 | 否 |
| `TUSHARE_TOKEN` | A 股深度数据需 | Tushare Pro token | 否 |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | 推送需 | Telegram 投递 | 否 |
| `RESEND_API_KEY` + `EMAIL_FROM` + `EMAIL_TO` | 邮件需 | Resend 邮件投递 | 否 |
| `CRON_SECRET` | cron 需 | cron Bearer 鉴权 | 否 |
| `CACHE_PURGE_SECRET` | 可选 | `/api/cache/revalidate` 的 `X-Purge-Secret` 鉴权 | 否 |
| `ALPHAVANTAGE_API_KEY` | 可选 | 美股（东财+EDGAR 已覆盖大部分） | 否 |

**已移除（不再使用）**：`SITE_PASSWORD`、`SITE_AUTH_SECRET`（共享口令门已删，改 Supabase 会话 + RLS）。Vercel Production 已删除这两项并重新部署。

> 本地零变量开发仍可降级，但生产缺 `SUPABASE_SERVICE_ROLE_KEY` 会使平台计量/审计失败关闭；发布前必须运行 `npm run preflight:release`，验证解析出的 provider/model、精确价格键与 service-role 配置。

---

## 4. 域名与 DNS

- **注册/DNS**：Aliyun（阿里云）管理 `osbornalpha.com`，A/CNAME 记录指向 Vercel。
- **Auth URL（Supabase Dashboard）**：
  - Site URL = `https://www.osbornalpha.com`。
  - Redirect URLs = `www.osbornalpha.com/**`、`osbornalpha.com/**`、`localhost:3000/**`，并补 `…/auth/callback`、`…/reset-password`（含预览域名按需）。

---

## 5. Supabase 项目

- 项目名 `stock-monitor`（gilosbornhello's Org / Free / Tokyo）。
- **ref**：`mzfcaabhuwtfvsvadvsv`；**URL**：`https://mzfcaabhuwtfvsvadvsv.supabase.co`。
- **OAuth 回调（所有 provider 统一）**：`https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback`。
- **Key 体系**：新版 `sb_publishable_…`（= anon/publishable）/ `sb_secret_…`（= service_role）。生产 service-role 是平台计量、持久化审计和 admin DB RPC 的必需服务端 secret；绝不带 `NEXT_PUBLIC_` 或进入客户端 bundle。
- **迁移状态**：已通过 SQL Editor 应用（11 表 / ~26 RLS 策略 / `on_auth_user_created` 触发器）。推送命令：`supabase link --project-ref mzfcaabhuwtfvsvadvsv && supabase db push`。
- **Auth 开关**：允许注册、允许 manual linking（第三方绑定）、Confirm email = 开。默认 SMTP 配额低，正式上线建议接自有 SMTP（Resend/SES）。

---

## 6. Google OAuth 接线

1. Google Cloud Console → APIs & Services → Credentials → 建 **OAuth 2.0 Client ID（Web）**。
2. Authorized redirect URI 填 Supabase 回调：`https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback`。
3. 将 Client ID / Secret 填入 Supabase → Auth → Providers → **Google** → Enable。
4. GitHub 同法（OAuth App，callback 同上）。Apple 需开发者账号（$99/年，建 Service ID + Key + 域名验证），v1 可后置——按钮在但未配点击会报错。

> 状态（2026-06-20）：代码侧登录/注册/找回/重置/设置（改邮箱密码、绑定解绑、登出、显示套餐）均已实现；**待用户在 Google Cloud 建 OAuth Client 并填入 Supabase Google provider**，再做注册首测（需邮箱确认）。

---

## 7. 认证与隔离（部署视角）

- 两道门：Edge middleware（`src/middleware.ts`，会话 cookie 校验 + 重定向）+ `(app)/layout.tsx` 服务端守卫。详见 `04_SYSTEM_ARCHITECTURE.md` §3。
- 多租户隔离由 Postgres RLS（`auth.uid()`）在数据库层强制；service-role 仅由受信服务端路径在完成用户/admin/签名鉴权后使用，用于计量、审计与管理 RPC，不下传浏览器。
- 计费钩子 `src/lib/billing/entitlements.ts` 只读映射 `profiles.plan` → 能力位（free: maxWatchlistItems=50, aiCommitteePerDay=20, canExport=true；pro: 无限），Phase 1 不强制、未接 Stripe。

---

## 8. EdgeOne 说明（历史）

- 曾在腾讯 **EdgeOne Pages** 部署（见 `docs/EDGEONE_DEPLOY.md`、`docs/CLAUDE_EDGEONE_OSBORNALPHA_HANDOFF.md`），用于早期 osbornalpha.com 上线尝试。
- 现以 **Vercel 为权威生产环境**；EdgeOne 路径作为备选/历史记录保留。若双端共存，Supabase Redirect URLs 需同时收录 EdgeOne 预览/生产域名。

---

## 9. 上线验收清单（摘自 AUTH_SETUP.md §4）

1. 邮箱注册 → 收确认邮件 → 确认 → 密码登录成功。
2. 忘记密码 → 收重置邮件 → 设新密码 → 登录。
3. Google 一键登录跑通（配好 provider 后）。
4. 两账户互不可见对方 watchlist（RLS 隔离实证）。
5. `/settings → 账号`：改密码、绑定/解绑 Google、登出生效。
6. 移除 `SITE_PASSWORD` 后站点公开可访问；私有数据仍受会话 + RLS 保护。
