# ARCHITECTURE — Stock Monitor

> 技术架构 + 模块边界 + 数据流

## 1. 高层架构

```
                ┌──────────────────────────────────────┐
                │  launchd (08:30 CST / 22:00 CST)     │
                └────────────────┬─────────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────────┐
                │  /stock-monitor-daily Skill          │
                │  (Claude Code Skill)                 │
                └────┬───────────────┬─────────────┬───┘
                     │               │             │
                     ▼               ▼             ▼
              ┌──────────┐    ┌──────────┐  ┌──────────┐
              │  DATA    │    │ SIGNALS  │  │ DELIVER  │
              │  LAYER   │    │ + AI     │  │ LAYER    │
              └──────────┘    └──────────┘  └──────────┘
                  │                │             │
   ┌──────────────┼──────────┐     │       ┌─────┼─────┬─────┐
   ▼              ▼          ▼     ▼       ▼     ▼     ▼     ▼
 Akshare    Alpha Vantage  EDGAR  FRED   Telegram Email Web TradingView
 (A/HK)        (US)         (US)  (Macro)  Bot    SMTP  UI    Charts
                                                              CDN
                  ↑
          ┌───────┴────────┐
          │  Anthropic API │
          │  Claude Opus/  │
          │  Sonnet/Haiku  │
          └────────────────┘
```

## 2. 模块清单

```
stock-monitor/
├── docs/                          # 设计文档（本仓库）
├── assets/                        # Web demo 资源
│   ├── css/style.css
│   ├── js/app.js
│   ├── js/watchlist.js
│   ├── js/stock.js
│   └── data/mock.json
├── index.html                     # Web demo 首页
├── watchlist.html                 # Watchlist 管理
├── stock.html                     # 单股详情
├── about.html                     # 关于
│
├── stock_monitor/                 # Python 包（计划中，未实现）
│   ├── __init__.py
│   ├── cli.py
│   ├── data/
│   │   ├── types.py
│   │   ├── orchestrator.py
│   │   ├── cache.py
│   │   └── sources/
│   │       ├── akshare_client.py
│   │       ├── alphavantage_client.py
│   │       ├── edgar_client.py
│   │       ├── fred_client.py
│   │       └── news_aggregator.py
│   ├── signals/
│   │   ├── rules.py
│   │   ├── llm_judge.py
│   │   └── scorer.py
│   ├── perspectives/
│   │   ├── orchestrator.py
│   │   └── personas/  *.md (9 个视角 prompt)
│   ├── compose/
│   │   └── composer.py
│   ├── deliver/
│   │   ├── telegram.py
│   │   ├── email.py
│   │   └── web_static.py
│   ├── llm/
│   │   ├── client.py
│   │   └── budget.py
│   └── feedback/
│       ├── tracker.py
│       └── backtest.py
│
├── backend/                       # FastAPI 后端（计划中）
│   └── app.py
│
├── config/
│   ├── watchlist.example.yml
│   ├── perspectives.yml
│   └── delivery.yml
│
├── scripts/
│   ├── setup.sh
│   └── install_launchd.sh
│
├── briefs/                        # gitignored
├── raw/                           # gitignored
├── logs/                          # gitignored
├── feedback/                      # gitignored
└── .env.example
```

## 3. 数据源决策矩阵

| 数据需求 | A 股 | 港股 | 美股 |
|---------|-----|-----|------|
| 日 OHLCV | Akshare | Akshare / Longport | Alpha Vantage |
| 财报 | Tushare + 巨潮 | HKEX | EDGAR (10-K/10-Q) |
| 财报日历 | Tushare | AAStocks | Alpha Vantage |
| 新闻情绪 | 财联社 RSS + 雪球 | 雪球港股 | Alpha Vantage NEWS_SENTIMENT |
| 研报 | 雪球公开 | 雪球公开 | EDGAR 8-K + Seeking Alpha RSS |
| 13F | — | — | EDGAR 13F-HR |
| 宏观 | Akshare | — | FRED |

**核心原则**：
- ✅ 优先用免费/开源数据源
- ✅ 优先复用现成 Skills (Alpha Vantage / EDGAR / FRED)
- ❌ 不爬付费/受限平台（合规优先）

## 4. LLM 任务分工

| 任务 | 模型 | 单次成本估算 |
|-----|------|------------|
| 新闻情绪二分类 | Claude Haiku 4.5 | ~$0.0001 |
| 视角推理（9 个并发） | Claude Sonnet 4.6 | ~$0.007/视角 |
| 简报最终合成 | Claude Opus 4.7 | ~$0.07 |
| 财报 transcript 摘要 | Claude Sonnet 4.6 1M | ~$0.04 |
| 单标的深度报告 | Claude Opus 4.7 | ~$0.30 |

**日预算**：$5/天 cap，超过自动降级到 Haiku。

## 5. 失败模式与降级

| 失败 | 检测 | 降级 |
|-----|-----|------|
| 数据源 timeout | `httpx.TimeoutException` | 备用源 → 简报标"数据缺失" |
| LLM API 不可达 | `ConnectionError` | 1 次重试 → 本地 Ollama 兜底 |
| LLM 输出非 JSON | `JSONDecodeError` | 1 次重试 → 跳过该视角 |
| 违规建议语言 | 后处理正则 | 自动替换合规语言 |
| Telegram 失败 | API error | 写入 retry queue + 邮件告警 |
| 简报超时 (>5min) | 整体 timeout | 用上一份简报 + 告警 |
| 单日成本超 budget | BudgetGuard | 跳过剩余视角 + 标注 |

**核心**：永不沉默失败。所有降级都在简报顶部明确标注。

## 6. 合规与安全

| 类别 | 措施 |
|-----|------|
| API key | `.env` + `.gitignore`；macOS Keychain |
| Telegram Token | 仅 send_message 权限 |
| 邮件认证 | App Password / OAuth |
| 内容合规 | LLM 输出后处理过滤"建议买入/卖出" |
| 审计 | 所有调用记录到 `logs/audit-YYYY-MM.jsonl` |
| 数据 | 不存储仓位 / 资金 / PII |

## 7. 可观测性

每次运行写入 `logs/metrics.jsonl`：

```jsonl
{"ts":"...","run_id":"abc","stage":"data_fetch","duration_s":45,...}
{"ts":"...","run_id":"abc","stage":"signals","top_n":5,...}
{"ts":"...","run_id":"abc","stage":"compose","cost_usd":0.45,...}
{"ts":"...","run_id":"abc","stage":"end","total_cost_usd":1.20,"status":"success"}
```

## 8. 部署演化

| 阶段 | 部署 |
|-----|-----|
| v0 (UI demo) | GitHub Pages（本仓库当前状态） |
| v0.5 (本地引擎) | macOS Mac mini + launchd |
| v1 (Web 接入) | 同上 + Cloudflare Tunnel 给 iPhone 用 |
| v2 (多用户 SaaS) | Cloudflare Pages + Modal / Railway 后端 + Postgres |

---

## 9. Hiphon PM Agent 层（v1.2+）

在上述 Web/数据架构之上叠加一层 **investment agent**（CLI + Hermes 双端），复用现有数据 API、不改 Web 栈。

```
渠道：CLI (Claude Code) · Telegram/飞书 (Hermes gateway)
  │
主代理 .claude/agents/john-cameron.md  ── 人格(Druckenmiller DNA) + 意图路由
  │   遵循 skills/hiphon-pm/references/doctrine.md（投资宪法，单一事实源）
  ├─ hiphon-pm-pick      选股+择时 → 排序买入清单
  ├─ hiphon-pm-deepdive  个股系统性基本面报告
  ├─ hiphon-pm-track     战绩记录 + score-calls.sh 确定性打分
  └─ stock-bottleneck-picker / ai-supply-chain-bottleneck-hunter（卡脖子研究）
  │
数据：复用 Web 端 API（行情/财报/信号/资金流/AI委员会）
状态：~/.hiphon-pm/（calls.jsonl 战绩 + portfolio + scorecard，append-only，不进 git）
```

**关键架构原则**
- **单一事实源**：技能权威内容在 `skills/`；Hermes 端 `hermes/skills/` 只是符号链接薄壳——一处修改两端生效。
- **命中由代码裁定**：战绩 hit/miss 由 `score-calls.sh`（前复权 K 线）确定性计算，LLM 不得自评自己的命中率（反过拟合/过度自信）。
- **append-only journal**：调用与篮子再平衡只追加不改写，使战绩可信、可校准（by_factor/by_evidence/by_chain_role）。
- **Hermes 接口级融合**：内核 100% 上游（零 fork/vendor），故 `upgrade-hermes.sh` 可持续自动升级（烟测+回滚）。

**Hedge Fund AI（设计阶段）** 在此基础上扩展为 5 层 playbook 操作系统（PM/人决策 → Agent → Playbook Runtime → Skill → Data），面向中国私募/可转债/周频/risk-parity；详见 `docs/designs/hedge-fund-ai-prd.md`。**仅设计，未编码。**
