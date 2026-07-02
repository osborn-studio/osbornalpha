# P5b Tushare L2 + 决策 vs 信号对照 Implementation Plan

> **For agentic workers:** superpowers:subagent-driven-development or executing-plans。
> **依赖：P5a 已合并。外部前置：用户完成 Tushare 5000 积分充值**（未充值时代码优雅降级，全部功能不报错）。

**Goal:** ① 券商一致预期真数据接入（`report_rq`），填掉股票池 目标价/估值区间 的 `--`；② 复盘页新增「我的决策 vs 信号」对照区。

---

### Task 1: fetchTushareReportRq + 降级链 (TDD on pure parts)

- `src/lib/data/sources/tushare.ts` 加 `fetchTushareReportRq(ticker, opts?)`：调 `report_rq` 接口（字段 report_date/report_title/report_type/org_name/quarter/op_rt/np/eps/pe/rd/max_price/min_price 等——以实际 API 文档字段为准，实现者查 tushare.pro 文档或按既有 fetchTushare* 模式写，失败抛 TushareError）。
- `src/lib/stocks/consensus.ts`（纯函数 TDD）：`deriveConsensus(reports)` → `{target_median, target_min, target_max, n}`（复用/对齐 metrics.ts 的 deriveTargetPrice 语义：中位数、≥2 才有区间）。
- 接线：现 metrics 的 broker_reports（mock）路径改为降级链——`/api/financials` 或新轻路由 `/api/consensus/[ticker]`（A 股：tushare report_rq → deriveConsensus；无 token/额度/非 A 股 → 现 mock broker_reports → null）。WatchlistTable 与个股页 FocusPanel 的目标价来源统一走这里；来源标注（tushare/mock）。
- 环境无 5000 积分时：TushareError 捕获 → 降级，UI 与现状一致（`--`）。

### Task 2: 决策 vs 信号对照（复盘页新区块）

`/portfolio/review` 加「决策 vs 信号」Panel：对每个有评分的决策 ticker，取 `useSignals(ticker)`.stats 或 `/api/signals/[ticker]` 的 hit_rate_5d；表格：ticker / 我的决策 hit（该 ticker 已评分决策的 hit 率）/ 信号 hit_rate_5d / 差值上色（我强于信号→up）。汇总行：总体我的胜率 vs 信号平均胜率 vs Copilot 决策(source_type='copilot')胜率——**三方对照**（需要 decisions join reviews，页面已有两份数据，纯客户端计算）。空态：评分决策不足时提示。

### Task 3: 终审 + 合并

验收：充值后 A 股目标价列出真数（来源标 tushare）；复盘页三方胜率表随数据增长可用。
