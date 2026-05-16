# Stock Monitor

> 个人股票池每日 AI 监控工具 · A 股 / 港股 / 美股  
> Personal daily AI-powered stock watchlist monitor for CN A-shares, HK, and US markets

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://gilosbornhello.github.io/stock-monitor/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 这是什么 · What

每天定时跑一次，针对你自己配置的股票池：

1. 拉取行情、财报日历、新闻、券商研报
2. 用 LLM 模拟多位投资大师视角合成一份简报
3. 推送到 Telegram、邮箱、Web 三处

A daily-running personal stock monitor:

1. Fetches quotes, earnings calendar, news, and broker reports for your watchlist
2. Uses LLMs to simulate multiple investor perspectives and synthesize a briefing
3. Delivers via Telegram, email, and a personal web dashboard

---

## 在线 Demo · Live Demo

👉 **[https://gilosbornhello.github.io/stock-monitor/](https://gilosbornhello.github.io/stock-monitor/)**

> 当前在线版本是 UI 原型（静态 + mock 数据）。可点击体验：
> - 首页：今日 AI 委员会信心 + Top 5 注意力优先级
> - Watchlist：添加 / 删除 / 分组股票
> - 单股详情：行情 + K 线 + AI 多视角 + 财报 + 新闻
> - iPhone Safari 流畅
>
> Current online version is a UI prototype (static + mock data). Backend & live data
> integration are tracked in the roadmap.

---

## 设计原则 · Design Principles

| 是 What it is | 不是 What it isn't |
|--------------|-----------------|
| ✅ 决策辅助工具 | ❌ 不是交易执行系统（永远不连券商） |
| ✅ 信息整合 + 多视角 | ❌ 不是涨跌预测算命器 |
| ✅ 个人私用 | ❌ 不向不特定公众分发 |
| ✅ 完整 cite 来源 | ❌ 不构成任何投资建议 |
| ✅ iPhone 优先体验 | ❌ 不做对比模式（每股独立管理） |

---

## 项目状态 · Status

- **v0.1 (2026-05)** — UI 原型上线 · GitHub Pages
- **v0.2** — Python 后端骨架 + 数据层 + Signal 引擎
- **v0.3** — LLM 视角合成 + 简报生成 + Telegram/Email 推送
- **v0.5** — Web UI 真实数据接入
- **v1.0** — TradingView K 线 + 5 年财务图 + 券商研报 AI 摘要

详见 [docs/ROADMAP.md](docs/ROADMAP.md)

---

## 技术栈 · Stack

| 层 Layer | 选择 Choice |
|---------|------------|
| Web 前端 | Vanilla HTML/CSS/JS + Tailwind CDN + TradingView Lightweight Charts |
| 后端 | Python (FastAPI) — 计划中 |
| LLM | Claude (Opus / Sonnet / Haiku) via Anthropic API |
| 数据 | Akshare / Alpha Vantage / EDGAR / FRED / Tushare Pro |
| 调度 | launchd (macOS) |
| 部署 | GitHub Pages (demo) → Cloudflare Pages / Vercel (production) |

---

## 文档 · Docs

- [PRD — 产品需求](docs/PRD.md)
- [ARCHITECTURE — 技术架构](docs/ARCHITECTURE.md)
- [ROADMAP — 路线图](docs/ROADMAP.md)
- [DISCLAIMER — 免责声明](docs/DISCLAIMER.md)

---

## 本地运行 Demo · Run Locally

零依赖。任意 HTTP server 即可：

```bash
git clone https://github.com/gilosbornhello/stock-monitor.git
cd stock-monitor
python3 -m http.server 8080
open http://localhost:8080
```

---

## License

MIT © 2026
