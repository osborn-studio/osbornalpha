# Stock Monitor

> 个人股票池每日 AI 监控工具 · A 股 / 港股 / 美股  
> Next.js 15 · Supabase · Vercel · TradingView Lightweight Charts

[![Live](https://img.shields.io/badge/live-stock--monitor--nu.vercel.app-brightgreen)](https://stock-monitor-nu.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🌐 在线访问

| 版本 | URL |
|-----|-----|
| **v1.0 (current)** Next.js + Supabase | **https://stock-monitor-nu.vercel.app** |
| v0.1 (legacy 静态版) | https://gilosbornhello.github.io/stock-monitor/ |

> 路由：[首页](https://stock-monitor-nu.vercel.app/) · [股票池](https://stock-monitor-nu.vercel.app/watchlist) · [单股详情](https://stock-monitor-nu.vercel.app/stock/00700.HK) · [简报历史](https://stock-monitor-nu.vercel.app/briefs) · [设置](https://stock-monitor-nu.vercel.app/settings) · [登录](https://stock-monitor-nu.vercel.app/login)

**iPhone**：用 Safari 打开 → 分享 → 添加到主屏幕。下次像 App 一样开。

---

## 🎯 产品定位（v1.1）

> **桌面优先（IBKR 风格）+ 手机适配**。打开首页就是工作台，左栏 watchlist、中栏 K 线/详情、右栏新闻+AI 委员会——切换标的不重新加载页面，URL 用 `?s=TICKER` 同步。

## 🤖 Hiphon PM —— John Cameron 投资顾问 Agent（v1.2，CLI）

在 Stock Monitor 数据管线之上，新增一位虚拟资深基金经理 **John Cameron**（Hiphon 资本首席 PM）。
DNA：**Druckenmiller 主导**（全球宏观 / 流动性 / 顺势重仓 / 快速止损）+ 价值护城河 + 产业链卡脖子。

- **主代理** [`.claude/agents/john-cameron.md`](.claude/agents/john-cameron.md)：一二级市场专业问答 + 总调度
- **投资宪法** [`skills/hiphon-pm/references/doctrine.md`](skills/hiphon-pm/references/doctrine.md)：择时/选股/评级/策略/仓位/持仓决策/置信度校准/合规
- **选股技能** [`skills/hiphon-pm-pick`](skills/hiphon-pm-pick/SKILL.md)：「今天买什么」→ 排序买入清单（每只带评级/仓位%/进场区间/止损/风险）
- **个股深研** [`skills/hiphon-pm-deepdive`](skills/hiphon-pm-deepdive/SKILL.md)：单股系统性基本面报告 + 操作建议
- **战绩记录** [`skills/hiphon-pm-track`](skills/hiphon-pm-track/SKILL.md)：每个调用 append 落库 → 用[确定性脚本](skills/hiphon-pm/scripts/score-calls.sh)对照前复权 K 线自动打分（命中率/收益/校准）。**护城河**：对照真实战绩说话，正面解 AI 选股的过拟合/过度自信通病
- 复用现有 [`stock-daily-radar`](skills/stock-daily-radar/SKILL.md) / [`stock-bottleneck-picker`](skills/stock-bottleneck-picker/SKILL.md) 作子技能
- 数据全部来自现有 API（[取数与鉴权](skills/hiphon-pm/references/data-access.md)）；市场：A 股为主 + 港/美机会
- 个人战绩/持仓存 `~/.hiphon-pm/`（[storage spec](skills/hiphon-pm/references/storage.md)），**不进 git**（隐私）

**双形态**（需求 1）：每个 Skill 既可被用户直接调用（如「今天买什么」触发 `hiphon-pm-pick`），也可被 John Cameron 主代理在对话中自动编排。

**合规（个人版）**：可直言买卖评级，但每条必带 理由 + 仓位% + 止损/风险 + 「仅供个人参考」尾注。

> 设计文档：[`docs/superpowers/specs/2026-06-02-hiphon-pm-design.md`](docs/superpowers/specs/2026-06-02-hiphon-pm-design.md) · 经 CEO Review（SCOPE EXPANSION）扩出战绩/持仓/校准层
> 路线图（[TODOS](TODOS.md)）：每日自动早盘推送、Web `/hiphon` 聊天页。

## ✨ 已实现（v1.1）

### Web UI — IBKR 风格 3 栏 workspace
- 🏠 **首页 = 交易终端工作台**：
  - **左栏**：紧凑 watchlist（IBKR 风格），含内联 SVG sparkline、多分组可折叠
  - **中栏**：当前选中标的的 K 线 + 6 个 tab（行情/AI/财报/新闻/信号/13F）
  - **右栏**：AI 委员会信心 + Top 5 优先级 + 宏观条 + 新闻流
- 📋 **股票池管理页**：完整 CRUD + 分组 + 导出 YAML
- 📊 **单股详情页**：可分享的 `/stock/[ticker]` URL
- 📰 **简报历史**：日历列表 + 单日详情 + 30 天命中率
- ⚙️ **设置**：账号 / 推送 / 主题 / 配色
- 🔐 **登录**：Supabase magic-link 邮箱
- 🔍 **搜索**：**接入东方财富 API**，全 A/H/US 上市公司任意查（"完美世界" / "腾讯" / "PWRD" 都能搜到）

### 体验
- ⌘+K / Ctrl+K 全局唤起搜索
- 🌑 / ☀️ 暗色 / 浅色主题切换（localStorage 持久化）
- 🇨🇳 / 🇺🇸 配色方案（红涨 / 绿涨）
- 📱 iPhone 优先响应式 + 底部 tab bar
- 💾 PWA 可加到主屏幕
- 👤 访客模式（localStorage）+ 登录模式（Supabase）无缝切换

### 后端
- **Supabase Postgres** 10 表 schema + RLS 策略：
  - `stocks_universe` · `financial_history`（公开只读）
  - `watchlists` · `watchlist_items`（用户私有）
  - `briefs` · `stock_signals` · `perspectives`（每日简报全套）
  - `news_items` · `broker_reports` · `user_preferences`
- 自动触发器：用户注册时自动创建默认 watchlist
- **API routes**：`/api/search` · `/api/watchlist` · `/api/stocks/[ticker]`
- **Supabase SSR auth** middleware
- **Magic-link email auth** + `/auth/callback`

---

## 🚀 部署（已完成）

- ✅ Vercel 自动从 main 分支部署
- ✅ GitHub Actions 已移除（替换为 Vercel auto-deploy）
- ✅ 域名：`stock-monitor-nu.vercel.app`（Vercel 默认）

---

## 🔧 启用 Supabase（**你需要做的最后一步**）

我已经把 schema 和客户端代码全部写好，但 Supabase 连接需要你手动完成两件事：

### Step 1: 推送 schema 到你的 Supabase 项目

```bash
cd /Users/osborn/Developer/ClaudeCode/01_active/stock-monitor

# 1. 登录（会打开浏览器）
supabase login

# 2. 链接到你的项目（在 https://supabase.com/dashboard 选）
supabase link --project-ref <YOUR_PROJECT_REF>

# 3. 推送 schema（创建 10 张表 + RLS 策略）
supabase db push

# 4. 灌入 seed 数据（30 只股票 universe + 5 年财务）
supabase db reset --linked  # 或在 Studio 的 SQL Editor 粘贴 supabase/seed.sql
```

### Step 2: 配置 Vercel 环境变量

在 [Vercel Dashboard → Project → Settings → Environment Variables](https://vercel.com/gilosbornhellos-projects/stock-monitor/settings/environment-variables) 添加：

| Key | Value | 来源 |
|-----|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon public key) | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service_role secret) | 同上（仅服务端用，**绝不暴露给前端**） |

添加后触发重新部署：

```bash
vercel --prod
```

完成后，登录功能就会生效，watchlist 会自动从 localStorage 切换到 Supabase 持久化（多设备同步）。

---

## 🛠 本地开发

```bash
git clone https://github.com/gilosbornhello/stock-monitor.git
cd stock-monitor

# 安装
npm install

# 配置（可选；不配也能跑访客模式）
cp .env.example .env.local
# 编辑 .env.local 填 Supabase URL + Key

# 跑
npm run dev
# 打开 http://localhost:3000
```

可选：本地 Supabase（需要 Docker Desktop）：

```bash
supabase start         # 启动本地 Postgres + Studio
supabase db reset      # 应用 migrations + seed
# 复制本地 anon key 到 .env.local
```

---

## 📐 项目结构

```
stock-monitor/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # 根布局（TopBar + TabBar + Toast）
│   │   ├── page.tsx            # 首页
│   │   ├── watchlist/page.tsx  # 股票池管理
│   │   ├── stock/[ticker]/     # 单股详情（动态路由）
│   │   ├── briefs/             # 简报列表 + 详情
│   │   ├── settings/page.tsx   # 设置
│   │   ├── login/page.tsx      # Magic-link 登录
│   │   ├── about/page.tsx      # 关于
│   │   ├── auth/callback/route.ts  # OAuth 回调
│   │   ├── api/
│   │   │   ├── search/         # 股票搜索（Supabase 优先 + mock 兜底）
│   │   │   ├── watchlist/      # CRUD
│   │   │   └── stocks/[ticker]/
│   │   └── globals.css         # Tailwind + CSS 变量（theme/color-scheme）
│   ├── components/
│   │   ├── TopBar.tsx · TabBar.tsx · SearchInput.tsx
│   │   ├── KlineChart.tsx      # TradingView Lightweight Charts wrapper
│   │   ├── PerspectiveCard.tsx · ThemeToggle.tsx
│   │   ├── Disclaimer.tsx · Toast.tsx
│   ├── lib/
│   │   ├── supabase/client.ts · server.ts · database.types.ts
│   │   ├── stocks/search.ts    # Fuzzy search (中文/拼音/代码)
│   │   ├── data/mock.ts        # Mock data fallback
│   │   └── utils.ts            # cn, formatPrice, formatPct, ...
│   └── middleware.ts           # Supabase SSR auth refresh
├── supabase/
│   ├── config.toml             # Supabase 本地 config
│   ├── migrations/20260515000000_initial_schema.sql  # 10 表 + RLS
│   └── seed.sql                # 30 只股票 + 财务数据
├── public/
│   ├── manifest.json           # PWA
│   └── icon-{192,512}.svg
├── docs/                       # PRD / ARCHITECTURE / ROADMAP / DISCLAIMER
├── legacy-demo/                # v0.1 静态版本（归档保留）
└── README.md
```

---

## 📐 设计原则

| ✅ 是 | ❌ 不是 |
|-----|------|
| 决策辅助工具 | 不连券商不执行交易 |
| 信息整合 + 多视角 | 不是涨跌预测算命器 |
| 个人私用 | 不向不特定公众分发 |
| 完整 cite 来源 | 不构成投资建议 |
| iPhone 优先 | 不做对比模式（每股独立） |

---

## 🛣 Roadmap

- ✅ **v0.1** — UI 原型（静态 + mock 数据，GitHub Pages）
- ✅ **v1.0** — Next.js + Supabase + Vercel（当前）
- 🚧 **v1.1** — Python Skill 后端（Akshare + Alpha Vantage 接真实数据 + LLM 视角生成 + Telegram 推送）
- 🚧 **v1.2** — 13F 监控 + 券商研报 AI 摘要 + 30 天 backtest
- 🚧 **v2.0** — 多用户 SaaS 形态（如开放注册的话）

详见 [docs/ROADMAP.md](docs/ROADMAP.md)

---

## 📄 文档

- [PRD — 产品需求](docs/PRD.md)
- [ARCHITECTURE — 技术架构](docs/ARCHITECTURE.md)
- [ROADMAP — 路线图](docs/ROADMAP.md)
- [DISCLAIMER — 免责声明](docs/DISCLAIMER.md)
- [SUPABASE_SETUP — 数据库接入步骤](docs/SUPABASE_SETUP.md)

---

## 📜 License

MIT © 2026 · [免责声明](docs/DISCLAIMER.md)
