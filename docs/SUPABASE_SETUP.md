# Supabase 接入指南

> 你的付费 Supabase 项目接入到 Stock Monitor，5 分钟搞定。

## 前置条件

- ✅ Supabase 项目已创建（你说已付费）
- ✅ Supabase CLI 已装（`brew install supabase/tap/supabase`）
- ✅ Vercel 项目已部署：https://stock-monitor-nu.vercel.app

## Step 1: 登录 Supabase CLI

```bash
supabase login
# 会打开浏览器认证
```

## Step 2: 链接到你的 Supabase 项目

去 [Supabase Dashboard](https://supabase.com/dashboard) 找你想用的项目，复制 Project Ref（URL 里 `https://supabase.com/dashboard/project/<PROJECT_REF>` 的 ref）：

```bash
cd /Users/osborn/Developer/ClaudeCode/01_active/stock-monitor
supabase link --project-ref <YOUR_PROJECT_REF>
```

输入 database password（在 Dashboard → Settings → Database 里看）。

## Step 3: 推送 schema

```bash
# 推送 migrations/ 里所有 .sql（包括 Watchlist cursor、研究质量和刷新队列清理迁移）
supabase db push
```

这会创建：
- 10 张表（stocks_universe, financial_history, watchlists, watchlist_items, briefs, stock_signals, perspectives, news_items, broker_reports, user_preferences）
- RLS 策略（用户只能看自己数据 + 公开 reference 表所有人可读）
- 自动触发器（用户注册时自动建默认 watchlist + 默认偏好）

Watchlist 后端上线前请在 Dashboard 的 **Database → Migrations** 或 CLI 输出中确认以下迁移已执行：

- `20260904170000_watchlist_overview_cursor.sql`
- `20260904180000_watchlist_research_quality.sql`
- `20260904190000_watchlist_research_refresh_cleanup.sql`
- `20260904200000_watchlist_monitoring_status.sql`
- `20260904230000_external_evidence_audit_snapshot.sql`
- `20260904240000_watchlist_research_event_clusters.sql`
- `20260904250000_watchlist_ui_preferences.sql`
- `20260904260000_watchlist_metric_snapshots.sql`
- `20260904265000_shared_quote_snapshots.sql`
- `20260904266000_shared_research_artifacts.sql`
- `20260904270000_watchlist_overview_query.sql`
- `20260904280000_watchlist_alert_scopes.sql`
- `20260904290000_market_calendar_overrides.sql`
- `20260904300000_external_evidence_documents.sql`
- `20260904310000_news_sentiment_aspects.sql`
- `20260904320000_perspective_feedback_outcomes.sql`
- `20260904380000_perspective_analysis_modes.sql`
- `20260904330000_watchlist_plan_limits.sql`
- `20260904340000_watchlist_operational_health.sql`
- `20260904350000_watchlist_activity_feedback_hardening.sql`
- `20260904360000_watchlist_operational_monitoring.sql`
- `20260904370000_watchlist_atomic_research_quota.sql`
- `20260904390000_watchlist_review_workflow.sql`
- `20260904400000_watchlist_review_reminders.sql`
- `20260904410000_watchlist_metric_alerts.sql`
- `20260904420000_perspective_generation_jobs.sql`
- `20260904430000_perspective_claims.sql`
- `20260904450000_watchlist_peer_metrics.sql`
- `20260904460000_perspective_claim_feedback.sql`
- `20260904470000_watchlist_composition_metrics.sql`
- `20260904480000_watchlist_peer_metric_alerts.sql`
- `20260904490000_watchlist_overview_peer_query.sql`
- `20260904500000_watchlist_alert_summaries.sql`
- `20260904510000_watchlist_provider_health.sql`
- `20260904520000_watchlist_composition_snapshots.sql`
- `20260904530000_watchlist_research_jobs.sql`
- `20260904540000_watchlist_perspective_alert_reviews.sql`
- `20260904550000_watchlist_claim_alert_hardening.sql`
- `20260904560000_watchlist_manual_research_job_health.sql`
- `20260904570000_watchlist_decision_context.sql`
- `20260904580000_watchlist_operational_retention.sql`
- `20260904590000_watchlist_bulk_workflow_runs.sql`
- `20260904600000_watchlist_cron_dispatch_slots.sql`
- `20260904610000_watchlist_api_rate_limits.sql`
- `20260904620000_watchlist_cron_dispatch_acl_hardening.sql`
- `20260904630000_watchlist_cron_dispatch_acl_health.sql`

Vercel 部署只发布 Next.js 代码，不会自动执行 Supabase migrations；两者必须分别验收。

完成迁移后可使用只读 verifier 复核生产 schema（不会写入数据库，也不会输出密钥）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://mzfcaabhuwtfvsvadvsv.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
npm run watchlist:production-check
```

输出中的全部检查必须为 `"ok": true`，再进行 Watchlist 登录态验收；其中 release marker 用于确认最新迁移确实已应用。

Vercel 发布后可运行无副作用的 runtime verifier。它不会发送 Cron secret，也不会执行告警或研究任务；除验证页面和 Cron 路由的鉴权边界外，还会通过专用验收账号登录并读取一页真实 Watchlist overview：

```bash
WATCHLIST_RUNTIME_URL=https://<exact-deployment>.vercel.app \
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY> \
WATCHLIST_RUNTIME_EMAIL=<RUNTIME_ACCOUNT_EMAIL> \
WATCHLIST_RUNTIME_PASSWORD=<RUNTIME_ACCOUNT_PASSWORD> \
npm run watchlist:runtime-check
```

`WATCHLIST_RUNTIME_URL` 必须是本次发布返回的精确 HTTPS deployment URL；脚本不再回退到固定域名。
如果 Vercel Deployment Protection 截获请求，验证会失败，不能把平台登录页当作应用健康证明。
验收账号只能用于只读冒烟测试，不应复用管理员或人工用户账号；CI 的四项登录配置均须保存在 GitHub `production` environment secrets 中。

在生产 Provider 密钥已注入的受控环境运行 live canary。该命令会真实访问所有已配置 Provider；未配置的可选 Provider 跳过，`WATCHLIST_REQUIRED_PROVIDERS` 中任一 Provider 未配置或探测失败都会阻断发布：

```bash
npm run watchlist:provider-check
```

官方文档 Provider 还需配置一个允许抓取的官方公告 URL 作为 canary：`OFFICIAL_DOCUMENT_CANARY_URL`。该值只用于健康检查，不会写入数据库。

准备两个独立的只读验收账号后运行 RLS Canary。脚本不会创建、修改或删除数据；
每个 Canary 所列的用户可读私有表都必须在两个账号下有 fixture。worker-only 队列表、全局行情快照
和 service-role 专用表不属于此 REST 读取检查；用户可读的研究任务状态仍必须覆盖。它们由 schema/RPC 契约测试覆盖：

```bash
E2E_EMAIL=<ACCOUNT_A_EMAIL> E2E_PASSWORD=<ACCOUNT_A_PASSWORD> \
E2E_EMAIL_B=<ACCOUNT_B_EMAIL> E2E_PASSWORD_B=<ACCOUNT_B_PASSWORD> \
npm run watchlist:rls-check
```

生产发布 workflow 会强制运行 Provider 与 RLS Canary。GitHub `production` environment
必须设置 `WATCHLIST_RUNTIME_EMAIL_B` / `WATCHLIST_RUNTIME_PASSWORD_B`，并在两个账号下预置
Canary 所列的私有表 fixture；同时必须用 repository variable `WATCHLIST_REQUIRED_PROVIDERS`
显式声明发布不可降级的 Provider。Provider endpoint、Canary ticker/query 使用 repository variables，
Provider token/key 使用 environment secrets。

通知投递门禁使用 `WATCHLIST_DELIVERY_CANARY_EMAIL`（environment secret）、
`WATCHLIST_DELIVERY_CANARY_FROM`（repository variable）和 `RESEND_API_KEY`。每个 release SHA
只发送一封幂等 Canary 邮件，并轮询 Resend 状态；只有状态达到 `delivered` 才允许继续部署。

输出必须为 `"ok": true`，且每张 Canary 表的 `coverage` 都为 `full`；缺少任一
fixture 不是隔离证明，必须在发布前补齐。

Review 到期提醒由 Watchlist Dispatcher 调用数据库队列生成，单轮上限由
`WATCHLIST_REVIEW_REMINDER_LIMIT` 控制（建议生产值 `500`）。提醒复用现有
Email/Telegram、Digest、静默时段、重试和死信队列；`paused` 与
`invalidated` 标的不进入提醒队列。

如果 Cron 路由返回 `404`，说明生产仍在运行旧部署或 Vercel 项目绑定未指向当前 `main`，此时先处理部署切换，再进行 Cron 首次运行验收。

如果输出 `deployment_protection`，说明请求被 Vercel Deployment Protection 的 SSO 拦截，尚未到达 Next.js；需要使用 Vercel protection bypass 或公开生产别名后，才能验证应用自身的 `401/503` Cron 鉴权结果。

Watchlist Sharpe 等风险指标默认使用 `0%` 年化无风险利率；需要更准确的口径时，可在服务端配置 `WATCHLIST_RISK_FREE_RATE_PCT`，或按市场配置 `WATCHLIST_RISK_FREE_RATE_US_PCT`、`WATCHLIST_RISK_FREE_RATE_A_PCT`、`WATCHLIST_RISK_FREE_RATE_HK_PCT`、`WATCHLIST_RISK_FREE_RATE_JP_PCT`、`WATCHLIST_RISK_FREE_RATE_KR_PCT`、`WATCHLIST_RISK_FREE_RATE_TW_PCT`。市场专属值优先，非法值会安全回退到 `0%`。

## Step 4: 灌入 seed 数据

```bash
# 推 30 只股票 universe + 5 年财务历史
supabase db push --include-seed
```

或者手动：去 Supabase Dashboard → SQL Editor，把 `supabase/seed.sql` 内容粘贴执行。

## Step 5: 获取环境变量

去 Supabase Dashboard → Settings → API，记下：

- **Project URL** → `https://YOUR-PROJECT.supabase.co`
- **Project API keys → anon public** → `eyJ...`（前端可用）
- **Project API keys → service_role** → `eyJ...`（**仅服务端，绝不暴露**）

## Step 6: 添加到 Vercel

```bash
cd /Users/osborn/Developer/ClaudeCode/01_active/stock-monitor

vercel env add NEXT_PUBLIC_SUPABASE_URL production
# 粘贴 https://YOUR-PROJECT.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# 粘贴 anon public key

vercel env add SUPABASE_SERVICE_ROLE_KEY production
# 粘贴 service_role key（仅服务端用）
```

也可以在 [Vercel Dashboard](https://vercel.com/gilosbornhellos-projects/stock-monitor/settings/environment-variables) 手动添加。

## Step 7: 重新部署

```bash
vercel --prod
```

## Step 8: 验证

打开 https://stock-monitor-nu.vercel.app/login

- 输入你的邮箱 → 点击"发送魔法链接"
- 检查邮箱（含垃圾邮件）→ 点击链接
- 跳转回首页，右上角应该看到登录状态
- 去 `/watchlist` 添加股票 → 在 Supabase Dashboard → Table Editor → watchlists 应该看到记录

## Step 9: 配置邮箱模板（可选但推荐）

去 Dashboard → Authentication → Email Templates，定制：
- Magic Link
- Confirm Signup
- Reset Password

把发件人改成 `Stock Monitor <noreply@yourdomain.com>`，主题改中文。

## 故障排查

### "Supabase 未配置" 警告

环境变量没生效。检查：
1. `vercel env ls` 看是否在 production 环境
2. 是否运行了 `vercel --prod` 触发重新部署

### Magic link 邮件没收到

- 检查垃圾邮件
- 在 Dashboard → Auth → Logs 看是否真的发出
- 免费 plan 每小时有 4 封限制；你已付费应该没事
- 试试 Resend SMTP 自定义发件人（Dashboard → Auth → Email Provider）

### 登录后看不到自己的 watchlist

Trigger 没跑。手动执行：
```sql
insert into public.watchlists (user_id, name, is_default)
values (auth.uid(), '我的股票池', true);
```

### RLS 报错 "new row violates row-level security policy"

确认登录态。在 RLS 策略里：`with check (auth.uid() = user_id)` 要求每次 insert 都带 user_id 字段。

## 下一步：接真实数据

Supabase 跑通后，下一步是 Python 后端：
1. `claude-mem` Skill 接 Akshare + Alpha Vantage + EDGAR 拉数据
2. 写入 `stocks_universe`, `financial_history`, `news_items`, `broker_reports`
3. 每天 launchd 定时跑 LLM 视角合成，写入 `briefs`, `perspectives`, `stock_signals`
4. Web UI 自动读到最新数据

详见 [ROADMAP.md](ROADMAP.md) 的 v0.2 / v0.3 部分。
