<!-- 13 运维手册 · 用途：部署/env/迁移/换密钥/故障处置/监控/on-call · 最后更新 2026-06-20 -->

# 13 · 运维手册（Runbook）

osbornalpha 生产运维。托管 Vercel（osbornalpha.com，阿里云 DNS）；数据层 Supabase（ref `mzfcaabhuwtfvsvadvsv`，Tokyo / Free）；LLM DeepSeek（Anthropic 回退）；数据源 Tushare + Eastmoney/Sina/Tencent。

---

## 1. 部署

正常发布走 Git → Vercel 自动构建（push 到 `main` 触发 Production）。手动发布：

```bash
npm run typecheck && npm run build   # 本地预检（见 11_TEST_AND_EVAL_PLAN.md）
vercel --prod --yes                  # 直接发 Production
```

部署后冒烟：打开 https://www.osbornalpha.com → 未登录见落地页 → 登录 → `/dashboard`。回滚：Vercel Dashboard → Deployments → 选上一个绿的 → **Promote to Production**（或 `vercel rollback`）。

---

## 2. 环境变量管理

在 Vercel → Project → Settings → Environment Variables（Production / Preview 分别设）。代码实际引用的变量：

| 变量 | 必需 | 用途 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL（`https://mzfcaabhuwtfvsvadvsv.supabase.co`） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 前端 anon/publishable key（`sb_publishable_…`） |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ | 高权限密钥（`sb_secret_…`），仅服务端，绝不入库/暴露；当前代码未用，按需 |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://www.osbornalpha.com`（生产） |
| `DEEPSEEK_API_KEY` | LLM | 默认 LLM provider |
| `DEEPSEEK_MODEL` | 可选 | `deepseek-chat` 或 `deepseek-reasoner` |
| `ANTHROPIC_API_KEY` | 可选 | LLM 回退 |
| `LLM_PROVIDER` | 可选 | 钉死 `deepseek\|anthropic`（不设则自动选） |
| `TUSHARE_TOKEN` | 数据 | A 股深度数据 |
| `CRON_SECRET` | 建议 | `/api/cron/*` 的 Bearer 鉴权 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 通知 | 简报/告警推送 |
| `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_TO` | 通知 | 邮件简报/告警 |
| `CACHE_PURGE_SECRET` | 可选 | `/api/cache/revalidate` 鉴权 |
| `LLM_DIGEST_TAKE` | 可选 | 摘要 take 开关 |

> 已废弃、务必从所有环境删除：`SITE_PASSWORD`、`SITE_AUTH_SECRET`（共享密码门已下线）。
> `NEXT_PUBLIC_GUEST_MODE_ALLOWED` 为历史遗留变量，访客模式已移除，门禁不再依赖它。

---

## 3. Supabase 迁移

迁移文件在 `supabase/migrations/`（`20260515000000_initial_schema.sql`、`20260621000000_profiles_and_billing_hooks.sql`）。两种应用方式：

**A. CLI（推荐）**
```bash
supabase login
supabase link --project-ref mzfcaabhuwtfvsvadvsv   # 输入 DB 密码（Dashboard→Settings→Database）
supabase db push                                    # 应用所有未应用迁移
```

**B. SQL Editor（无 CLI 时）** — Dashboard → SQL Editor，粘贴迁移文件内容执行。迁移写法幂等（`create table if not exists`、`create or replace function`、`drop trigger if exists`），可安全重跑。

**Seed**：`supabase/seed.sql`（30 只股票 universe）—— `supabase db push --include-seed` 或 SQL Editor 粘贴；`on conflict do update` 可重复执行。

---

## 4. 轮换密钥

1. 在源头生成新 key（Supabase / DeepSeek / Tushare / Resend / Telegram 各自控制台）。
2. Vercel → Settings → Env 更新对应变量（Production + Preview）。
3. 重新部署使新值生效（`vercel --prod` 或 redeploy）。
4. 源头吊销旧 key。
5. **Supabase service_role / `sb_secret_`**：泄漏即视为最高级事故，立即在 Dashboard → Settings → API 轮换并全环境替换。

---

## 5. 故障处置（Incident Playbook）

### 5.1 登录/认证不可用
- 症状：用户卡 `/login`，或受保护页全跳登录。
- 排查：①Vercel `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` 是否被改坏（含 `placeholder` 会触发门禁放行）；②Supabase 项目是否在线（Dashboard 状态）；③Auth → URL Configuration 的 Site URL / Redirect URLs 是否含当前域名；④OAuth 报错查 provider Client ID/Secret 与回调地址。
- 缓解：env 回滚到上一个已知好的值 → redeploy。

### 5.2 数据源中断（Tushare/抓取）
- 症状：`/api/quote|kline|financials|radar` 返回 500 或空。
- 排查：`GET /api/diag/tushare` 看 token；抓取源（Eastmoney/Sina/Tencent）可能限流/改版。
- 缓解：单源故障应优雅降级（不让整页 500）；必要时临时切 mock（`lib/data/mock.ts`）保证页面可用，并记录受影响接口。

### 5.3 LLM 失败（简报/委员会）
- 症状：`/api/brief/preview` 或 cron 简报 500/超时。
- 排查：DeepSeek 配额/超时；用 `?skipLLM=true` 隔离判断是数据还是 LLM 问题。
- 缓解：设 `LLM_PROVIDER=anthropic` 切回退；或降 `topN`；cron 失败会自动 Telegram/Email 告警（路由内置）。

### 5.4 cron 未跑 / 被滥用
- 排查：Vercel cron 在 `vercel.json`（`daily-radar` 00:00 UTC、`daily-brief` 00:30 UTC）；Vercel Dashboard → Crons 看执行记录。
- 加固：设 `CRON_SECRET`，裸调 `/api/cron/*` 应返回 401。

---

## 6. 监控与 on-call

- **告警通道**：cron 失败时路由自动推 Telegram（`TELEGRAM_*`）+ Email（`RESEND_*`/`EMAIL_*`）。保证至少一条通道配好。
- **日常巡检**：Vercel Deployments（构建/函数错误率）、Vercel Crons（每日两个 job 是否绿）、Supabase Dashboard（DB 用量、Auth 用户数、SMTP 配额）。
- **健康探针**：`GET /api/brief/preview?skipLLM=true`（数据管线）、`GET /api/diag/tushare`（数据源 token）。
- **on-call 基本动作**：①确认影响面（全站 vs 单接口）；②先看 Vercel 部署日志 + Supabase 状态；③能 env 回滚就回滚 + redeploy；④数据/LLM 单点故障走 §5 降级；⑤事后记录根因与改进项。
