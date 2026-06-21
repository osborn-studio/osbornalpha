<!-- 15_CHANGELOG — osbornalpha 倒序变更日志，从 git log 提炼里程碑 — 最后更新 2026-06-20 -->

# 15 · 变更日志（Changelog）

> 倒序（最新在前），按里程碑分组，从 git 历史提炼。术语以 [`00_TERMINOLOGY_CONSISTENCY.md`](./00_TERMINOLOGY_CONSISTENCY.md) 为准。日期为提交日期。

---

## 2026-06-20 · 多租户账号 + 全门禁 + osbornalpha 营销落地页（里程碑：可售卖 SaaS 底座）

- **产品全门禁 + 公开营销落地页**（PR #22，`feat/auth-gate-landing`）：纠正此前的 guest-mode 逻辑错误——仅营销落地页 `/` 与认证页公开，产品页收进受保护路由组 `src/app/(app)/`（dashboard/watchlist/radar/briefs/backtest/settings/stock），由 `(app)/layout.tsx` 服务端守卫 + `src/middleware.ts` 重定向双保险拦截。原工作台从 `/` 迁到 `/dashboard`。新建深色高保真落地页（hero + 4 大能力区 + Free/Pro 定价 + 免责声明）。
- **多租户账号体系**（PR #21，`feat/multi-tenant-auth`）：基于 Supabase Auth 的邮箱+密码 + Google/GitHub/Apple OAuth + magic-link（次要）；`/login`、`/register`、`/forgot-password`、`/reset-password`、`/settings→账号`（改邮箱/密码、绑定解绑第三方、登出、显示套餐）。
- **数据隔离与计费钩子**：新迁移 `20260621000000_profiles_and_billing_hooks.sql` 建 `profiles` 表（plan/role/usage/stripe_customer_id），扩展注册触发器 `handle_new_user()` 自动建 profile + 默认股票池 + user_preferences；全表 RLS 按 `auth.uid()`。`src/lib/billing/entitlements.ts` 计费钩子（Free/Pro 能力映射，只读不强制）。
- **品牌**：对外统一为 osbornalpha（域名 osbornalpha.com，app 头部改名），代号仍为 stock-monitor。
- **移除**：删除 SITE_PASSWORD 共享密码门（middleware/unlock/site-password.ts）及 `SITE_PASSWORD`/`SITE_AUTH_SECRET` 环境变量。
- 关联设计：`docs/superpowers/specs/2026-06-20-osbornalpha-auth-gate-and-landing-design.md`、`docs/superpowers/specs/2026-06-21-multi-tenant-auth-design.md`、`docs/AUTH_SETUP.md`。

## 2026-06-12 · Hermes Agent 接口级融合（里程碑：Agent 多端交付）

- John Cameron / Hiphon PM 与 Hermes Agent 接口级融合 + 内核自动升级（PR 级）：4 个 Hermes 入口技能（符号链接，仓库为单一事实源）；Hermes cron——周五 16:30 推周度决策包到 Telegram，周日 03:30 核心自动升级（烟测+回滚）。
- 设计：`docs/superpowers/specs/2026-06-12-hermes-integration-design.md`。

## 2026-06-02 ～ 06-03 · John Cameron / Hiphon PM Agent 产品线（里程碑：投资 PM agent）

- John Cameron 投资顾问 agent v1（CLI）+ 投资宪法 `doctrine.md`；技能 `hiphon-pm-pick`（选股+择时）/`-deepdive`（个股深研）/`-track`（战绩问责）。
- v2 问责层：append-only 战绩 journal + 确定性打分（命中由代码裁定，非 LLM 自评）+ 校准桶（by_factor/by_evidence/by_chain_role）。
- 内化 chokepoint-atlas 卡脖子方法论（证据梯 ●◐○ + 四角色 + 打分框架）；并行 subagent QA 修复 scorer hit_rate bug。
- 同期加入供应链卡脖子研究 + 选股技能（`stock-bottleneck-picker` 等）。
- 设计：`docs/superpowers/specs/2026-06-02-hiphon-pm-design.md`、`docs/designs/hiphon-pm-accountability.md`、`docs/designs/chokepoint-pipeline-integration.md`。
- （设计阶段，未编码）Hedge Fund AI PRD v2 + 5 份专家 annex（`docs/designs/hedge-fund-ai/`）。

## 2026-06-19 ～ 06-20 · 文档同步 + 组合 PDF 报告 + EdgeOne 评估

- 组合 PDF 报告技能 + EdgeOne 部署文档与 osbornalpha handoff（PR #20、#19）。
- README/ROADMAP/ARCHITECTURE 同步 Agent 产品线。

## 2026-05-24 ～ 05-28 · 雷达增强 + 设计系统 v2

- 设计系统 v2：DESIGN.md + STITCH_PROMPTS.md（Stitch 2.0 重设计）；`?design=v2` flag 灰度接入 tokens；line-art tab 图标 + 黄铜质感组件（PR #16–#18）。
- 雷达催化剂：14 天事件日历 + 财报/分红/解禁触发；每只 🔴/🟡 股票附 LLM 一句话委员会研判；4 个 Tushare 事件日历 fetcher（PR #14、#15）。

## 2026-05-17 ～ 05-20 · 股票池工程化 + 资金流 + 每日雷达推送

- 每日 08:00 CST 逐股雷达推送到 Telegram + Email（cron，PR #14）。
- 资金流修正：北上/南下端点纠错；解锁 5000 积分 Tushare 端点（北上资金/涨跌停/公告）；Tushare 诊断与 debug 模式（PR #9–#13）。
- 股票池：Kanban 看板 + 实时报价 + 列重排/拖拽；批量导入（CSV/粘贴/XLS/XLSX/XLSM/XLSB，去重）；Wind（万得）代码方言支持；4 层报价回退链（东方财富→新浪→腾讯→Tushare）（PR #1–#8）。

## 2026-05-15 ～ 05-16 · 核心引擎成型（里程碑：从原型到可用产品）

- v0.1 Web UI 原型 + 文档 → 迁移到 Next.js 15 + Supabase + Vercel 部署。
- IBKR 风格三栏工作台 + 东方财富搜索/实时报价/K 线；Tushare 财务/股东 + AI 委员会（Claude）+ 30s 自动刷新。
- **LLM 主力切换为 DeepSeek**（Anthropic 转为回退/分析来源）。
- 每日哨兵简报 + Telegram 推送 + Vercel cron；真实 60 天回测引擎 + 批量回测排序；委员会引用的证据-信心可视化；Resend 邮件成为一等交付通道。
- Tushare 缓存层（Next.js `unstable_cache`，4× 提速）；机构晨报格式简报升级。
- （注：当时曾上线 HMAC 站点密码门 `feat(auth): site-wide password gate`，后于 2026-06-20 随多租户改造移除。）

---

> 仓库代号 stock-monitor 自 2026-05-15 起公开提交历史；2026-06-20 完成 osbornalpha 品牌化与多租户/门禁改造，进入可售卖 SaaS 阶段。Stripe 实付与 Pro 功能闸为 Phase 2（未开始）。
