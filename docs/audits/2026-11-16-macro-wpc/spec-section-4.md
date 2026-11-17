## 4. WP-C · 图表组织

### 4.1 概览大图卡

`KeyIndicatorCards`（US `US_DFF`、`US_DGS10`、`US_CPI_YOY`、`US_UNRATE`；CN `CN_PMI_MFG`、`CN_CPI_YOY`、`CN_CGB_10Y`、`CN_M2_YOY`）。标题行 = envelope 行（快照值、期、变化，标注"快照值"）；折叠态 `Sparkline(IndicatorRow.sparkline)`；展开态 `IndicatorDetail compact asOf={createdAt}`（`createdAt` 经 `GET /api/macro/snapshots/{snapshotId}` 的 `snapshot.created_at`，组件级缓存），图表区标注"历史（可得时间 ≤ 快照时刻 …）"；图最后一点 `observation_id` ≠ 快照行 → 提示"图表最新 X（期）≠ 快照值"。**限制**：`seriesHistory(asOf)` 不按批次完成过滤（与快照 `eligibleHistoryAsOf` 不同），内部点可能含快照后完成批次的数据——记入 runbook §14；D1 可在 `views.ts` 增 `history_ids` 投影后改为冻结历史。默认前 2 张展开。

### 4.2 标记层与事件列表

`MacroLineChart.layers?:{derived?:boolean;calendar?:boolean}`（默认 derived on、calendar off）；`markersOf(events, calendar, firstPeriod, layers)`：事件身份 = 派生 `kind|region|series_id|effective_date`（US 目标区间事件 `series_id` 固定；CN 报价事件按期限序列区分，同日 1Y 与 5Y 各一条）、日历 `start|end`；仅去身份相同者；同日派生 + 日历各一。两个 `aria-pressed` pill。"事件（最近 6 条）"：按 `effective_date` desc，同日 derived 先于 calendar，再按身份键；`|change_bp| ≥ 25` 才带文字。

### 4.3 资产条形

`barGeometry` 从 `strategy-view-model.ts` 移至 `charts/chart-geometry.ts`（删除旧实现，策略组件改 import）；`assetBarPanels(assetsByCycle, cycles)` → 每周期 `{pct:{domainMax,rows}, bp:{domainMax,rows}}`，`rows[{asset_id, name, value:number|null, text}]`，缺值不画条（显示"缺失"）；零轴居中；tooltip 单位与端点；表格切换保留；`--up/--down`。

### 4.4 默认关联结果卡（P1 §3.4 修订）

- **共享服务** `src/lib/macro/analysis-service.ts::prepareAnalysis(deps, spec, {cutoff, codeVersion, history:'as_of'|'eligible_as_of'})`：别名解析（`aliasOf`）、历史读取（`'as_of'` → `db.seriesHistory({asOf})`；`'eligible_as_of'` → `db.eligibleHistoryAsOf({to, asOf, maxRows})`：候选按 period_end 分组，只保留 asOf 前已完成批次的最高版本（`db.ts:350-360`））、行数上限同 POST、`event_window` 的 `US_FED_TARGET_UPPER_D`/`LOWER_D` 读取与 `derivePolicyEvents`、`freezeInputs`、`inputsHash`（只哈希 `FrozenInputs`）、`runAnalysis`、`explainResult`。POST 路由改调它（`history:'as_of'`，**行为不变**，幂等查找仍在路由内先于读取）。
- **配额执行点**：唯一 `create_macro_analysis_run` RPC（POST）；预设不调用；测试：memory db 无 run、无 RPC。
- **路由** `GET /api/macro/analyses/presets?region=`：`requireSessionUser` → region 校验 → `resolveCodeVersion({allowGit:false})` 失败 → 503 `code_version_unavailable` → `db.activeSnapshot(region)` 无 → `{cards:[], reason:'no_published_snapshot'}` → `cutoff = snapshot.created_at`；每预设 `request_id = uuidv5('6f0c3d0e-9a2b-4c8e-8d4f-1b2c3d4e5f60', preset_id)` → `prepareAnalysis(…,{history:'eligible_as_of'})`。
- **预设规范**（`correlation-presets.ts`，`PRESETS_VERSION='macro-presets/1'`）：p1 US change `US_DFF×US_UST10Y` 0 10y；p2 US change `US_CPI_YOY×US_UST10Y` 0 10y；p3 US change `US_CPI_YOY×US_WTI` −1 10y；p4 US change `US_DTWEXBGS×US_WTI` 0 10y；p5 US rolling `US_UNRATE×US_UST10Y` 0 all；p6 US event_window `US_DFF×US_UST10Y` ±6 all（额外两条事件源读取）；p7 CN change `CN_PMI_MFG×CN_CGB10Y` 0 10y；p8 CN level `CN_CPI_YOY×CN_CGB10Y` 0 10y。
- **响应**：`{region, snapshot_id, cutoff, computed_at(首次计算 UTC，memo 命中返回原值), code_version, method_version:CORRELATION_VERSION, presets_version, catalog_version, cards:PresetCard[]}`；`PresetCard={preset_id, run_id:null, request_id, kind, spec, inputs, inputs_hash, results|null, error|null, status:'ok'|'failed', method_version, code_version, created_at:computed_at}`（与 `RunJson` 同名字段；`CorrelationResult` `preset` 模式）。
- **memo**：LRU 32、单飞（单飞键 = memo 键），键 `region|snapshot_id|CATALOG_VERSION|CORRELATION_VERSION|EVENTS_VERSION|PRESETS_VERSION|code_version` → 值 = 该地区**整个响应**（全部预设卡 + `computed_at`）；头 `X-Macro-Presets-Memo: hit|miss` 描述整个响应；`computed_at` 为响应顶层字段（首次计算的 UTC ISO 时刻；hit 返回原值）。限制：cutoff 后隔离裁决可改变 eligible 集合 → `inputs_hash` 揭示；不声称跨实例恒等；多实例冷启动成本 = 每实例一次（≤ 6 组 × ≤ 4 次读取）。
- `analysis-spec.ts` 新增 `dataHash(inputs)`：只哈希 `indicator/asset` 的 `series_id, source_series_id, change_kind, observations[]{observation_id, period_end, value_text}`、`events[]` 与 `events_version`（`EVENTS_VERSION`，`src/lib/macro/events.ts`）（不含 `cutoff`、`catalog_version`）；`PresetCard` 与 `RunJson` 都带 `data_hash`。按钮"重新计算并保存" → POST（计配额、现时 cutoff、`as_of` 历史）；`data_hash` 不同 → 提示 `correlation.preset.inputsChanged`（"数据已更新"）；仅 `inputs_hash` 不同 → 不提示（cutoff 差异）。测试：相同观测不同 cutoff → `data_hash` 相等；一次修订 → 不等。
- 失败预设成卡。
- 基准 `scripts/macro/bench-presets.ts`：参数 `--base`、`--region`、`--runs 3`；冷 = 新进程 + 空 memo，热 = 同进程；固定样本 DB（`seed.ts`，记录其 snapshot_id 与 catalog 版本）；禁用 HTTP 缓存（`cache:'no-store'`）；输出全部样本与中位数；结果写 `pr-c2-acceptance.md`。
- 测试：预设路由结果 === 直接调用 `prepareAnalysis(spec, cutoff, 'eligible_as_of')`；无 run/无 RPC；memo 头与 `computed_at` 稳定；无快照；401；503；p6 事件读取；失败卡；POST 现有测试不变。

### 4.5 传导短标签

`NodeCard` 默认：徽章、短标签、值 + 单位、数据期；其余 `<details>`。边：`stages[].edge:{text:Bilingual;kind:'assumption'}|null`（契约已有）；流程内只画箭头；流程下方 `<details>`"机制假设（N 条）"= `stages.filter(s=>s.edge).map(s=>s.edge.text[locale])`；删除 `flow.edge` 文案键（`strategy-messages.test.ts` 断言不存在）；剧本声明一次。

### 4.6 列切换

`visibleColumns(view:CycleTableView, mode)`、`visibleDims(view:PolicyResponseView, mode)` → `VisibleColumn{id,label,hidden_reason:'restricted'|'not_in_catalog'|null}`；N 按表各算；`cycleScale` 不变；`localStorage` 键 `macro.strategy.columns.v1`；"补齐计划 → `/intel/macro?tab=methodology#data-gaps`"（方法 tab 新小节，内容 §5.6）。

### 4.7 测试

`view-model.test`（`KEY_INDICATORS`）；`detail-model.test`（asOf 透传、层过滤、身份去重、事件排序）；`chart-geometry.test`（`barGeometry` 搬家同用例、`assetBarPanels` 缺值）；`strategy-view-model.test`（`visibleColumns/visibleDims` 不改 `cycleScale`、`edgeNotes`）；`strategy-messages.test`（无 `flow.edge`）；`analysis-service.test`；预设路由测试；浏览器四组截图。

---

