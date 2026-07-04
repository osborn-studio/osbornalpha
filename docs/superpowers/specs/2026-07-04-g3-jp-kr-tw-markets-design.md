# G3 日韩台市场接入 Design

> 全球化战略第三期（G1 i18n ✅ → G2 时钟 ✅ → **G3 本期**）。
> 用户决策（2026-07-04）：**台湾先行**——本期只接台股数据（TWSE/TPEx 官方免费 API），但 Market 架构一次性扩到 JP/KR/TW 三市场（类型/DB/时钟/货币全就位）；日韩数据源留适配器接口，有付费用户再订 EODHD（€19.99/月），届时只加一个适配器 + 配 env。

## 目标

用户可把台股（如 `2330.TW` 台积电、`5483.TWO` 中美晶）加入股票池/持仓/决策，获得与 HK/US 同级的体验（行情、K 线、搜索、雷达价格信号、时钟、Copilot）；JP/KR 标的类型合法可入库，行情显示"数据源未接入"占位而非报错。

## 侦察结论（已验证，2026-07-03 存档）

- 东财/新浪/腾讯**无日韩台个股**（只有指数）——现级联对新市场天然返回 null。
- 台湾：TWSE（上市 `.TW`）+ TPEx（上柜 `.TWO`）官方免费 OpenAPI；实时报价 `mis.twse.com.tw/stock/api/getStockInfo.jsp`（限流 ~3 请求/5 秒）；日线 `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`（全市场当日）；公司名录 OpenAPI 可建搜索宇宙。
- 日韩免费只有 Yahoo 逆向端点且**封锁数据中心 IP**（Vercel 直接撞墙）→ 唯一理性方案 EODHD 付费。
- Ticker 后缀约定（与 EODHD/Yahoo 一致）：`.T`=东京、`.KS`=KOSPI、`.KQ`=KOSDAQ、`.TW`=TWSE、`.TWO`=TPEx。
- 三地均无夏令时；台北 UTC+8、东京/首尔 UTC+9。

## 架构

### 1. Market 类型与 DB（一次扩三市场）

- `src/lib/supabase/database.types.ts`: `Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW'`。波及 ~9 文件的 union 编译修正（switch/记录表补分支，TypeScript 会逐个点名）。
- 迁移 `20260704xxxxxx_markets_jp_kr_tw.sql`：
  - `alter type market_t add value 'JP' / 'KR' / 'TW'`（三条独立语句；PG12+ 允许事务内 ADD VALUE，但新值不能在同事务内使用——迁移内不使用即可）。
  - decisions 表 text check 约束：drop `decisions_market_check` 后按六市场重建。
  - `supabase db push --yes` 落生产。

### 2. Ticker 解析（单一真源）

- `classifyMarket(ticker)`（utils.ts）与 `marketOfTicker`（clock.ts）**合并为一个**：clock.ts 的 `marketOfTicker` 改为 re-export utils 的 `classifyMarket`（或反向，取消费面小的一侧），扩展规则：
  `/\.(SH|SZ|BJ)$/i`→A；`/\.HK$/i`→HK；`/\.T$/i`→JP；`/\.(KS|KQ)$/i`→KR；`/\.(TW|TWO)$/i`→TW；其余→US。
  ⚠️ 顺序陷阱：`.TW`/`.TWO` 必须先于 `.T` 判定（`2330.TW` 不能被 `/\.T$/` 吃掉——用精确后缀交替式一条 regex 或按最长后缀优先）。
- wind-normalize 等输入归一化路径核查台股格式直通。

### 3. 数据源适配器注册表

- 新 `src/lib/data/sources/registry.ts`：`quoteSourcesFor(market): QuoteFetcher[]` —— A/HK/US 返回现级联 [eastmoney, sina, tencent]；TW 返回 [twse]；JP/KR 返回 [eodhd]（未配 token 时 fetcher 直接返回 null）。
- `/api/quote/[ticker]`、`/api/quote/batch`、radar `resolveQuote` 三处消费点改走注册表（响应 shape 不变）。
- 新 `src/lib/data/sources/twse.ts`：
  - `fetchTwseQuote(ticker)`：mis.twse.com.tw getStockInfo（`ex_ch=tse_2330.tw` / `otc_5483.tw`），返回统一 Quote shape（`market:'TW'`, `currency:'NT$'`）；**限流应对**：模块级内存缓存 60s + 批量请求合并（getStockInfo 支持一次多标的 `|` 分隔——batch 场景一次请求带全部 TW 标的）。
  - `fetchTwseKline(ticker, months)`：TWSE `STOCK_DAY`（按月分页）/ TPEx 对应端点，供 `/api/kline/[ticker]` 路由按 market 分派；日线 only（周/月线由日线聚合或本期不支持——按现 kline 路由参数实际支持面定，不硬造）。
  - `fetchTwseUniverse()`：公司名录 OpenAPI，`unstable_cache` 24h，供搜索。
- 新 `src/lib/data/sources/eodhd.ts` **占位适配器**：`isEodhdConfigured()`（env `EODHD_API_TOKEN`）；未配置返回 null——订阅后只填 token 即活。quote 实现按 EODHD real-time API 写好（文档公开、shape 固定），标注"未订阅未实测"。

### 4. 搜索

- `/api/search`：东财 suggest 对 TW 无结果 → 合并 `fetchTwseUniverse()` 的本地匹配（代码前缀/名称包含，与 MOCK_UNIVERSE 合并去重）。JP/KR 本期不进搜索（无数据源）。

### 5. 时钟与显示（G2 地基，纯加行）

- `MARKET_SESSIONS` += TW（Asia/Taipei 09:00–13:30 单段）、JP（Asia/Tokyo 09:00–11:30 / 12:30–15:30，2024-11 起收盘 15:30）、KR（Asia/Seoul 09:00–15:30 单段）。`ClockMarket` 与 `Market` 类型统一（clock 导入 database.types 的 Market）。
- i18n：`components.market.{JP,KR,TW}`、`today.clock.market.{JP,KR,TW}` zh/en（日股/韩股/台股；Japan/Korea/Taiwan——入 GLOSSARY）。
- 货币：JPY `JP¥`（避免与人民币 `¥` 混淆）、KRW `₩`、TWD `NT$`——补入各 quote shape 的 currency 分支与 GLOSSARY。

### 6. 未接源市场的体验（JP/KR 占位）

- quote 注册表返回 null → 个股页/股票池行情列显示"—"+ tooltip/小字 `数据源未接入`（i18n 键 `market.sourcePending`），**不报错不空白页**。
- 雷达对 JP/KR 标的：跳过并在批量响应里标 `skipped: 'source-pending'`（不烧配额）。

### 7. 雷达/回测/Copilot 对 TW 的深度

- 与今日 HK/US 同级：价格触发器（涨跌幅/振幅/量比——取决于 twse quote 提供的字段，缺字段的触发器自然不触发）；Tushare 资金面/财报补充是 A 股专属，照旧跳过。
- 回测/K线信号：TW 日线可用则自然进入现回测管线（classifyMarket 扩展后 `market` 过滤器 UI 自动多一档？——**不改回测 UI**，市场过滤按钮本期维持 all/A/HK/US，TW 归入 all；避免 UI 铺开，待有真实 TW 用户再加按钮）。

## 测试（TDD）

- classifyMarket 六市场后缀表（含 `.TW` vs `.T` 顺序陷阱、`.TWO`、大小写）。
- clock：JP 午休/15:30 收盘、KR/TW 单段、台北周末；A/HK/US 回归。
- twse.ts：getStockInfo/STOCK_DAY 响应 fixture 解析（数值字段字符串→number 坑：TWSE 返回带千分位逗号字符串——必须 coerce，呼应 PostgREST 教训）。
- registry：市场→源路由；EODHD 未配置返回 null。
- 迁移后 decisions 表可插 market='TW' 行（终审时 Management API 实测）。

## 不做（YAGNI）

- EODHD 订阅与日韩实数据（等付费用户）；回测页 TW 过滤按钮；台股盘中 tick 级数据；TWSE 之外的第三方台股源；日韩搜索；港股通/台股复委托等交易通道概念。
