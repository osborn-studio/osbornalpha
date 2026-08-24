<!-- 23_EXTERNAL_INTELLIGENCE_SKILLS.md · osbornalpha 外部数据与情报（Tushare+爬虫行情/news_items/broker_reports/雷达喂入） · 最后更新 2026-06-20 -->

# 23 · 外部数据与情报能力

> 以 `src/lib/data/sources/*` 与 `supabase/migrations/*`、`database.types.ts` 真实代码为准。

## 23.1 行情数据源与级联

四个数据源（`src/lib/data/sources/`），按可靠性级联，每层 ~4s 超时 + 200ms 重试：

1. **Eastmoney（东方财富）** `eastmoney.ts` — 实时快照 `https://push2delay.eastmoney.com/api/qt/stock/get`、K 线 `https://push2his.eastmoney.com/api/qt/stock/kline/get`（`fqt=1` 前复权）。无需鉴权。secid 前缀映射：`0.`=深/北、`1.`=沪、`116.`=港、`105/106/107`=NASDAQ/NYSE/AMEX（US 失败时 105→106→107 回退）。字段 `f43`价/`f44`高/`f45`低/`f46`开/`f60`昨收/`f162`PE TTM/`f167`PB/`f50`量比 等。**注意：从 Vercel US 区访问 A 股 secid（0./1.）地理受限，常需回落。**
2. **Sina（新浪财经）** `sina.ts` — `https://hq.sinajs.cn/list=...`（GBK 编码），AKShare 底层源。前缀 `sh/sz`=A、`rt_hk`=港、`gb_`=US。逗号分隔、按市场不同字段布局；标记为延迟数据，A 股无 PE/PB/市值。
3. **Tencent（腾讯财经）** `tencent.ts` — `http://qt.gtimg.cn/q=...`（GBK，波浪线分隔）。前缀 `sh/sz/bj`=A、`hk`=港、`us`=US。A 股成交量按「手」(=100 股) 转换为股。
4. **Tushare daily** — 仅 A 股、消耗积分，仅在前三免费源全失败时兜底。

级联实现见 `src/app/api/quote/batch/route.ts`：Eastmoney → Sina → Tencent → Tushare。

## 23.2 Tushare Pro（A 股深度数据）

`tushare.ts`：endpoint `https://api.tushare.pro`（POST），鉴权 `TUSHARE_TOKEN`。仅用于 A 股深度数据（财报/股东/公告/业绩预告/分红/限售解禁/北向），**不用于实时行情和 HK/US**。

主要函数：`fetchTushareDaily`（日线 OHLCV）、`fetchTushareDailyBasic`（pe/pe_ttm/pb/ps/total_mv/dv_ratio/turnover_rate）、`fetchTushareFinaIndicator`（roe/grossprofit_margin/netprofit_margin/current_ratio）、`fetchTushareIncome`、`fetchTushareBalance`、`fetchTushareCashflow`（含 `free_cashflow`）、`fetchTushareTopHolders`、`fetchTushareNorthboundTop10`（`hsgt_top10`）、`fetchTushareLimitList`（涨跌停 U/D/Z）、`fetchTushareAnnouncements`、`fetchTushareDisclosureDate`、`fetchTushareForecast`（业绩预告）、`fetchTushareDividend`、`fetchTushareShareFloat`。

**缓存** `tushare-cached.ts`（Next.js `unstable_cache`）：日线 6h；daily_basic 24h；财报类（fina_indicator/income/balance/cashflow）7 天；股东 24h。定价：免费 120 积分；Pro 5000 积分（≈¥4500/年）解锁高配额 + 5k 端点（北向/公告/涨跌停）。

## 23.3 新闻与券商研报

DB 中两张 **按用户** 缓存表（`supabase/migrations/20260515000000_initial_schema.sql`，RLS 按 user_id）：

- **`news_items`**：`ticker / title / source / url / sentiment / published_at / fetched_at`。
- **`broker_reports`**：`ticker / broker / rating / target_price / target_change_pct / pdf_url / ai_summary / published_at / fetched_at`。

> **现状**：两表 schema 已就绪，但 **暂无外部自动抓取集成**（manual / stub 填充）。`broker_reports.ai_summary` 预留给 LLM 研报摘要（Anthropic/DeepSeek，见文档 12），尚未接线。

## 23.4 外部信号如何喂入雷达/简报

1. 行情源（23.1）→ `/api/quote*` → `composer.ts:computeTriggers()` 与 `radar.ts` 算信号分。
2. Tushare daily_basic / fina_indicator → 触发器 `high_turnover`、`low_pe`、`high_pe`、`quality_value`（roe>20 且 pb<5）。
3. Tushare 北向（`hsgt_top10`）+ 涨跌停（limit_list）→ `/api/flows` → 雷达「资金流向」段（北上 5 日趋势、n 连板）。
4. 公告/业绩日历（announcements/disclosure/forecast/dividend）→ `/api/calendar` → 雷达「事件」段（公告 +2、财报 +3 权重）。
5. 综合分→雷达级别 `≥8 🔴 / 4–7 🟡 / <4 ⚪️`；🔴/🟡 个股可选触发 `digest-takes` 委员会一句话（`LLM_DIGEST_TAKE=on`）。
6. 简报与雷达由 cron 每日生成并经 Telegram/Email 推送（详见文档 16）。

雷达载荷 `/api/radar/{ticker}` 无 LLM、零成本即时输出 Price/Flows/Events/Fundamentals/Triggers + markdown/html。

## 23.5 信号回测引擎

`src/lib/signals/backtest.ts`：在 K 线上算 vol5/vol20、pctChg、amplitude、consecUpDays、rsi14（超买≥75、超卖≤25），输出 `forward_1d/5d/20d_pct`、`hit_5d`（hit/miss/flat/pending）、`bias`。这是 `/api/signals` 的 `hit_rate_5d` 与 bias 来源，供 skills 评估信号可靠性。

## 23.6 源可靠性与回退总结

| 源 | 用途 | 鉴权 | 回退/可靠性 |
|---|---|---|---|
| Eastmoney | 实时行情 + K 线 | 无 | 主源；Vercel US 访问 A 股受限 → 回落 Sina |
| Sina | 行情兜底 | 无 | 延迟数据；A 股无 PE/PB/市值 |
| Tencent | 行情三级兜底 | 无 | GBK，量按手转股 |
| Tushare | A 股深度 + daily 兜底 | `TUSHARE_TOKEN` | 积分配额限制；缓存 6h–7d |
| news_items / broker_reports | 新闻/研报缓存 | RLS（用户） | 暂无外部抓取，手动/stub |

## 23.7 与既有事实的差异

- **新闻/研报无外部集成**：`news_items`、`broker_reports` 仅有 DB schema，尚未自动抓取。
- **北向口径**：Tushare 的 `hk_hold` 实为南向（陆资买港股）；个股北向走 `hsgt_top10`（代码注释已标注）。
- 可选 `ALPHAVANTAGE_API_KEY`（US 备选）存在于 `.env.example`，Eastmoney 已覆盖多数 US 标的，默认不强制。
