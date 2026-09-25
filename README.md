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
| EdgeOne Pages / Makers | 待绑定腾讯 EdgeOne 项目与自定义域名 |
| v0.1 (legacy 静态版) | https://gilosbornhello.github.io/stock-monitor/ |

> 路由：[首页](https://stock-monitor-nu.vercel.app/) · [股票池](https://stock-monitor-nu.vercel.app/watchlist) · [单股详情](https://stock-monitor-nu.vercel.app/stock/00700.HK) · [简报历史](https://stock-monitor-nu.vercel.app/briefs) · [设置](https://stock-monitor-nu.vercel.app/settings) · [登录](https://stock-monitor-nu.vercel.app/login)

**iPhone**：用 Safari 打开 → 分享 → 添加到主屏幕。下次像 App 一样开。

---

## 📈 实时行情 API（对外接入）

服务端已接入 **DataGateway/Wind**，并对外提供无需鉴权的 REST 行情快照接口：

生产 Base URL：`https://osbornalpha.com`（Vercel 默认域名亦可）。

```bash
# 单标的
curl -sS 'https://osbornalpha.com/api/quote/600519.SH'

# 批量（逗号分隔，最多 40 个）
curl -sS 'https://osbornalpha.com/api/quote/batch?tickers=600519.SH,0700.HK,AAPL'
```

- 数据链路：`osbornalpha /api/quote/* -> DataGateway/Wind -> Eastmoney/Sina/Tencent 等回退`
- 响应模式：REST 快照 + 30～60 秒缓存，不是 WebSocket/SSE 推送
- 调用方**不需要** DataGateway 地址或 API Key；这些凭证只保留在服务端
- 外部服务可直接调用；浏览器跨域调用需服务端按 Origin 增加 CORS 白名单

完整字段、示例、错误处理、轮询建议和对方接入清单见 **[实时行情 API 对接说明](docs/REALTIME_MARKET_DATA_API.md)**。

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
- **产业链卡脖子作业法内化**（doctrine §11）：把 [`stock-bottleneck-picker`](skills/stock-bottleneck-picker/SKILL.md) + [`ai-supply-chain-bottleneck-hunter`](skills/ai-supply-chain-bottleneck-hunter/SKILL.md) 两个研究技能的方法论吃进 John Cameron——两镜头(Serenity/Crux)、拆栈、四角色候选、证据 ●/◐/○。证据质量与链角色写入战绩，按 `by_evidence`/`by_chain_role` 校准（"我的高证据/真瓶颈调用是否真的更准"）。纯研究仍可路由到这两个独立技能。
- 复用现有 [`stock-daily-radar`](skills/stock-daily-radar/SKILL.md) 作子技能
- 数据全部来自现有 API（[取数与鉴权](skills/hiphon-pm/references/data-access.md)）；市场：A 股为主 + 港/美机会
- 个人战绩/持仓存 `~/.hiphon-pm/`（[storage spec](skills/hiphon-pm/references/storage.md)），**不进 git**（隐私）

**双形态**（需求 1）：每个 Skill 既可被用户直接调用（如「今天买什么」触发 `hiphon-pm-pick`），也可被 John Cameron 主代理在对话中自动编排。

**合规（个人版）**：可直言买卖评级，但每条必带 理由 + 仓位% + 止损/风险 + 「仅供个人参考」尾注。

### 🤝 Hermes Agent 融合（v1.3，接口级）

John Cameron 已接入 [Hermes Agent](https://github.com/NousResearch/hermes-agent)（NousResearch 自进化 agent）运行时——**Telegram/飞书随时问股，cron 自动周度决策包，战绩接 Hermes 学习闭环**。零 fork、零 vendoring：

- [`hermes/skills/`](hermes/skills/)：4 个 Hermes 入口技能（薄壳，权威内容仍在本仓库），由 [`hermes/install.sh`](hermes/install.sh) 符号链接进 `~/.hermes/skills/finance/`
- [`hermes/upgrade-hermes.sh`](hermes/upgrade-hermes.sh)：**核心模块自动升级**——包裹官方 `hermes update`，加 烟测（版本/技能/状态）→ 失败自动回滚 → Telegram 通知；由 Hermes cron 每周日 03:30 驱动
- Hermes cron `hiphon-weekly-pack`：每周五 16:30 John Cameron 自动产出周度决策包推送 Telegram
- 取数密码注入 `~/.hermes/.env`（`STOCK_MONITOR_SITE_PASSWORD`）

> 设计文档：[`docs/superpowers/specs/2026-06-02-hiphon-pm-design.md`](docs/superpowers/specs/2026-06-02-hiphon-pm-design.md) · 经 CEO Review（SCOPE EXPANSION）扩出战绩/持仓/校准层 · [Hermes 融合设计](docs/superpowers/specs/2026-06-12-hermes-integration-design.md)
> 路线图（[TODOS](TODOS.md)）：Web `/hiphon` 聊天页（每日推送已由 Hermes 周度包取代）。

### 🏦 Hedge Fund AI —— 中国私募投资操作系统 PRD（设计阶段）

把 John Cameron 从「个人选股顾问」延伸为面向**中国私募基金经理**的投资操作系统设计草案：抽象自 Alva.ai 学习笔记，落地为 Playbook OS（可转债 / A股多资产 / 周频 / risk-parity / Wind·Choice·券商数据 / 人在环审批）。**目前为 PRD + 5 份专家深化 annex，尚未编码**。

- 顶层 PRD：[`docs/designs/hedge-fund-ai-prd.md`](docs/designs/hedge-fund-ai-prd.md)（v2，含 5 层架构 + 核心 Playbook schema + MVP + 数据 Skill 表 + 合规边界 + 审批闸 + 周度决策包工作流）
- 5 份专家 annex（[`docs/designs/hedge-fund-ai/`](docs/designs/hedge-fund-ai/)）：playbook runtime · 可转债策略 · 私募合规与审批 · risk-parity+组合回测 · 数据 Skill 与本地化
- 卡脖子方法论上游 fork 集成：[`docs/designs/chokepoint-pipeline-integration.md`](docs/designs/chokepoint-pipeline-integration.md) + [`skills/hiphon-pm/scripts/research-pack.sh`](skills/hiphon-pm/scripts/research-pack.sh)（chokepoint-atlas scoring/evidence-ladder/catalyst 已并入 doctrine §11）

> ⚠️ Hedge Fund AI 的合规部分为常识性边界、**非法律意见**，每个数字均标「须法务确认」。

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

- ✅ Vercel 从 `main` 分支自动部署；前提是 Vercel Project 的 Git Repository 指向 `osborn-studio/osbornalpha`
- ✅ GitHub Actions 负责应用检查和行情连通性告警，Vercel 负责自动部署
- ✅ 域名：`stock-monitor-nu.vercel.app`（Vercel 默认）
- ⏳ EdgeOne Pages / Makers：见 [docs/EDGEONE_DEPLOY.md](docs/EDGEONE_DEPLOY.md)

DataGateway 常驻、Vercel 环境变量和自动部署验收见 [Vercel + DataGateway 部署说明](docs/VERCEL_DATAGATEWAY_DEPLOYMENT.md)。

快速导入 EdgeOne：

[![Deploy with EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https://github.com/gilosbornhello/stock-monitor)

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
| `DATAGATEWAY_BASE_URL` | `https://gateway.example.com/` | Datagateway（服务端 HTTPS 地址） |
| `DATAGATEWAY_API_KEY` | 网关 API Key | Datagateway（仅服务端用，**绝不暴露给前端**） |
| `NEXT_PUBLIC_DATAGATEWAY_ENABLED` | `true` / `false` | 是否向前端开放仅由 Datagateway 支持的 JP/KR 日线区间；必须与服务端配置保持一致 |
| `DATAGATEWAY_REALTIME_QUOTE_PATH` | `/v1/market-data/tickers/query` | Datagateway Wind 实时快照接口 |

添加后触发重新部署：

```bash
vercel --prod
```

当 DataGateway 运行在本机而 stock-monitor 部署在 Vercel 时，使用 Tailscale Funnel 暴露受控 HTTPS 入口：

```bash
tailscale funnel --bg --https=443 http://127.0.0.1:<DATAGATEWAY_PORT>
tailscale funnel status
```

将输出的 `https://<machine>.<tailnet>.ts.net/` 配置为 `DATAGATEWAY_BASE_URL`。Funnel 是公网入口，必须同时启用 `DATAGATEWAY_API_KEY`，且 DataGateway 只暴露 `/v1/market-data/tickers/query` 和日线接口；本机休眠或断网时，行情会自动回退到公开数据源/短期缓存。

Wind 实时快照由服务端以 `POST /v1/market-data/tickers/query` 请求
`{"symbols":["600519.SH","0700.HK"]}`，使用 `Authorization: Bearer <API key>`；响应读取
DataGateway 的 `data[].symbol`、`data[].last_price` 和 `data[].fetched_at`。浏览器只访问本站 API，不会接触 Funnel 地址或密钥。

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
│
│   ── Hiphon PM Agent 层（v1.2+，CLI/Hermes 双端）──
├── .claude/agents/
│   └── john-cameron.md         # 主代理：资深 PM 人格 + 技能编排
├── skills/                     # agentskills.io 标准技能（Claude Code & Hermes 共用）
│   ├── hiphon-pm/
│   │   ├── references/         # doctrine（投资宪法）/ storage / data-access
│   │   └── scripts/            # score-calls.sh（战绩打分）/ research-pack.sh
│   ├── hiphon-pm-pick/         # 选股+择时
│   ├── hiphon-pm-deepdive/     # 个股深研
│   ├── hiphon-pm-track/        # 战绩记录+自我打分
│   ├── stock-daily-radar/      # 每股早报
│   ├── stock-bottleneck-picker/        # 产业链瓶颈选股
│   ├── ai-supply-chain-bottleneck-hunter/  # 卡脖子研究框架（含 chokepoint-atlas 导入）
│   └── portfolio-pdf-report/   # 持仓 PDF → 可搜索/筛选/排序 HTML 报表
├── hermes/                     # Hermes Agent 接口级融合（v1.3）
│   ├── skills/                 # 4 个 Hermes 入口薄壳
│   ├── install.sh              # 符号链接进 ~/.hermes/skills/
│   └── upgrade-hermes.sh       # 核心自动升级（烟测+回滚）
│
├── docs/
│   ├── PRD.md · ARCHITECTURE.md · ROADMAP.md · DISCLAIMER.md · SUPABASE_SETUP.md  # Web 产品文档
│   ├── designs/                # Agent 设计：hedge-fund-ai-prd + 5 annex + chokepoint
│   └── superpowers/specs/      # Hiphon PM / Hermes 融合 设计 spec
├── TODOS.md
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
- ✅ **v1.0 / v1.1** — Next.js + Supabase + Vercel Web 工作台（IBKR 风格 3 栏）
- ✅ **v1.2** — **Hiphon PM / John Cameron 投资顾问 Agent**（CLI）：doctrine 投资宪法 + pick/deepdive/track + 战绩问责层 + 卡脖子方法论
- ✅ **v1.3** — **Hermes Agent 接口级融合**：Telegram/飞书问股、cron 周度决策包、核心自动升级
- 🏦 **设计中** — **Hedge Fund AI**（中国私募投资操作系统 PRD + 5 专家 annex；可转债/周频/risk-parity）
- 🚧 **后续** — Web `/hiphon` 聊天页 · 13F 监控 · 多用户 SaaS

详见 [docs/ROADMAP.md](docs/ROADMAP.md)

---

## 📄 文档

**Web 产品（v1.x）**
- [PRD — 产品需求](docs/PRD.md) · [ARCHITECTURE — 技术架构](docs/ARCHITECTURE.md) · [ROADMAP — 路线图](docs/ROADMAP.md) · [DISCLAIMER — 免责声明](docs/DISCLAIMER.md) · [SUPABASE_SETUP — 数据库接入](docs/SUPABASE_SETUP.md) · [EDGEONE_DEPLOY — 腾讯 EdgeOne 部署](docs/EDGEONE_DEPLOY.md)

**Hiphon PM Agent（v1.2 / v1.3）**
- [Hiphon PM 设计](docs/superpowers/specs/2026-06-02-hiphon-pm-design.md) · [Hermes 融合设计](docs/superpowers/specs/2026-06-12-hermes-integration-design.md)
- [问责层 CEO Plan](docs/designs/hiphon-pm-accountability.md) · [chokepoint-atlas 集成](docs/designs/chokepoint-pipeline-integration.md)

**Research OS（本地专用，RESEARCH_OS_ENABLED=1）**
- [产品/技术 Spec](docs/research-os/product-technical-spec.md) · [Phase 1 skeleton](docs/research-os/2026-07-04-phase1-skeleton.md) · [Phase 2 signals+thesis](docs/research-os/2026-07-04-phase2-signals-thesis.md)
- 每日流水线 `scripts/research-daily.ts`（radar 导入 → signal 提炼 → thesis 监控；alerts 一律待人工裁决）。可自行挂 cron/launchd，例：`30 8 * * * cd <repo> && RESEARCH_OS_ENABLED=1 npx tsx scripts/research-daily.ts`（用户自选，不代配）

**Hedge Fund AI（设计阶段）**
- [PRD v2](docs/designs/hedge-fund-ai-prd.md) — 顶层
- annex：[playbook runtime](docs/designs/hedge-fund-ai/playbook-runtime-spec.md) · [可转债策略](docs/designs/hedge-fund-ai/convertible-bond-strategy-spec.md) · [私募合规与审批](docs/designs/hedge-fund-ai/compliance-and-approval-spec.md) · [risk-parity+回测](docs/designs/hedge-fund-ai/risk-parity-and-backtest-spec.md) · [数据 Skill 与本地化](docs/designs/hedge-fund-ai/data-skills-and-localization-spec.md)

## 🧰 Skills

- [portfolio-pdf-report](skills/portfolio-pdf-report/SKILL.md)：把持仓/portfolio PDF 转成可搜索、筛选、排序的临时多维 HTML 报表。

---

## 📜 License

MIT © 2026 · [免责声明](docs/DISCLAIMER.md)
