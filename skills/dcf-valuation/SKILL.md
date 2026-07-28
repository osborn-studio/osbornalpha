---
name: dcf-valuation
description: 对某只股票跑组合式 DCF 估值（4 个现金流变体 + 每股区间 + 敏感性）。当用户问"X 值多少钱/内在价值/DCF/估值"时使用。
---

# DCF 估值（dcf-valuation）

## 何时用
用户想要某标的的内在价值 / DCF / 估值区间时。

## 怎么做
1. 解析 ticker（不确定先用 search）。
2. 调用 Stock Monitor API：`POST /api/dcf/<ticker>`，body 可带 `{ "overrides": { "wacc": 0.1, "terminalG": 0.025, "forecastYears": 8 } }`。
   - Base URL 见 `skills/hiphon-pm/references/data-access.md`。
3. 读取响应：`result.valuation.rangePerShare`（min/median/max）、四变体 `fcff/ebitda/adjusted/exSbc` 的 `perShare`、`sensitivity` 网格、`warnings`。
4. 解读：
   - 中枢取 median；用 4 变体的离散度表达不确定性。
   - terminalPctEv 过高（>0.8）→ 提示终值依赖大、敏感性高。
   - 必看 `warnings`：AI/默认假设要人工复核；港美无 A 股财报时数据更弱。
5. 与相对估值（PE/PB，来自 quote/financials）交叉验证后再下结论。

## 纪律
- 绝不编造数字；缺数据说"暂无数据"。
- 估值是区间不是点；务必带假设与敏感性。
