<!-- 18 本地部署与数据库导入 · 用途：本地开发环境搭建 + 迁移/seed 导入 · 最后更新 2026-06-20 -->

# 18 · 本地部署与数据库导入（Local Dev & DB Import）

在本机跑起 osbornalpha 并导入数据库。最小可跑路径不需要 Supabase（门禁会自动放行），但要验证登录/RLS 则需接 Supabase。

---

## 1. 前置

- Node.js 20 或 22。
- （可选）Supabase CLI：`brew install supabase/tap/supabase`（用于本地迁移/seed）。
- 代码须在外置 SSD 路径下：`~/Developer/ClaudeCode/01_active/stock-monitor`。

---

## 2. clone + 安装 + 启动

```bash
cd ~/Developer/ClaudeCode/01_active
git clone https://github.com/gilosbornhello/stock-monitor.git   # 若尚未 clone
cd stock-monitor
npm install
npm run dev        # next dev -p 3000 → http://localhost:3000
```

---

## 3. `.env.local`

在仓库根建 `.env.local`（参考 `.env.example`）。最常用的几项：

```bash
# Supabase（要验证登录/RLS 时必填；留空则门禁放行、可纯前端开发）
NEXT_PUBLIC_SUPABASE_URL=https://mzfcaabhuwtfvsvadvsv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# LLM（出 AI 简报/委员会时填其一；不填则用 ?skipLLM=true 看数据管线）
DEEPSEEK_API_KEY=...
# ANTHROPIC_API_KEY=...           # 回退

# 数据源（A 股深度数据）
TUSHARE_TOKEN=...
```

> **门禁在 Supabase 未配置时的行为**：`middleware.ts` 与 `(app)/layout.tsx` 检测到 `NEXT_PUBLIC_SUPABASE_URL` 缺失或含 `placeholder` 时**直接放行**，所有页面可访问、不强制登录——方便纯 UI 开发。一旦填了真实 Supabase URL/Key，门禁立即生效，未登录访问 `/dashboard` 会跳 `/login`。
> 安全提示：本地验证平台计量/成本审计时需要服务端 `SUPABASE_SERVICE_ROLE_KEY`；只通过未提交的本地 secret 或受控环境注入，绝不写进仓库或输出。纯 UI/数据管线开发可不启用平台 LLM 路径。

---

## 4. 本地应用迁移

连到（共享的）Supabase 项目或自建本地实例，二选一。

**A. 推到远端 Supabase 项目（最简单）**
```bash
supabase login
supabase link --project-ref mzfcaabhuwtfvsvadvsv   # 输入 DB 密码
supabase db push                                    # 应用 supabase/migrations/*
```

**B. 本地 Supabase（Docker）**
```bash
supabase start          # 起本地 Postgres + Auth + Studio
supabase db reset       # 重建并应用迁移 + seed.sql
```
本地实例会打印本地 URL / anon key，把它们填进 `.env.local` 即可对本地库开发。

迁移内容（共 11 表）：`stocks_universe`、`financial_history`（公开 reference，所有人可读）+ `watchlists`、`watchlist_items`、`briefs`、`stock_signals`、`perspectives`、`news_items`、`broker_reports`、`user_preferences`、`profiles`（均 RLS 按 `auth.uid()` 隔离）。注册触发器 `on_auth_user_created` 自动建默认 watchlist + user_preferences + profiles。

---

## 5. 灌入 seed（stocks_universe）

`supabase/seed.sql` 含 30 只股票（A/HK/US）。`db reset` 已自动跑；只补 seed：

```bash
supabase db push --include-seed
# 或：Supabase Studio/Dashboard → SQL Editor 粘贴 supabase/seed.sql 执行
```
seed 用 `on conflict (ticker) do update`，可反复执行。验证：`/api/search?q=茅台` 或 `/api/stocks/600519.SH` 返回数据。

---

## 6. 本地验证

- 纯前端（无 Supabase）：`http://localhost:3000` 可直接进 `/dashboard`（门禁放行）。
- 接 Supabase 后：未登录访问 `/dashboard` → 跳 `/login`；注册/登录后可见数据；用两个账号验证 RLS 隔离（见 `11_TEST_AND_EVAL_PLAN.md` §2.3）。
- 简报数据管线（无 LLM 成本）：`http://localhost:3000/api/brief/preview?skipLLM=true&format=markdown`。
- 预检：`npm run typecheck && npm run build`。
