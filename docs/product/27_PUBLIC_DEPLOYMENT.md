<!-- 27 公开部署指南 · 用途：生产上线（Vercel+DNS+Supabase+OAuth+ICP+冒烟） · 最后更新 2026-06-20 -->

# 27 · 公开部署指南（Public Deployment）

osbornalpha 生产上线全流程。当前线上：托管 **Vercel**，域名 **osbornalpha.com**（DNS 在阿里云），数据层 **Supabase**（ref `mzfcaabhuwtfvsvadvsv`，Tokyo）。本文与 `docs/AUTH_SETUP.md` 对齐（auth 门禁已于 2026-06-20 上线）。

> 历史：早期文档含 EdgeOne Pages 路径（`docs/EDGEONE_DEPLOY.md`），适用于需要中国大陆境内访问且已 ICP 备案的场景；当前主部署为 Vercel（海外）。

---

## 1. Vercel 项目 + 环境变量

1. Vercel → New Project → Import `https://github.com/gilosbornhello/stock-monitor`，分支 `main`。
2. Framework 自动识别 Next.js；Build `npm run build`，Install `npm install`，Output 留空（框架默认）；Node 20/22。
3. Settings → Environment Variables（Production）至少设：

```
NEXT_PUBLIC_SUPABASE_URL=https://mzfcaabhuwtfvsvadvsv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=https://www.osbornalpha.com
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...        # 必需，仅服务端
LLM_PROVIDER=deepseek                          # 生产显式 pin
LLM_MODEL=deepseek-v4-flash                    # 已复核定价模型
DEEPSEEK_API_KEY=...                            # 仅部署 secret
TUSHARE_TOKEN=...                               # 数据
CRON_SECRET=...                                 # cron 鉴权（建议）
# 通知（可选）：TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / RESEND_API_KEY / EMAIL_FROM / EMAIL_TO
```
   `SUPABASE_SERVICE_ROLE_KEY` 是平台计量/成本审计的生产必需项，只放 Vercel 服务端 secret。完整变量表见 `13_RUNBOOK.md` §2。**务必不要**再设 `SITE_PASSWORD` / `SITE_AUTH_SECRET`（已废弃）。
4. 在生产变量已注入的受控环境运行 `npm run preflight:release`，确认解析为 `deepseek / deepseek-v4-flash`、价格注册表通过、service-role 已配置；输出不得包含 key。
5. 部署。`vercel.json` 已定义两个 cron（`/api/cron/daily-radar` 00:00 UTC、`/api/cron/daily-brief` 00:30 UTC），Vercel 自动接管。

---

## 2. 域名 + DNS（osbornalpha.com via 阿里云 → Vercel）

1. Vercel → Project → Settings → Domains 添加 `osbornalpha.com` 与 `www.osbornalpha.com`（建议主用 `www`，根域 301 到 `www` 或反之，与 Supabase Site URL 保持一致）。
2. 阿里云 DNS 按 Vercel 提示加记录：根域 `A` 记录指向 Vercel 提供的 IP（如 `76.76.21.21`），`www` 用 `CNAME` 指向 `cname.vercel-dns.com`（以 Vercel 控制台实际显示为准）。
3. Vercel 验证域名归属后自动签发 HTTPS。

---

## 3. Supabase：回调 + Google OAuth

对应 `AUTH_SETUP.md`。

**3.1 Auth → URL Configuration**
- Site URL：`https://www.osbornalpha.com`
- Redirect URLs（已配）：`www.osbornalpha.com/**`、`osbornalpha.com/**`、`localhost:3000/**`；并显式加 `https://www.osbornalpha.com/auth/callback` 与 `https://www.osbornalpha.com/reset-password`（Vercel 预览域名按需同样加两条）。
- Auth 开关：允许注册、允许 manual linking（第三方绑定）、Confirm email = 开。

**3.2 Google OAuth（待用户完成）**
1. Google Cloud Console → APIs & Services → Credentials → 建 **OAuth 2.0 Client ID（Web）**。
2. Authorized redirect URI 填 Supabase 回调：`https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback`。
3. 把 Client ID / Secret 填入 Supabase → Auth → Providers → Google → Enable。
4. GitHub 可一并配（OAuth App，回调同址）；Apple 需 Developer 账号（$99/年），可后置（按钮在，未配则点击报错）。

**3.3 SMTP（建议）** — 默认 Supabase SMTP 配额低；正式上线接自有 SMTP（Resend/SES）保证确认/重置邮件送达，模板可中文化。

**3.4 迁移** — 确保生产库已应用 `supabase/migrations/*`（`supabase db push` 或 SQL Editor）+ `seed.sql`。详见 `13_RUNBOOK.md` §3。

---

## 4. ICP 备案说明

- **Vercel（海外节点）**：无需 ICP 备案即可上线，全球可访问；但中国大陆访问可能不稳定/受限。当前 osbornalpha.com 走此路径。
- **大陆境内稳定访问**：需用境内/合规 CDN（如 Tencent EdgeOne，见 `docs/EDGEONE_DEPLOY.md`）并完成 **ICP 备案**（域名 + 主体）。备案未下发前不要把大陆 CDN 指向生产。
- 决策：面向海外/港股美股用户优先 Vercel；若主攻大陆 A 股用户体验，再走 EdgeOne + ICP 备案的并行部署。

---

## 5. 上线后冒烟（go-live smoke）

参照 `11_TEST_AND_EVAL_PLAN.md` §4，最少：
1. [ ] 打开 https://www.osbornalpha.com → 未登录看到**落地页**（非产品）。
2. [ ] 访问 `/dashboard`（未登录）→ 跳 `/login?next=/dashboard`。
3. [ ] 注册 → 收确认邮件 → 确认 → 登录 → 落 `/dashboard`。
4. [ ] Google 一键登录（配好后）跑通。
5. [ ] 两账号 RLS 隔离：互不可见对方 watchlist。
6. [ ] `GET /api/brief/preview?skipLLM=true` 返回 200。
7. [ ] Vercel Crons 面板确认两个 daily job 已注册；裸调 `/api/cron/*` 返回 401（已设 `CRON_SECRET`）。
8. [ ] `npm run preflight:release` 在生产 env 下通过，且输出的 provider/model 与已复核价格键一致。
