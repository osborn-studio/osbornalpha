<!-- 07 存储与 CDN | 用途：osbornalpha 数据落地位置、缓存层、静态资源/CDN、图片与 manifest 处理 | 最后更新 2026-06-20 -->

# 07 · 存储与 CDN（Storage & CDN）

> 事实源：`supabase/migrations/*`、`src/lib/data/sources/tushare-cached.ts`、`next.config.mjs`、`vercel.json`、`src/app/api/cache/revalidate/route.ts`。
> 核心原则：持久数据落 Supabase Postgres；外部 API 结果走 Next.js Data Cache（TTL）以省 Tushare 积分；不引入 Redis / 外部对象存储。

---

## 1. 数据落地全景

| 数据 | 落地位置 | 性质 / 隔离 |
|---|---|---|
| 用户账号、会话 | Supabase Auth（`auth.users` + cookie 会话） | `@supabase/ssr`，HttpOnly cookie |
| 用户档案 / 套餐 | Postgres `profiles`（plan/role/usage/stripe_customer_id） | RLS `auth.uid()=id` |
| 自选股票池 | Postgres `watchlists` / `watchlist_items` | RLS `auth.uid()=user_id` |
| 每日简报产物 | Postgres `briefs`（`content_md`/`content_json`/成本/耗时） | RLS，单用户可见 |
| 信号 / 视角 | Postgres `stock_signals` / `perspectives` | RLS，追加式 |
| 新闻 / 研报缓存 | Postgres `news_items` / `broker_reports` | RLS（用户级缓存） |
| 偏好（语言/配色/时区/推送） | Postgres `user_preferences` | RLS |
| 个股元数据 / 财报参考 | Postgres `stocks_universe` / `financial_history` | 公开读 |
| 实时行情 / K 线 / 基本面 | 外部 API（东财/新浪/腾讯/Tushare），**不长期入库** | 经 Data Cache 短期缓存 |
| LLM 视角原文 | 落 `perspectives` 表（持久）+ 路由响应即时返回 | — |

> 说明：行情、K 线、财务明细等高频/大体量数据**不写 Postgres**，而是按请求实时取外部源并由 Data Cache 缓冲；只有「用户产生的」与「精选参考」数据进库。

---

## 2. 缓存层（Next.js Data Cache，TTL）

封装于 `src/lib/data/sources/tushare-cached.ts`，用 `unstable_cache` 把每个 Tushare fetcher 包成持久缓存（跨 Vercel 冷启动，借 Vercel Data Cache）。命中时零 Tushare 积分、~10ms 返回；未命中则完整往返后写回。

| 包装 | TTL | cache tag |
|---|---|---|
| `fetchTushareDaily`（K 线） | 6h | `tushare`, `tushare-daily` |
| `fetchTushareDailyBasic` | 24h | `tushare`, `tushare-daily-basic` |
| `fetchTushareFinaIndicator` | 7d | `tushare`, `tushare-fina-indicator` |
| `fetchTushareIncome` / `Balance` / `Cashflow` | 7d | `tushare`, `tushare-income`/`-balance`/`-cashflow` |
| `fetchTushareTopHolders` / `FloatHolders` | 24h | `tushare`, `tushare-holders` |
| `fetchTushareHkHold`（已弃用，南向） | 6h | `tushare`, `tushare-hk-hold` |
| `fetchTushareNorthboundTop10` | 6h | `tushare`, `tushare-northbound-top10` |
| `fetchTushareLimitList` | 6h | `tushare`, `tushare-limit-list` |
| `fetchTushareAnnouncements` | 6h | `tushare`, `tushare-anns` |
| `fetchTushareDisclosureDate` / `Forecast` / `Dividend` / `ShareFloat` | 24h | `tushare`, `tushare-calendar` |

- **失效**：`unstable_cache` 的 tag 是 per-wrapper 静态的（不能含参数），故仅按 TTL 过期；可经 `POST /api/cache/revalidate?tag=...`（`X-Purge-Secret` 头鉴权）调用 `revalidateTag()` 做全局刷新（tag `tushare` 一键全清，或单 endpoint tag）。
- **路由级缓存**：各 GET Route Handler 另设 `export const revalidate = N`（行情 30s、K 线 300s、财务 3600s、雷达/信号 1800s、视角 86400s 等），与上述数据缓存叠加。

---

## 3. 客户端存储

- **会话**：Supabase 会话以 cookie 形式由 `@supabase/ssr` 管理（中间件与服务端通过 `getAll/setAll` 读写），无自建 token 存储。
- **localStorage**：用于轻量 UI 偏好（如配色 cn/us、最近浏览）等纯客户端状态；权威偏好以 `user_preferences` 表为准。
- 不在客户端缓存 PII / 仓位 / 资金类数据。

---

## 4. 静态资源与 CDN（Vercel）

- 部署在 **Vercel**（生产域 `osbornalpha.com`，Aliyun DNS 指向 Vercel）。Next.js 构建产物（JS/CSS chunk、字体 `geist`、`public/` 静态文件）由 Vercel Edge CDN 全球分发并带不可变缓存头。
- `next.config.mjs`：
  - `images: { unoptimized: true }` — **关闭 Next 图片优化**，图片按原样经 CDN 提供（避免 EdgeOne/Vercel 图片优化差异与额度），适配纯静态/抓取图标场景。
  - `reactStrictMode: true`。
  - webpack `watchOptions.ignored: ['**/legacy-demo/**']` — 忽略归档的旧静态 demo。
- Route Handlers 为 Node serverless function；重负载路由用 `maxDuration`（30/60s）控制超时。

---

## 5. 图片 / Manifest / 图标

- 因 `images.unoptimized=true`，所有 `<Image>`/`<img>` 直出原图，由 CDN 缓存；无 `/_next/image` 优化管线。
- favicon 与静态资源经中间件 `matcher` 排除（`favicon.ico`、`_next/static`、`_next/image` 不走认证门），保证公开可缓存。
- 搜索结果中的股票图标/行情图标来自抓取源（东财等）的公开 URL，前端直引。

---

## 6. 不使用的存储能力

- **未使用 Supabase Storage（对象桶）**：迁移中未声明 storage bucket；研报 PDF 仅以 `broker_reports.pdf_url` 存外链，不托管文件。
- **未使用 Redis / 外部缓存**：缓存全靠 Next.js Data Cache（见 §2）。
- **Stripe / 计费存储**：`profiles.stripe_customer_id` 等为 Phase 2 预留，当前无支付数据写入。
