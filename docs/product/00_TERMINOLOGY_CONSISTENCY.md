<!-- 00_TERMINOLOGY_CONSISTENCY — osbornalpha 产品设计文档包的权威术语表（中英对照），统一全包用词 — 最后更新 2026-06-20 -->

# 00 · 术语一致性表（Terminology Consistency）

> 本文件是整个 `docs/product/` 文档包的**单一术语事实源**。任何其他文件出现以下概念时，必须使用本表给定的中文/英文写法与定义，不得另造同义词。每个术语在此**权威定义一次**。

## 0. 使用规则

- 中文为主，英文术语保留（首次出现给中英对照，后文沿用本表写法）。
- 代号 vs. 品牌：仓库代号 `stock-monitor`（package.json `name`、Supabase 项目名、git 仓库名），对外品牌 `osbornalpha`（域名 osbornalpha.com、应用头部、营销落地页）。两者指同一产品。
- 路由名（`/dashboard`、`/watchlist` 等）与数据库表名（`watchlists`、`briefs` 等）以代码为准，引用时保持原样、不翻译。

## 1. 产品与品牌

| 术语（中） | 术语（英 / 代码） | 权威定义 |
|---|---|---|
| osbornalpha | `osbornalpha` | 对外产品品牌，部署于 osbornalpha.com（DNS 在阿里云，托管在 Vercel）。一个多租户、可售卖的 AI 投资监控 SaaS。 |
| stock-monitor | `stock-monitor` | 仓库/工程代号（`package.json` name = `stock-monitor`、Supabase 项目名 = `stock-monitor`、Project ref `mzfcaabhuwtfvsvadvsv`）。= osbornalpha 的内部代号。 |
| 工作台 | dashboard `/dashboard` | 登录后默认落点页，App 的主入口。原先位于 `/`，2026-06-20 门禁改造后迁入受保护路由组 `(app)/dashboard`。 |
| 营销落地页 | landing `/` | 公开首页，唯一对陌生人开放的产品面，含 hero / 4 大能力区 / Free·Pro 定价 / 免责声明。见 `src/app/page.tsx`。 |

## 2. 核心产品能力（功能）

| 术语（中） | 术语（英 / 路由 / 表） | 权威定义 |
|---|---|---|
| 股票池 | watchlist · `/watchlist` · 表 `watchlists` / `watchlist_items` | 用户自选的 A股/港股/美股标的集合，支持搜索添加、删除、分组、conviction（0–10）。注册触发器自动建一个默认股票池「我的股票池」。 |
| 简报 | briefs · `/briefs`、`/briefs/[date]` · 表 `briefs` | 每日 AI 生成的监控简报（Markdown + 结构化 JSON），按 `(user_id, brief_date, language)` 唯一。可经 Telegram/Email 推送（`/api/brief`、`/api/cron/daily-brief`）。 |
| 雷达 | radar · `/radar` · `/api/radar` · `src/lib/brief/radar.ts` | 信号雷达：规则触发的机会/风险信号实时扫描（财报临近、异动量、事件日历、评级变动等），每只可附 LLM 一句话委员会研判。 |
| 回测 | backtest · `/backtest` · `/api/backtest` · `src/lib/signals/batchBacktest.ts` | 对雷达/哨兵（Sentinel）信号做历史可靠性回测，输出胜率与排序；参数 `days`（10–180）、`tickers`（≤40）。 |
| 委员会 | perspectives · `/api/perspectives/[ticker]` · 表 `perspectives` | AI 投资委员会：多位投资大师 persona 对同一标的各自独立研判（stance + confidence + summary + cites），严格 JSON。定义见 `src/lib/data/personas.ts`。 |
| 单股详情 | stock detail · `/stock/[ticker]` | 单标的页：行情 + 财务 + 委员会观点 + 信号/事件。 |
| 设置 | settings · `/settings` | 偏好（语言/涨跌配色/推送时间）+ 账号分区（改邮箱/密码、绑定解绑第三方、显示套餐、登出）。 |

## 3. Persona 列表（委员会成员）

权威 ID 与中文名以 DB 枚举 `persona_t` 与 `src/lib/data/personas.ts` 为准，共 9 位：

| persona ID（代码） | 中文名 | 风格 |
|---|---|---|
| `buffett` | 巴菲特 | 价值投资 / 护城河 / 长期持有 |
| `munger` | 芒格 | 多元思维模型 / 反向思考 / 复利 |
| `druckenmiller` | 德鲁肯米勒 | 宏观对冲 / 流动性 / 顺势 |
| `marks` | 霍华德·马克斯 | 周期 / 风险 / 钟摆思维 |
| `lynch` | 彼得·林奇 | 成长股 / Tenbagger |
| `burry` | 迈克尔·伯里 | 逆向 / 危机 / 数据洞察 |
| `zhang_kun` | 张坤 | 优质成长 / 消费医药 |
| `li_lu` | 李录 | 价值投资 + 中国视角 / 安全边际 |
| `duan_yongping` | 段永平 | 平常心 / 商业本质 / 本分哲学 |

- `stance`（立场，枚举 `stance_t`）：`bullish` 偏多 / `neutral` 中性 / `bearish` 偏空。文案规范：禁止「建议买入/卖出」，统一用「信号偏多/偏空/中性」。

## 4. Agent 产品线

| 术语（中） | 术语（英 / 代码） | 权威定义 |
|---|---|---|
| John Cameron | John Cameron · `skills/hiphon-pm*` | 投资 PM agent 的人格名（DNA = Druckenmiller 主导 + 价值护城河安全边际 + 卡脖子选股）。CLI/Hermes 端技能，复用 Web 端数据 API。内部代号 Hiphon PM。 |
| Hiphon PM | Hiphon PM | John Cameron agent 的内部产品代号；技能目录前缀 `hiphon-pm-pick`/`-deepdive`/`-track`。 |
| 五段式决策管线 | 5-stage decision pipeline | `hiphon-pm-pick` 的自上而下流程：① 取数+读持仓/战绩 → ② 宏观/流动性总闸（择时定总仓位上限）→ ③ 候选生成（卡脖子选股漏斗）→ ④ 综合评级+排序 → ⑤ 持仓/校准叠加 + 组合层建议。详见 `skills/hiphon-pm-pick/SKILL.md`、`skills/hiphon-pm/references/doctrine.md`。 |

## 5. 账号 / 多租户 / 安全

| 术语（中） | 术语（英 / 代码） | 权威定义 |
|---|---|---|
| 多租户 | multi-tenant | 一套部署服务多个独立账户，数据按账户隔离。2026-06-20 起 osbornalpha 已是多租户 SaaS。 |
| profile | `profiles` 表 | 与 `auth.users` 1:1 的账户档案：`plan` / `role` / `usage` / `stripe_customer_id` / `email` / `display_name`。注册触发器 `handle_new_user()` 自动创建。RLS：仅本人 select/update。 |
| 套餐 | plan（`free` / `pro`） | 账户计费档位。`free`（默认，已上线）/ `pro`（标「即将上线」，Stripe = Phase 2，未实付）。能力映射见 `src/lib/billing/entitlements.ts`（只读，未强制）。 |
| 角色 | role（`user` / `admin`） | 账户权限角色，默认 `user`。 |
| RLS | Row Level Security | Postgres 行级安全。私有表全部按 `auth.uid()` 隔离（CRUD policy）；公共参考表（`stocks_universe`、`financial_history`）对所有人只读。默认拒绝：新表无 policy = 无人可读。 |
| 门禁 | auth gate | 产品全门禁：未登录只能看营销落地页 + 认证页；其余一律需 Supabase 会话。2026-06-20 上线，取代此前的 guest 模式与 SITE_PASSWORD 共享密码门。 |
| 路由组 (app) | route group `src/app/(app)/` | Next.js App Router 路由组：把所有受保护产品页（dashboard/watchlist/radar/briefs/backtest/settings/stock）收进 `(app)/`，由 `(app)/layout.tsx` 服务端守卫统一拦截。`(app)` 不出现在 URL 里。 |
| 公开白名单 | public allowlist | 无需登录可访问的路径：`/`、`/about`、`/login`、`/register`、`/forgot-password`、`/reset-password`、`/auth/*`（回调）、`/api/*`（各自带 RLS/鉴权）、`/_next/*` 与静态资源。见 `src/middleware.ts`。 |

## 6. 技术栈固定写法

| 术语 | 权威写法 / 说明 |
|---|---|
| 前端框架 | Next.js 14 App Router（TypeScript）+ Tailwind CSS |
| 鉴权与数据 | Supabase（Auth + Postgres + RLS），客户端用 `@supabase/ssr` |
| LLM | DeepSeek（默认，按成本优先）；Anthropic Claude 为高级推理回退。解析顺序见 `src/lib/data/sources/llm.ts`（`DEEPSEEK_API_KEY` → `ANTHROPIC_API_KEY`，可用 `LLM_PROVIDER` 钉住）。 |
| 行情/财务数据 | Tushare（A股为主）+ 东方财富/腾讯/新浪 抓取；FRED 宏观；Anthropic 亦作为分析来源之一。 |
| 部署 | Vercel（生产域 osbornalpha.com，DNS 在阿里云）。 |
| 登录方式 | 邮箱+密码、Google OAuth（已规划/待配 provider）；GitHub/Apple 按钮在但未配；magic-link 旧路由保留不主推。 |
