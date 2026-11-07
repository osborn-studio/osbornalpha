# 宏观工作台 P5 · ChaosAI 精华吸收（美林时钟卡片 · 图表组织 · 数据缺口）设计规格

日期：2026-11-07（第 1 稿）
状态：草稿，待 mmx + Codex gpt-6-astra 审计（审计记录 `docs/audits/2026-11-07-macro-p5/`）
前置：`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（P1+P2，第 6 稿）、`docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md`（P3+P4，第 3 稿）、F4 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md`
研究输入：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`（我方 11-04 实证拆解）、`docs/research/chaosai-macro-2026-11-07/handoff-chatgpt-2026-11-07.md`（owner 委托 ChatGPT 的 11-07 交接，含两国贡献矩阵与验收表）
总纲（硬约束）：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 —— 只用一手来源、每个数字可复算、事实与判断分离、缺失保持缺失（不插值不补零）、zh/en、`DESIGN.md` 令牌、每个页面 UI 先上 Claude Design 画布再写代码。
基线提交：本工作树基于 `origin/main` `1e9cfb87`（PR #121 合并后）。生产：`osbornalpha.com/intel/macro`，`MACRO_STRATEGY_ENABLED=1`，`MACRO_JUDGMENTS_ENABLED` 未设（判断层关闭）。

---

## 0. 一页结论

1. **不写第二套评分引擎。** 美林时钟的权重、类型化规则、逐项贡献、归一化、主次状态、覆盖率已经在 `src/lib/macro/regime.ts`（`classifyRegime`）里，并在每次快照发布时（`snapshots.ts::publishRegion`）与快照一同冻结进 `macro_regime_results`。P5 只消费这份结果，把它组织成 ChaosAI 式的"四象限卡 → 前三驱动 → 可展开分解 → 证据"阅读路径，并保证卡片数字 = 展开表合计。
2. **差距分三类：展示（WP-B、WP-C）、数据（WP-D）、方法（不在本规格内，见 §9）。** 现有图表（`IndicatorDetail` + `MacroLineChart`）、周期、事件、关联、传导、历史矩阵全部已上线；它们缺的是组织方式，不是图表库。
3. **ChaosAI 只借信息架构，不借数据与规则。** 其公开快照有可复算错误（UNRATE 2020-04 = 2.8、CN GDP 月度点、DGS10−DFF 冒充中美利差、规则按数值派发让汇率命中利率阈值），本规格不引用其任何数值。
4. **三个跨模块硬约束**在 §2.5 写明：(a) 目录任何改动 → `CATALOG_VERSION` 变 → F4 `macro_regime@v1` 固定的 `catalog_version` 失配 → F4 弃权（`upstream_version_mismatch`），所以 WP-D 必须带 F4 方法 v2 注册；(b) 权重/阈值/规则改动 = 方法版本改动（`METHODOLOGY_VERSION`、`RULES_VERSION`），不在 P5 内做；(c) 判断层数字只在 `MACRO_JUDGMENTS_ENABLED=1` 时经服务端路由出现，客户端永不读开关、永不自算。

---

## 1. WP-A · 基线：ChaosAI 各板块对照矩阵（2026-11-07 核实）

状态口径：**live** = 生产可见；**merged** = 已在 `main`，生产未开或未部署；**open PR** = 未合并；**not impl** = 代码不存在。ChaosAI 侧按 `MACRO_STRATEGY_DEEP_DIVE.md` §2 的七个区块与 §5–§8 细项拆开。

| # | ChaosAI 子板块 | 我方对应能力 | 状态 | 差距性质 | 归属 |
|---|---|---|---|---|---|
| 1a | 美林时钟 · 判定头（当前象限 + 备选 + GDP↑/CPI↑ 徽标） | `RegimeResult.{primary_state,secondary_state,growth_axis,inflation_axis}`，存于 `macro_regime_results.regime`；`GET /api/macro/snapshots/[id]` 在开关开时返回 | merged（开关关 → 不可见） | 展示 | WP-B |
| 1b | 四张象限卡 + 百分比 | `RegimeResult.norm`（规则得分占比）、`scores`、`margin_pp`、`coverage` | merged | 展示 + 命名（不得叫概率） | WP-B |
| 1c | "查看定量分解"展开表（指标 / 当前值 / 命中规则 / 得分×权重 / 贡献） | `RegimeContribution[]`（`series_id, observation_id, rule_id, weight, support, contribution{4}`）；`MacroJudgmentSlot` Basis 表只显示 `series_id`/`rule_id`/`weight`/非零贡献 | merged（技术表格） | 展示：可读名、值、期、比较、规则中文、支持系数、证据入口、对账 | WP-B |
| 1d | 偏差案例库 | `strategy/deviations.ts` + `DeviationCases.tsx`（`macro-deviations/1`，仅判断层开） | merged | — | 不动 |
| 1e | 判定方法论页 | `/intel/macro?tab=methodology`（目录表 + 版本）；F4 `docs/methodologies/macro_regime/v1.md` | live | 规则表中文化在 WP-B 一并给出 | WP-B |
| 1f | 资产配置模板（股/债/商品/现金/黄金比例）与超/低配行业 | **无**；P3 `playbooks-v1.ts` 只有"受益/受损资产（假设）" | not impl（有意） | 本规格明确**不做**配置比例（§3.7） | — |
| 2a | 指标汇总表（值、变化、日期、来源） | `IndicatorTable`（名称、值、类型化变化、数据期、可得时间、状态、迷你走势） | live | — | 不动 |
| 2b | 指标大卡（历史线 + 周期色带 + 事件卡 + 周期内资产 + 解读 + 来源行） | `IndicatorDetail`（完整）+ `MacroLineChart`（色带、箭头、FOMC 圆点）+ 表格视图；概览只有"行选中 → compact 预览" | live | 组织：概览缺大图卡入口；FOMC 圆点过密；资产表不可横向比较 | WP-C |
| 2c | Pearson Top-6 卡 + 拟合分析 | `CorrelationWorkbench`（预填 8 组表单，不自动跑）+ `CorrelationResult`（r/R²/n/散点/拟合/解释句/冻结输入） | live | 首进无结果卡 | WP-C |
| 3a | 中国"利率三合一"卡（MLF / LPR 1Y / LPR 5Y） | 目录 `CN_LPR_1Y`、`CN_MLF_1Y` 为 `missing`；无 `CN_LPR_5Y` 目录项 | not impl（数据） | 数据 + 目录 | WP-D |
| 3b | 社融存量同比 | `CN_AFRE_STOCK_YOY` 为 `missing`（AKShare 只有商务部转载的增量口径） | not impl（数据） | 数据 | WP-D |
| 4a | 六段实时传导流 | `strategy/transmission.ts` + `TransmissionFlow.tsx`（观测/推导/假设/缺失/受限/未纳入目录六态；中美 10Y 利差只在同期可算时出现） | live | 可读性：每条边"机制假设：机制假设：…"重复；节点字段全展开 | WP-C |
| 4b | 流动性节点（RRP/TGA、M2/社融、信用利差） | US 流动性段为 `not_in_catalog`（RRPONTSYD / WTREGEN 未入目录）；WALCL 未入目录；信用利差无权利已确认序列 | not impl（数据） | 数据 | WP-D |
| 4c | 四象限剧本 + 当前剧本 | `PlaybookGrid`（`macro-playbooks/1`，F4 标记三条件） | live | 文案重复"（假设）" | WP-C（轻） |
| 5 | 联储 → 中国资产（六节点、热力图、价格/数量工具） | `PolicyResponseMatrix`（`macro-policy-response/1`：加息/降息/QE-QT × 9 维度的事件后描述统计，n<5 只列逐事件） | live | 权益两列受限；QE/QT 行无资产负债表序列 | WP-C（切换）+ WP-D（WALCL） |
| 6 | 历史：加息/降息周期 × 13 资产表 | `CycleReturnsTable`（`macro-cycle-table/1`，三种边界、九列：US_UST10Y、CN_CGB10Y、US_WTI、US_DTWEXBGS、CN_USDCNY_CP、US_SP500、US_NASDAQCOM、US_DJIA、CN_CSI300；后四列 restricted） | live | 受限列占视野；港股/黄金/铜/债券总回报无目录项 | WP-C（切换）+ WP-D（来源计划） |
| 7 | 页脚总来源声明 | 每行 `SourceFooter` + `SourceDrawer`（URL、主机、SHA-256、定位、解析器版本、修订） | live | — | 不动 |
| — | 月度复盘（ChaosAI 无） | `review.ts` + `/intel/macro/review` | live（2026-10 数据不足） | 时间积累 | 不动 |
| — | F4 判断卡（ChaosAI 无等价物） | `MacroJudgmentSlot` 读 `GET /api/judgments?subject_type=macro_region`；`macro_regime@v1` 已注册但 `publishable=false`、校准 `threshold_n=100` | merged；生产无卡 | 见 §2.4 决策 D1 | WP-B |

在飞行中、本规格**不触碰**的文件：PR #125（`claude/integ-f4-macro`：`src/lib/judgments/{deps,inputs-db}.ts`、`src/app/api/judgments/[id]/route.ts`、`src/app/api/macro/{series,snapshots}/[id]/route.ts` 改为经 `macroJudgmentsEnabled()` 读开关）、#123/#124（F4→industry/company，不触宏观）、`claude/macro-strategy-latency`（`src/lib/macro/db.ts` 分页并行、`strategy/port.ts` 读层 memo）、foreign research（`20261119*` 迁移）。P5 对 `snapshots/[id]/route.ts` 的改动（§3.4）以 #125 合并后的版本为基线；若 #125 未合并先合 P5，用同一 `macroJudgmentsEnabled()` 调用，合并冲突只会是这一行。

---

## 2. 时钟数据契约（代码实际暴露的）

### 2.1 计算（`src/lib/macro/regime.ts`，纯函数，方法 `METHODOLOGY_VERSION='v1.0'`，规则表 `RULES_VERSION='macro-regime-rules/1.0'`）

- 输入 `RegimeInput{region, series:Record<id,{latest, prev?, prev3m?}>}`，每个 `ObsRef={observation_id, period_end, value_text}`。
- 每个 `WEIGHTS_V1` 中属于该地区的序列：目录 `status==='active'` 且 `type` 非空且 `weight>0` 才参与；`comparisons()` 把 `value_text` 转 `Number`（唯一的转换边界），`d1 = latest − prev`，`d3 = latest − prev3m`（fx 用百分比变化 `yoyPct`）；比较期缺失 → `null`，需要它的规则不命中。
- `matchRule(type, v, d3, d1)`：只在**自己类型**的规则里找第一条命中（类型内规则互斥）。
- `contribution[i][q] = weight_i × support_rule(i)[q]`，`r6` 四舍六入到 1e-6；`scores[q] = Σ_i`；`matched = Σ 命中权重`；`denominator = Σ regionWeights`（含 missing/restricted 项的权重）；`coverage = matched/denominator`。
- `coverage < 0.6` 或 `Σ scores ≤ 0` → `regime = null`（贡献与 `uncoveredWeight` 仍返回）。
- `norm[q] = scores[q]/Σ scores`；`pickStates`：`primary = argmax`（并列按 `REGIMES` 顺序 recovery<overheat<stagflation<recession）；`secondary = 其余中 norm>0 的最大者`，无则 `null`；`margin_pp = 100×(norm[primary] − norm[secondary ?? 0])`。
- `growth_axis`：pmi/labor_rate/growth_yoy 命中项的 `weight×(recovery+overheat−stagflation−recession)` 加权均值；`inflation_axis` 同式只取 inflation_yoy。范围 [−1,1]，**不是 GDP/CPI 实测值**。
- 权重：US 合计 100（DFF 25、DGS10 15、DTWEXBGS 10、CPI 15、UNRATE 10、PPI 5、ISM 15、VIX 5）；CN 合计 125（CPI 10、PPI 15、PMI 15、GDP 5、M2 10、出口 10、中债 15、人民币 5、LPR 1Y 10、MLF 10、社融 20）。目前 US 分母含 ISM（missing，15）+ VIX（restricted，5）→ 最大 coverage 0.80；CN 分母含 LPR 1Y/MLF/社融（missing，40）→ 最大 coverage 0.68。
- `RULES[type][].label:{zh,en}` **已存在**：规则中文来自这里，按 `rule_id` 查；展示层只在快照的 `rules_version === RULES_VERSION` 时查表，否则显示 `rule_id` 原文加"规则表版本不一致"状态（§3.5）。

### 2.2 冻结与存储（`snapshots.ts`、迁移 `20261114090000_macro_workbench.sql`）

- `buildRegimeInput(db, region)`：对 `regimeInputsOf(region)`（active、weight>0、非日频非事件频）取 `latestEligible`；`prev` = 24 个月窗口内最近一条更早期（**不保证严格相邻月**）；`prev3m` = 恰好三个月前的 `period_end`（季度序列为上一季度，因 `shiftMonthEnd(-3)`）；三者全部进入 `snapshot.observation_ids`；另取 24 点进入 `history_ids`（迷你走势）。
- `publishRegion` 在同一事务里写 `macro_snapshots`（`snapshot_id, region, as_of, revision, methodology_version, catalog_version, observation_ids[], history_ids[], catalog_counts, status, publish_key`）与 `macro_regime_results`（`snapshot_id PK, region, regime jsonb|null, contributions jsonb[], rules_version, uncovered_weight`）。`macro_regime_results` **只授 service_role**；读取只经 `db.regimeOf(id)`（admin client，服务端）。
- 快照不论 coverage 都发布；`regime=null` 只表示这一快照不产生判定。判断开关不影响计算与存储（runbook §12），只影响读取与展示。

### 2.3 读取（路由，`src/app/api/macro/*`）

| 路由 | 返回 | 开关 |
|---|---|---|
| `GET /api/macro/overview?region=US\|CN` | `Envelope{snapshotId, asOf, catalogVersion, methodologyVersion, collection[], indicators[]{observation_id, series_id, name, value_text, unit, change, period_end, available_at, status A/M/R, reason, publisher, via, retrieval_id, evidence[], sparkline[]}, changes, catalogCounts}` | 无判定字段（任何开关下） |
| `GET /api/macro/snapshots/[id]` | `{catalogVersion, snapshot, observations[]（manifest 全部观测的 `publicObservation`：observation_id, series_id, period_end, value_text, version, available_at, availability_basis, retrieval_id, locator, derived_from, transform, code_version）}` + **开关为 `1` 时** `{regime: RegimeResult\|null, contributions: RegimeContribution[], rulesVersion, uncoveredWeight}` | `macroJudgmentsEnabled()` |
| `GET /api/macro/series/[id]?from&to&transform` | `SeriesJson{def（开关关时去掉 weight）, observations, cycles, insufficient, events, calendar, assetsByCycle, …}` | weight 字段 |
| `GET /api/judgments?subject_type=macro_region&subject_key=US` | F4 卡片 `cards[]`（`judgment_id, lifecycle, calibration, as_of, methodology{id,version,title,href}, display{headline, percent\|null, value}, inputs[]{kind:'macro_snapshot', ref:{snapshot_id}}`）；**只含 `publishable=true` 方法**的卡 | F4 RLS |

### 2.4 决策 D1：象限卡的数字来源与"发布资格"

事实：`macro_regime@v1` 在生产已注册但 `publishable=false`，校准门槛 `threshold_n=100` 个已结算判断、`ece_max=0.1`，`display.percent` 只在 `calibration==='calibrated'` 时出现。因此在可预见的几个月内 `GET /api/judgments` 对 `macro_region` 不会有卡，更不会有百分比。

决策：
- **象限卡的全部数字（norm、scores、coverage、margin_pp、贡献）来自宏观快照路由 `GET /api/macro/snapshots/[id]` 在 `MACRO_JUDGMENTS_ENABLED=1` 时返回的 `regime` + `contributions`**，这是 P1 第 6 稿已定的服务端门槛（runbook §12），也是与"同一快照、同一方法"最直接的绑定。标签固定为"规则得分占比（非概率）"，`margin_pp` 标"主次差距（占比差，pp）"。
- **F4 卡片是叠加层，不是数字来源**：同快照（`inputs[].ref.snapshot_id === snapshotId`）且有卡 → 显示生命周期 / 校准 / 方法入口；`percent` 为数时另起一行"校准概率 X%"（唯一允许出现"概率"二字的地方）；无卡 → 状态条"F4：尚无已发布判断（方法 macro_regime@v1 未开放发布）"；卡对应更早快照 → "F4 判断对应较早快照 …，不作为本卡依据"；读取失败 → "判断层暂不可用"（卡片其余部分照常）。
- 开关关闭（生产现状）→ 时钟卡**不挂载**，页面保持第 2 稿 OverviewOff（不出现象限/得分/占比字样，`macro-messages.test.ts` 的禁词断言继续生效：时钟文案全部放在 `judgment.*` 命名空间下的新子树 `judgment.clock.*`）。
- 这是对 ChatGPT 交接"只有结果已满足既有发布条件才展示"的落实：既有发布条件 = 服务端开关；F4 的 publishable 门槛管的是**概率**，不是规则分解。审计时请专门挑战这一条。

### 2.5 跨模块硬约束

| 约束 | 事实 | 后果 |
|---|---|---|
| C1 目录即版本 | `CATALOG_VERSION = 'macro-catalog/' + sha256(canonicalJson(MACRO_CATALOG))[0:12]`，现值 `macro-catalog/30bcaa2a33c5`；F4 `macro-regime.v1.ts` `params.catalog_version` 固定为同一值，`compute()` 在 `s.catalog_version !== params.catalog_version` 时 `abstain('upstream_version_mismatch')`，`gather()` 也只接受此版本 | WP-D 任何目录行增删改（含把 `missing` 翻成 `active`、加 `CN_LPR_5Y`、加三条流动性序列）都要同 PR 增加 `macro-regime.v2.ts`（公式不变，只换 `catalog_version` 与 `doc: v2.md`），并在生产跑 `scripts/judgments/sync-methodologies.ts` 注册（prod-rollout 会话的事）；v2 的 publishable 继续 false |
| C2 方法即版本 | `METHODOLOGY_VERSION='v1.0'`、`RULES_VERSION`、`WEIGHTS_V1` 冻结；`classifyAsOf` 对非 `v1.0` 抛 `methodology_mismatch` | P5 不改权重、阈值、规则；LPR 5Y 以 `weight:0` 入目录（展示、不评分）；"把 LPR 5Y 纳入评分 / 校正政策利率绝对阈值跨国适用性"= 方法 v1.1，另立规格（§9） |
| C3 开关只在服务端 | `pages.test.ts` 断言只有 `page.tsx` 读 `macroJudgmentsEnabled()`；组件不得含 `MACRO_JUDGMENTS_ENABLED` 字面量 | 时钟组件以 `judgmentsEnabled` prop 挂载，数据来自路由 |
| C4 冻结清单不变 | P3/P4 的 manifest hash、回放 fixture（`strategy/fixtures/replay/*`）不得变 | WP-C 对历史/政策反应的"已可用/完整目录"切换是**纯展示过滤**，`columns` 参数与清单不变 |
| C5 数值十进制 | `value_text` 全链路十进制字符串；只在分类/统计边界转 `Number` | 展示层四舍五入不回写、不重算 |

---

## 3. WP-B · 美林时钟卡片与定量分解

### 3.1 位置与挂载

`MacroWorkbench` 概览 tab，`judgmentsEnabled` 为真时，在 `ChangesCard`/`CatalogCoverage` 网格之下、指标表之上，用新组件 `RegimeClockCard`（`src/components/macro/clock/RegimeClockCard.tsx`）**替换**现有 `MacroJudgmentSlot` 的位置；`MacroJudgmentSlot` 的 F4 读取逻辑（`judgment-view.ts::parseJudgments`）复用为时钟卡的 F4 状态条，`MacroJudgmentSlot.tsx` 保留文件但不再挂载（删除在 WP-B 末任务做，避免与 #125 冲突）。默认**展开**（ChaosAI 的阅读路径起点就是判定头），可折叠，折叠状态存 `localStorage`（仅 UI 偏好）。

### 3.2 数据流

```
page.tsx（服务端读开关）→ MacroWorkbench(judgmentsEnabled)
  → useMacroOverview → env.snapshotId
  → RegimeClockCard(region, snapshotId)
      → GET /api/macro/snapshots/{snapshotId}        （唯一数字来源；含 regime、contributions、observations、rulesVersion、uncoveredWeight）
      → GET /api/judgments?subject_type=macro_region&subject_key={region}   （F4 状态条；失败不影响数字）
      → buildClockView(json, catalog, RULES)          （纯函数，src/lib/macro/clock-view.ts）
```

`buildClockView` 是**纯 TS、可在客户端 import**（与 `catalog.ts`、`regime.ts` 同样只依赖纯模块；`regime.ts` 已 import `catalog`、`decimal`、`judgment-contract`，均无 I/O）。它不重算分数，只做：行拼装、排序、对账校验、状态归类。

### 3.3 `ClockView`（`src/lib/macro/clock-view.ts`，版本 `macro-clock-view/1`）

```ts
export interface ClockRow{
 series_id:string;name:Bilingual;type:SeriesType|null;weight:number;          // weight 来自快照时的 contributions（命中行）或 WEIGHTS_V1（未命中行）
 state:'matched'|'no_rule'|'comparison_missing'|'no_data'|'missing'|'restricted'|'invalid_value';
 latest:{observation_id:string;period_end:string;value_text:string;unit:string}|null;
 prev:{observation_id:string;period_end:string;value_text:string;d1_text:string|null}|null;     // d1 按目录 changeKind 口径（bp/pp/pct/points），与 IndicatorTable 一致
 prev3m:{observation_id:string;period_end:string;value_text:string;d3_text:string|null}|null;
 rule:{id:string;label:Bilingual|null;support:Partial<Record<Regime,number>>}|null;              // label=null ⇔ rules_version 不匹配或 id 不在 RULES
 contribution:Record<Regime,number>|null;
 reason?:Bilingual;                                                                               // missing/restricted 的目录理由
}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}   // drivers = 该象限 contribution>0 的前三，按 contribution desc、weight desc、目录序
export interface ClockView{
 status:'ok'|'no_regime'|'reconcile_failed'|'rules_version_mismatch';
 snapshot:{id:string;as_of:string;created_at:string;methodology_version:string;catalog_version:string;rules_version:string|null};
 regime:RegimeResult|null;quadrants:QuadrantView[];rows:ClockRow[];
 coverage:{matched_weight:number;denominator:number;coverage:number;uncovered_weight:number;by_state:Record<ClockRow['state'],{count:number;weight:number}>};
 reconciliation:{per_quadrant:Record<Regime,{sum:number;score:number;delta:number}>;total:number;norm_check:Record<Regime,{computed:number;stored:number;delta:number}>;ok:boolean;tolerance:1e-6};
 axes:{growth:number|null;inflation:number|null};
}
```

行拼装规则（必须与 `buildRegimeInput` 的选择规则**字面相同**，实现时把该选择逻辑从 `snapshots.ts` 抽成导出的纯函数 `selectComparisons(rows:ObsRefLike[], period:PeriodKind)` 并由两处共用；这是重构不是方法改动，`snapshots.test.ts` 现有用例不变）：
- `latest` = contribution 的 `observation_id` 对应观测（命中行）；未命中但有数据的行 = 该序列在 `observations[]` 中 `period_end` 最大者。
- `prev` = 同序列、`period_end < latest`、在 24 个月窗口内的最大 `period_end`；`prev3m` = `period_end === shiftMonthEnd(latest.period_end, −3)`。
- `d1_text`/`d3_text` 用 `macro-format.ts::typedChange` 口径（展示值），**不是** `regime.ts::comparisons` 的 `Number`（规则输入）；两者差异只在精度与 fx 的百分比变化，表格脚注写明"规则以精确十进制差值判定，显示值四舍五入到 2 位"。
- `state` 归类：目录 `missing` → `missing`；`restricted` → `restricted`；active 且 `observations[]` 无该序列 → `no_data`；有数据、`Number(value_text)` 非有限 → `invalid_value`；有数据且不在 contributions → 若该类型所有规则都需要 `d3`/`d1` 且相应比较期缺 → `comparison_missing`，否则 `no_rule`（判定方法：对该行调用 `matchRule(type, v, d3, d1)` 一次，命中 ⇒ 不应出现，记 `reconcile_failed`；不命中且 `d3===null||d1===null` ⇒ `comparison_missing`，否则 `no_rule`）。
- 对账：`per_quadrant.sum = Σ rows.contribution[q]`，与 `regime.scores[q]` 之差 ≤ 1e-6；`norm_check.computed = score/Σscore`；任一不满足 → `status='reconcile_failed'`（仍渲染全部数字 + 警示条，不隐藏、不改数）。`regime===null` → `status='no_regime'`（coverage 不足或零分），象限区显示"覆盖不足：命中权重 X/Y（需 ≥ 60%）"，分解表照常。

### 3.4 路由改动（最小）

`GET /api/macro/snapshots/[id]` 不改形状；只在开关开时**额外**返回 `rulesVersion`（已有）与 `catalog`：`{version, weights: regionWeights(region)}`，供 `buildClockView` 算分母时用**快照时**的权重而非当前代码的 `WEIGHTS_V1`（两者在 v1.0 内相等，但对账以快照为准）。若 `regimeOf` 返回 null（历史快照无判定行）→ `regime:null, contributions:[]`，时钟显示"该快照无判定记录"。

### 3.5 UI（画布 §7；文案全部在 `messages/{zh,en}/macro.json` 的 `judgment.clock.*`）

```
┌ 美林时钟 · 美国                                    快照 2026-11-07 · 方法 v1.0 · 规则表 1.0 · 目录 30bcaa2a33c5 ▸ ┐
│ 主状态  复苏 Recovery  38.2%    次状态 过热 29.1%    主次差距 9.1 pp    覆盖 60/100（命中 4 项·缺失 1·受限 1·无命中 2） │
│ 规则得分占比，非概率 · 增长轴 +0.32 · 通胀轴 −0.10（规则支持度合成，非实测）                                   │
│ ┌ 复苏 ◆ 主 ─────────┐ ┌ 过热 次 ────────────┐ ┌ 滞胀 ───────────────┐ ┌ 衰退 ───────────────┐          │
│ │ 38.2% · 分 21.0     │ │ 29.1% · 分 16.0     │ │ 17.3% · 分 9.5      │ │ 15.5% · 分 8.5      │          │
│ │ 1 CPI 同比   6.0    │ │ 1 10Y 收益率  7.5   │ │ 1 10Y 收益率  4.5   │ │ 1 PPI 同比   3.5    │          │
│ │ 2 联邦基金   7.5    │ │ 2 联邦基金    5.0   │ │ 2 CPI 同比    1.5   │ │ 2 CPI 同比   1.5    │          │
│ │ 3 失业率     5.0    │ │ 3 失业率      4.0   │ │ 3 联邦基金    2.5   │ │ 3 联邦基金   2.5    │          │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘ └────────────────────┘          │
│ F4：尚无已发布判断（macro_regime@v1 未开放发布）▸ 方法页                                                   │
│ ▸ 定量分解（8 项）                                                                                        │
│   指标 | 当前值 | 单位 | 数据期 | 上期→变化 | 3M 前→变化 | 规则 | 权重 | 支持系数 复/热/滞/衰 | 贡献 复/热/滞/衰 | 证据   │
│   CPI 同比 | 2.9 | % | 2026-09 | 2.6 → +0.3pp (2026-08) | 2.7 → +0.2pp (2026-06) | 2% ≤ 通胀同比 ≤ 3% | 15 | .4/.3/.1/.1 | 6.0/4.5/1.5/1.5 | ▸ │
│   …                                                                                                       │
│   ISM 制造业 PMI | 缺失（FRED 2016 年移除 ISM…） | — | — | — | — | 15 | — | —（不计入分子，计入分母） | — │
│   VIX | 受限（第三方版权…） | … | 5 | … │
│   合计 | | | | | | | 命中 60 / 100 | | 21.0/16.0/9.5/8.5 = 分数 ✓ | 归一化 38.2/29.1/17.3/15.5 ✓ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

（示例数字为画布示意，不是任何真实快照。）

规则：
- 象限卡四张等宽；主状态卡 `--border-active` + `--accent-wash`，次状态卡 `--border-active` 无底色，其余中性；**不用四色**（DESIGN.md 单一铜色）。圆角 6px。
- 卡内"前三驱动"：名称（zh/en 按 locale）+ 该象限贡献分（Geist Mono），点击名称 → 分解表定位该行并高亮。贡献为 0 的项不列；不足三项就少列，不补。
- 分解表默认折叠（"定量分解（N 项）"），展开后按**贡献绝对值最大的象限贡献**降序；未命中行（no_rule / comparison_missing / no_data）接在命中行后，missing / restricted 最后，行色 `text-text-dim`，每行写明状态与理由，且**显式写"计入分母、不计入分子"**。
- 比较列显示"上期值 → 变化（上期数据期）"，上期**不一定是相邻月**，脚注说明"上期 = 24 个月窗口内最近一条更早期"。
- 证据列：当前值可点 → 复用 `SourceDrawer`（`DrawerTarget{seriesId, observationId, …}`），打开的是**冻结的 `observation_id`**，不是最新值。
- 合计行：每象限 Σ 贡献、`= 分数 ✓/✗`、`归一化 ✓/✗`；✗ 时整卡顶部警示条"分解与分数不一致（差 X），请报告"，数字照常显示。
- 页头右侧"方法 v1.0 · 规则表 1.0 · 目录 …"链接到 `?tab=methodology`；方法 tab 新增"v1.0 规则表"小节（从 `RULES` 渲染：类型 / 条件 / 四象限支持系数 / `rule_id`），即 1e 的"方法论页"。
- 禁止出现：概率、置信度（除 F4 `percent` 行的"校准概率"）、"预测"、配置比例、行业超配。`macro-messages.test.ts` 的禁词断言对 `judgment.*` 之外继续生效；新增断言：`judgment.clock.*` 文案中不得出现"概率|置信度|probabilit|confidence"，除 `judgment.clock.f4.calibratedPercent` 一键。
- 窄屏（<640px）：象限卡 2×2；分解表改为"每行一张小卡"（指标名 + 当前值 + 命中规则 + 四个贡献），比较列折进"详情"。

### 3.6 状态矩阵（每个都要能在测试中构造）

| 状态 | 触发 | 时钟卡表现 |
|---|---|---|
| judgments_disabled | `judgmentsEnabled=false` | 不挂载（OverviewOff） |
| loading / snapshot_failed | 快照路由 pending / 非 2xx | 骨架 / "判定数据读取失败 · 重试"（不显示零） |
| no_regime | `regime===null` | 页头"覆盖不足 X/Y（需 ≥ 60%）"，象限区灰、分解表照常 |
| ok | 对账通过 | 全量 |
| reconcile_failed | Σ≠分数 或 norm≠score/Σ 或 未命中行却命中规则 | 全量 + 顶部警示 |
| rules_version_mismatch | `rulesVersion !== RULES_VERSION` | 规则列显示 `rule_id`，表头注"规则表 X ≠ 当前 1.0，中文规则不可用" |
| no_regime_record | 开关开但 `regimeOf` 为 null | "该快照无判定记录" |
| f4_none / f4_earlier / f4_unavailable / f4_card(+percent) | §2.4 | 状态条四态；数字区不受影响 |
| 行级 missing / restricted / no_data / no_rule / comparison_missing / invalid_value | §3.3 | 行状态与理由 |

### 3.7 明确不做

- 资产配置比例、超配/低配行业（ChaosAI 的固定模板）。象限卡底部只放一个链接"剧本（假设框架）→ 传导页"。
- 不在客户端重算 `classifyRegime`；不从 `/api/judgments` 推导任何分数；不显示 ChaosAI 的任何数值。
- 不为显示改动 `regime.ts` 的 RULES/WEIGHTS/阈值。

### 3.8 测试

- `clock-view.test.ts`：手算用例（给定 4 个命中行的 contributions + scores，验证 Σ、norm、drivers 排序、并列规则）；每个 `status` 与每个行 `state` 一个用例；`rulesVersion` 不匹配；`reconcile_failed` 用例（篡改一个贡献）；窗口选择与 `selectComparisons` 共用后 `snapshots.test.ts` 不变。
- `regime.test.ts` 不改（方法未动）；新增一个回归：`RULES` 每条都有非空 zh/en label。
- `macro-messages.test.ts`：新禁词断言；zh/en 对等。
- 路由测试：`snapshots/[id]` 开关开/关的字段存在性；`catalog.weights` 等于 `regionWeights`。
- 真实浏览器验收（桌面 1280 + 窄屏 390）：截图进 PR；用本地 DB 的冻结样本快照（`src/lib/macro/testing/seed.ts` 扩一个"完整状态"样本，**标明用途为测试**）跑 `MACRO_JUDGMENTS_ENABLED=1`。

---

## 4. WP-C · 把已有图表组织得清楚

全部为展示层；不新增迁移，不改任何 manifest/回放 fixture；不依赖 WP-D 的数据（新序列到位后自动进入已有组件）。

### 4.1 概览大图卡（C1）

概览 tab 在时钟卡（或 OverviewOff 的两张事实卡）之下、指标表之上，新增 `KeyIndicatorCards`：每地区固定 4 个序列（US：`US_DFF`、`US_DGS10`、`US_CPI_YOY`、`US_UNRATE`；CN：`CN_PMI_MFG`、`CN_CPI_YOY`、`CN_CGB_10Y`、`CN_M2_YOY`；常量 `KEY_INDICATORS` 放 `view-model.ts`，与 `GLANCE_IDS` 并列），每卡 = 行标题（名称、当前值、类型化变化、数据期，直接取 envelope 行）+ `IndicatorDetail compact`（复用：同一取数 `fetchSeriesWindow`、同一图 `MacroLineChart`、同一表格视图）。默认前 2 张展开、后 2 张折叠（折叠态显示 envelope 的 `sparkline`，不发请求）；展开才发请求。桌面 2 列、窄屏 1 列。"查看全部指标 →" 切到指标 tab。现有"行选中 → 预览"保留。

### 4.2 政策变化优先、FOMC 圆点可选（C2）

- `MacroLineChart` 增 `layers?:{derived?:boolean;calendar?:boolean}`（默认 `{derived:true, calendar:false}`）；`detail-model.ts::markersOf` 增同形参数过滤。`IndicatorDetail` 图上方加两个开关 pill"政策变化 ▲""FOMC 会议 ●"（`aria-pressed`），状态存组件内。
- 图下新增"事件（最近 N 条）"紧凑列表：派生政策事件按时间倒序（日期 · 上限 from→to · bp），默认 6 条，"全部"展开现有事件表。FOMC 日历条目只在圆点层开时列出。
- 事件标记文字：派生事件 `text` 由 `"${change_bp} bp"` 改为仅在 `|change_bp| ≥ 25` 时带文字，其余只画箭头（lightweight-charts marker text 是密集的主因）。

### 4.3 可比较的周期内资产变化（C3）

`IndicatorDetail` "周期内资产区间变化"表上方加条形小图（内联 SVG，`chart-geometry.ts` 新增 `barGeometry`——把 `strategy-view-model.ts` 里的同名函数**移到** `charts/chart-geometry.ts` 并由策略组件改 import；逻辑不变，测试搬家）：按周期分组，每组内一行一个资产，**bp 与 % 分两个面板、各自标尺**，标尺上限 = 该面板内最大 |值|；负值向左。保留表格（`DataTableToggle`），端点、单位、证据下钻不变。颜色：资产涨跌用 `--up/--down`（已有约定），宏观指标不着色。

### 4.4 默认关联结果卡（C4）

- 新路由 `GET /api/macro/analyses/presets?region=US|CN`（`src/app/api/macro/analyses/presets/route.ts`）：对 `PRESETS` 中该地区的预设，用与 `POST /api/macro/analyses` **相同**的 `freezeInputs` + `runAnalysis` + `explainResult` 计算，**不写** `macro_analysis_runs`、不计配额、不需要 `request_id`；返回 `{snapshotId, computed_at, cards:[{preset_id, spec, inputs_hash, results|null, error|null, method_version, code_version}]}`。进程内 LRU memo（键 = `region + 当前 active snapshot_id + CATALOG_VERSION + CORRELATION_VERSION + code_version`，32 项，单飞），响应头 `X-Macro-Presets-Memo: hit|miss`。只跑有数据的预设：`insufficient_sample` 等 `AnalysisError` 照常以 `error` 返回并在卡上显示原因（不隐藏）。
- `CorrelationWorkbench` 顶部新增"默认结果"区：每预设一张 `CorrelationResult`（复用，加 `preset` 模式：隐藏 run_id，显示"预设 · 未保存"，按钮"保存为我的分析"= 用该预设 spec 走现有 POST，计配额）。表单与"热门分析"按钮不变。
- 性能：首次 miss 跑 ≤ 6 个预设（US）；PR 必须记录本地与生产 `miss`/`hit` 耗时（§8 验收"性能"）。若 miss > 3 s，默认结果区改为"按预设逐张加载"（并发 2），不阻塞表单。
- 预设有效性：`workbench-options.test.ts` 已断言每预设是合法请求；新增"预设在当前目录下指标与资产均 active"断言（CN 两组用 `CN_CGB10Y`，有数据）。

### 4.5 传导节点短标签（C5）

- `NodeCard` 默认只显示：状态徽章、短标签、值 + 单位、数据期；`formula`、`reason`、输入/指标链接折进"详情"（`<details>`，窄屏默认收起，桌面也收起）。
- 修掉"机制假设：机制假设：…"：`flow.edge` 文案改为 `{text}`（数据里已含前缀），并在 `strategy-messages.test.ts` 加断言"边文案不以'机制假设'开头两次"。边文案改为一条折叠列表"机制假设（5 条）"放在流程下方，流程内只画箭头。
- 剧本卡：`PLAYBOOK_DISCLAIMER_V1` 只在 `PlaybookGrid` 面板底部出现一次，卡内"（假设）"后缀保留在标签而非每一项。

### 4.6 "已可用 / 完整目录"切换（C6）

`CycleReturnsTable` 与 `PolicyResponseMatrix` 的列：默认 **"已可用"**（隐藏整列为 `restricted` / `not_in_catalog` 的列），右上角切换"完整目录（+N 列受限/未纳入）"；隐藏列的计数与理由在切换旁的 tooltip/列表里。**纯展示过滤**：`view.columns`/`dims`、manifest、`cycleScale` 的分母（只用 ok 单元格，不受影响）都不变；偏好存 `localStorage`。切换旁一行"补齐计划 → 方法与来源 §数据缺口"，链接到方法 tab 新增的"数据缺口与来源计划"小节（内容 = §5.5 表，由 i18n 文案渲染，不是硬编码英文）。

### 4.7 测试与验收

- `detail-model.test.ts`：`markersOf` 过滤；`chart-geometry.test.ts`：`barGeometry` 搬家后同用例；`strategy-view-model.test.ts`：列过滤函数 `visibleColumns(view, mode)` 不改变 `cycleScale`。
- 预设路由测试：与 POST 路由同输入同结果（同一 `runAnalysis`）、不写库、memo 命中头、错误预设以 `error` 返回。
- 浏览器：概览首屏截图（桌面/窄屏）、DFF 详情两种标记层截图、关联 tab 首进截图、历史页两种切换截图。

---

## 5. WP-D · 数据缺口

### 5.1 每条序列必须落到现有体系的字段

| 字段 | 落点 |
|---|---|
| 稳定 ID、经济定义、单位、原生频率、数据期、调整、修订政策、发布滞后、权重、changeKind | `catalog.ts` 的 `MacroSeriesDef` 行（代码即配置；`macro_series` 表由发布时 `upsertCatalog` 镜像） |
| 来源与取数主机、原发布机构、via、权利、署名 | `SeriesSource{adapter, fetchHost, publisher, via, seriesKey, rights, attribution}` |
| 原始响应证据 | `macro_evidence_objects`（SHA-256 路径，桶 `macro-raw`）+ `macro_retrievals` |
| 解析器版本与定位 | `parsers/*`（`FRED_PARSER_VERSION` 等）+ `Locator{csv_row\|json_pointer\|html_cell}`（迁移 CHECK 只认这三种） |
| 派生关系 | `derive:{kind, from}` + `derive.ts`（`month_end`、`yoy_from_index`、`index_minus_100`；`transform='<kind>@1'`） |
| 可得时间 | `available_at`（首次取得，`availability_basis='first_seen'`；不声称历史时点） |
| 质量/隔离 | `macro_write_observations` 的版本/隔离规则（不变） |
| 更新任务 | FRED → `GET /api/cron/macro-sync`（Vercel cron）；中国 → `scripts/macro/collect.py`（owner 的 Mac，launchd）+ `cn-series.json`（由 `export-cn-series.ts` 从目录导出） |
| 新鲜度 | `freshness.ts::releaseTimeliness`（按 `nativeFrequency` + `releaseLagDays`） |
| 回放 fixture | `fixtures/fred/manifest.json`（`record-fred-fixtures.ts`）、`fixtures/cn/{manifest,claims,verification}.json`（`collect.py --record-fixtures`） |

每新增一条序列的 PR 必须附：runbook `macro-sync.md` §10 风格的"核实记录"（实际 URL、主机、HTTP 状态、响应片段的定位、解析器版本、首次取得时间、已知限制）。

### 5.2 美国流动性三序列（FRED，最低风险，先做）

| 新 ID | FRED | 定义 | 单位 | 原生频率 / period | 发布 | 权利 | 派生 |
|---|---|---|---|---|---|---|---|
| `US_WALCL_W` | WALCL | 联储总资产（H.4.1，周三水平） | `usd_mn` | **weekly** / day（period_end = 周三日期） | 周四 16:30 ET | Board of Governors；FRED 页面标注待核实（预期 public domain） | — |
| `US_WALCL` | — | 同上，月末 | `usd_mn` | monthly / month | — | 同上 | `month_end` from `US_WALCL_W` |
| `US_RRPONTSYD_D` | RRPONTSYD | 隔夜逆回购成交量（纽约联储） | `usd_bn` | daily / day | 当日 | FRBNY；待核实 | — |
| `US_RRPONTSYD` | — | 月末 | `usd_bn` | monthly / month | — | 同上 | `month_end` |
| `US_WTREGEN_W` | WTREGEN | 财政部一般账户（周**平均**余额） | `usd_bn` | weekly / day | 周四 | Board；待核实 | — |
| `US_WTREGEN` | — | 月末所在周的周平均（**不是**月末时点） | `usd_bn` | monthly / month | — | 同上 | `month_end`（定义写进名称与 drawer） |

- `role:'indicator'`，`type:null`，`weight:0`，`revisionPolicy:'revisable'`（H.4.1 偶有修订）。**不进入 WEIGHTS_V1**，不改方法；但进入 `CATALOG_VERSION` → 触发 §2.5 C1。
- **D0 · 非评分指标进入概览与快照（WP-D 的前置改动，所有新指标都依赖）**：现状 `snapshots.ts::catalogItemsOf(region)` = `Object.keys(WEIGHTS_V1)` 按地区过滤，`buildRegimeInput` 只冻结 `regimeInputsOf`（active、weight>0）；所以 weight 0 的指标（本节三条、`CN_LPR_5Y`）既不在概览指标表、也不在快照 `observation_ids`/`history_ids`/`catalog_counts` 里，只能从详情页与传导页读到。改为：`catalogItemsOf = indicatorsOf(region)`（目录 role=indicator 全部行，含 weight 0、missing、restricted）；`buildRegimeInput` 冻结 `displayInputsOf(region)` = `indicatorsOf` 中 active 且月/季频的行（weight ≥ 0）。`classifyRegime` 只遍历 `regionWeights`（`WEIGHTS_V1`），对多出来的序列**视而不见**，分数、覆盖率、贡献不变（`regime.test.ts` 不改）；F4 `gather` 冻结的观测数与 `observation_ids` 等长，仍成立。影响：`catalog_counts.verified` 分母变大（概览"已核实 X / 目录 Y"的 Y 从 8/11 变为含新行），`catalog.test.ts:90-93` 的 `indicatorsOf` 精确列表、`snapshots.test.ts` 的 manifest 期望要更新；`macro-regime.v2` 的 fixture 快照按新清单录。
- 单位白名单：`quality.ts::KNOWN_UNITS` 与 `macro-format.ts::KNOWN_UNITS` 各加 `usd_mn`、`usd_bn`（§5.4 社融余额再加 `cny_tn`），`BY_UNIT` 质量区间：`usd_mn {min:0,max:20_000_000,maxRelJump:0.5}`、`usd_bn {min:0,max:10_000,maxRelJump:null}`（RRP 可在数日内从 2000 降到 0 附近）、`cny_tn {min:0,max:1000,maxRelJump:0.2}`；否则每个点都会被 `rule_failed:macro.unit` 隔离。
- FRED 回填规则：`FRED_BACKFILL_DONE_BY='2000-04-15'`，WALCL（2002 起）、RRPONTSYD（2003 起）永远不满足"已回填"，每天全量取（与 `US_FED_TARGET_UPPER_D` 相同行为，CSV 各约 1–6k 行，可接受，runbook §14 记一笔）。
- 测试影响：`catalog.test.ts:97` 的 `collectableOf('fred_csv')` 精确列表、`fred-csv.test.ts:75-78` 的 manifest 对等、`replay.test.ts:116` 的 `expectedDerived` 加 `US_WALCL`。
- 需要 `NativeFrequency` 增 `'weekly'`（`types.ts` 联合类型 + 迁移 `macro_series.native_frequency` CHECK 加 `'weekly'` + `freshness.ts::releaseTimeliness` 的 weekly 分支 + `fredCosdFor` 把 weekly 视同 daily 窗口 400 天）。迁移文件：`supabase/migrations/20261121090000_macro_weekly_frequency.sql`（`20261121*`，排在 foreign research `20261119*` 之后；进入 `migrations.lock.json` 时保持时间序）。
- 单位新增 `usd_mn`、`usd_bn`（`messages/*/macro.json units.*`）；单位换算**不做**（RRP 十亿、WALCL 百万分别显示）。
- 传导页：`transmission-v1.ts` US 流动性段的 `not_in_catalog` 节点替换为三个 `observed` 节点（`US_WALCL`、`US_RRPONTSYD`、`US_WTREGEN`）——这改变 `TRANSMISSION_V1` 配置 → `macro-transmission/2`（配置版本号 bump，`transmission.manifest.json` 回放 fixture 不变因其冻结的是 v1 参数；新版本新增 fixture）。`response-dims-v1.ts` 不动（QE/QT 行维度另议，§9）。
- fixture：`record-fred-fixtures.ts` 录三条；`fred-csv.test.ts` 加周频 CSV 用例（含 FRED 的 `.` 缺失值行）。

### 5.3 中国政策利率：LPR 1Y / 5Y（中风险：来源核实先行）

- 来源：全国银行间同业拆借中心（CFETS）`www.chinamoney.org.cn`（目录现有 `CN_LPR_1Y` 的 `reason` 已指明此机构）。**任务 D3a 先做来源核实**：用 `curl` 实测 chinamoney LPR 历史数据端点（页面 `https://www.chinamoney.org.cn/chinese/bklpr/` 背后的 JSON/Excel 接口），记录：实际 URL、响应 Content-Type、字段（报价日、1Y、5Y+）、历史起点（LPR 新机制 2019-08-20 起）、是否需要 Referer/Cookie、robots 与使用条款；写入 runbook §10。核实失败（只有 JS 渲染或需登录）→ 该序列留 `missing`，理由更新为核实结果，WP-D 其余照做。
- 采集：`collect.py` 当前只支持三个 AKShare 函数（`cn-series.ts::CnFunction`：`macro_china_nbs_nation`、`bond_china_yield`、`currency_boc_safe`；`test_collect.py:99-104` 与 `catalog.test.ts:9,21-27` 把函数与主机限定为这三组）。LPR 需要**直连官方 HTTP**：新增适配器 `adapter:'official_http'`（`types.ts::Adapter` + 迁移 `macro_series.adapter` CHECK，放进 §5.2 的 `20261121090000` 迁移），`seriesKey` 形如 `http_json|<path>|<field>` / `http_html|<path>|<table hint>`；`cn-series.ts` 的 `cnSpecOf` 增这两种 function（`cn-series/2`），`collect.py::calls_for/collect_series` 增 `requests.get` 分支并经 `recorder.recording()` 录制（host = `www.chinamoney.org.cn`）；`ingest/route.ts` 的 `evidence_not_allowed` 校验（host、path、200）照旧；`parsers/index.ts::parserFor` 按 function 分派到新 parser。Python 侧 claims 仍只作交叉校验。
- 解析：按核实结果选 `json_pointer`（JSON 接口）或 `html_cell`（HTML 表）；新 parser `parsers/chinamoney.ts`，版本 `macro-chinamoney/1`。
- 目录：`CN_LPR_1Y` 改 `active`（weight 10 不变，type policy_rate，nativeFrequency **monthly**：LPR 每月 20 日报价，period_end = 报价当月月末；`releaseLagDays` 不适用——报价日固定，`timeliness` 按 monthly）；新增 `CN_LPR_5Y`（`weight:0`，type policy_rate，同来源，名称"5 年期以上贷款市场报价利率"）。**LPR 5Y 不评分**（§2.5 C2）。
- 月内两次报价（历史上无）→ 取该月最后一次；`collect.py` claims 以报价日为 `period_label`。
- 事件：`events.ts` 的 US 事件源是目标区间日频；CN LPR 是月频报价，LPR 变动事件 = 相邻月报价差 ≠ 0，由 `series-extras.ts` 读时派生（新 `kind:'policy_rate_change'`，`region:'CN'`，`source:'derived'`，`macro-events/2`——版本号 bump 因为事件形状新增一种；US 事件不变）。这让 `IndicatorDetail` 的 CN 政策利率卡自动有箭头，`cycles.ts::policyCycles` 对 CN 可用。

### 5.4 社融存量同比（中风险）

- 来源：中国人民银行 调查统计司"社会融资规模存量统计表"（月度，`www.pbc.gov.cn/diaochatongjisi/...` 的 HTML 表或 PDF；交接文件给的实例是 PDF）。**任务 D4a 先核实**是否每月有 HTML 表版本（目录 `116219/116319`）及其表结构（存量余额、同比增速列），PDF 不解析（无 PDF 解析器，且不新建）。只有 HTML 表可用时才做；否则留 `missing`，理由更新。
- 采集：同 §5.3 的 `http` 调用种类（host `www.pbc.gov.cn`；每月一页，`--mode backfill` 遍历列表页）。解析：`html_cell`（`parsers/html-table.ts` 复用）+ `parsers/pboc-afre.ts`（`macro-pboc-afre/1`）。
- 目录：`CN_AFRE_STOCK_YOY` 改 `active`（weight 20 不变，`revisionPolicy:'revisable'`——PBOC 口径修订（2015、2018、2019 三次扩口径）以新版本记录，不回填改旧值；`releaseLagDays:15`）。**不用增量替代**；表中若只给余额不给同比，派生 `yoy_from_index`（from 余额序列 `CN_AFRE_STOCK`，单位 `cny_tn`），并在 drawer 写明"同比由存量余额派生"。

### 5.5 MLF 1Y 事件序列（高风险，排最后，可独立延期）

- 来源：人民银行"公开市场业务交易公告"中的 MLF 操作公告（`www.pbc.gov.cn/zhengcehuobisi/.../index.html` 列表 + 每条公告页）。**任务 D5a 核实**：列表页结构、公告正文格式（"中标利率 X%"）、2016 年至今覆盖、每月操作次数。
- 频率 `event`（`NativeFrequency` 已有 `'event'`，`period:'day'`；`catalog.test.ts:55` 要求 active 的 event 原生序列 weight 0，`regimeInputsOf` 排除 event 频——所以评分用的是下面的月频派生行，不是事件行），每条公告一个观测（period_end = 操作日）。解析：公告正文不是表格 → 需要新定位器 `html_text{xpath|regex_index}`；迁移 CHECK 要加 `'html_text'`。这是**唯一**需要改观测约束的项，放在 `20261121091000_macro_locator_html_text.sql`。
- 月末延续：新派生种类 `effective_interval`（`derive.ts`，`transform='effective_interval@1'`）：每个已完成月的值 = 该月末之前最后一次事件的值，`derived_from = [那条事件观测, 完成见证]`；**不是插值**（文档必须这样写）；`CN_MLF_1Y`（monthly，weight 10）`derive:{kind:'effective_interval', from:'CN_MLF_1Y_E'}`，`CN_MLF_1Y_E` 为事件原生序列（`role:'event_source'`，weight 0）。`DeriveRule` 联合类型加一种 → types 变更，`derive.test.ts` 加用例（月内无事件沿用、月内多次取最后、首个事件前的月不产值）。
- 事件：`CN_MLF_1Y_E` 的相邻事件差 ≠ 0 → `policy_rate_change`（与 §5.3 同一派生）。

### 5.6 资产覆盖：有来源的计划（本规格只做"计划 + 目录状态"，接入按 owner 的权利确认分批）

| 资产 | 候选一手来源 | 权利 | 单位/口径 | 本规格动作 |
|---|---|---|---|---|
| 美股三指数（SP500 / NASDAQCOM / DJIA） | FRED（S&P DJI、Nasdaq 版权） | third_party，owner 未确认 | 价格指数、交易日 | 保持 `restricted`；runbook §9 流程由 owner 决定 |
| 沪深 300 | 中证指数公司 `www.csindex.com.cn` | third_party | 价格指数 | 同上 |
| 港股（恒指、恒生科技） | 恒生指数公司 / HKEX | third_party | 价格指数；恒生科技 2020-07 前无（ChaosAI 用回溯模拟，我方**不做**） | 新增 `HK_HSI`、`HK_HSTECH` 目录行，`status:'restricted'`，`reason` 写明 |
| 黄金 | LBMA（版权）；World Bank Pink Sheet（CC BY 4.0，**月平均**，`USD/troy oz`） | Pink Sheet 可用 | 月平均 ≠ 月末，名称必须写"月平均" | 新增 `WB_GOLD_MAVG`、`WB_COPPER_MAVG`（`adapter:'worldbank_csv'`——核实 Pink Sheet 是否提供 CSV；只有 XLSX 则本期不做，留 `missing`） |
| 铜 | LME（版权）；Pink Sheet 铜月平均 | 同上 | 同上 | 同上 |
| 债券总回报 | 无公开一手总回报指数（Bloomberg/ICE 版权） | — | 收益率 bp ≠ 持有回报 | **不做**；`CycleReturnsTable` 债券列继续标 bp，并在列头 tooltip 写"收益率变动，非持有回报" |
| 北向资金 | 港交所每日披露（口径 2024-08 起改为季度/半年度） | 待核实披露连续性 | — | 留 `not_in_catalog`，理由更新为披露口径变更 |
| 权益（内部） | DataGateway（Wind 适配层，`POST /v1/market-data/security-prices/history/query`，证券日线契约） | owner 的 Wind 授权，是否允许在产品内展示指数由 owner 决定 | 日线 | 列为**owner 事项 D-O1**：若允许，用 `adapter:'datagateway'` 新建 provider，证据为网关响应；本规格不实现 |

### 5.7 WP-D 的 F4 方法 v2（§2.5 C1 的落实）

- 新文件 `src/lib/judgments/methodologies/macro-regime.v2.ts`：与 v1 相同的 `gather/resolveTarget/compute/condition`（直接 import v1 的实现函数，只换 `params.catalog_version` 为新 `CATALOG_VERSION`、`version:'v2'`、`doc:'docs/methodologies/macro_regime/v2.md'`），注册表加入；`docs/methodologies/macro_regime/v2.md` 写明"公式与 v1 相同，目录版本变更；校准样本重新计数"。
- **v1 的 formula_hash 漂移**：`formulaHashOf` 哈希方法模块的整个 import 闭包，`catalog.ts` 经 `regime.ts` 在 v1 闭包内，所以目录一改，v1 的 `formula_hash` 就变；`methodology-sync.ts:124` 对仍在 `REGISTRY` 的 v1 判为 `drift` → 整个同步计划拒绝（exit 2，什么都不写）。因此目录 PR 必须把 `REGISTRY` 改为 `[macroRegimeV2]`（v1 从注册表移除，其已存行不受同步影响、不再产出）。v1 行的 `status` 改为 `retired` 需要同步脚本支持"对不在 REGISTRY 的已存行改状态"——计划任务先核实 `methodology-sync.ts` 是否支持；不支持则 v1 保持 `active` 但无模块可产出，记为 owner 事项 D-O2（F4 侧补一个 retire 路径）。`macro-regime.v1.test.ts:47,52,65,74` 与 `fixtures/judgments/{macro/us-2026-09-11.json, replay/macro-regime.json}` 里的 `30bcaa2a33c5` 字面量随 v2 fixture 一起更新（v1 测试改为固定快照的历史回归，不再与运行时 `CATALOG_VERSION` 比较）。
- `src/lib/judgments/*` 与 F4 会话无冲突：F4 已合并且暂停；#125 改的是 `deps.ts`/`inputs-db.ts`，不是 methodologies / registry。
- 生产步骤（prod-rollout 会话）：合并 WP-D 后先部署，再 `sync-methodologies.ts`（注册 v2，publishable 保持 false），再 cron/collector 首次发布新目录版本的快照。顺序写进 runbook §13 新小节。
- **每个 WP-D 子 PR 都会改目录版本**：为避免 v2/v3/v4 连环，WP-D 的目录改动合并为**一个** PR（D-catalog：全部目录行 + weekly 频率 + v2 方法），采集/解析/派生按序列分 PR 但不改目录（目录行先以 `status:'missing'` + 完整 source 定义落地，接入 PR 只翻 `status`——翻 status 也改版本！）。因此改为：目录 PR 把能核实的序列直接置 `active`（核实任务在目录 PR 之前完成），不能核实的保持 `missing`；之后每翻一条 status 仍要 v(n+1)。接受这个代价，但在计划里把 LPR/社融/MLF 的核实放在目录 PR 之前，尽量一次翻完。

### 5.8 测试

- 每个 parser：fixture 字节 → 期望观测（含定位），`-00` 命名沿用 `fixtures/cn/`。
- `derive.test.ts`：weekly 的 `month_end`（最后一个周三）、`effective_interval` 三用例。
- `catalog.test.ts`：新行通过现有不变式（derived 行带输入 source、missing 行 source null、weight 与 `WEIGHTS_V1` 一致——新行 weight 0 不在 WEIGHTS_V1，断言需允许"不在表中的行 weight 必须为 0"）。
- F4：`macro-regime.v2` 的 `compute` 对新目录版本快照不弃权、对旧版本弃权；`methodology-sync` 的注册计划用例。
- 回放：`replay.test.ts` 用新 fixture 复算一条 WALCL 月末值。

---

## 6. API 与文件清单

| 工作包 | 新增/修改文件 |
|---|---|
| WP-B | `src/lib/macro/clock-view.ts`（+test）；`snapshots.ts` 抽 `selectComparisons`；`src/app/api/macro/snapshots/[id]/route.ts`（+`catalog`）；`src/components/macro/clock/{RegimeClockCard,QuadrantGrid,DecompositionTable,F4Strip}.tsx`；`MacroWorkbench.tsx`（替换槽位、方法 tab 规则表）；`messages/{zh,en}/macro.json`（`judgment.clock.*`、`judgment.rules.*`）；`macro-messages.test.ts`；`testing/seed.ts` |
| WP-C | `view-model.ts`（`KEY_INDICATORS`）；`components/macro/KeyIndicatorCards.tsx`；`MacroLineChart.tsx`、`detail-model.ts`、`IndicatorDetail.tsx`（层开关、事件列表、资产条形）；`charts/chart-geometry.ts`（`barGeometry` 搬入）；`src/app/api/macro/analyses/presets/route.ts`（+test）；`CorrelationWorkbench.tsx`、`CorrelationResult.tsx`；`strategy/{TransmissionFlow,PlaybookGrid,CycleReturnsTable,PolicyResponseMatrix}.tsx`、`strategy-view-model.ts`（`visibleColumns`）；`messages/*/macroStrategy.json`、`macro.json` |
| WP-D | `catalog.ts`、`types.ts`（weekly、DeriveRule、Locator）、`freshness.ts`、`derive.ts`、`providers/fred.ts`、`parsers/{chinamoney,pboc-afre,pboc-mlf}.ts`、`events.ts`/`series-extras.ts`（CN 事件）、`strategy/data/transmission-v1.ts`→v2、`scripts/macro/{collect.py,cn-series.json,export-cn-series.ts}`、迁移 `20261121090000`、`20261121091000`、`src/lib/judgments/methodologies/macro-regime.v2.ts`、`docs/methodologies/macro_regime/v2.md`、runbook §10/§13、fixtures |

---

## 7. Claude Design 画布

owner 规则：每个页面 UI 先上画布。本规格在既有画布 `https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH`（宏观工作台 GUI）新增一行"P5 · 美林时钟与图表组织"，画板：
1. `Clock.dc.html` —— 时钟卡 ok 态（页头、四象限、前三驱动、F4 状态条、分解表展开、合计对账行）
2. `ClockStates.dc.html` —— no_regime / reconcile_failed / rules_version_mismatch / f4 四态 / 行级六态
3. `OverviewP5.dc.html` —— 概览：时钟卡 + 大图卡（2 展开 2 折叠）+ 指标表
4. `DetailP5.dc.html` —— 指标详情：标记层开关、事件列表、资产条形（bp / % 两面板）
5. `CorrelationP5.dc.html` —— 关联 tab 首进：默认结果卡 ×3 + 表单
6. `StrategyP5.dc.html` —— 传导短标签节点 + 历史表"已可用/完整目录"切换
7. `ClockMobile.dc.html` —— 390 宽：象限 2×2 + 行卡分解

画板链接在 §7 末尾回填（§7.1）。数值为示意；颜色/字体只用 `globals.css` 令牌（画布既有 `s-tokens` 便签）。

### 7.1 画布回填

（待画布完成后填写画板名与说明。）

---

## 8. 验收（ChatGPT 交接验收表的逐项回答方式）

| 验收面 | 必须成立 | 证明方式（PR 里附） |
|---|---|---|
| 贡献算术 | 分项贡献、象限总分、归一化逐步对上（容差 1e-6） | `clock-view.test.ts` 手算用例 + 页面合计行截图 |
| 快照一致 | 卡、前三驱动、分解、证据同一 `snapshot_id`/方法/目录版本 | 单一数据源（快照路由）；F4 卡不同快照 → 显式"较早快照"状态的测试 |
| 规则类型 | FX 不命中利率阈值、GDP 不命中 PMI 阈值 | 现有 `regime.test.ts`（不改）+ 规则表页按类型分组 |
| 缺失语义 | missing / restricted / no_data / no_rule / comparison_missing / disabled / unavailable 各异 | 状态矩阵用例 + ClockStates 画板 + 截图 |
| 覆盖率 | 分母含应计权重；<60% 不硬判 | `no_regime` 用例；页头"X/Y" |
| 概率语义 | 未校准占比不叫概率 | 禁词测试；只有 F4 `percent` 行用"校准概率" |
| 数据对齐 | 不静默覆盖重复日期；月/季不混 | WP-D parser 测试（重复报价日取最后并记录）；`derive` 不前填季度 |
| 历史可知 | cutoff 后的批次不进过去 | 不新增；沿用 #120/#125 的 `classifyAsOf` 回归 |
| 证据链 | 点击贡献 → 冻结 observation_id 的 drawer | 组件用 `observation_id` 打开 drawer 的测试（view-model 层）+ 浏览器点击录屏/截图 |
| UI 可读性 | 首屏可读主状态与依据；分解可完整展开 | 1280 / 390 截图 |
| 图表可用 | 事件不淹没曲线、色带可辨、表格可用 | DFF 详情两种层截图 |
| 可用数据 | 已接入资产可比较；受限资产明确但不主导 | 历史页两种切换截图 |
| 性能 | 时钟卡 = 1 次快照读 + 1 次 F4 读；预设路由 miss/hit 耗时 | 响应头与本地/生产计时表 |

---

## 9. 不在本规格内（另立规格或 owner 事项）

- 方法 v1.1：LPR 5Y 入权重、政策利率绝对阈值的跨国适用性、VIX 受限期的 risk_index 权重处置。
- QE/QT 政策事件定义（WALCL 变动 ≠ 政策定义）与 `response-dims` 的资产负债表维度。
- F4 `macro_regime` 的 publishable 决定与校准路径（owner）。
- D-O1：DataGateway/Wind 指数数据能否在产品内展示（owner 权利确认）。
- 月度复盘的历史回填（时间积累，不能伪造当时可知）。
- 北向资金统计口径。

---

## 10. 分期与 PR

| PR | 内容 | 依赖 |
|---|---|---|
| P5-B | WP-B 全部（§3） | 无（#125 合并与否都可） |
| P5-C1 | §4.1、§4.2、§4.3、§4.5、§4.6（无新数据） | 无；可与 P5-B 并行（文件不重叠：B 改 `MacroWorkbench` 槽位行，C1 改同文件的概览区——合并时二选一先合，后者 rebase） |
| P5-C2 | §4.4 预设路由与默认结果卡 | 无 |
| P5-D1 | §5.2 美国流动性 + weekly + 迁移 + §5.7 v2 方法 + 目录 PR 合并（含 LPR/社融核实结果决定的 status） | 核实任务 D3a/D4a 先完成 |
| P5-D2 | §5.3 LPR 采集/解析/事件 | D1 |
| P5-D3 | §5.4 社融 | D1 |
| P5-D4 | §5.5 MLF（可延期） | D1 |
| P5-D5 | §5.6 资产目录行（restricted/计划）+ Pink Sheet（若有 CSV） | D1 |
