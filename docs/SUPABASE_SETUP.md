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
# 推送 migrations/ 里所有 .sql
supabase db push
```

这会创建：
- 10 张表（stocks_universe, financial_history, watchlists, watchlist_items, briefs, stock_signals, perspectives, news_items, broker_reports, user_preferences）
- RLS 策略（用户只能看自己数据 + 公开 reference 表所有人可读）
- 自动触发器（用户注册时自动建默认 watchlist + 默认偏好）

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
