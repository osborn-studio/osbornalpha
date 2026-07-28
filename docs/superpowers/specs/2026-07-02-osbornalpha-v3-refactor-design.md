# OsbornAlpha V3 全栈重构 — 设计文档

**日期**: 2026-07-02
**状态**: 已获用户逐节批准（§1–§6，含浏览器高保真稿确认）
**方式**: 方案 A —— 原地渐进式重构（同 repo/main，逐板块上线，feature flag 过渡）
**首位用户**: Osborn 本人（多租户 SaaS 架构保持不变：Supabase RLS + BYO-key）

---

## 0. 目标与已确认决策

把 osbornalpha.com 从"信息展示型投研站"重构为"个人投资者决策操作系统"。五项需求与澄清结论：

| 需求 | 结论 |
|---|---|
| 推进方式 | 总设计蓝图先行，批准后按依赖序实现（本文档即蓝图） |
| 交易决策管理范围 | **③ 全链路**：决策日志 + 持仓 P&L + 择时信号归因闭环 |
| 交易录入方式 | 手动快速表单 + Copilot 对话解析（回显确认后入库）；CSV 导入暂缓 |
| 信息架构 | B+A 混合：4 顶层板块（今日/情报/投资/工具），Copilot 全局浮层 |
| 技能集成 | **全部产品化为站内功能**；范围 = 二级市场核心包 + 公司研究包 + 一级市场包 |
| 视觉方向 | **C 双密度混合**：V2 静奢基调 + 数据面板高密度档，一套 token 两档密度 |
| 数据预算 | Tushare 升 5000 积分（用户充值）+ 预留专业源分级接入（Wind 桥/Polygon） |
| Vercel | 先 Hobby，长任务按分段架构设计，升 Pro 后自动受益（maxDuration 环境变量化） |
| ARK | 用户 key 已可用；Anthropic 协议接入纳入本次重构 P1 |

---

## 1. 信息架构与路由

### 顶层导航（4 板块 + 2 全局件）

| 板块 | 路由 | 内容（现有页面去向） |
|---|---|---|
| 🌅 今日 | `/today` | 晨间雷达（优先级流，🔴 级联动未平决策纪律）+ 持仓速览卡 + 宏观速览 + AI 简报。合并现 `/dashboard` `/radar` `/briefs`；简报历史归档 `/today/briefs/[date]` |
| 📡 市场情报 | `/intel` | 二级 Tab：**发现** `/intel/discover`（筛选器、瓶颈选股向导、产业链尽调）；**研究** `/intel/stock/[ticker]`（现个股 6-tab 页迁入 + 「深度研究」按钮） |
| 💼 我的投资 | `/portfolio` | C 驾驶舱主屏（详见 §3）；子页 `/portfolio/decisions` `/portfolio/positions` `/portfolio/review` |
| 🧰 研究工具 | `/tools` | 技能库目录、回测实验室（现 `/backtest` 迁入 + 决策vs信号对照）、DCF 工作台、一级市场工作台 `/tools/primary` |
| 🎩 Copilot | 全局浮层 | 底部 Tab 移除；右下浮动按钮 + `⌘K` 侧滑面板，自动注入当前页面上下文（ticker/持仓/未平决策）；现 `/copilot` 保留为展开态 |
| ⚙️ 设置 | 顶栏头像菜单 | 现 `/settings` 入口迁移 |

### 落地方式
- 新路由组 `(v3)` 逐板块建设；旧路由 301 重定向逐个切换（`/dashboard→/today`、`/watchlist→/portfolio`、`/radar→/today`、`/backtest→/tools/backtest` 等）。
- `TabBar` 重写为 4 板块 + Copilot 浮钮结构。
- `src/lib/**` 领域库全部原位保留复用。

---

## 2. 数据模型 — 决策·持仓·归因链路

决策链路新增 4 张 Supabase 表（全带 `user_id` + RLS，单个迁移文件交付；第 5 张技能产出表 `artifacts` 见 §5）：

### `decisions` 决策日志（核心表）
```
id, user_id, ticker, market(A/HK/US)
action: buy | sell | trim | add | hold | pass
thesis: text                 -- 决策理由
confidence: int 0-100
entry_zone: numrange, target_price, stop_loss: numeric
horizon: short | mid | long
source_type: manual | copilot | signal | radar | skill   -- 归因起点
source_ref: jsonb            -- 信号id / copilot run / 技能报告引用
status: open | executed | expired | cancelled
decided_at, expires_at
```

### `trades` 成交记录
```
id, user_id, decision_id (nullable FK → decisions)
ticker, direction(buy/sell), price, quantity, fee, currency
executed_at, note
```
录入：站内快速表单（个股页/驾驶舱一键带出现价）+ Copilot 工具 `record_trade`（解析→回显确认→入库）。

### `positions` 持仓
```
user_id, ticker, shares, avg_cost, realized_pnl, currency, opened_at, closed_at
```
每笔 trade 写入后按加权平均成本法重算；浮盈实时由 `useBatchQuotes` 行情计算，不落库。

### `decision_reviews` 复盘评分（hiphon-pm-track 产品化）
```
decision_id FK, scored_at
forward_5d_pct, forward_20d_pct, forward_60d_pct
hit: boolean, score: numeric, calibration_bucket
```
由 daily cron 回填，复用 `lib/signals/backtest.ts` 的 forward-return 计算。

### 归因全链路
`雷达/信号/Copilot建议 → decisions.source_ref → trades.decision_id → decision_reviews`
反向查询回答"Copilot 建议胜率 vs 手动决策胜率"，同时是 Copilot P3 自我进化的数据地基。

### API
`/api/decisions` `/api/trades` `/api/portfolio`（聚合持仓+P&L）三组 REST；agent 工具 `record_decision` / `record_trade` / `get_portfolio` / `get_my_decisions`。

---

## 3. 「我的投资」驾驶舱（已按高保真稿确认）

三栏 12 列栅格（24% / 52% / 24%），双密度范例页：

- **左栏**: 持仓列表（黄铜左边框标焦点股）+ 总浮盈卡 + 股票池观察区（带雷达/信号标记）
- **中栏**: 焦点个股工作区 —— K线（叠加用户买卖点 ⬥ 与信号旗标）、五格指标条（持仓成本/目标价/止损/DCF区间/九人观点）、**决策条**（买入/卖出/观望 三键 → 30 秒表单 → `decisions` 表）、未平决策纪律卡常驻
- **右栏**: 今日信号流 + Copilot 常驻栏（驾驶舱内不是浮层而是常驻卡片；建议可"一键采纳→记录决策"）

移动端：三栏纵向堆叠为 持仓速览 → 焦点股 → 信号/Copilot。

---

## 4. 其余板块（已按线框稿确认）

- **🌅 /today**: 雷达优先级流（🔴/🟡/⚪，⚪ 默认折叠）+ 持仓速览 + 宏观速览 + AI 简报三分钟读物；盘前倒计时头部。
- **📡 /intel 发现**: 瓶颈选股向导（输入赛道→产业链图→最窄约束→候选清单→一键入池）、产业链全景尽调（15 维框架生成存档报告）、全市场筛选器。
- **📡 /intel 研究**: 现个股详情页迁入（行情/AI观点/财报+DCF/新闻/信号/股东）+「深度研究」按钮（company-diligence / earnings-research-book 生成存档报告）。
- **🧰 /tools**: 技能库目录（卡片=说明+启动+历史产出）、回测实验室（+"我的决策 vs 信号"对照回测）、一级市场工作台（IC Memo 生成器 / PE Portfolio 台账 / 投资人LP追踪，产出为可存档文档）。

---

## 5. 技能运行时 + Copilot/LLM 层

### A. Skill Runtime（统一产品化模式）
每个技能落地为三件套：
1. **Agent 方法**: 注册进 `src/lib/agent/methods/registry.ts`（同 john-cameron-5step 模式）
2. **UI 入口**: 向导页或按钮（发现页/研究页/一级市场工作台）
3. **产出存档**: 新表 `artifacts (id, user_id, skill_id, ticker?, title, content_md, params jsonb, created_at)` — 全站可翻的私人研究档案库

要点：
- osbornhub 确定性脚本（`dcf.mjs` `ic-memo-outline.mjs` `pe-portfolio-outline.mjs`）为零依赖 Node ESM → 移植到 `src/lib/skills/<id>/` 成为可单测纯函数。
- LLM 环节复用 copilot loop；新增通用工具 `run_skill(skill_id, params)`。
- **osbornhub 同步**: 一次性 vendor 进本仓库 + 只读 `scripts/import-skill.mjs` 拉新；**绝不从本仓库向 osbornhub deploy**（防 360 技能目录覆盖事故，见 SKILLHUB_REFACTOR_HANDOFF_2026-07-01.md）。

### 首批技能清单
| 包 | 技能 → 入口 |
|---|---|
| 二级核心 | hiphon-pm-pick → 发现向导；hiphon-pm-deepdive → 研究「深度研究」；hiphon-pm-track → 复盘模块；stock-bottleneck-picker → 发现向导；generic-dcf → DCF 工作台（已有引擎，补 4 变体）；industry-chain-diligence → 发现 |
| 公司研究 | company-diligence、earnings-research-book → 研究「深度研究」 |
| 一级市场 | ic-memo、pe-portfolio、investor-lp-tracking → `/tools/primary` |

### B. Copilot 全局浮层 + 多协议 LLM
- 浮层组件：右下浮钮 + `⌘K`；上下文注入（当前 ticker/持仓/未平决策）。
- 新增 agent 工具：`record_decision` `record_trade` `get_portfolio` `get_my_decisions` `run_skill`；写操作一律回显确认。
- **ARK Anthropic 协议**：
  - `ProviderDef` 加 `protocol: 'openai' | 'anthropic'`；`ark` → `https://ark.cn-beijing.volces.com/api/coding`，Anthropic 协议，Bearer 鉴权
  - 参数化 `anthropicToolChat`（`src/lib/data/sources/anthropic.ts` 现硬编码 api.anthropic.com + x-api-key → 接受 `{baseUrl, apiKey, authScheme}`）
  - copilot loop 内部保持 OpenAI 消息形状，边界做 OpenAI↔Anthropic 双向转换器（复用现有 Anthropic 格式 TOOL_DEFS），转换器单测覆盖
- **Hobby 时长兼容**：长 agent 任务改为前端驱动多轮（每次 API 调用一轮工具循环 <60s，前端续发）；`maxDuration` 环境变量化，升 Pro 自动放宽。

---

## 6. 数据接口 · 设计系统 · 测试 · 分期

### A. 数据接口分级
| 层级 | 源 | 供给 |
|---|---|---|
| L1 行情 | 东财(主) + 新浪/腾讯(备)，现有降级链保留 | A/港/美报价、K线、资金流 |
| L2 基本面 | **Tushare 5000 积分**（用户充值 ~¥500/年） | 财务三表、券商目标价/一致预期（填掉 `--` 列）、业绩预告、高频额度 |
| L3 海外 | 公开端点 + AI 估算兜底（标注"模型估值"） | 美/港财务与预期 |
| L4 专业源（预留） | Wind Excel 桥 / Polygon.io | 深度数据按需，接口留槽 |

统一改造：`src/lib/data/sources/` 增加 `DataSourceRegistry`（能力声明 + 优先级 + 降级链）；空值必须标注来源与缺失原因，不再静默 `--`。

### B. 双密度设计系统（V3 token 体系）
- 一套 CSS 变量、两档密度：`data-density="reading"`（静奢：衬线标题/宽留白）与 `data-density="data"`（等宽数字/紧凑网格），**按容器切换**而非按页面。
- 组件库 `src/components/ui/`：Button / Card / Panel / Metric / Table / Modal / Tag / DecisionBar；V1/V2 散装样式全部收编。
- 红涨绿跌(CN)/绿涨红跌(US) 沿用 `data-color-scheme`。
- V1 主题在全部板块迁移完成后删除。

### C. 测试与验证
- 单测：持仓成本重算、决策评分/校准、协议转换器、技能纯函数（vitest，86 → 150+）
- API 集成测：decisions/trades/portfolio + RLS
- E2E 冒烟（Playwright）：录决策→录成交→看持仓→晨间复盘 主链路，每板块上线前跑
- 验证闭环：本地 preview → Vercel preview → 用户在 osbornalpha.com 真实使用验收

### D. 实施分期（每期独立上线）
| 期 | 内容 |
|---|---|
| P1 地基 | 数据模型 4 表 + REST API + V3 token/组件库 + ARK 协议 + Copilot 浮层化 |
| P2 我的投资 | 驾驶舱 + 决策/持仓/复盘 |
| P3 今日 | 三页合一晨间流（依赖 P2 数据） |
| P4 情报 | 发现向导 + 研究页迁移 + Skill Runtime |
| P5 工具 | 技能库 + 回测 lab + 一级市场工作台 + Tushare L2 接入 |
| P6 清尾 | 旧路由 301、V1 主题删除、全站 E2E |

**osstack**: 每期建 kanban 卡组跟踪（不用 loop 写码，直接实现 + osstack 记录进度）。

---

## 附录
- 高保真稿/线框稿存档: `.superpowers/brainstorm/80169-1782973459/content/`（cockpit-mockup.html、boards-mockup.html、ia-merged.html、visual-direction.html）
- 前序文档: `docs/HANDOFF-2026-07-01.md`（ARK 背景）、`docs/superpowers/specs/2026-06-20-john-cameron-copilot-design.md`、多供应商 LLM spec
- osbornhub 风险备忘: 本仓库对 osbornhub 只读，禁止 `deploy:store`
