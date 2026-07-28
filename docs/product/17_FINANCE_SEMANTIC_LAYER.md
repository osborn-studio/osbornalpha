<!-- 17_FINANCE_SEMANTIC_LAYER.md · osbornalpha 金融语义层（financial_history 字段/估值指标/市场约定/红涨绿跌色彩） · 最后更新 2026-06-20 -->

# 17 · 金融语义层

> 以 `database.types.ts`、`supabase/migrations/*`、`src/lib/brief/composer.ts`、`src/lib/signals/backtest.ts`、`src/app/api/financials/[ticker]/route.ts`、`src/components/KlineChart.tsx` 真实代码为准。

## 17.1 `financial_history`（公共参考表）

主键 `(ticker, fiscal_year, period)`，RLS 公共可读。字段：

| 字段 | 类型 | 单位/含义 |
|---|---|---|
| `ticker` | text (FK→stocks_universe) | 标的代码 |
| `fiscal_year` | int | 财年 |
| `period` | text（默认 `annual`） | 期间 |
| `revenue` | numeric | 营收（元） |
| `net_income` | numeric | 净利润（元） |
| `roe` | numeric | 净资产收益率 % |
| `gross_margin` | numeric | 毛利率 % |
| `free_cash_flow` | numeric | 自由现金流（元） |
| `updated_at` | timestamptz | 更新时间 |

数据来源 Tushare（income/fina_indicator/cashflow，见文档 23），底层金额以 **元** 存储。

## 17.2 估值/指标定义与计算

- **来源管线**：Eastmoney 行情（PE/PB 即时）+ Tushare daily_basic（`pe/pe_ttm/pb/ps/total_mv/circ_mv/dv_ratio/turnover_rate`）+ fina_indicator（`roe/grossprofit_margin/netprofit_margin/current_ratio`）+ income/balance/cashflow（含 `free_cashflow`）。
- **展示换算**（`/api/financials/[ticker]/route.ts`）：Tushare 原值为「元」，展示按「亿」= `n / 1e8`。年度摘要表字段：`year, revenue_yi, total_revenue_yi, net_income_yi, eps_basic, total_assets_yi, total_liab_yi, equity_yi, op_cashflow_yi, free_cashflow_yi`；最新指标 `end_date, roe, gross_margin, net_margin, current_ratio`。
- **派生收益**（`backtest.ts`）：`pctChg = (close−prev_close)/prev_close*100`，`amplitude = (high−low)/prev_close*100`，另算 vol5/vol20、consecUpDays、rsi14。

## 17.3 信号触发器（金融语义→分数）

`composer.ts:computeTriggers()` 把金融指标翻译为带权信号：

| rule | 条件 | weight | 来源 |
|---|---|---|---|
| `large_move` | \|change_pct\| ≥ 5% | 3 | 行情 |
| `medium_move` | 3% ≤ \|change_pct\| < 5% | 2 | 行情 |
| `high_turnover` | turnover ≥ 5% | 2 | Tushare daily_basic |
| `anomalous_volume` | volume_ratio ≥ 2.0x | 2 | Eastmoney f50 |
| `high_amplitude` | (high−low)/prev_close ≥ 5% | 1 | 行情 |
| `low_pe` | pe_ttm < 15 | 1 | Tushare/Eastmoney |
| `high_pe` | pe_ttm > 80 | 1 | Tushare/Eastmoney |
| `quality_value` | roe > 20% 且 pb < 5 | 1 | fina_indicator + daily_basic |

分数→雷达级别 `levelFromScore`：`≥8 → 🔴 关注`、`≥4 → 🟡 留意`、`<4 → ⚪️ 平静`。

## 17.4 市场约定（A / HK / US）

- **市场枚举** `market_t`：`'A' | 'HK' | 'US'`（`stocks_universe.market`）。
- **代码格式**：A 股 `600519.SH` / `002624.SZ`；港股 `00700.HK`；美股 `AAPL`（无后缀）。各数据源前缀映射见文档 23。
- **数据覆盖差异**：A 股有完整深度数据（financials/flows/holders/calendar）；HK/US 缺深度数据，深研/雷达对其降级为「行情 + 信号 + 定性」，缺失字段统一返回「暂无数据」。

## 17.5 红涨绿跌（CN）vs 绿涨红跌（US）色彩方案

`KlineChart.tsx` 按 `data-color-scheme` 取色：

```ts
const scheme = document.documentElement.getAttribute('data-color-scheme') || 'cn';
const upColor   = scheme === 'cn' ? '#ef4444' : '#10b981'; // 涨：CN 红 / US 绿
const downColor = scheme === 'cn' ? '#10b981' : '#ef4444'; // 跌：CN 绿 / US 红
```

- 默认 `'cn'`（中国惯例红涨绿跌）；用户经 `ThemeToggle`（🇨🇳 红涨绿跌 / 🇺🇸 绿涨红跌）切换，持久化于 `localStorage['color-scheme']`，并落 `user_preferences.color_scheme`。
- 服务端在 `layout.tsx` 预水合 `data-color-scheme` 避免闪烁。

## 17.6 指标如何展示

- 雷达载荷 `/api/radar/{ticker}`（无 LLM）输出 Price（价/change_pct/PE/PB/市值/source）、Flows（北向/连板）、Events、Fundamentals（ROE/毛利/净利/股息率）、Triggers + markdown/html。
- 财务页经 `/api/financials/{ticker}` 展示「亿」单位年度摘要 + 最新比率（仅 A 股）。
- 信号页经 `/api/signals/{ticker}` 展示触发器 + bias + `hit_rate_5d`（回测命中率）。

## 17.7 与既有事实的差异

- `financial_history` 存「元」，展示层换算为「亿」（`/1e8`）。
- 色彩默认 `'cn'`，K 线图遵循；但 radar-digest HTML 邮件目前用固定 `#d33/#3a3`，尚未完全跟随 `color_scheme`（见文档 16）。
- 部分估值指标（PE/PB/市值）对 A 股可能来自 Tushare daily_basic 而非免费行情源（Sina A 股不带 PE/PB/市值）。
