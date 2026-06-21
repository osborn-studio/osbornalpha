<!-- 10 任务拆解 · 用途：Epic→Task 待办（含验收标准与 done/todo 现状） · 最后更新 2026-06-20 -->

# 10 · 任务拆解（Task Breakdown）

可执行 backlog，按 Epic → Task 组织，每条带验收标准（AC）与状态。对应 OSStack 卡：`[OA门禁]`（门禁）= **done**、`[OA文档]`（产品文档包）= **进行中**。

状态图例：✅ 已完成 · 🟡 进行中 · ⬜ 待办（按计划）· ⛔ 阻塞（外部配置）

---

## Epic A — 多租户 + 登录门禁 `[OA门禁]`（✅ done）

| # | Task | 状态 | 验收标准 |
|---|------|------|---------|
| A1 | 路由组 `(app)` 重构，产品页移入受保护组 | ✅ | `src/app/(app)/*` 含 dashboard/watchlist/radar/briefs/backtest/settings/stock；URL 不变；`build` 绿 |
| A2 | `middleware.ts` 门禁 | ✅ | 未登录访问受保护路径 → `302 /login?next=…`；已登录访问 `/login\|/register` → `/dashboard`；未配 env 放行 |
| A3 | `(app)/layout.tsx` 服务端兜底守卫 | ✅ | 无会话 `redirect('/login')`；与 middleware 双保险 |
| A4 | `profiles` 表 + RLS + 触发器扩展 | ✅ | 迁移 `20260621000000`；注册自动建 profiles/watchlists/user_preferences 三行；self read/update RLS |
| A5 | 账号页（改邮箱/密码、绑定第三方、登出、显套餐） | ✅ | `/settings → 账号` 各操作生效 |
| A6 | 移除访客模式 / `SITE_PASSWORD` 共享密码门 | ✅ | middleware/unlock/site-password 全删；`SITE_PASSWORD`/`SITE_AUTH_SECRET` 从 Vercel 移除 |
| A7 | 计费 hook 只读 stub | ✅ | `entitlements.ts` 读 `profiles.plan` → free/pro 能力位，未强制 |
| A8 | 公开营销落地页 `/` | ✅ | 深色高保真；Hero/功能×4/定价/免责；已登录显「进入工作台」 |

---

## Epic B — 产品文档包 `[OA文档]`（🟡 进行中）

| # | Task | 状态 | 验收标准 |
|---|------|------|---------|
| B1 | 09 实施计划 | 🟡 | 分阶段 + 里程碑 + 退出标准，无 TBD |
| B2 | 10 任务拆解（本文） | 🟡 | Epic→Task→AC，映射 done/todo |
| B3 | 11 测试与评估计划 | 🟡 | typecheck+build 门 + 运行时 e2e 清单 + LLM eval |
| B4 | 13 运维 Runbook | 🟡 | 部署/env/迁移/换密钥/故障/监控 |
| B5 | 18 本地部署与数据库导入 | 🟡 | clone→npm i→.env.local→dev→迁移→seed |
| B6 | 27 公开部署指南 | 🟡 | Vercel + DNS + Supabase 回调 + ICP + 冒烟 |

---

## Epic C — Phase 1 加固（⬜/⛔ upcoming）

| # | Task | 状态 | 验收标准 |
|---|------|------|---------|
| C1 | Google OAuth provider 配置 + 验证 | ⛔ | Google Cloud 建 Web Client；回调 `https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback`；一键登录落 `/dashboard` |
| C2 | GitHub OAuth provider（可选，轻量） | ⬜ | OAuth App 回调同址；按钮可登录 |
| C3 | Apple OAuth provider（可后置） | ⬜ | Apple Developer（$99/年）Service ID+Key+域名验证；未配前按钮点击报错可接受 |
| C4 | 自有 SMTP（Resend/SES） | ⛔ | 确认/重置邮件稳定送达；模板中文化；替代低配额默认 SMTP |
| C5 | cron `CRON_SECRET` 加固 | ⬜ | 设 `CRON_SECRET`；裸调 `/api/cron/*` 返回 401；Vercel cron 带 Bearer |
| C6 | 回归冒烟清单固化 | ⬜ | 见 `11`；每次部署前过一遍 |

---

## Epic D — Phase 2 Stripe 计费 + Pro 闸（⬜ upcoming）

| # | Task | 状态 | 验收标准 |
|---|------|------|---------|
| D1 | Stripe Checkout + Customer Portal | ⬜ | 测试卡完成订阅；可在 Portal 取消 |
| D2 | Stripe webhook → 写 `profiles.plan`/`stripe_customer_id` | ⬜ | 订阅成功置 `plan='pro'`；取消回落 `free` |
| D3 | 收紧 `plan/role` 列不可由客户端改 | ⬜ | 列级 grant 或 trigger；客户端 update 改不动 plan |
| D4 | enforcement：watchlist 上限 | ⬜ | free 50 上限超限拦截并提示升级；pro 无限 |
| D5 | enforcement：AI 委员会日限 | ⬜ | free 20/日；超限拦截；计数写 `profiles.usage` |
| D6 | 套餐 UI（升降级 + 用量） | ⬜ | `/settings` 显示当前套餐/用量/升级入口 |

---

## Epic E — Phase 3+ 产品功能（⬜ from ROADMAP）

| # | Task | 状态 | 验收标准 |
|---|------|------|---------|
| E1 | 接真实数据替换 mock | ⬜ | 各 `/api/*` 走 Tushare/抓取，去 `lib/data/mock.ts` 兜底 |
| E2 | 财务 5 年趋势图 | ⬜ | `financial_history` 渲染 5 年营收/净利/ROE |
| E3 | 券商研报 AI 摘要 | ⬜ | `broker_reports.ai_summary` 生成展示 |
| E4 | 财报日历 + 历史 PDF | ⬜ | `/api/calendar` 接入；PDF 链接可看 |
| E5 | 13F/持仓变动追踪 | ⬜ | `holders` 数据展示变动 |
| E6 | Sentinel 历史信号回看 | ⬜ | 历史 `stock_signals` 时间轴回放 |
| E7 | PWA + iOS Web Push | ⬜ | manifest + push 订阅；可推每日简报 |
| E8 | 红涨绿跌配色切换 | ⬜ | 读写 `user_preferences.color_scheme`（cn/us） |

> Hiphon PM Agent 线（CLI v1.2 / Hermes v1.3 已完成；Hedge Fund AI 设计中）见 `docs/ROADMAP.md`，不在本 Web backlog 内逐条展开。
