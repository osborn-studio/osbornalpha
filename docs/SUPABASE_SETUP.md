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

Vercel 部署只发布 Next.js 代码，不会自动执行 Supabase migrations；两者必须分别验收。

完成迁移后可使用只读 verifier 复核生产 schema（不会写入数据库，也不会输出密钥）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://mzfcaabhuwtfvsvadvsv.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
npm run watchlist:production-check
```

输出中的全部检查必须为 `"ok": true`，再进行 Watchlist 登录态验收；其中 release marker 用于确认最新迁移确实已应用。

Vercel 发布后可运行无副作用的 runtime verifier。它不会发送 Cron secret，也不会执行告警或研究任务；只验证页面存在、Cron 路由已安装并且未授权请求会被拒绝：

```bash
WATCHLIST_RUNTIME_URL=https://stock-monitor-nu.vercel.app npm run watchlist:runtime-check
```

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
