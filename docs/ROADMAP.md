# ROADMAP — Stock Monitor

## v0.1 — UI 原型上线（当前）

**已完成**：
- ✅ 高保真 Web UI 静态原型（HTML/CSS/JS）
- ✅ 4 个页面：首页 / Watchlist / 单股详情 / 关于
- ✅ Mock 数据，可点击体验
- ✅ TradingView Lightweight Charts K 线接入
- ✅ 移动端响应式
- ✅ GitHub Pages 部署
- ✅ localStorage 暂存 watchlist 改动

## v0.2 — Python 引擎骨架（Week 1）

| Day | 任务 |
|-----|-----|
| Mon | uv 初始化、pyproject、.env 模板 |
| Tue | 数据类型定义 + sqlite cache + Akshare client |
| Wed | Tushare client + Alpha Vantage client（Skill 集成） |
| Thu | EDGAR client + FRED client |
| Fri | Orchestrator 并发拉取 + 容错 |
| Sat | watchlist.yml 配置 + CLI `fetch` 子命令 |

## v0.3 — 信号 + 视角（Week 2）

| Day | 任务 |
|-----|-----|
| Mon | 规则引擎（财报临近/异常成交量/波动） |
| Tue | LLM 情绪判断（Haiku）+ 综合打分 |
| Wed | 9 个视角 prompt 编写 |
| Thu | Perspective orchestrator（并发 Sonnet） |
| Fri | Budget Guard + 每日成本 cap |
| Sat | 端到端：watchlist → perspectives.json |

## v0.4 — 简报 + 交付（Week 3）

| Day | 任务 |
|-----|-----|
| Mon | 简报 Markdown 模板 + Composer (Opus) |
| Tue | 合规后处理 + 免责声明强制注入 |
| Wed | Telegram bot 接入 + MarkdownV2 转义 |
| Thu | Email 渲染（HTML）+ SMTP |
| Fri | 静态 Web 站点构建 |
| Sat | 端到端手动跑 |

## v0.5 — 调度 + 接真实数据（Week 4）

| Day | 任务 |
|-----|-----|
| Mon | run-daily.sh + launchd plist |
| Tue | metrics.jsonl + 成本计算 |
| Wed | 失败告警邮件 |
| Thu | 简报历史归档 + Web 时间轴 |
| Fri | 第一次自动跑（08:30 CST） |
| Sat | Web UI 接入真实数据（替换 mock） |

## v0.6 — 测试 + 打磨（Week 5）

- 写测试（pytest + recorded fixtures）
- 视角输出 schema 校验
- 简报内容 LLM eval
- 通道渲染回归

## v0.7 — v0 发版（Week 6）

- 跑 7 天无故障验收
- 写完整使用文档
- 备份 .env

## v0 验收

- [ ] 30 天自用，每日成功率 ≥ 95%
- [ ] 每日成本 ≤ $5
- [ ] 自己每日打开率 ≥ 80%
- [ ] 30 天信号回测命中率 ≥ 60%

## v1.0 — 炒股软件级 Web（3 个月）

- TradingView K 线接入（已 demo，需接真实数据）
- 财务 5 年趋势图
- 券商研报 AI 摘要
- 财报日历 + 历史 PDF
- 13F 持仓变动追踪
- Sentinel 历史信号回看
- PWA + iOS Web Push
- 红绿配色可切换

## v2.0 — 长期演化（半年后）

- 多 watchlist 支持
- 中英双语简报
- 真实 agent debate（LangGraph）
- 用户自定义投资人视角
- 后端 API 服务化（FastAPI + Postgres）

## 退出策略

| 触发 | 决策 |
|-----|-----|
| 30 天打脸率 > 50% | 暂停发版，优化视角 |
| 数据成本 > $100/月 | 砍掉 Tushare，回退 Akshare |
| LLM 成本 > $300/月 | 切换 DeepSeek-R1 自托管 |
| 我自己不再每天打开 | 重新审视价值 |
