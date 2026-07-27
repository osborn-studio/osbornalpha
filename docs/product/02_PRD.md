<!-- 02_PRD — osbornalpha 产品需求文档，对齐 docs/PRD.md 并升级为多租户+门禁+Free/Pro — 最后更新 2026-06-20 -->

# 02 · 产品需求文档（PRD）

> 本文件在 [`docs/PRD.md`](../PRD.md) 基础上**校准并升级**：原 PRD 写于单用户「私人工具」阶段，本版反映 2026-06-20 已落地的**多租户账号 + 全门禁 + Free/Pro 定价**现实。术语以 [`00_TERMINOLOGY_CONSISTENCY.md`](./00_TERMINOLOGY_CONSISTENCY.md) 为准。

## 1. 产品定义

osbornalpha 是一个多租户、可售卖的 AI 投资监控工作台：用户登录后维护自己的股票池，系统每日生成 AI 简报、雷达信号与多大师委员会研判，覆盖 A股/港股/美股，并提供 John Cameron PM agent 的可追溯决策。所有内容为决策辅助，不构成投资建议。

## 2. 与原 PRD 的关键变化（reconciliation）

| 维度 | 原 docs/PRD.md（v0） | 本版（2026-06-20 现实） |
|---|---|---|
| 租户模型 | 单用户、本地 Mac mini 运行、不存储仓位 | 多租户 SaaS，Supabase Auth + 全表 RLS 隔离 |
| 访问控制 | 无（自用）/ 后续 SITE_PASSWORD 共享密码 | 全门禁：营销落地页公开，产品页需登录；SITE_PASSWORD 已删除 |
| 部署 | GitHub Pages 静态 demo / 本地引擎 | Next.js 14 + Vercel，生产域 osbornalpha.com |
| 商业化 | 无 | Free（已上线）/ Pro（即将上线，Stripe = Phase 2，未实付） |
| 数据源 | Akshare/Alpha Vantage/EDGAR/FRED（早期设想） | Tushare + 东方财富/腾讯/新浪抓取 + FRED；LLM=DeepSeek（默认）/ Anthropic（回退） |
| Persona 实现 | Python markdown 模板（计划） | TS 内置 9 persona（`src/lib/data/personas.ts`），经 `/api/perspectives/[ticker]` 实时调用 |
| Agent 产品线 | 无 | 新增 John Cameron / Hiphon PM（CLI + Hermes），五段式决策管线 |

> 注：原 PRD 中提到的"渠道/品类/客户类型/收入趋势"类报告**不属于本产品**（疑似另一项目），本 PRD 不收录。

## 3. 用户角色（Personas，产品使用层）

| 角色 | 诉求 | 对应套餐 |
|---|---|---|
| 跨市场认真散户（主） | 每天替我扫池子、摆清多空理由、可追溯 | Free 起步 |
| 进阶散户 / 小工作室 | 把"多视角+PM 决策+历史回看"当投研流水线 | Pro（升级目标） |
| 产品作者（dogfood） | 自用第一现场，验证 DARR | 自有 |
| admin（role=admin） | 运营/调试，非对外角色 | — |

## 4. 范围（Scope）

**In scope（已实现或在产品现状内）**：多租户账号、股票池、每日简报、雷达、回测、AI 委员会、单股详情、设置、营销落地页、John Cameron Agent（CLI/Hermes）。
**Out of scope**：见 §7。

## 5. 功能需求（Functional Requirements，按能力分）

### F-1 账号与多租户（Auth & Tenancy）— 已落地
- **F-1.1 注册/登录**：邮箱+密码（`signUp`/`signInWithPassword`）；Google OAuth（`signInWithOAuth`，待配 provider）；GitHub/Apple 按钮在但未配；magic-link 旧路由保留不主推。页面：`/register`、`/login`。
- **F-1.2 找回密码**：`/forgot-password`（`resetPasswordForEmail`）→ 邮件 → `/reset-password`（`updateUser({password})`）。
- **F-1.3 账号设置**：`/settings → 账号`：改邮箱、改密码、绑定/解绑第三方（`linkIdentity`/`unlinkIdentity`）、登出、显示当前套餐（只读）。
- **F-1.4 注册自动初始化**：触发器 `handle_new_user()` 自动建默认股票池「我的股票池」+ `user_preferences` + `profiles`（plan=free）。
- **F-1.5 数据隔离**：所有私有表 RLS 按 `auth.uid()`；公共参考表（`stocks_universe`/`financial_history`）仅只读。验收：两账户互不可见对方 watchlist。
- **F-1.6 门禁**：未登录访问受保护路径 → 302 `/login`（带 `?next=`）；已登录访问 `/login`/`/register` → 302 `/dashboard`。双保险：`src/middleware.ts` + `(app)/layout.tsx` 服务端守卫。公开白名单见术语表 §5。

### F-2 营销落地页（Landing）— 已落地（`src/app/page.tsx`）
- **F-2.1**：公开 hero（osbornalpha — 你的 AI 投资 PM）+ A股·港股·美股标签 + CTA（未登录=注册/登录；已登录=进入工作台）。
- **F-2.2**：4 大能力区（股票池+每日简报 / AI 投资委员会 / 信号雷达+回测 / John Cameron PM 决策）。
- **F-2.3**：定价区 Free（¥0）/ Pro（¥—，标「即将上线」）。
- **F-2.4**：免责声明 + 页脚。

### F-3 股票池（Watchlist）— `/watchlist`
- 搜索（中文/拼音/代码，A/H/US 全量 `stocks_universe`）添加/删除标的；conviction（0–10）；默认股票池；按 `(watchlist_id, ticker)` 去重。RLS 按 user。

### F-4 每日简报（Briefs）— `/briefs`、`/briefs/[date]`
- 每日生成 Markdown + 结构化 JSON；含 AI 信心分 + 标签 + 成本/时延/状态；按 `(user_id, brief_date, language)` 唯一归档可回看。
- 推送：Telegram + Email（`/api/brief/preview`、`/api/brief/send`、cron `/api/cron/daily-brief`）。
- 合规：每条信号带来源/信心分/免责；禁"建议买卖"，用"信号偏多/偏空/中性"。

### F-5 信号雷达（Radar）— `/radar`、`/api/radar`
- 规则触发的机会/风险信号扫描（财报临近、异动量、事件日历、评级/分红/解禁等）；每只可附 LLM 一句话委员会研判（`src/lib/brief/digest-takes.ts`）。cron `/api/cron/daily-radar`。

### F-6 回测（Backtest）— `/backtest`、`/api/backtest`
- 对哨兵（Sentinel）信号做历史可靠性回测；参数 `days`（10–180，默认 60）、`tickers`（≤40，缺省用内置组合）；输出排序后的信号可靠性。`src/lib/signals/batchBacktest.ts`。

### F-7 AI 投资委员会（Perspectives）— `/api/perspectives/[ticker]`、表 `perspectives`
- 9 位 persona 各自独立研判：严格 JSON `{stance, confidence(0–10), summary(≤120字), cites[]}`；summary 必引用 ≥1 个传入数据点；可用 `?personas=` 过滤。LLM 路由 DeepSeek→Anthropic。数据上下文来自 Tushare/东方财富等。

### F-8 单股详情（Stock Detail）— `/stock/[ticker]`
- 行情 + 财务 + 委员会观点 + 信号/事件日历，单标的聚合视图。

### F-9 设置（Settings）— `/settings`
- 偏好：语言、涨跌配色（cn 红涨/us 绿涨）、推送时间、时区（表 `user_preferences`）+ F-1.3 账号分区。Email/Telegram 目的地由服务端配置；手动发送仅对服务端鉴权确认的 admin 显示，UI 不接收或展示完整收件地址/Chat ID。

### F-10 John Cameron / Hiphon PM Agent — `skills/hiphon-pm*`（CLI / Hermes）
- 五段式决策管线（取数+读持仓战绩 → 宏观总闸择时 → 卡脖子选股漏斗 → 评级排序 → 持仓/校准叠加 + 组合建议）。
- append-only 战绩 journal（`~/.hiphon-pm/calls.jsonl`）+ 确定性打分脚本，命中由代码裁定。
- 复用 Web 端数据 API，不改 Web 栈。

### F-11 计费钩子（Billing hook）— `src/lib/billing/entitlements.ts`
- `getEntitlements()` 读 `profiles.plan` → 能力对象（`maxWatchlistItems`/`aiCommitteePerDay`/`canExport`）。**Phase 1 只读、不强制**。Free 与 Pro 映射已定义；Pro enforcement + Stripe = Phase 2。

## 6. 套餐与定价（Free / Pro）

| 能力 | Free（已上线，¥0） | Pro（即将上线，未实付） |
|---|---|---|
| 股票池上限 `maxWatchlistItems` | 50 | 无限（-1） |
| 每日委员会次数 `aiCommitteePerDay` | 20 | 无限（-1） |
| 导出 `canExport` | 是 | 是 |
| 每日简报 / 基础雷达 | 是 | 是 |
| 完整回测 + 导出 / PM 决策 | 受限（落地页定位为 Pro 卖点） | 完整 |

> 当前 entitlements **不强制**任何上限；上表为 Phase 2 接 Stripe 时的设计目标。落地页 Pro 标「即将上线」。

## 7. 范围外（Out of Scope）

- ❌ 实时分钟级行情 / 交易终端
- ❌ 自动下单 / 仓位管理 / 资金托管
- ❌ 期权策略 / 加密货币
- ❌ 社交评论 / 直播 / 荐股许可服务
- ❌ 通用 AI 聊天问答（不是另一个 ChatGPT）
- ❌ Stripe 实付与 Pro 真功能闸（Phase 2）
- ❌ 团队/组织多成员、用量计费 enforcement（Phase 2+）
- ❌ 只读 guest demo 模式（已随门禁移除）

## 8. 非功能需求（Non-functional）

| 类别 | 要求 |
|---|---|
| 性能 | 单次简报生成 ≤ 5 分钟；API 函数 `maxDuration` 60s（委员会/回测） |
| 可靠性 | 简报调度成功率 ≥ 99% |
| 成本 | 单用户单日 LLM ≤ $5，超额可降级 |
| 安全 | 全表 RLS 隔离；密钥仅 env；service_role 不入库；门禁双保险 |
| 合规 | 全部外发带免责声明；不存储仓位/资金/PII；禁"建议买卖"措辞 |
| 隔离默认 | 新表无 policy = 默认拒绝，避免漏配泄露 |
| 国际化 | v1 中文为主；中英双语为后续 |

## 9. 成功指标

北极星 DARR + 30 天信号命中率（≥60%）+ 调度成功率（≥99%）+ 单日成本（≤$5）+ Free→Pro 转化（上线后）。详见 [`01_VISION.md`](./01_VISION.md) §5。

## 10. 验收要点（核心回归）

1. 未登录访问 `/dashboard`、`/watchlist` 等 → 跳 `/login`；已登录访问 `/login`/`/register` → 跳 `/dashboard`。
2. `/` 落地页对所有人可见；已登录显示「进入工作台」。
3. 邮箱注册→确认→登录；忘记密码→重置→登录。
4. 两账户 RLS 隔离实证。
5. `npm run typecheck` + `npm run build` 绿。
