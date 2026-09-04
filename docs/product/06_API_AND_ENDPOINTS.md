<!-- 06 API 与端点 | 用途：osbornalpha src/app/api/** 全量 Route Handler 方法/路径/参数/鉴权/数据源/响应参考 | 最后更新 2026-06-20 -->

# 06 · API 与端点（API & Endpoints）

> 事实源：`src/app/api/**/route.ts`（24 个 route 文件）。
> 鉴权约定：
> - 行情/财务/分析类公开端点**无鉴权**（数据为公共参考；中间件放行 `/api/*`）。
> - 写用户数据的端点用 `getServerSupabase().auth.getUser()`，并由 Postgres RLS 兜底隔离。
> - cron 用 `Authorization: Bearer ${CRON_SECRET}`；cache 用 `X-Purge-Secret` 头。
> 缓存：多数 GET 设 `export const revalidate = N`（秒）与 `export const dynamic = 'force-dynamic'`；重负载路由设 `maxDuration`。

---

## 1. Quote（行情）

### `GET /api/quote/[ticker]`
- 路径参数：`ticker`（URL 编码）。
- 鉴权：无。
- 数据源：东方财富 → 新浪 → 腾讯 级联兜底；A 股再用 Tushare `daily` / `daily_basic` / `fina_indicator` 补充基本面。
- 响应：`{ source, ticker, name, market('A'|'HK'|'US'), currency, price, change, change_pct, open, high, low, prev_close, volume, amount, amplitude, pe_ttm, pb, turnover, dividend_yield, market_cap, roe, gross_margin, net_margin, supplemented[], updated_at, delayed }`。
- 缓存：`revalidate=30`，`dynamic=force-dynamic`。

### `GET /api/quote/batch`
- 查询参数：`tickers`（逗号分隔，上限 40）。
- 鉴权：无。数据源：同单股级联（`Promise.allSettled` 并发）。
- 响应：`{ quotes: Record<ticker, Quote|null> }`。缓存：`revalidate=30`，`force-dynamic`。

---

## 2. K-line（K 线）

### `GET /api/kline/[ticker]`
- 路径参数：`ticker`。查询参数：`period`（`D`|`W`|`M`，默认 `D`）、`limit`（默认 120，上限 500）。
- 鉴权：无。数据源：东方财富。
- 响应：`{ source, ticker, bars: Array<{date, open, close, high, low, volume, amount}> }`。
- 缓存：`revalidate=300`，`force-dynamic`。

---

## 3. Financials（财务 / 股东）

### `GET /api/financials/[ticker]`
- 路径参数：`ticker`。鉴权：无。
- 数据源：A 股使用 Tushare `income`/`balance`/`cashflow` + `fina_indicator`；美股使用 SEC EDGAR Company Facts。其他市场通过统一 Provider registry 返回显式 unsupported，不伪造数据。
- 响应：`{ source, ticker, yearly[], quarterly[], ttm, latest_indicator, meta }`。期间行统一使用 `revenue/totalRevenue/netIncome/epsBasic/totalAssets/totalLiabilities/equity/operatingCashflow/freeCashflow`；金额显示口径由 `meta.currency/unit/unitScale` 声明。
- `meta` 包含 `supported/availability/reportingFrequency/coverage/warnings`，部分来源失败或缺项不会按零处理。SEC 请求使用可配置 `SEC_USER_AGENT`，ticker→CIK 缓存 24 小时，Company Facts 缓存 6 小时。
- 缓存：`revalidate=3600`，`force-dynamic`。

### `GET /api/holders/[ticker]`
- 路径参数：`ticker`（仅 A 股）。鉴权：无。
- 数据源：Tushare `top10_holders` / `top10_floatholders`。
- 响应：`{ source('tushare'|'unsupported'|'no-token'|'error'), ticker, top10_holders[], top10_floatholders[], reporting_period }`。
- 缓存：`revalidate=86400`，`force-dynamic`。

---

## 4. Radar（雷达）

### `GET /api/radar/[ticker]`
- 路径参数：`ticker`。鉴权：无。
- 数据源：quote 级联 + Tushare `daily_basic`/`fina_indicator` + flows（`hk_hold`/`limit_list_d`/`anns_d`）+ 信号计算。
- 响应：`{ ticker, name, radar_level, headline, sections, triggers, markdown, score, ... }`。
- 缓存：`revalidate=1800`，`force-dynamic`。

### `GET /api/radar/batch`
- 查询参数：`tickers`（逗号分隔，上限 25）。鉴权：无。数据源：并发 `buildRadar()`。
- 响应：`{ radars: Record<ticker, RadarPayload|{error}>, order[], generated_at }`。
- 缓存：`revalidate=1800`，`force-dynamic`，`maxDuration=60`。

---

## 5. Signals / Backtest（信号 / 回测）

### `GET /api/signals/[ticker]`
- 路径参数：`ticker`。查询参数：`days`（默认 60，范围 10–180）。鉴权：无。
- 数据源：内部回测引擎（K 线 + 信号数学）。
- 响应：历史信号事件 + 胜负统计。缓存：`revalidate=1800`，`force-dynamic`，`maxDuration=30`。

### `GET /api/backtest`
- 查询参数：`tickers`（逗号分隔，默认 `DEFAULT_WATCHLIST`，上限 40）、`days`（10–180，默认 60）。鉴权：无。
- 数据源：内部批量回测。响应：批量信号可靠度排序。
- 缓存：`revalidate=1800`，`force-dynamic`，`maxDuration=60`。

---

## 6. Perspectives（AI 投研委员会）

### `GET /api/perspectives/[ticker]`
- 路径参数：`ticker`。查询参数：`personas`（可选，逗号分隔 persona id 过滤）。鉴权：无。
- 数据源：东方财富 quote + Tushare（仅 A 股）`daily_basic`/`fina_indicator`/`income`(5 期)；9 人格经 DeepSeek/Anthropic（`llm.ts` 门面）。
- 响应：`{ source, ticker, context: StockContext{ticker,name,market,price,change_pct,pe_ttm,pb,roe,market_cap_label,...}, perspectives: Array<{persona,name,stance,confidence,summary,cites}>, meta: {generated_at,duration_ms,provider,model,personas_attempted,personas_succeeded,tokens,est_cost_usd,failures?} }`。
- 缓存：`revalidate=86400`，`force-dynamic`，`maxDuration=60`。

---

## 7. Flows / Calendar（资金流 / 事件日历，A 股）

### `GET /api/flows/[ticker]`
- 路径参数：`ticker`（仅 A 股）。查询参数：`debug`（可选 `1`）。鉴权：无。
- 数据源：Tushare `hsgt_top10`（北向十大，30 天）+ `limit_list_d`（涨跌停，30 天）。
- 响应：`{ source('tushare-5k'|'unsupported'|'no-token'|'error'), ticker, northbound: {available, appearance_count_30d, latest_rank, latest_date, latest_amount_yi, total_amount_30d_yi, recent[]}, limits: {current_streak, last_30d_up_count, latest_date, up_stat, recent[]}, announcements[], triggers[] }`。
- 缓存：`revalidate=3600`，`force-dynamic`。

### `GET /api/calendar/[ticker]`
- 路径参数：`ticker`（仅 A 股）。查询参数：`days`（默认 14，范围 1–90）。鉴权：无。
- 数据源：Tushare `disclosure_date`/`forecast`/`dividend`/`share_float`。
- 响应：`{ ticker, events: CalendarEvent[], next_earnings, ... }`。缓存：`revalidate=3600`，`force-dynamic`。

### `GET /api/calendar/batch`
- 查询参数：`tickers`（逗号分隔，上限 25）、`days`（默认 14，1–90）。鉴权：无。数据源：并发 `buildCalendar()`。
- 响应：`{ generated_at, horizon_days, events: Array<CalendarEvent & {ticker,name?}>(按日期升序), by_ticker: Record<ticker,{events,next_earnings}|{error}>, counts: {total,earnings,guidance,dividends,unlocks} }`。
- 缓存：`revalidate=3600`，`force-dynamic`，`maxDuration=60`。

---

## 8. Watchlist（自选，需登录）

### `GET /api/watchlist`
- 鉴权：**需登录**（`getServerSupabase` + `auth.getUser()`）。数据源：Supabase `watchlists` join `watchlist_items`（RLS）。
- 响应：`{ watchlists: Array<{id,name,description,weight,sort_order,watchlist_items[]}> }`。

### `POST /api/watchlist`
- Body：`{ watchlist_id, ticker, conviction(默认 5) }`。鉴权：需登录。数据源：插入 `watchlist_items`。
- 响应：`{ item: {watchlist_id,ticker,conviction,user_id,id} }`。

### `DELETE /api/watchlist/[ticker]`
- 路径参数：`ticker`（URL 编码）。鉴权：需登录。数据源：删除 `watchlist_items`。响应：`{ ok: true }`。

### `GET|PUT /api/watchlist/ui-preferences`
- 鉴权：需登录，由 `user_preferences` RLS 隔离。
- GET 响应：`{ preferences, version, updatedAt }`；旧的空 JSON 会归一化为当前 schema 默认值。
- PUT Body：`{ expectedVersion, preferences }`。服务端严格校验大小、字段、保存视图及逐标的条目上限，并以版本谓词原子更新；冲突返回 `409` 和最新云端快照。
- 客户端以本地快照先渲染，迁移旧 localStorage 键，登录后防抖同步；冲突时把尚未提交的字段级操作重放到最新云端版本。

---

## 9. Search / Stocks（搜索 / 个股元数据）

### `GET /api/search`
- 查询参数：`q`、`limit`（默认 10，上限 30）。鉴权：无。
- 数据源：东方财富（主）+ 新浪/腾讯兜底 + 本地 mock universe。
- 响应：`{ source('eastmoney+local'|'local-fallback'), results: Array<{t,n,py,m}> }`。缓存：`revalidate=60`，`force-dynamic`。

### `GET /api/stocks/[ticker]`
- 路径参数：`ticker`。鉴权：无。数据源：当前 mock universe（计划接 Supabase `stocks_universe`+`financial_history`）。
- 响应：`{ source:'mock', stock: {...} }` 或 404。

---

## 10. Brief（简报，手动触发）

### `GET /api/brief/preview`
- 查询参数：`watchlist`（逗号分隔，默认 `DEFAULT_WATCHLIST`）、`topN`（默认 5）、`skipLLM`（布尔）、`format`（`json`|`markdown`）。`skipLLM=true` 的纯数据路径公开；启用 LLM 时要求登录，并执行次数配额、每日成本上限和逐调用审计。
- 数据源：`generateDailyBrief()`（quote 级联 + radar +（非 skip 时）perspectives）。
- 响应：JSON 简报或 markdown 文本（`text/markdown`）。`force-dynamic`，`maxDuration=60`。

### `POST /api/brief/send`
- 鉴权：仅 admin；未登录 `401`，已登录非 admin `403`。
- Body：`{ watchlist?[], topN?, skipLLM?, channels?:('telegram'|'email')[], text?(受限原始文本), subject? }`。`watchlist` 最多 10、`topN` 钳制到 1–5、文本最多 4000 字符、主题最多 200 字符；`chatId`/`to` 等收件人覆盖一律 `400`。
- 数据源：`generateDailyBrief()` + `sendTelegram` + `sendEmail`（按环境变量门控）。
- 响应：`{ mode:'raw'|'brief', channels:{telegram?,email?}, brief_meta? }`。`force-dynamic`，`maxDuration=60`。

---

## 11. Cron（定时任务）

### `GET /api/cron/daily-radar`
- 查询参数：`preview`（可选 `1`）、`force`（可选 `1`）。鉴权：`Authorization: Bearer ${CRON_SECRET}`（`preview=1` 时跳过）。
- 数据源：`buildRadarDigest()`（`DEFAULT_WATCHLIST`）+ Telegram + Email。
- 响应：（preview）digest JSON；（正常）`{ ok, date, subject, totals, order, errors, duration_ms, channels }`。
- 调度：`vercel.json` cron `0 0 * * *`（UTC 00:00 = 北京 08:00）。`maxDuration=60`。

### `GET /api/cron/daily-brief`
- 鉴权：必须配置 `CRON_SECRET`，并要求 `Authorization: Bearer ${CRON_SECRET}` 完全匹配；缺少服务端 secret 时返回 503。
- 数据源：受信 cron 以显式 `trusted_unmetered` 模式调用 `generateDailyBrief` + Telegram + Email。
- 响应：`{ ok, date, subject, overall_confidence, overall_label, top:[{ticker,name,consensus}], duration_ms, channels }`。
- 调度：cron `30 0 * * *`（UTC 00:30 = 北京 08:30）。`maxDuration=60`。

---

## 12. Diag / Cache（诊断 / 缓存）

### `GET /api/diag/tushare`
- 查询参数：`api_name`（必填，须属 `ALLOWED_APIS`）、`ts_code`、`trade_date`、`start_date`、`end_date`、`limit`、`fields` 及其他 Tushare 透传参数。
- 鉴权：无（token 从 `process.env.TUSHARE_TOKEN` 读取，**不回显**）。
- 允许的 api：`stock_basic, daily, daily_basic, fina_indicator, hk_hold, limit_list_d, anns_d, top10_holders, top10_floatholders, income, balance, cashflow, hsgt_top10, moneyflow_hsgt`。
- 数据源：转发 Tushare POST。响应：`{ request:{api_name,params,fields,sent_body}, response:{status,code,msg,has_data,row_count,fields_returned,first_row,first_3_rows,raw_body} }`。`force-dynamic`。

### `POST /api/cache/revalidate`
- 查询参数：`tag`（`tushare`|`tushare-daily`|`tushare-daily-basic`|`tushare-fina-indicator`|`tushare-income`|`tushare-balance`|`tushare-cashflow`|`tushare-holders`|`all`，默认 `tushare`）。
- 鉴权：若设了 `process.env.CACHE_PURGE_SECRET`，则请求头 `X-Purge-Secret` 必须匹配，否则 401。
- 数据源：无（调用 `revalidateTag()`）。响应：`{ revalidated: string|string[], ok: true }`。`force-dynamic`。

---

## 13. Auth（会话）

### `GET /api/auth/logout` · `POST /api/auth/logout`
- 鉴权：调用 `getServerSupabase()` + `auth.signOut()`（先判 configured）。数据源：无。
- 响应：GET → 重定向 `/login`；POST → `{ ok: true }`。`force-dynamic`。

---

## 14. 速查表

| 端点 | 方法 | 鉴权 | 主数据源 | 缓存 |
|---|---|---|---|---|
| `/api/quote/[ticker]` | GET | 无 | 东财→新浪→腾讯→Tushare | 30s |
| `/api/quote/batch` | GET | 无 | 同上 | 30s |
| `/api/kline/[ticker]` | GET | 无 | 东财 | 300s |
| `/api/financials/[ticker]` | GET | 无 | Tushare / SEC Company Facts | 3600s；SEC 上游 6h |
| `/api/holders/[ticker]` | GET | 无 | Tushare | 86400s |
| `/api/radar/[ticker]` | GET | 无 | quote+Tushare+flows+信号 | 1800s |
| `/api/radar/batch` | GET | 无 | 并发 radar | 1800s |
| `/api/signals/[ticker]` | GET | 无 | 内部回测 | 1800s |
| `/api/backtest` | GET | 无 | 内部回测 | 1800s |
| `/api/perspectives/[ticker]` | GET | 无 | quote+Tushare+LLM | 86400s |
| `/api/flows/[ticker]` | GET | 无 | Tushare hsgt_top10/limit_list_d | 3600s |
| `/api/calendar/[ticker]` | GET | 无 | Tushare 日历 | 3600s |
| `/api/calendar/batch` | GET | 无 | 并发 calendar | 3600s |
| `/api/watchlist` | GET/POST | 登录+RLS | Supabase | — |
| `/api/watchlist/[ticker]` | DELETE | 登录+RLS | Supabase | — |
| `/api/watchlist/ui-preferences` | GET/PUT | 登录+RLS | Supabase | — |
| `/api/search` | GET | 无 | 东财+本地 | 60s |
| `/api/stocks/[ticker]` | GET | 无 | mock | — |
| `/api/brief/preview` | GET | 无 | generateDailyBrief | — |
| `/api/brief/send` | POST | admin | brief+Telegram+Email（服务端目的地） | — |
| `/api/cron/daily-radar` | GET | Bearer CRON_SECRET | radarDigest+投递 | — |
| `/api/cron/daily-brief` | GET | Bearer CRON_SECRET | brief+投递 | — |
| `/api/diag/tushare` | GET | env token（不回显） | Tushare 透传 | — |
| `/api/cache/revalidate` | POST | X-Purge-Secret 头 | revalidateTag | — |
| `/api/auth/logout` | GET/POST | Supabase signOut | — | — |
