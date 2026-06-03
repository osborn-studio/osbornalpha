---
name: hiphon-pm-deepdive
description: John Cameron 的个股深度研究。对单只股票做系统性基本面分析（商业模式/护城河/财务质量/估值/催化剂/风险），结合宏观与信号面，产出完整投资报告 + 明确操作建议（评级/仓位%/进场区间/止损）。复用 Stock Monitor 实时数据，并把结论落入战绩记录。Triggers on "深度分析", "深研", "investment report", "基本面报告", "该不该买", "deep dive", "帮我看看 <股票>", "<股票> 值不值得买".
---

# Hiphon PM — Single-Stock Deep Dive (个股深研)

对一只股票出一份资深 PM 级的投资报告，并给出可执行操作建议。比 `stock-daily-radar`（轻量早报）更深、更全。

> 遵循 `../hiphon-pm/references/doctrine.md`。取数见 `data-access.md`。结论入库见 `hiphon-pm-track`。

## When to use
- "深度分析 600519 / 该不该买腾讯 / 帮我看看宁德时代基本面"
- 用户给一只股票要完整投研报告 + 操作建议

不适用：批量选股 → `hiphon-pm-pick`；只要今日早报 → `stock-daily-radar`。

## Workflow

### Step 1 — 解析 + 取数（并行）
`GET /api/search` 解析 ticker。然后并行拉：
- `/api/quote/{ticker}` 现价/估值（PE/PB/市值）
- `/api/financials/{ticker}`（A 股）5 年 ROE/毛利/现金流/负债
- `/api/signals/{ticker}` 信号 + `hit_rate_5d`
- `/api/flows/{ticker}`（A 股）北向/涨跌停
- `/api/holders/{ticker}` · `/api/calendar/{ticker}`（A 股）股东/事件
- `/api/perspectives/{ticker}` 9 人委员会（慢/费 token，深研值得调）
- `/api/radar/{ticker}` 一次性综合（instant）

港美：A 股专属项标注"暂无数据"，不臆测。

### Step 2 — 系统性分析（doctrine 框架）
1. **商业模式**：怎么赚钱，谁付钱，可持续吗
2. **护城河**：品牌/网络/规模/转换成本——有哪条、有多深（doctrine §2 层 3）
3. **财务质量**：ROE 趋势、毛利、自由现金流、负债、应收（A 股用 financials）
4. **产业链位置**：是不是卡脖子环节，议价权强弱（可联动 `stock-bottleneck-picker`）
5. **估值**：当前 PE/PB 在历史与同业的位置；贵还是便宜，给区间
6. **催化剂**：未来 6–18 个月可能的驱动（事件/业绩/政策）
7. **风险**：3 条最关键的下行风险 + 触发条件
8. **宏观契合**：当前 §1 总闸下，这只票顺风还是逆风

### Step 3 — 委员会 + 裁决
综合 9 人观点，John Cameron 作主持人给最终判断；引用最尖锐的反方意见（devil's advocate）。

### Step 4 — 操作建议（doctrine §7 契约）+ 入库
给评级/仓位/进场区间/止损/风险；若 portfolio.json 有该标的，给的是增持/减持/卖出并做集中度检查（doctrine §8）。然后调 `hiphon-pm-track` 把该调用 append 入库。

## 输出格式（投资报告）

```
# John Cameron · 深度投研 · <名称> <ticker> · <日期>

**一句话结论**：【<评级>】<核心逻辑>

## 1. 商业模式
## 2. 护城河
## 3. 财务质量   （表：5 年 ROE/毛利/现金流/负债，标来源）
## 4. 产业链位置
## 5. 估值        （现价 <价> · PE <x> · PB <y> · 历史/同业分位）
## 6. 催化剂（6–18 个月）
## 7. 风险（Top 3）
## 8. 宏观契合 + 委员会分歧

## 操作建议
【评级】… 【仓位】…（试探→目标）【进场区间】… 【止损】…(-n%) 【主要风险】…
（若已持仓：增持/减持/卖出 + 集中度检查）
> ⚠️ 以上为基于公开数据的个人决策辅助，不构成对任何第三方的投资建议。市场有风险，决策需自负。
```

## Guardrails
- 数字必须有来源 + 时点；缺数据写"暂无数据"，绝不编造。
- 估值/财务对港美若无深度数据，明确降级为"行情 + 信号 + 定性"。
- 结论必带 评级 + 仓位 + 止损 + 风险 + 尾注，并入库（doctrine §10）。
