# 宏观工作台 P5 · ChaosAI 精华吸收（美林时钟卡片 · 图表组织 · 数据缺口）设计规格

日期：2026-11-07（第 1 稿）；第 2 稿（处置第一轮 mmx 48 项 / Codex 27 项，§0.1）；**第 3 稿**（处置第二轮 mmx 45 项 / Codex 16 项，§0.2）
状态：第 3 稿，待第三轮审计（审计记录 `docs/audits/2026-11-07-macro-p5/`）
前置：`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（P1+P2，第 6 稿；**本规格 §2.4 对其 §3.2 作一条修订**）、`docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md`（P3+P4，第 3 稿）、F4 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md`
研究输入：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`、`docs/research/chaosai-macro-2026-11-07/handoff-chatgpt-2026-11-07.md`
总纲（硬约束）：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 —— 只用一手来源、每个数字可复算、事实与判断分离、缺失保持缺失（不插值不补零）、zh/en、`DESIGN.md` 令牌、每个页面 UI 先上 Claude Design 画布再写代码。
基线提交：`origin/main` `1e9cfb87`（PR #121 合并后）。生产：`osbornalpha.com/intel/macro`，`MACRO_STRATEGY_ENABLED=1`，`MACRO_JUDGMENTS_ENABLED` 未设。

---

## 0. 一页结论

1. **不写第二套评分引擎，客户端不评估任何规则。** 权重、类型化规则、逐项贡献、归一化、主次状态、覆盖率已在 `src/lib/macro/regime.ts`（`classifyRegime`），每次快照发布时冻结进 `macro_regime_results`。P5 只在**服务端**把冻结结果投影成"判定 → 四象限 → 前三驱动 → 可展开分解 → 证据"，并在服务端对账（八条不变式）；对账失败 → **不出数字**。
2. **展示门槛 = 既有发布条件。** 四象限与分解只在服务端开关 `MACRO_JUDGMENTS_ENABLED=1` **且** F4 对当前活动快照存在一张可发布、生命周期合格的 `macro_regime` 判断卡时出现（P1 §3.2、runbook §12、F4 §4.1）。规则得分占比作为该卡的"依据"显示，并以 §2.4 的一条修订写入 P1 §3.2；F4 categorical 卡的 `display.percent` 保持 null。
3. **差距分三类：展示（WP-B、WP-C）、数据（WP-D）、方法（§9，不在本规格内）。**
4. **ChaosAI 只借信息架构，不借数据与规则。**
5. **跨模块硬约束（§2.5）**：目录每变一次版本 → F4 新方法版本 + 生产切换（`compensate.ts`、`playbooks.ts`、`deviations.ts` 的版本常量一并切换）；WP-B / WP-C 不碰 v1 `deps` 与闭包文件；权重/阈值/规则改动不在 P5 内；开关只在服务端。

### 0.1 第 2 稿处置（第一轮 Codex C1–C27、mmx M1–M48）

| 来源 | 处置 | 落点 |
|---|---|---|
| C1 / M1 | 接受：时钟 = F4 卡 + 依据；无可发布同快照卡 → 无数字 | §2.4 |
| C2 / M2 / M9 / M30 | 接受：投影全在服务端；客户端只排版 | §3.2、§3.3 |
| C3 / M3 / M31 / M32 | 接受为 P5-B 的版本门槛；每结果方法清单冻结在 D1 落地（§0.2 R-M3） | §3.3、§5.2 |
| C4 | 接受：删除未命中原因猜测 | §3.3 |
| C5 / M24 | 接受 | §2.1、§3.5 |
| C6 / M4 / M10 | 接受：`regime_status` 四态 | §3.3 |
| C7 / M8 / M40 | 接受：不变式扩展，破坏用例逐条 | §3.4 |
| C8 / M7 | 接受：真实卡片契约、排序键 | §2.3、§3.3 |
| C9 | 接受：删除概率路径 | §2.4 |
| C10 / M25 | 接受：禁词扩展、豁免一键、方法页门控 | §3.5 |
| C11–C13 / M11 / M12 | 接受：C6 红线；v2 工厂；v1 作废行为 | §2.5、§5.7 |
| C14–C16 / M20 / M21 / M35 | 接受：预设路由回执、修订 P1 §3.4 | §4.4 |
| C17 | 接受：asOf 同 vintage | §4.1 |
| C18 / M48、C19 / M18、C20 / M22、C21、C22 / M17、C23 / M14 / M15、C24 / M37、C25 / M38、C26 / M13、C27 / M28 / M41 / M42、M5 / M39、M6、M16、M19、M23、M27、M29、M33、M34、M36、M43–M47、M26 | 接受，见第 2 稿对应小节（本稿保留） | §4–§8 |

### 0.2 第 3 稿处置（第二轮 Codex R-C1–R-C16、mmx R-M1–R-M45）

| 来源 | 处置 | 落点 |
|---|---|---|
| R-C1（P1 百分比政策冲突） | 接受：§2.4 明文修订 P1 §3.2；categorical `percent` 保持 null；占比只在门槛后作为依据显示 | §2.4 |
| R-C2 / R-M27（对账失败仍出数字） | 接受：不变式 1–6、8 失败 → `reconcile_failed` 无数字；差值进服务端日志与响应 `diagnostics`（无数值字段），不进 UI 数字 | §3.4 |
| R-C3 / R-M2（规则解释未校验；服务端 import regime.ts） | 接受：新增不变式 8（`rule_id` 属于该行类型且存储 `support` === 规则表 `support`，缺省 0）；明确 `clock-view.ts` 在版本门槛下 import `regime.ts`/`catalog.ts` 是**同一方法同一版本**的读取而非第二套解释（§3.3 论证）；每结果方法清单冻结在 D1（迁移加列） | §3.3、§3.4、§5.2 |
| R-C4（compensate/playbooks/deviations 硬编码 v1） | 接受：D1 同 PR 切换三处常量并测试 v1→v2 的 compensate | §5.7 |
| R-C5 / R-M18（`official_http` 走不通 ingest） | 接受：ingest 路由从目录推导 adapter，按 adapter 分组调用 `ingestEvidence`；`DATASET_OF.official_http='macro.akshare'`；内容类型与定位器映射 | §5.3 |
| R-C6 / R-M12（预设输入不可变） | 接受：改用 `eligibleHistoryAsOf`（批次按 cutoff 完成）；隔离裁决后变化由 `inputs_hash` 揭示并记为已知限制；不再声称跨实例必然相同 | §4.4 |
| R-C7 / R-M4（弃权卡被过滤；生命周期枚举） | 接受：列表请求 `include_abstained=1`；枚举逐字取 `src/lib/judgments/types.ts::Lifecycle`（`abstained\|open\|settled\|void\|withdrawn\|pending_fill`），合格集 `{open, settled, pending_fill}` | §2.3、§3.3 |
| R-C8 / R-M1 / R-M26（状态优先级矛盾；可辨识联合） | 接受：§3.3 改为可辨识联合 + 唯一优先级表（编号、触发、允许字段、测试名） | §3.3、§3.6 |
| R-C9 / R-M24（prev 与 prev3m 同一观测） | 接受：`comparisons[].roles:('prev'\|'prev3m')[]` | §3.3 |
| R-C10（未校验活动快照） | 接受：路由要求 `snapshot_id === db.activeSnapshot(region).snapshot_id`，否则 `snapshot_not_active` | §3.2 |
| R-C11 / R-M31（`created_at` 不在 envelope；sparkline） | 接受：`KeyIndicatorCards` 经 `GET /api/macro/snapshots/[id]` 读 `created_at`；`IndicatorRow.sparkline` 已存在（`views.ts`），保留 | §4.1 |
| R-C12 / R-M10 / R-M13 / R-M21 / R-M22（预设路由细节） | 接受：抽共享 `prepareAnalysis`；`request_id` 不进 `inputs_hash`（`inputsHash` 只哈希 `FrozenInputs`）；预设用确定性 UUIDv5；`code_version` fail-closed；p6 事件读取计入预算；响应 DTO 与 `RunJson` 的映射；预设规范表 | §4.4 |
| R-C13（transmission 回放按清单版本分派） | 接受 | §5.2 |
| R-C14 / R-M17（`month_end` 完成见证延迟） | 接受并明文：LPR/MLF 月度行在下一次报价/操作出现后才产生；状态文案区分"等待完成见证"与"无来源数据" | §5.3、§5.5 |
| R-C15 / R-M15 / R-M16 / R-M36（六行字段矩阵；首期日期） | 接受：逐行字段矩阵；`firstPeriod` 由 D0a 核实后**回填本表**（D1 不得在回填前开始） | §5.2 |
| R-C16（读取预算漏观测读） | 接受：1 快照 + 1 观测批读 + 1 判定 + 2 F4 | §3.2 |
| R-M3 / R-M25 / R-M31（权重/状态非冻结） | P5-B：版本门槛（§3.3 论证）；D1：`macro_regime_results.method_manifest`（迁移加列，发布时冻结行 id/type/weight/status/rule/support/denominator）；时钟在 D1 后优先读清单 | §3.3、§5.2 |
| R-M5（单状态结果 v1 弃权 `invalid_snapshot`） | 接受：作为 `f4_ineligible` 显示 `abstain_reason`；v2 不改此要求（方法不变） | §3.6 |
| R-M6（non_scoring 定义） | 接受：`scoring_rows` = `regionWeights` 键；`display_only_rows` = manifest 指标 − scoring | §3.3 |
| R-M7 / R-M38（v2 deps、版本身份） | 接受：v2 `deps` 与 v1 同列表；`METHODOLOGY_VERSION` 保持 `v1.0`（上游分类方法未变）；四种版本身份表 | §5.7 |
| R-M8（v1 retire 不确定） | 接受：D1 迁移内 `update judgment_methodologies set status='retired'` + 事件行；生产顺序：迁移 → 部署 → 同步 v2 | §5.7 |
| R-M9（D2–D4 是否改目录） | 接受：D2–D4 只加 parser/采集代码与 fixture（目录与 `cn-series.json` 不动；事件源行与 `source` 在 D5 一次加入） | §5.8 |
| R-M11（配额执行点） | 接受：列出配额唯一执行点（`create_macro_analysis_run` RPC）与证明测试 | §4.4 |
| R-M14（约束名未知） | 接受：迁移用 `DO $$` 按 `pg_constraint` 发现并替换 | §5.8 |
| R-M19 / R-M20 / R-M37（AFRE 修订、MLF 列、LPR 重复冲突） | 接受 | §5.3–§5.5 |
| R-M28（动态字符串禁词） | 接受：时钟不渲染 F4 自由文本；类别标签用本模块 i18n；`abstain_reason` 以代码显示 | §3.5 |
| R-M29 / R-M44（精度） | 接受：不变式 2、6 用与发布相同的运算顺序与 r6，精确相等 | §3.4 |
| R-M30（破坏用例与不变式一一对应） | 接受：八条不变式各一命名用例 | §3.8 |
| R-M32（事件身份） | 接受 | §4.2 |
| R-M33 / R-M34 / R-M35（文件清单、边 DTO、列适配器） | 接受 | §4.3、§4.5、§4.6、§6 |
| R-M39（v1 测试） | 接受：v1 模块与其测试不改；新增 `macro-regime.v1.hash.test.ts` 固定其历史公式哈希（D1 之前录制）；D1 改变闭包后该测试改为"等于 D1 前录制值"的历史断言 | §5.7 |
| R-M40 / R-M41（截图与基准） | 接受：截图只作视觉证据；基准脚本入库 | §8 |
| R-M23 / R-M42 / R-M43 | 接受：独立 DTO、删 `f4:null`、标签契约 | §3.3、§3.5 |
| R-M45（D2/D3/D4 分 PR） | 已是三个 PR；表格拆行 | §10 |

---

## 1. WP-A · 基线：ChaosAI 各板块对照矩阵（2026-11-07 核实）

状态口径：**live** = 生产可见；**merged** = 已在 `main`，生产未开或未部署；**open PR**；**not impl**。

| # | ChaosAI 子板块 | 我方对应能力 | 状态 | 差距性质 | 归属 |
|---|---|---|---|---|---|
| 1a | 美林时钟判定头 | `RegimeResult.{primary_state,secondary_state,growth_axis,inflation_axis}`（`macro_regime_results.regime`）；F4 `macro_regime@v1` 判断卡（categorical，`scores_are_not_probabilities`） | merged（开关关、`publishable=false`） | 展示 + 发布资格（owner） | WP-B |
| 1b | 四张象限卡 + 百分比 | `RegimeResult.norm/scores/margin_pp/coverage`；F4 claim `distribution` | merged | 展示 + 命名 | WP-B |
| 1c | 定量分解展开表 | `RegimeContribution[]`；`MacroJudgmentSlot` Basis 表（技术表格） | merged | 展示 + 服务端对账 | WP-B |
| 1d | 偏差案例库 | `deviations.ts` + `DeviationCases.tsx` | merged | — | 不动 |
| 1e | 方法论页 | `?tab=methodology`；F4 `docs/methodologies/macro_regime/v1.md` | live | 规则表中文化（随开关挂载） | WP-B |
| 1f | 资产配置模板、超/低配行业 | 无（有意） | not impl | 不做（§3.7） | — |
| 2a | 指标汇总表 | `IndicatorTable` | live | — | 不动 |
| 2b | 指标大卡 | `IndicatorDetail` + `MacroLineChart` | live | 组织、FOMC 圆点密、资产表不可横比 | WP-C |
| 2c | Pearson 卡 + 拟合 | `CorrelationWorkbench` + `CorrelationResult` | live | 首进无结果 | WP-C |
| 3a | 利率三合一（MLF / LPR 1Y / 5Y） | `CN_LPR_1Y`、`CN_MLF_1Y` missing；无 `CN_LPR_5Y` | not impl | 数据 + 目录 | WP-D |
| 3b | 社融存量同比 | `CN_AFRE_STOCK_YOY` missing | not impl | 数据 | WP-D |
| 4a | 六段传导流 | `transmission.ts` + `TransmissionFlow.tsx` | live | 可读性 | WP-C |
| 4b | 流动性节点 | US 流动性段 `not_in_catalog` | not impl | 数据 | WP-D |
| 4c | 剧本 | `PlaybookGrid` | live | 文案重复 | WP-C |
| 5 | 联储 → 中国资产 | `PolicyResponseMatrix` | live | 权益列受限 | WP-C + WP-D |
| 6 | 历史周期 × 资产表 | `CycleReturnsTable`（九列，四列 restricted） | live | 受限列占视野 | WP-C + §5.6 |
| 7 | 来源声明 | `SourceFooter` + `SourceDrawer` | live | — | 不动 |

不触碰的在飞行文件：PR #125（`src/lib/judgments/{deps,inputs-db}.ts`、`src/app/api/judgments/[id]/route.ts`、`src/app/api/macro/{series,snapshots}/[id]/route.ts`）、#123/#124、`claude/macro-strategy-latency`（`db.ts`、`strategy/port.ts`）、foreign research（`20261119*`）。

---

## 2. 时钟数据契约（代码实际暴露的）

### 2.1 计算（`regime.ts`，`METHODOLOGY_VERSION='v1.0'`，`RULES_VERSION='macro-regime-rules/1.0'`）

- 输入 `RegimeInput{region, series:Record<id,{latest, prev?, prev3m?}>}`，`ObsRef={observation_id, period_end, value_text}`。
- `WEIGHTS_V1` 中该地区的序列：目录 `status==='active'` 且 `type` 非空且 `weight>0` 才参与；`comparisons()` 把 `value_text` 转 `Number`，`d1 = latest − prev`（序列单位差，百分点），`d3 = latest − prev3m`（fx 用 `yoyPct` 百分比变化）；比较期缺失 → `null`。
- `matchRule(type, v, d3, d1)`：只在自己类型的规则里找第一条命中。
- `contribution[i][q] = r6(weight_i × support[q])`；`scores[q] = r6(Σ 未舍入贡献)`；`matched = Σ 命中权重`；`denominator = Σ regionWeights`（含 missing/restricted）；`coverage = r6(matched/denominator)`；`uncoveredWeight = r6(denominator − matched)`。
- `coverage < 0.6` 或 `Σ scores ≤ 0` → `regime = null`（贡献与 uncovered 仍存）。
- `norm[q] = r6(scores[q]/Σ scores)`（Σ 用未舍入 scores）；`pickStates`：primary = argmax（并列按 REGIMES 顺序），secondary = 其余 norm>0 最大者或 null；`margin_pp = r6(100×(norm[p] − (norm[s] ?? 0)))`。
- `growth_axis` = Σ_{pmi,labor_rate,growth_yoy 命中} `weight×(s.recovery+s.overheat−s.stagflation−s.recession)` ÷ Σ 权重，r6；`inflation_axis` = Σ_{inflation_yoy 命中} `weight×(s.overheat+s.stagflation−s.recovery−s.recession)` ÷ Σ 权重，r6；无命中 → null。
- 权重：US 合计 100；CN 合计 125（明细见第 2 稿；不变）。
- `RULES[type][].label:{zh,en}` 与 `support` 是规则表 1.0 的一部分（冻结）。

### 2.2 冻结与存储

- `buildRegimeInput`：`latestEligible` + `prev`（24 个月窗口内最近更早期）+ `prev3m`（恰好 −3 个月 / 上一季度）；三者 id 去重后进入 `observation_ids`（**prev 与 prev3m 可能是同一观测**，例如季度序列）；24 点进 `history_ids`。
- `publishRegion` 同事务写 `macro_snapshots` 与 `macro_regime_results`（`regime`, `contributions`, `rules_version`, `uncovered_weight`）；后者 service_role only，读经 `db.regimeOf`。
- `macro_series` 镜像只存当前目录；无按版本的历史目录 → §3.3 版本门槛；D1 增 `macro_regime_results.method_manifest`。
- 快照不论 coverage 都发布。

### 2.3 读取

| 路由 | 返回 | 开关 |
|---|---|---|
| `GET /api/macro/overview?region=` | `Envelope{snapshotId, asOf(日期), catalogVersion, methodologyVersion, collection, indicators[]{…, sparkline:string[]}, changes, catalogCounts}`（无 `created_at`） | 无判定字段 |
| `GET /api/macro/snapshots/[id]` | `{catalogVersion, snapshot{…, created_at, status}, observations[]}` + 开关开时判定字段 | `macroJudgmentsEnabled()` |
| `GET /api/macro/series/[id]?from&to&asOf&transform` | `SeriesJson` | — |
| `GET /api/judgments?subject_type=macro_region&subject_key=US&types=macro_regime&include_abstained=1` | `{cards[]}`，`JudgmentCard{judgment_id, kind:'categorical', lifecycle:Lifecycle, calibration, as_of, methodology{id,version,title,href}, display{headline, percent:null, value}, inputs[]{kind:'macro_snapshot'\|'macro_observation', ref, available_at, origin, href}, abstain_reason?}`；只含 `publishable=true` 方法；`Lifecycle='abstained'\|'open'\|'settled'\|'void'\|'withdrawn'\|'pending_fill'`（`src/lib/judgments/types.ts:255`） | F4 RLS |
| `GET /api/judgments/[id]` | `{card, judgment{claim:{selected, classes, distribution, scores_are_not_probabilities:true, margin_pp, catalog_version}, inputs, abstained, abstain_reason}, settlements, calibration}` | F4 RLS |

### 2.4 决策 D1（第 3 稿）：时钟 = F4 判断卡 + 其依据；对 P1 §3.2 的修订

- **挂载条件**（全部成立才显示任何象限/分数/占比/覆盖/贡献）：
  1. `macroJudgmentsEnabled()`（`page.tsx` 传入）；
  2. 概览的 `snapshotId` 是该地区**活动**快照（`db.activeSnapshot(region).snapshot_id`），且 `catalog_version === CATALOG_VERSION`、`methodology_version === METHODOLOGY_VERSION`、`rules_version === RULES_VERSION`；
  3. F4 列表（含弃权卡）中存在 `methodology.id==='macro_regime'`、`methodology.version ∈ acceptedVersions`（当前注册表版本）、`inputs` 含 `{kind:'macro_snapshot', ref:{snapshot_id}}` 等于本快照的卡；其 `lifecycle ∈ {open, settled, pending_fill}`；
  4. 详情 `judgment.claim` 与冻结结果一致（§3.4 不变式 7）。
- **对 P1 §3.2 的修订（随本规格合并时写入 P1 文件的"第 7 稿修订"小节）**："判断层开启时，`MacroJudgmentSlot` 的位置由 `RegimeClockCard` 取代；F4 categorical 卡的 `display.percent` 仍为 null、不显示任何百分比形式的判断值；在 §2.4 条件 1–4 全部满足时，允许把该判断的**依据**——冻结的规则得分占比（`claim.distribution` = 快照 `norm`）、分数、覆盖与逐项贡献——以'规则得分占比，不是概率'的标注展示；任一条件不满足或对账失败 → 只显示状态，不显示数字；F4 读取失败不回退到快照数字。"
- 卡片内容：F4 卡的类别（**用本模块 i18n `judgment.clock.regime.<state>` 渲染 `claim.selected`，不渲染 F4 自由文本 `headline`**）、生命周期、校准状态（枚举 → i18n）、方法入口（`methodology.href`，标签为 `id@version`）；四象限占比 = `claim.distribution`；分解 = 冻结 `contributions` 的投影。
- **生产后果（owner 事项 O1）**：`macro_regime@v1` 现为 `publishable=false`；时钟在生产显示 `f4_none` 直到 owner 运行 `sync-methodologies.ts --publishable macro_regime@<当前版本> "<确认>"`（并登记 `licenses.json`）。P5 用本地冻结样本验证全部状态。
- "概率"二字只在豁免键 `judgment.clock.notProbability`。

### 2.5 跨模块硬约束

| 约束 | 事实 | 后果 |
|---|---|---|
| C1 目录即版本 | `CATALOG_VERSION` 为目录内容哈希（现 `30bcaa2a33c5`）；F4 方法按版本固定它并对其他版本弃权 | 目录每变一版 → F4 新方法版本 + 切换 `compensate.ts::MACRO_METHOD`、`strategy/playbooks.ts`、`strategy/deviations.ts::METHOD`、时钟 `acceptedVersions`（§5.7） |
| C2 方法即版本 | `METHODOLOGY_VERSION='v1.0'`、`RULES_VERSION`、`WEIGHTS_V1` 冻结 | P5 不改；`CN_LPR_5Y` weight 0 |
| C3 开关只在服务端 | `pages.test.ts` | 组件以 prop 挂载 |
| C4 冻结清单不变 | P3/P4 manifest、回放 fixture | 列切换纯展示 |
| C5 数值十进制 | — | 展示舍入不回写 |
| C6 v1 公式哈希 | `formulaHashOf` 哈希 v1 的 import 闭包 + `deps`（`read-api,flags,snapshots,freshness,db`、`dq/freshness`）；任一改动 → `methodology-sync` drift，整个同步被拒 | WP-B / WP-C 不改这些文件（时钟投影在新文件，路由新建）；WP-D 的 D1 一次改完并注册 v2、retire v1 |

---

## 3. WP-B · 美林时钟卡片与定量分解

### 3.1 位置与挂载

`MacroWorkbench` 概览 tab，`judgmentsEnabled` 为真时，在两张事实卡之下、指标表之上，新组件 `RegimeClockCard` 取代 `MacroJudgmentSlot`（后者与 `judgment-view.ts` 在 WP-B 末任务删除）。默认展开；折叠偏好 `localStorage` 键 `macro.clock.expanded.<region>.v1`（try/catch；SSR 首屏默认展开）。

### 3.2 数据流与路由

```
page.tsx → MacroWorkbench(judgmentsEnabled, rules) → useMacroOverview → env.snapshotId
  → RegimeClockCard(region, snapshotId) → GET /api/macro/snapshots/{id}/clock → 排版
```

`GET /api/macro/snapshots/[id]/clock`（新文件）：`requireSessionUser` → `UUID_RE` → `macroJudgmentsEnabled()` 否 → 404 `judgments_disabled` → `db.snapshot(id)` 无 → 404 → `db.activeSnapshot(region)` 的 id ≠ `id` 或 `status!=='active'` → `{status:'snapshot_not_active'}` → 版本门槛 → `db.observationsByIds(snapshot.observation_ids)`（任一 id 读不到 → `{status:'integrity_error'}`，不是 `no_data`）→ `db.regimeOf(id)` → F4（列表 + 详情，`clock-f4.ts`，fail-closed，3 s）→ `buildClockView` → `okJson`，`Cache-Control: private, no-store`。读取预算：1 快照 + 1 活动快照 + 1 观测批读 + 1 判定 + 2 F4 HTTP。

### 3.3 `ClockView`（`src/lib/macro/clock-view.ts`，`macro-clock-view/1`，服务端纯函数；可辨识联合）

```ts
export type ClockStatus='ok'|'snapshot_not_active'|'version_unsupported'|'integrity_error'|'record_missing'|'f4_none'|'f4_earlier'|'f4_ineligible'|'f4_unavailable'|'f4_mismatch'|'reconcile_failed';
interface ClockMeta{version:'macro-clock-view/1';snapshot:{id:string;region:Region;as_of:string;created_at:string;catalog_version:string;methodology_version:string;rules_version:string|null};f4:{judgment_id:string|null;lifecycle:string|null;abstain_reason:string|null;earlier_snapshot_id:string|null;methodology_version:string|null};regime_status:'classified'|'coverage_below_threshold'|'zero_score'|'unknown'}
export type ClockView=
 |(ClockMeta&{status:'ok';card:{selected:Regime;lifecycle:Lifecycle;calibration:string;methodology:{id:string;version:string;href:string};as_of:string};quadrants:QuadrantView[];rows:ClockRow[];display_only_rows:DisplayRow[];summary:{primary:Regime;secondary:Regime|null;margin_pp:number;coverage:number;matched_weight:number;denominator:number;uncovered_weight:number;growth_axis:number|null;inflation_axis:number|null;scores:Record<Regime,number>;norm:Record<Regime,number>};reconciliation:{ok:true;tolerance:number}})
 |(ClockMeta&{status:Exclude<ClockStatus,'ok'>;diagnostics:{code:string;detail:string;ids?:string[]}[]});   // 非 ok：无任何数值字段
export interface ClockRow{series_id:string;name:Bilingual;type:SeriesType;weight:number;state:'matched'|'not_matched'|'no_data'|'missing'|'restricted';unit:string;
 latest:{observation_id:string;period_end:string;value_text:string;version:number}|null;
 comparisons:{observation_id:string;period_end:string;value_text:string;roles:('prev'|'prev3m')[]}[];   // manifest 中同序列其余观测，period_end 升序；roles：period_end === shiftMonthEnd(latest.period_end,−3)（季度序列：上一季度末）→ 'prev3m'；period_end 为 comparisons 中最大者 → 'prev'；一条观测可同时两个角色；其余观测 roles=[]（不会出现：manifest 每序列 ≤ 3 条）
 display_change:{kind:ChangeKind;value_text:string}|null;    // 对 roles 含 'prev' 的观测，changeOf 口径
 rule:{id:string;label:Bilingual;support:Record<Regime,number>}|null;contribution:Record<Regime,number>|null;reason:Bilingual|null}
export interface DisplayRow{series_id:string;name:Bilingual;unit:string;latest:ClockRow['latest']}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}
```

**优先级（唯一，编号即测试名 `clock-view.status.<n>`）**：
1. `snapshot_not_active`（路由判定）→ 2. `version_unsupported` → 3. `integrity_error`（manifest 观测缺失）→ 4. `record_missing`（`regimeOf` null）→ 5. F4：`f4_unavailable` / `f4_none`（列表无 `macro_regime` 卡）/ `f4_earlier`（有卡但快照不同；取 `as_of` 最新者）/ `f4_ineligible`（同快照但 lifecycle ∉ 合格集，含 `abstained`：附 `abstain_reason`，例如 `coverage_below_threshold`、`invalid_snapshot`（单状态结果）、`observation_missing`）→ 6. 存储对账不变式 1–6、8 失败 → `reconcile_failed` → 7. 不变式 7 失败 → `f4_mismatch`（含"F4 卡合格但快照 `regime===null`"）→ 8. `ok`。
`regime_status` 在任何状态下都从存储算出（null regime：`(denominator−uncovered)/denominator<0.6` → `coverage_below_threshold`，否则 `zero_score`；无记录 → `unknown`），只作文案，不带数字。

**scoring rows / display rows**：`rows` 恰为 `regionWeights(region)` 的键（互斥状态：目录 missing / restricted；在 `contributions` → `matched`；manifest 有观测但不在 contributions → `not_matched`；否则 `no_data`）；`display_only_rows` = manifest 指标 − scoring（D1 之前为空）。

**为什么服务端可以 import `regime.ts` / `catalog.ts`**：版本门槛要求快照的 `catalog_version`、`methodology_version`、`rules_version` 三者等于当前代码常量，而 `WEIGHTS_V1`、`RULES`、目录行在各自版本内冻结（§2.5 C1/C2 是对这一点的强制）；因此在门槛内读取当前常量就是读取快照时的方法定义，不是第二套解释。门槛外一律 `version_unsupported`。D1 之后 `macro_regime_results.method_manifest` 冻结每结果的 {row id, type, weight, status, rule_id, support, denominator}，时钟改为优先读清单（清单缺失的旧行仍走门槛）。

### 3.4 对账（服务端；失败 → 无数字）

`n` = 命中行数；`tol = (n+1)×1e-6`（r6 累计）。

| # | 不变式 | 失败状态 |
|---|---|---|
| 1 | `contributions.series_id` 唯一；每个 `observation_id` ∈ manifest 且其 `series_id` 相同；每个 `series_id` ∈ `regionWeights` 且目录 `active` | reconcile_failed |
| 2 | `contribution[q] === r6(weight × support[q])`（与 `regime.ts` 同运算、精确相等）；`weight === regionWeights[series_id]` | reconcile_failed |
| 3 | 每象限 `|Σ contribution[q] − scores[q]| ≤ tol` | reconcile_failed |
| 4 | `Σ matched weight + uncovered_weight === denominator`（r6 精确）；`coverage === r6(matched/denominator)` | reconcile_failed |
| 5 | `|norm[q] − r6(scores[q]/Σ scores)| ≤ 2e-6`；`pickStates(norm)` 的 primary/secondary 与存储一致；`margin_pp === r6(100×(norm[p]−(norm[s]??0)))` | reconcile_failed |
| 6 | axes 用存储 `support`/`weight` 按 `regime.ts` 同运算顺序重算，r6 后精确相等（无命中 → null） | reconcile_failed |
| 7 | F4 `claim.selected === primary_state`；`|claim.distribution[q] − norm[q]| ≤ 1e-6`；`claim.catalog_version === snapshot.catalog_version`；`|claim.margin_pp − margin_pp| ≤ 1e-6`；快照 `regime` 非 null | f4_mismatch |
| 8 | `rule_id` ∈ `RULES[row.type]`；存储 `support` 与规则表 `support` 逐象限相等（缺省 0） | reconcile_failed |

顺序：1→6→8→7。失败：`diagnostics[]{code:'invariant_<n>', detail, ids}`（**不含数值**），`console.error('[macro-clock] reconcile', …)` 记录差值；UI 显示"分解与分数不一致，已记录"并提供"重试"。

### 3.5 UI（画布 §7；文案 `judgment.clock.*`）

（布局同第 2 稿示意；省略）要点：
- 象限卡四张等宽；主 `border-[var(--border-active)] bg-[var(--accent-wash)]`，次 `border-[var(--border-active)]`，其余 `border-border`；圆角 `rounded-md`（6px）；不写十六进制；无四色。
- F4 行：`judgment.clock.regime.<selected>`（"判定：复苏"）、`judgment.clock.lifecycle.<lifecycle>`、`judgment.clock.calibration.<state>`、方法链接文本 `macro_regime@v1`。**不渲染** F4 `display.headline`、`methodology.title` 等自由文本。
- 主/次/差距/覆盖/轴行 + 固定标注 `judgment.clock.notProbability`（"规则得分占比，不是概率"）；`margin_pp` 标签 `judgment.clock.marginLabel` = "主次占比差（pp）" / "primary–secondary share gap (pp)"，禁止"置信度差/probability gap"。
- 前三驱动按钮 `aria-controls="clock-row-<series_id>"`，点击展开表、`scrollIntoView`、focus、高亮 2 s。
- 分解表：matched 行按 max_q contribution desc；not_matched / no_data 其后；missing / restricted 最后；非命中行 `text-text-dim` + "计入分母，不计入分子"；比较列"快照中的比较观测"（`2026-08 · 2.6（上期）· 2026-06 · 2.7（3M 前）`；同一观测两角色合并显示"上期 = 3M 前"）；显示变化列按目录口径；脚注（上期定义、规则输入 vs 显示变化、舍入）。
- 证据：当前值按钮 → `SourceDrawer`（冻结 `observation_id`）。
- 精度：占比 1 位 %；分数/贡献 2 位；margin 1 位 pp；轴 2 位带符号；覆盖 `X/Y` 整数；负零 → 0；对账只用原始值。
- 页头版本链接 `?tab=methodology`；方法 tab `RulesTable`（数据由 `page.tsx` 服务端从 `RULES` 投影为 prop，关态传 null）。
- 禁词：`judgment.clock.*` 不含 概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast（豁免 `notProbability`）；运行时渲染的字符串只有本模块 i18n、目录 `name`、规则 `label`、枚举代码。
- 窄屏：象限 2×2；分解表行卡。

### 3.6 状态矩阵（互斥；编号 = §3.3 优先级）

| # | 状态 | 触发 | UI | 数值字段 | 测试 |
|---|---|---|---|---|---|
| 0 | judgments_disabled | prop false | 不挂载 | — | `pages.test` |
| 0' | loading / load_failed | 请求中 / 非 2xx | 骨架 / "读取失败 · 重试" | — | `clock-model.test` |
| 1 | snapshot_not_active | 非活动快照 | "概览快照已更新，请刷新" | 无 | `route.test.status.1` |
| 2 | version_unsupported | 版本不等 | 两版本并列显示 | 无 | `.2` |
| 3 | integrity_error | manifest 观测读不到 | "快照数据不完整，已记录" | 无 | `.3` |
| 4 | record_missing | `regimeOf` null | "该快照无判定记录" | 无 | `.4` |
| 5a–5d | f4_unavailable / f4_none / f4_earlier / f4_ineligible | §3.3 | 各自文案（ineligible 显示 `abstain_reason` 代码与 `regime_status` 文案） | 无 | `.5a`–`.5d` |
| 6 | reconcile_failed | 不变式 1–6、8 | "分解与分数不一致，已记录" | 无 | `.6` |
| 7 | f4_mismatch | 不变式 7 | "F4 判断与快照结果不一致，已记录" | 无 | `.7` |
| 8 | ok | 全过 | 全量 | 全部 | `.8` |
| 行级 | matched / not_matched / no_data / missing / restricted | §3.3 | 行状态 | — | `clock-view.rows` |

共 11 个卡级状态（0、0'、1–8 含 5a–5d）。

### 3.7 明确不做

资产配置比例、行业超/低配；客户端评估规则或重选观测；显示 ChaosAI 数值；改 C6 文件。

### 3.8 测试

- `clock-view.test.ts`：手算 fixture（4 命中 + not_matched + no_data + missing + restricted，US）；八条不变式各一命名破坏用例（`invariant.1.duplicate_series`、`invariant.1.foreign_observation`、`invariant.2.contribution_cell`、`invariant.3.score_sum`、`invariant.4.uncovered`、`invariant.5.norm` / `.primary` / `.margin`、`invariant.6.axis`、`invariant.7.selected` / `.distribution` / `.null_regime`、`invariant.8.rule_id` / `.support`）；优先级 1–8 各一例；roles 双角色（季度 GDP）与三月缺口用例；非 ok 响应无数值字段的结构断言。
- `clock-f4.test.ts`：真实卡片 fixture、`include_abstained=1` 查询串、生命周期六值逐一、`earlier` 取最新、详情畸形/超时。
- `regime.rules-boundary.test.ts`：fx 值 7.12/102.4 不命中 policy_rate；growth_yoy 48 不进 pmi；RULES label 非空互异。
- 路由测试：开关关 404；非活动；观测缺失 → integrity_error；`Cache-Control`。
- 源码断言：`src/components/macro/clock/**` 不 import `regime.ts`/`catalog.ts`、不含 `MACRO_JUDGMENTS_ENABLED`。
- 文案：禁词；zh/en 对等；标签契约（`marginLabel` 含 "pp"）。
- 浏览器验收：本地 DB 样本（`seedClockSample`）+ 本地注册 `macro_regime@v1` 并 `--publishable`（仅本地）；1280 / 390 截图（视觉证据，附"对账由 `clock-view.test.ts` 证明"）。

---

## 4. WP-C · 把已有图表组织得清楚

### 4.1 概览大图卡

`KeyIndicatorCards`（`KEY_INDICATORS`：US `US_DFF`、`US_DGS10`、`US_CPI_YOY`、`US_UNRATE`；CN `CN_PMI_MFG`、`CN_CPI_YOY`、`CN_CGB_10Y`、`CN_M2_YOY`）。标题行取 envelope 行；折叠态画 `IndicatorRow.sparkline`（`views.ts` 已有，24 点，`Sparkline` 组件）；展开态嵌 `IndicatorDetail compact asOf={createdAt}`，`createdAt` 经 `GET /api/macro/snapshots/{snapshotId}` 的 `snapshot.created_at` 取得（一次，组件级缓存；该路由开关关时也返回 `snapshot`）；`fetchSeriesWindow` 透传 `asOf`。图中最后一点的 `observation_id` ≠ envelope 行 `observation_id` → 卡内提示"图表最新 X（期）≠ 快照值"。默认前 2 张展开。

### 4.2 标记层与事件列表

`MacroLineChart.layers?:{derived?:boolean;calendar?:boolean}`（默认 derived on、calendar off）；`markersOf(events, calendar, firstPeriod, layers)`：身份键 = 派生 `effective_date`（每日至多一条，引擎保证）、日历 `start|end`；只去掉身份相同的重复，不丢事件；同日派生 + 日历各画一个。两个 `aria-pressed` pill；"事件（最近 6 条）"按 `effective_date` desc、同日按 kind、再按身份键；`|change_bp| ≥ 25` 才带文字。

### 4.3 资产条形

`barGeometry` 从 `strategy-view-model.ts` 移到 `charts/chart-geometry.ts`（旧处删除，策略组件改 import；文件清单 §6 列出）；`assetBarPanels(assetsByCycle, cycles)`：每周期 {pct 面板, bp 面板}，面板值域 = max |值|，零轴居中，缺值不画条（显示"缺失"），tooltip 带单位与端点；表格切换保留；颜色 `--up/--down`。

### 4.4 默认关联结果卡 —— 修订 P1 §3.4

P1 §3.4 "只预填表单，不预存运行，不自动重算" → **P5 修订**：预设结果由服务端按需计算（不存运行、不计用户配额、不写库），响应自带冻结输入回执。

- **共享服务** `src/lib/macro/analysis-service.ts::prepareAnalysis(deps, spec, {cutoff, codeVersion})` 从 `POST /api/macro/analyses` 抽出：别名解析、历史读取（**`eligibleHistoryAsOf`**，按 cutoff 完成批次；行数上限与 POST 相同）、`event_window` 的目标利率两条历史读取与事件派生、`freezeInputs`、`inputsHash`（只哈希 `FrozenInputs`，不含 `request_id`）、`runAnalysis`、`explainResult`。POST 路由改为调用它，行为不变（现有测试照旧；POST 的 cutoff 仍为请求时刻 UTC）。
- **配额执行点**：唯一在 `create_macro_analysis_run` RPC（`src/app/api/macro/analyses/route.ts:89-93`）；预设路由不调用它；测试用 memory db 断言无 run 写入、无 RPC 调用。
- **路由** `GET /api/macro/analyses/presets?region=US|CN`：`requireSessionUser`；`resolveCodeVersion({allowGit:false})` 失败 → 503 `code_version_unavailable`（与 POST 同）；`db.activeSnapshot(region)` 无 → 200 `{cards:[], reason:'no_published_snapshot'}`；`cutoff = snapshot.created_at`；对 `PRESETS` 该地区各项：`request_id = uuidv5(NAMESPACE_P5_PRESETS, preset_id)`（通过 `validateAnalysisRequest`，不进哈希）→ `prepareAnalysis` → 卡。
- **预设规范表**（`src/components/macro/correlation-presets.ts`，不变）：p1 US change `US_DFF×US_UST10Y` lag0 10y；p2 US change `US_CPI_YOY×US_UST10Y` 0 10y；p3 US change `US_CPI_YOY×US_WTI` −1 10y；p4 US change `US_DTWEXBGS×US_WTI` 0 10y；p5 US rolling `US_UNRATE×US_UST10Y` 0 all；p6 US event_window `US_DFF×US_UST10Y` ±6 all（**额外读取** `US_FED_TARGET_UPPER_D`、`US_FED_TARGET_LOWER_D`）；p7 CN change `CN_PMI_MFG×CN_CGB10Y` 0 10y；p8 CN level `CN_CPI_YOY×CN_CGB10Y` 0 10y。
- **响应 DTO**：`{region, snapshot_id, cutoff, computed_at, code_version, method_version, catalog_version, cards:PresetCard[]}`，`PresetCard = {preset_id, run_id:null, request_id, kind, spec, inputs:FrozenInputs, inputs_hash, results|null, error|null, status:'ok'|'failed', method_version, code_version, created_at:computed_at}` —— 与 `RunJson` 字段同名，`CorrelationResult` 以 `preset` 模式渲染（隐藏 run_id，显示"预设 · 未保存"）。
- **memo**：进程内 LRU 32、单飞，键 `region|snapshot_id|CATALOG_VERSION|CORRELATION_VERSION|code_version`；头 `X-Macro-Presets-Memo`。**已知限制**：同一键下，cutoff 之后的隔离裁决可改变 eligible 集合 → 不同实例/时间的 `inputs_hash` 可能不同（响应自证）；不声称跨实例恒等。
- 按钮"重新计算并保存"→ POST（计配额，现时 cutoff）；保存后 `inputs_hash` 不同 → 提示。
- 失败预设成卡（`error`）。
- 基准：`scripts/macro/bench-presets.ts`（入库）：固定本地样本 DB（`seed.ts`）、冷 = 新进程 + memo 空、热 = 同进程第二次；各 3 次，报告全部样本与中位数；生产用 `vercel logs` 同法。
- 测试：预设与 POST 同 spec 同 cutoff → 同 `inputs_hash` 与 `results`；无 run、无 RPC；memo 头；无快照；401；503；p6 事件读取；失败卡。

### 4.5 传导短标签

`NodeCard` 默认显示徽章、短标签、值 + 单位、数据期；其余折进 `<details>`。边：`TransmissionView.stages[].edge:{text:Bilingual;kind:'assumption'}|null`（契约已有）；`TransmissionFlow` 不再在流程内渲染边文案，改为流程下方 `<details>`"机制假设（N 条）"列出 `stages.filter(s=>s.edge).map(s=>s.edge.text[locale])`；`flow.edge` 文案键删除（无前缀拼接）；`strategy-messages.test.ts` 断言不存在 `flow.edge`。剧本声明只在面板底部一次。

### 4.6 列切换

`visibleColumns(view:CycleTableView, mode)` 与 `visibleDims(view:PolicyResponseView, mode)` 两个适配器 → 共同 `VisibleColumn{id,label,hidden_reason:'restricted'|'not_in_catalog'|null}`；N 按表各自计算；`cycleScale` 不变；`localStorage` 键 `macro.strategy.columns.v1`；"补齐计划"链接 `/intel/macro?tab=methodology#data-gaps`。

### 4.7 测试与验收

同第 2 稿；加 `visibleDims`、事件身份、`assetBarPanels` 缺值。

---

## 5. WP-D · 数据缺口

### 5.1 落点（同第 2 稿表；不新增定位器与派生种类）

### 5.2 D1：D0 + 方法清单冻结 + 美国流动性三序列（目录版本 v2）

**D0**：`catalogItemsOf = indicatorsOf(region)`；`buildRegimeInput` 冻结 `displayInputsOf`（active、月/季、weight ≥ 0）；`classifyRegime` 不变；`observation_ids` = 评分 ∪ 展示；F4 v2 `gather` 冻结全部、`compute` 的长度检查仍成立。

**方法清单冻结**：迁移为 `macro_regime_results` 加列 `method_manifest jsonb null`；`publishSnapshot` RPC 与 `db.publishSnapshot` 增参数；`publishRegion` 写 `{rows:[{series_id,type,weight,status,rule_id|null,support|null}], denominator, weights_version:'v1.0', rules_version, catalog_version}`；时钟 D1 后优先读它。

**六行字段矩阵**（`firstPeriod` 由 D0a 核实后回填；回填前 D1 不开工）：

| id | FRED | role/type | unit | nativeFrequency/period | adjustment | changeKind | revisionPolicy | releaseLagDays | weight | derive | firstPeriod |
|---|---|---|---|---|---|---|---|---|---|---|---|
| US_WALCL_W | WALCL | indicator/null | usd_mn | weekly/day（周三） | na | pct | revisable | 1（周四发布） | 0 | — | [D0a] |
| US_WALCL | — | indicator/null | usd_mn | monthly/month | na | pct | revisable | undefined | 0 | month_end from US_WALCL_W | — |
| US_RRPONTSYD_D | RRPONTSYD | indicator/null | usd_bn | daily/day | na | pct | immutable | undefined | 0 | — | [D0a] |
| US_RRPONTSYD | — | indicator/null | usd_bn | monthly/month | na | pct | immutable | undefined | 0 | month_end | — |
| US_WTREGEN_W | WTREGEN | indicator/null | usd_mn | weekly/day（周三，值 = 该周周平均） | na | pct | revisable | 1 | 0 | — | [D0a] |
| US_WTREGEN | — | indicator/null | usd_mn | monthly/month | na | pct | revisable | undefined | 0 | month_end | — |

名称（zh/en）写明口径：WALCL "联储总资产（周三水平）/（月内最后一次周观测）"；WTREGEN "财政部一般账户（周平均，以周三标记）/（月内最后一次周平均观测）"；RRPONTSYD 口径逐字取 FRED 序列页（D0a）。
- `catalog.test.ts` 新不变式：`releaseLagDays` 对 daily/event/month_end 行 undefined、对 weekly 原生行必填、对 monthly/quarterly 原生行按现表；`freshness.ts` weekly：下一期 = 上一期 + 7 天 + lag + 3 天宽限（节假日延迟由宽限吸收，不建日历）。
- `types.ts`：`NativeFrequency` + weekly；`Adapter` + `official_http`；`MacroSeriesDef.firstPeriod?`；`fredCosdFor(period, backfilled, today, firstPeriod?)`。
- 单位：两处 `KNOWN_UNITS` + `BY_UNIT` + i18n（第 2 稿值）。
- transmission：`TRANSMISSION_V2` 新常量；`transmission.ts::buildTransmission` 按**清单的 `version`** 分派配置（v1 清单 → `TRANSMISSION_V1`，新清单 → v2）；`VERSIONS.transmission` 由构建时版本决定；v1 回放 fixture 不变并加 v2 fixture。
- F4 生产切换：`compensate.ts::MACRO_METHOD`、`strategy/playbooks.ts`、`strategy/deviations.ts::METHOD`、时钟 `acceptedVersions` → `v2`；测试 v1→v2 后 `compensate` 仍找到方法。

### 5.3 LPR 1Y / 5Y（D0b 核实 → D2 parser → D5 翻活）

- `official_http` 全链路：`types.ts::Adapter`；迁移 `macro_evidence_objects.adapter` CHECK；`DATASET_OF.official_http='macro.akshare'`（同一 CN 采集批次）；`DATASET_OF_REGION` 不变；`ingest/route.ts`：每个 evidence 项的 adapter 从目录 `catalogById(series_id).source.adapter` 推导（不再写死 `'akshare'`），按 adapter 分组后分别 `ingestEvidence`，解析失败的证据保留其 adapter；内容类型 JSON → `json_pointer`、HTML → `html_cell`（现有 `EXT`/MIME 白名单已含 json/html）；`cn-series.ts` function `http_json`/`http_html`（`cn-series/2`）；`collect.py` `requests.get` 经 `recording()`；主机白名单加 `www.chinamoney.org.cn`、`www.pbc.gov.cn`。
- 目录（D5）：`CN_LPR_1Y_Q`、`CN_LPR_5Y_Q`（event_source，policy_rate，event/day，period_end = 报价日，weight 0，immutable）；`CN_LPR_1Y`（active，weight 10）、`CN_LPR_5Y`（weight 0）：monthly，`month_end` from `_Q`。**`month_end` 的完成见证**：某月的月度行只在下一个月的报价出现后产生（`derive.ts` 规则），`available_at` 取见证观测；时钟/概览对"本月已报价、月度行未生成"显示 timeliness 文案 `awaiting_completion`（新增 `Timeliness` 值？——不改 `freshness.ts`（C6）之外：在 `views.ts`…亦 C6 红线。**P5 不新增该文案**，runbook §14 记录此延迟；D1 之后可在 views 加）。
- parser `chinamoney.ts`：行键 = 报价日；同键重复且值相同 → 计数；值不同 → `parse_failed:conflicting_rows`（拒绝整页）；表头精确匹配；fixture 原始字节。
- 事件：`deriveRateQuoteEvents`（`policy_rate_change`，effective_date = 报价日），`macro-events/2`，联合类型，消费者更新；US 不变。

### 5.4 社融（D0c → D3 → D5）

只采官方"同比增长（%）"列；行键 = 统计期（表标题中的年月）；同期多页（修订重发）→ 按页面发布日期升序，后者为新版本（`revisable`）；同页同期重复 → 拒绝；无同比列 → missing。

### 5.5 MLF（D0d → D4 → D5）

仅当列表页为表格：列 = 操作日期、期限、金额、中标利率；`CN_MLF_1Y_E` 一次操作一观测（行键 = 操作日 + 期限 1Y；同日多笔同利率 → 一条；不同利率 → 拒绝）；`CN_MLF_1Y` = `month_end` from `_E`（该月最后一次 1Y 操作），无操作月无行，完成见证延迟同 §5.3。

### 5.6 资产覆盖计划（同第 2 稿；不新增目录行）

### 5.7 F4 方法版本

| 身份 | 值 | 变化点 |
|---|---|---|
| 上游分类方法 `METHODOLOGY_VERSION`（快照 `methodology_version`） | `v1.0` | P5 不变（权重/规则未变） |
| 规则表 `RULES_VERSION` | `macro-regime-rules/1.0` | 不变 |
| 目录 `CATALOG_VERSION` | D1 → A；D5 → B | 每次目录改动 |
| F4 方法 `macro_regime@<v>` | v1 → v2（D1）→ v3（D5） | 跟随目录版本；公式不变 |
| 时钟视图 `macro-clock-view/1` | 不变 | — |

- v2 实现：`macro-regime.common.ts` 工厂 `macroRegimeMethod({version, catalogVersion, doc})`；`macro-regime.v2.ts` pin **字面量**（D1 合并前 `npx tsx` 算出），`deps` 与 v1 同列表；`module` 指向 v2 文件；测试：字面量 === 运行时 `CATALOG_VERSION`、新版本快照不弃权、旧版本弃权、`methodology-sync` 计划 = `register v2` 无 drift（v1 不在注册表）。
- v1 retire：迁移 `20261121090000` 内 `update public.judgment_methodologies set status='retired' where methodology_id='macro_regime' and version='v1'` + `insert into judgment_methodology_events(…event='status_changed'…)`（列按表定义）；v1 判断由解析器 `catalog_version_mismatch` → unavailable → 到期 void（已有行为，写入 v2.md）。
- v1 模块与 `macro-regime.v1.test.ts` 不改；新增 `macro-regime.v1.hash.test.ts`（D1 之前录制 v1 `formula_hash` 字面量；D1 后该测试断言 v1 的历史哈希等于录制值 —— 注意 D1 改变闭包后运行时哈希会变，故该测试在 D1 中改为比较 **fixture 内** 的历史哈希与迁移前记录，用作审计证据而非运行时断言）。
- 生产顺序：迁移（retire v1）→ 部署 → `sync-methodologies.ts`（register v2）→ cron/collector 发布新目录版本快照 → produce v2。

### 5.8 PR 矩阵与迁移

| PR | 目录版本 | F4 | 内容 |
|---|---|---|---|
| P5-D1 | A | v2 | D0、`method_manifest`、weekly、`official_http` 枚举与 ingest 分组、三条 FRED 序列、单位、transmission v2、F4 切换三常量、v1 retire 迁移、runbook |
| P5-D2 | 不改 | — | LPR parser + 采集器 http 分支 + fixture（目录、`cn-series.json` 不动；parser 直接以 fixture 字节单测） |
| P5-D3 | 不改 | — | 社融 parser + fixture |
| P5-D4 | 不改 | — | MLF parser + fixture（D0d 为表格时） |
| P5-D5 | B | v3 | 事件源行 + `source` + 翻 `active` + `cn-series.json` + 事件派生消费者 + 精确列表测试 + v3 |

迁移 `20261121090000_macro_p5_catalog.sql`：
```sql
do $$ declare c text; begin
 select conname into c from pg_constraint where conrelid='public.macro_series'::regclass and contype='c' and pg_get_constraintdef(oid) like '%native_frequency%';
 if c is not null then execute format('alter table public.macro_series drop constraint %I',c); end if;
 alter table public.macro_series add constraint macro_series_native_frequency_check check (native_frequency in ('daily','weekly','monthly','quarterly','event'));
 select conname into c from pg_constraint where conrelid='public.macro_evidence_objects'::regclass and contype='c' and pg_get_constraintdef(oid) like '%adapter%';
 if c is not null then execute format('alter table public.macro_evidence_objects drop constraint %I',c); end if;
 alter table public.macro_evidence_objects add constraint macro_evidence_objects_adapter_check check (adapter in ('fred_csv','akshare','official_http'));
end $$;
alter table public.macro_regime_results add column if not exists method_manifest jsonb check (method_manifest is null or jsonb_typeof(method_manifest)='object');
-- macro_retrievals.adapter 若有同类 CHECK 同法处理；publish RPC 增 p_method_manifest；v1 retire 两条语句
```
前后合法集合与验证 SQL（`select pg_get_constraintdef(oid) …`）写在迁移注释；`test:migrations` 追加。

### 5.9 测试（同第 2 稿 + 新增：ingest 混合 adapter 块；`compensate` v1→v2；transmission 清单版本分派；`month_end` 完成见证的 LPR/MLF 用例；`method_manifest` 写读）

---

## 6. 文件清单

WP-B：`src/lib/macro/{clock-view,clock-f4}.ts`(+tests)、`src/lib/macro/regime.rules-boundary.test.ts`、`src/app/api/macro/snapshots/[id]/clock/route.ts`(+test)、`src/components/macro/clock/{clock-model.ts,RegimeClockCard,QuadrantGrid,DecompositionTable,F4Strip}.tsx`、`clock/clock-imports.test.ts`、`RulesTable.tsx`、`MacroWorkbench.tsx`、`page.tsx`（rules prop）、`messages/*/macro.json`、`macro-messages.test.ts`、`pages.test.ts`、`testing/seed.ts`；删除 `MacroJudgmentSlot.tsx`、`judgment-view.ts`(+test)。
WP-C：`view-model.ts`、`KeyIndicatorCards.tsx`、`detail-model.ts`、`charts/{MacroLineChart.tsx,chart-geometry.ts}`、`IndicatorDetail.tsx`、`strategy-view-model.ts`、`strategy/{TransmissionFlow,PlaybookGrid,CycleReturnsTable,PolicyResponseMatrix}.tsx`、`messages/*/{macro,macroStrategy}.json`、`src/lib/macro/analysis-service.ts`(+test)、`src/app/api/macro/analyses/route.ts`（改调服务）、`src/app/api/macro/analyses/presets/route.ts`(+test)、`scripts/macro/bench-presets.ts`、`CorrelationWorkbench.tsx`、`CorrelationResult.tsx`。
WP-D：第 2 稿清单 + `src/lib/judgments/compensate.ts`、`strategy/{playbooks,deviations}.ts`、`macro-regime.v1.hash.test.ts`、`db.ts`/`db-contract.ts`（`publishSnapshot` 参数）、迁移。

---

## 7. Claude Design 画布

`https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH` P5 行（版本 17）：`Clock`、`ClockStates`、`OverviewP5`、`DetailP5`、`CorrelationP5`、`StrategyP5`、`ClockMobile`。第 3 稿差异（WP-B 开工前同步）：F4 行改为本模块类别标签；`ClockStates` 的 no_regime 画板改为 `f4_ineligible`（`abstain_reason: coverage_below_threshold`）且无数字；`reconcile_failed` 画板改为无数字版本。

---

## 8. 验收

记录格式同第 2 稿；"贡献算术"只由 `clock-view.test.ts` 证明，截图为视觉证据；基准脚本入库。

---

## 9. 不在本规格内

O1 publishable；O2/O3 指数权利与 DataGateway；方法 v1.1；QE/QT 事件定义；`Region` 扩展；Pink Sheet；北向资金；`awaiting_completion` 时效文案（需改 C6 文件，D1 后）。

---

## 10. 分期与 PR

P5-B；P5-C1（§4.1–4.3、4.5、4.6）；P5-C2（§4.4）；P5-D1；P5-D2；P5-D3；P5-D4；P5-D5。
