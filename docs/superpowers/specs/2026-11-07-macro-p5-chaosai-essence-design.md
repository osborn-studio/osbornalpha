# 宏观工作台 P5 · ChaosAI 精华吸收（美林时钟卡片 · 图表组织 · 数据缺口）设计规格

日期：2026-11-07（第 1 稿）；第 2 稿（同日，处置 mmx 第一轮 48 项与 Codex gpt-6-astra 第一轮 27 项，见 §0.1）
状态：第 2 稿，待第二轮审计（审计记录 `docs/audits/2026-11-07-macro-p5/`）
前置：`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（P1+P2，第 6 稿）、`docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md`（P3+P4，第 3 稿）、F4 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md`
研究输入：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`（我方 11-04 实证拆解）、`docs/research/chaosai-macro-2026-11-07/handoff-chatgpt-2026-11-07.md`（owner 委托 ChatGPT 的 11-07 交接，含两国贡献矩阵与验收表）
总纲（硬约束）：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 —— 只用一手来源、每个数字可复算、事实与判断分离、缺失保持缺失（不插值不补零）、zh/en、`DESIGN.md` 令牌、每个页面 UI 先上 Claude Design 画布再写代码。
基线提交：本工作树基于 `origin/main` `1e9cfb87`（PR #121 合并后）。生产：`osbornalpha.com/intel/macro`，`MACRO_STRATEGY_ENABLED=1`，`MACRO_JUDGMENTS_ENABLED` 未设（判断层关闭）。

---

## 0. 一页结论

1. **不写第二套评分引擎，客户端不评估任何规则。** 美林时钟的权重、类型化规则、逐项贡献、归一化、主次状态、覆盖率已经在 `src/lib/macro/regime.ts`（`classifyRegime`）里，并在每次快照发布时（`snapshots.ts::publishRegion`）与快照一同冻结进 `macro_regime_results`。P5 只在**服务端**把这份冻结结果投影成 ChaosAI 式的"判定 → 四象限 → 前三驱动 → 可展开分解 → 证据"阅读路径，并在服务端对账：卡片数字 = 展开表合计。
2. **展示的门槛是既有发布条件，不是新门槛。** 四象限与分解只在两件事同时成立时出现：服务端开关 `MACRO_JUDGMENTS_ENABLED=1`，**且** F4 对当前活动快照存在一张可发布（`publishable=true`）、生命周期合格的 `macro_regime` 判断卡（P1 §3.2、runbook §12、F4 §4.1）。分解是那张卡的"依据"，不是独立于 F4 的事实。F4 无卡 / 对应更早快照 / 不可用 → 只显示状态，不显示任何象限、分数、占比、覆盖、贡献。
3. **差距分三类：展示（WP-B、WP-C）、数据（WP-D）、方法（不在本规格内，见 §9）。** 现有图表、周期、事件、关联、传导、历史矩阵全部已上线，缺的是组织方式。
4. **ChaosAI 只借信息架构，不借数据与规则。** 其公开快照有可复算错误（UNRATE 2020-04 = 2.8、CN GDP 月度点、DGS10−DFF 冒充中美利差、规则按数值派发），本规格不引用其任何数值。
5. **跨模块硬约束（§2.5）**：目录任何改动 → `CATALOG_VERSION` 变 → F4 `macro_regime@v1` 固定的目录版本失配且 v1 的 `formula_hash` 漂移，所以 WP-D 的每一次目录版本变更都伴随一个新的 F4 方法版本；WP-B 不得改动 v1 `deps` 列出的文件；权重/阈值/规则改动 = 方法版本改动，不在 P5 内做；判断层数字只在服务端路由经开关出现，客户端永不读开关、永不自算。

### 0.1 第 2 稿处置（`02-spec-round1-codex.md` C1–C27，`03-spec-round1-mmx.md` M1–M48）

| 来源 | 处置 | 落点 |
|---|---|---|
| C1 / M1（D1 绕过发布资格） | 接受。时钟卡 = F4 `macro_regime` 判断卡 + 其依据；无可发布且同快照的卡 → 无数字 | §2.4、§3.1、§3.6 |
| C2 / M2 / M9 / M30（客户端 `matchRule`、重选观测、`Number` 判定） | 接受。投影全部在服务端 `clock-view.ts`（新路由 `GET /api/macro/snapshots/[id]/clock`）；客户端只排版；不重选观测、不判定规则；未命中行只标"未命中"，不猜原因 | §3.2、§3.3 |
| C3 / M3 / M31 / M32（"快照时权重"不存在；目录状态非冻结） | 接受。时钟只服务**活动快照且 `catalog_version === CATALOG_VERSION` 且 `methodology_version === METHODOLOGY_VERSION` 且 `rules_version === RULES_VERSION`** 的情形；否则 `version_unsupported`，无数字。在此前提下当前代码的权重/目录状态就是快照时的 | §3.3、§3.6 |
| C4（comparison_missing 定义不一致） | 接受。删除 `comparison_missing` / `no_rule` 的猜测；统一为 `not_matched`，并列出快照里存在的比较观测 | §3.3 |
| C5 / M24（比较口径、精度、轴公式文字） | 接受。规则输入值与显示变化分开标注；精度契约 §3.5；修正通胀轴文字 | §2.1、§3.3、§3.5 |
| C6 / M4 / M10（no_regime 原因、记录缺失） | 接受。`regime_status: classified \| coverage_below_threshold \| zero_score \| record_missing`，服务端判定并返回 | §3.3、§3.6 |
| C7 / M8 / M40（对账不完整、舍入） | 接受。对账不变式扩为 7 条（§3.4），容差按 r6 舍入次数定义；每条配故意破坏用例 | §3.4、§3.8 |
| C8 / M7（F4 卡契约、排序并列） | 接受。读 `cards[].inputs[]{kind:'macro_snapshot',ref:{snapshot_id}}`、方法 id/version、生命周期；排序键与并列规则固定 | §2.3、§3.3 |
| C9（categorical 无概率路径） | 接受。删除"校准概率"行；时钟永不出现百分比以外的"概率"字样；F4 卡 display 原样渲染（categorical 无 percent） | §2.4、§3.5 |
| C10 / M25（禁词、方法页门控） | 接受。禁词扩为"概率\|置信度\|可靠度\|预测"；唯一豁免键 `judgment.clock.notProbability`；方法页规则表随 `judgmentsEnabled` 挂载并测关态 | §3.5、§3.8 |
| C11 / C12 / C13 / M11 / M12（v1 hash 漂移从 WP-B 开始；v2 实现；v1 回放） | 接受。WP-B 不触碰 v1 `deps` 与闭包（§2.5 C6）；v2 为独立工厂模块；v1 判断在目录变更后由解析器 `catalog_version_mismatch` → unavailable → 到期 void（已有行为）；方法键 `macro_regime@v2` | §2.5、§5.7 |
| C14 / C15 / C16 / M20 / M21 / M35（预设路由可重放、memo、配额语义） | 接受。响应含完整冻结输入回执；按钮改"重新计算并保存"；明确修订 P1 §3.4 的"不自动重算"；鉴权、白名单、成本测量方法固定 | §4.4 |
| C17（大图卡两个"当前值"） | 接受。嵌入的 `IndicatorDetail` 以快照 `created_at` 作 `asOf` | §4.1 |
| C18 / M48（WTREGEN 单位、RRP 口径） | 接受。WTREGEN `usd_mn`；每条序列的单位/口径以 FRED 序列页元数据逐字记录 | §5.2 |
| C19 / M18（month_end 语义） | 接受。派生行按选择规则命名（"月内最后一次周观测"），不称"月末" | §5.2 |
| C20 / M22（迁移 CHECK 清单） | 接受。列出真实约束名与前后合法集合 | §5.8 |
| C21（adapter 路由不完整） | 接受。`official_http` 的全链路契约；Pink Sheet 不实现 | §5.3、§5.6 |
| C22 / M17（LPR 日期）；C23 / M14 / M15（MLF 延续、html_text） | 接受。LPR/MLF 原生为报价/操作日事件序列，月度评分行用**现有** `month_end`（"该月最后一次报价/操作"），无操作的月保持缺失；**删除 `effective_interval` 与 `html_text`**；MLF 解析改为公告列表页表格（`html_cell`）或核实失败则保持缺失 | §5.3、§5.5 |
| C24 / M37（社融余额派生） | 接受。只采 PBOC 表中官方公布的同比增速列；无则缺失；删除余额派生回退 | §5.4 |
| C25 / M38（HK / Pink Sheet 无 region） | 接受。P5 不新增这些目录行；资产计划只作为方法页文案 | §5.6 |
| C26 / M13（PR 顺序、missing+source 违反 CHECK） | 接受。目录版本矩阵：v2（D0+美国流动性）、v3（中国序列一次翻 active）；missing 行 `source:null` | §5.7、§10 |
| C27 / M28 / M41 / M42（验收可证明性、画布） | 接受。画布已发布并回填（§7.1）；验收记录格式 §8；新增派生链的 cutoff 回归 | §7、§8 |
| M5 / M39（by_state 权重、observation_ids 语义） | 接受。`by_state` 只覆盖 `WEIGHTS_V1` 行；D0 的 manifest 语义变更明确为 v2 的一部分 | §3.3、§5.2 |
| M6（规则版本不匹配时的行状态） | 已被版本门槛覆盖（不匹配 → 无数字） | §3.6 |
| M16（FRED 不是原发布机构） | 既有目录模型已区分 `publisher`（Board/FRBNY）与 `via`（FRED）；补"FRED 序列页权利字段核实"任务 | §5.2 |
| M19（catalogItemsOf 改动是 manifest 变更） | 接受，归入 D0 / v2 | §5.2 |
| M23（HTML 解析确定性） | 接受。每个 parser 的行键、排序、重复、空值规则 | §5.3–§5.5 |
| M27（not_in_catalog 列来源） | 说明：历史表列全为目录 id；`not_in_catalog` 只在政策反应维度配置里是真实条目 | §4.6 |
| M29（unit nullable）、M33（事件去重）、M34（条形缺值）、M36（COSD）、M43（localStorage 键）、M44（a11y）、M45–M47 | 接受，逐条写入对应小节 | §3.3、§4.2、§4.3、§5.2、§3.1、§3.5、§4.5 |
| M26（规则类型回归） | 接受。补显式边界测试（fx 值落在利率区间、GDP 不进 PMI 规则） | §3.8 |

---

## 1. WP-A · 基线：ChaosAI 各板块对照矩阵（2026-11-07 核实）

状态口径：**live** = 生产可见；**merged** = 已在 `main`，生产未开或未部署；**open PR** = 未合并；**not impl** = 代码不存在。ChaosAI 侧按 `MACRO_STRATEGY_DEEP_DIVE.md` §2 的七个区块与 §5–§8 细项拆开。

| # | ChaosAI 子板块 | 我方对应能力 | 状态 | 差距性质 | 归属 |
|---|---|---|---|---|---|
| 1a | 美林时钟 · 判定头（当前象限 + 备选 + GDP↑/CPI↑ 徽标） | `RegimeResult.{primary_state,secondary_state,growth_axis,inflation_axis}`，存于 `macro_regime_results.regime`；`GET /api/macro/snapshots/[id]` 在开关开时返回；F4 `macro_regime@v1` 判断卡（categorical，`scores_are_not_probabilities`） | merged（开关关、方法 `publishable=false` → 生产不可见） | 展示 + 发布资格（owner） | WP-B |
| 1b | 四张象限卡 + 百分比 | `RegimeResult.norm`（规则得分占比）、`scores`、`margin_pp`、`coverage`；F4 claim `distribution` | merged | 展示 + 命名（不得叫概率） | WP-B |
| 1c | "查看定量分解"展开表 | `RegimeContribution[]`（`series_id, observation_id, rule_id, weight, support, contribution{4}`）；`MacroJudgmentSlot` Basis 表只显示 `series_id`/`rule_id`/`weight`/非零贡献 | merged（技术表格） | 展示：可读名、值、期、比较观测、规则中文、支持系数、证据入口、服务端对账 | WP-B |
| 1d | 偏差案例库 | `strategy/deviations.ts` + `DeviationCases.tsx` | merged | — | 不动 |
| 1e | 判定方法论页 | `/intel/macro?tab=methodology`；F4 `docs/methodologies/macro_regime/v1.md` | live | 规则表中文化在 WP-B 一并给出（随开关挂载） | WP-B |
| 1f | 资产配置模板与超/低配行业 | **无**；P3 `playbooks-v1.ts` 只有"受益/受损资产（假设）" | not impl（有意） | 本规格明确**不做**（§3.7） | — |
| 2a | 指标汇总表 | `IndicatorTable` | live | — | 不动 |
| 2b | 指标大卡（历史线 + 周期色带 + 事件 + 周期内资产 + 来源行） | `IndicatorDetail` + `MacroLineChart` + 表格视图；概览只有"行选中 → compact 预览" | live | 组织：概览缺大图卡入口；FOMC 圆点过密；资产表不可横向比较 | WP-C |
| 2c | Pearson Top-6 卡 + 拟合分析 | `CorrelationWorkbench`（预填 8 组表单，不自动跑）+ `CorrelationResult` | live | 首进无结果卡 | WP-C |
| 3a | 中国"利率三合一"卡（MLF / LPR 1Y / LPR 5Y） | `CN_LPR_1Y`、`CN_MLF_1Y` 为 `missing`；无 `CN_LPR_5Y` | not impl（数据） | 数据 + 目录 | WP-D |
| 3b | 社融存量同比 | `CN_AFRE_STOCK_YOY` 为 `missing` | not impl（数据） | 数据 | WP-D |
| 4a | 六段实时传导流 | `strategy/transmission.ts` + `TransmissionFlow.tsx`（六态） | live | 可读性：每条边"机制假设：机制假设：…"重复；节点字段全展开 | WP-C |
| 4b | 流动性节点（RRP/TGA、M2/社融、信用利差） | US 流动性段为 `not_in_catalog`；WALCL 未入目录；信用利差无权利已确认序列 | not impl（数据） | 数据 | WP-D |
| 4c | 四象限剧本 + 当前剧本 | `PlaybookGrid` | live | 文案重复 | WP-C（轻） |
| 5 | 联储 → 中国资产 | `PolicyResponseMatrix`（加息/降息/QE-QT × 9 维度） | live | 权益两列受限；QE/QT 行无资产负债表序列 | WP-C（切换）+ WP-D（WALCL） |
| 6 | 历史：周期 × 13 资产表 | `CycleReturnsTable`（三种边界、九列，后四列 restricted） | live | 受限列占视野；港股/黄金/铜/债券总回报无目录项 | WP-C（切换）+ §5.6（计划） |
| 7 | 页脚总来源声明 | `SourceFooter` + `SourceDrawer` | live | — | 不动 |
| — | 月度复盘（ChaosAI 无） | `review.ts` + `/intel/macro/review` | live（数据不足） | 时间积累 | 不动 |

在飞行中、本规格**不触碰**的文件：PR #125（`claude/integ-f4-macro`：`src/lib/judgments/{deps,inputs-db}.ts`、`src/app/api/judgments/[id]/route.ts`、`src/app/api/macro/{series,snapshots}/[id]/route.ts` 改为经 `macroJudgmentsEnabled()` 读开关）、#123/#124、`claude/macro-strategy-latency`（`db.ts` 分页并行、`strategy/port.ts` memo）、foreign research（`20261119*`）。P5 对 `snapshots/[id]/route.ts` 不改动（时钟走新路由 §3.2），避免与 #125 冲突。

---

## 2. 时钟数据契约（代码实际暴露的）

### 2.1 计算（`src/lib/macro/regime.ts`，纯函数，方法 `METHODOLOGY_VERSION='v1.0'`，规则表 `RULES_VERSION='macro-regime-rules/1.0'`）

- 输入 `RegimeInput{region, series:Record<id,{latest, prev?, prev3m?}>}`，每个 `ObsRef={observation_id, period_end, value_text}`。
- 每个 `WEIGHTS_V1` 中属于该地区的序列：目录 `status==='active'` 且 `type` 非空且 `weight>0` 才参与；`comparisons()` 把 `value_text` 转 `Number`（唯一的转换边界），`d1 = latest − prev`（序列单位的差，**百分点**，不是 bp），`d3 = latest − prev3m`（fx 用百分比变化 `yoyPct`）；比较期缺失 → `null`，需要它的规则不命中。
- `matchRule(type, v, d3, d1)`：只在**自己类型**的规则里找第一条命中（类型内规则互斥）。
- `contribution[i][q] = r6(weight_i × support_rule(i)[q])`（r6 = 四舍六入到 1e-6）；`scores[q] = r6(Σ_i 未舍入贡献)`；`matched = Σ 命中权重`；`denominator = Σ regionWeights`（含 missing/restricted 项的权重）；`coverage = r6(matched/denominator)`；`uncoveredWeight = r6(denominator − matched)`。
- `coverage < 0.6` 或 `Σ scores ≤ 0` → `regime = null`（贡献与 `uncoveredWeight` 仍返回、仍存储）。
- `norm[q] = r6(scores[q]/Σ scores)`；`pickStates`：`primary = argmax`（并列按 `REGIMES` 顺序 recovery<overheat<stagflation<recession 取先者）；`secondary = 其余中 norm>0 的最大者`（同一并列规则），无则 `null`；`margin_pp = r6(100×(norm[primary] − (norm[secondary] ?? 0)))`。
- `growth_axis` = pmi/labor_rate/growth_yoy 命中项的 `weight×(support.recovery+support.overheat−support.stagflation−support.recession)` ÷ 这些项的权重和；`inflation_axis` = inflation_yoy 命中项的 `weight×(support.overheat+support.stagflation−support.recovery−support.recession)` ÷ 其权重和。范围 [−1,1]，**不是 GDP/CPI 实测值**。
- 权重：US 合计 100（DFF 25、DGS10 15、DTWEXBGS 10、CPI 15、UNRATE 10、PPI 5、ISM 15、VIX 5）；CN 合计 125（CPI 10、PPI 15、PMI 15、GDP 5、M2 10、出口 10、中债 15、人民币 5、LPR 1Y 10、MLF 10、社融 20）。目前 US 分母含 ISM（missing，15）+ VIX（restricted，5）→ 最大 coverage 0.80；CN 分母含 LPR 1Y/MLF/社融（missing，40）→ 最大 coverage 0.68。
- `RULES[type][].label:{zh,en}` 已存在；展示层按 `rule_id` 查表，只在 `rules_version === RULES_VERSION` 时（§3.3 版本门槛）。

### 2.2 冻结与存储（`snapshots.ts`、迁移 `20261114090000_macro_workbench.sql`）

- `buildRegimeInput(db, region)`：对 `regimeInputsOf(region)` 取 `latestEligible`；`prev` = 24 个月窗口内最近一条更早期（**不保证严格相邻月**）；`prev3m` = 恰好三个月前的 `period_end`（季度序列为上一季度）；三者全部进入 `snapshot.observation_ids`（所以 manifest 里每个评分序列至多 3 条观测）；另取 24 点进入 `history_ids`。
- `publishRegion` 在同一事务里写 `macro_snapshots`（含 `methodology_version, catalog_version, observation_ids[], history_ids[], catalog_counts, status`）与 `macro_regime_results`（`snapshot_id PK, region, regime jsonb|null, contributions jsonb[], rules_version, uncovered_weight`）。`macro_regime_results` 只授 service_role；读取只经 `db.regimeOf(id)`（admin client，服务端）。
- `macro_series` 镜像表以 `id` 为主键、带 `catalog_version` 外键，但只保存**当前**目录（`upsertCatalog` 覆盖）；没有按版本保存的历史目录。这是 §3.3 版本门槛的直接原因。
- 快照不论 coverage 都发布；`regime=null` 只表示这一快照不产生判定。判断开关不影响计算与存储（runbook §12），只影响读取与展示。

### 2.3 读取（路由）

| 路由 | 返回 | 开关 |
|---|---|---|
| `GET /api/macro/overview?region=US\|CN` | `Envelope{snapshotId, asOf, catalogVersion, methodologyVersion, collection[], indicators[]…, changes, catalogCounts}` | 无判定字段（任何开关下） |
| `GET /api/macro/snapshots/[id]` | `{catalogVersion, snapshot, observations[]}` + **开关为 `1` 时** `{regime, contributions, rulesVersion, uncoveredWeight}` | `macroJudgmentsEnabled()` |
| `GET /api/macro/series/[id]?from&to&asOf&transform` | `SeriesJson`；`asOf` ⇒ `available_at ≤ asOf` | weight 字段 |
| `GET /api/judgments?subject_type=macro_region&subject_key=US[&types=macro_regime]` | `{subject, asOf, view, cards[]}`；每张 `JudgmentCard{judgment_id, kind:'categorical', lifecycle, calibration, as_of, methodology{id,version,title,href}, display{headline:'判定：复苏'…, percent:null, value:<selected>}, inputs[]{kind:'macro_snapshot'\|'macro_observation', ref:{snapshot_id}\|{observation_id}, available_at, origin, href}, abstain_reason?}`；**只含 `publishable=true` 方法**的卡（RLS） | F4 RLS |
| `GET /api/judgments/[id]` | `{card, judgment{claim:{selected, classes, distribution, scores_are_not_probabilities:true, margin_pp, catalog_version}, inputs, …}, settlements, calibration}` | F4 RLS |

### 2.4 决策 D1（第 2 稿）：时钟 = F4 判断卡 + 其依据；发布资格来自 F4

- **挂载条件**（全部成立才显示任何象限/分数/占比/覆盖/贡献）：
  1. 服务端 `macroJudgmentsEnabled()`（`page.tsx` 传入）；
  2. 概览活动快照 `S`，且 `S.catalog_version === CATALOG_VERSION`、`S.methodology_version === METHODOLOGY_VERSION`、`macro_regime_results.rules_version === RULES_VERSION`（§3.3 版本门槛）；
  3. `GET /api/judgments?subject_type=macro_region&subject_key=<region>&types=macro_regime` 返回一张卡 `J`：`methodology.id==='macro_regime'`、`methodology.version` ∈ 当前注册表（P5-B 时为 `v1`；WP-D 后为当前版本）、`lifecycle ∈ {open, settled, pending_fill}`、`inputs` 含 `{kind:'macro_snapshot', ref:{snapshot_id: S.snapshot_id}}`；
  4. `GET /api/judgments/<J.judgment_id>` 的 `judgment.claim` 与 `S` 的冻结结果一致（§3.4 不变式 7）。
- 卡片内容：F4 `display.headline`（"判定：复苏"，categorical 永无 percent）、生命周期、校准状态、方法入口原样渲染（P1 §3.2）；四象限的占比 = `claim.distribution`（与快照 `norm` 相等，服务端已校验）；分解表 = `macro_regime_results.contributions` 的服务端投影（§3.3）。
- 不满足条件时的状态（§3.6）只显示状态文案，**不显示数字**；F4 读取失败不回退到快照数字（P1 §3.2）。
- **生产后果（owner 事项 O1）**：`macro_regime@v1` 现为 `publishable=false`，所以即使设 `MACRO_JUDGMENTS_ENABLED=1`，时钟也只会显示"F4：无已发布判断"。让时钟出现的既有发布条件 = owner 运行 `scripts/judgments/sync-methodologies.ts --publishable macro_regime@v1 "<确认文本>"`（并确认 `docs/methodologies/licenses.json` 的来源许可），这不属于 P5 代码范围。P5 用本地冻结样本（§3.8）验证全部状态。
- "概率"二字在时钟卡内**不出现**；唯一含"概率"的文案是豁免键 `judgment.clock.notProbability`（"规则得分占比，不是概率"）。

### 2.5 跨模块硬约束

| 约束 | 事实 | 后果 |
|---|---|---|
| C1 目录即版本 | `CATALOG_VERSION = 'macro-catalog/' + sha256(canonicalJson(MACRO_CATALOG))[0:12]`，现值 `macro-catalog/30bcaa2a33c5`；F4 `macro-regime.v1.ts` `params.catalog_version` 固定同值，`gather`/`compute` 对其他版本 `abstain('upstream_version_mismatch')` | 目录每变一次版本 → F4 新方法版本（§5.7） |
| C2 方法即版本 | `METHODOLOGY_VERSION='v1.0'`、`RULES_VERSION`、`WEIGHTS_V1` 冻结；`classifyAsOf` 对非 `v1.0` 抛 `methodology_mismatch` | P5 不改权重、阈值、规则；`CN_LPR_5Y` 以 `weight:0` 入目录 |
| C3 开关只在服务端 | `pages.test.ts` 断言只有 `page.tsx` 读 `macroJudgmentsEnabled()`；组件不得含 `MACRO_JUDGMENTS_ENABLED` 字面量（含注释） | 时钟组件以 `judgmentsEnabled` prop 挂载，数据来自路由 |
| C4 冻结清单不变 | P3/P4 manifest hash、回放 fixture 不得变 | WP-C 列切换是纯展示过滤 |
| C5 数值十进制 | `value_text` 全链路十进制；只在分类/统计边界转 `Number` | 展示层四舍五入不回写、不重算 |
| C6 v1 公式哈希 | `formulaHashOf` 哈希 v1 模块的 import 闭包（`regime.ts`、`catalog.ts`、`decimal.ts`、`judgment-contract.ts`、`types.ts`…）**加** `deps` 显式列出的 `src/lib/macro/{read-api,flags,snapshots,freshness,db}.ts`、`src/lib/dq/freshness.ts`；任一文件改动 → `methodology-sync` 判 drift，整个同步被拒 | **WP-B / WP-C 不得改动上述任何文件**（时钟投影放在新文件 `clock-view.ts`，路由新建；`snapshots.ts` 不重构）；WP-D 改 `catalog.ts`/`types.ts` 时同 PR 注册新方法版本并把 v1 移出 `REGISTRY` |

---

## 3. WP-B · 美林时钟卡片与定量分解

### 3.1 位置与挂载

`MacroWorkbench` 概览 tab，`judgmentsEnabled` 为真时，在 `ChangesCard`/`CatalogCoverage` 网格之下、指标表之上，新组件 `RegimeClockCard`（`src/components/macro/clock/RegimeClockCard.tsx`）**替换** `MacroJudgmentSlot` 的挂载位置；`MacroJudgmentSlot.tsx` 与 `judgment-view.ts` 在 WP-B 末任务删除（其 `parseJudgments` 的校验逻辑迁入 `clock/f4-card.ts` 并按 §2.3 的真实卡片契约重写）。默认**展开**；折叠偏好存 `localStorage` 键 `macro.clock.expanded.<region>.v1`（读写失败忽略；SSR 首屏按默认展开渲染，水合后再应用偏好，不存任何业务数字）。

### 3.2 数据流

```
page.tsx（服务端读开关）→ MacroWorkbench(judgmentsEnabled)
  → useMacroOverview → env.snapshotId
  → RegimeClockCard(region, snapshotId)
      → GET /api/macro/snapshots/{id}/clock       （新路由；服务端：开关检查 → 版本门槛 → F4 卡匹配 → 投影 + 对账；一次响应）
      → 客户端只做：排版、折叠、定位高亮、drawer 打开
```

`GET /api/macro/snapshots/[id]/clock`（`src/app/api/macro/snapshots/[id]/clock/route.ts`）：`requireSessionUser` → 开关关 → 404 `judgments_disabled`（与 `judgmentGate` 一致）→ `db.snapshot(id)`（404 `not_found`）→ 版本门槛（不满足 → 200 `{status:'version_unsupported', …}`）→ `db.regimeOf(id)` → F4 卡（经 `f4-client.ts` 同样的 fail-closed HTTP 读法：`/api/judgments` 列表 + `/api/judgments/[id]` 详情，超时 3 s）→ `buildClockView(...)`（`src/lib/macro/clock-view.ts`，纯函数，服务端）→ `okJson(view)`。响应头 `Cache-Control: private, no-store`。

### 3.3 `ClockView`（`src/lib/macro/clock-view.ts`，版本 `macro-clock-view/1`，服务端纯函数）

```ts
export type ClockStatus='ok'|'version_unsupported'|'record_missing'|'coverage_below_threshold'|'zero_score'|'f4_none'|'f4_earlier'|'f4_ineligible'|'f4_unavailable'|'f4_mismatch'|'reconcile_failed';
export interface ClockRow{
 series_id:string;name:Bilingual;type:SeriesType;weight:number;                 // 只含 WEIGHTS_V1 的该地区行；weight 来自 regionWeights（版本门槛保证 = 快照时）
 state:'matched'|'not_matched'|'no_data'|'missing'|'restricted';
 latest:{observation_id:string;period_end:string;value_text:string;version:number}|null;   // matched：贡献行的 observation_id；not_matched：该序列在 manifest 中 period_end 最大者（manifest 已是冻结的 eligible 集合，不再选择）；其余 null
 unit:string;                                                                     // 目录单位（缺失/受限行也有）
 comparisons:{observation_id:string;period_end:string;value_text:string;role:'prev3m'|'prev'}[];   // manifest 中同序列的其他观测，按 period_end 升序；role 由日期决定：period_end === shiftMonthEnd(latest,−3) → prev3m，否则 prev（最多各一条）
 display_change:{kind:ChangeKind;value_text:string}|null;                         // 相对 comparisons 中 role=prev 的显示变化（changeOf 口径：bp/pp/pct/points），与规则输入分开
 rule:{id:string;label:Bilingual;support:Record<Regime,number>}|null;            // matched 才有；label 从 RULES 查（版本门槛保证可查）
 contribution:Record<Regime,number>|null;                                         // matched 才有，原样来自存储
 reason:Bilingual|null;                                                           // missing/restricted 的目录理由
}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}
export interface ClockView{
 status:ClockStatus;snapshot:{id:string;region:Region;as_of:string;created_at:string;methodology_version:string;catalog_version:string;rules_version:string|null};
 f4:{status:'card'|'none'|'earlier'|'ineligible'|'unavailable';card:JudgmentCardView|null;judgment_id:string|null;earlier_snapshot_id:string|null}|null;   // null 当开关关（不会到客户端）
 regime:RegimeResult|null;quadrants:QuadrantView[]|null;rows:ClockRow[];non_scoring:{series_id:string;name:Bilingual;latest:ClockRow['latest'];unit:string}[];   // non_scoring = manifest 中不在 WEIGHTS_V1 的指标（WP-D D0 之后才会出现）
 coverage:{matched_weight:number;denominator:number;coverage:number;uncovered_weight:number;by_state:Record<ClockRow['state'],{count:number;weight:number}>}|null;
 reconciliation:ReconciliationReport|null;   // §3.4
 axes:{growth:number|null;inflation:number|null}|null;
}
```

规则：
- `rows` 恰好 = `regionWeights(region)` 的键（每个评分序列一行，互斥状态）：目录 `missing` → `missing`；`restricted` → `restricted`；在 `contributions` 中 → `matched`；manifest 中有该序列观测但不在 `contributions` → `not_matched`（**不猜原因**；比较观测照列，脚注"规则未命中：值不在任何区间，或规则所需的比较期缺失"）；manifest 中无该序列 → `no_data`。`by_state.weight` 按此分组求和，`Σ by_state.weight === denominator`。
- `quadrants`：`score/norm` 原样来自存储；`rank` 由存储的 `primary_state`/`secondary_state` 决定，其余 `other`；`drivers` = 该象限 `contribution>0` 的行，按 (`contribution` desc, `weight` desc, `series_id` 字典序) 取前三；不足三项就少列。
- `regime_status` 判定（服务端）：`regimeOf` 为 null → `record_missing`；`regime===null` 且 `(denominator−uncovered_weight)/denominator < 0.6` → `coverage_below_threshold`；`regime===null` 且 coverage ≥ 0.6 → `zero_score`；否则 `classified`。`quadrants/axes/reconciliation` 在非 `classified` 时为 null；`rows/coverage` 仍返回（分解可看，无象限数字）。
- 版本门槛失败 → `status:'version_unsupported'`，`rows=[]`、`coverage=null`，并带 `snapshot` 元数据（供状态文案显示两个版本）。
- F4 匹配失败按 §2.4 条件 3/4 分别产生 `f4_none`（空列表）、`f4_earlier`（有卡但 `ref.snapshot_id ≠ S`）、`f4_ineligible`（同快照但生命周期为 abstained/void/withdrawn，附 `abstain_reason`）、`f4_unavailable`（读取失败/超时/畸形）、`f4_mismatch`（claim 与存储不一致，§3.4 不变式 7）。这些状态下 `regime/quadrants/rows/coverage/reconciliation/axes` 全部 null（不传数字到客户端）。

### 3.4 对账（服务端，`ReconciliationReport`）

容差：贡献与分数都已 r6；`Σ_i r6(c_i)` 与 `r6(Σ_i c_i)` 的差最多 `n × 0.5e-6`（n = 命中行数）。定义 `tol = (n+1) × 1e-6`。

| # | 不变式 | 失败 → |
|---|---|---|
| 1 | `contributions` 中 `series_id` 唯一，且每个 `observation_id` 属于 `snapshot.observation_ids` 且该观测的 `series_id` 相同 | `reconcile_failed` |
| 2 | 每格 `|contribution[q] − r6(weight × support[q])| ≤ 1e-6`，`weight === regionWeights[series_id]` | 同上 |
| 3 | 每象限 `|Σ_i contribution_i[q] − scores[q]| ≤ tol` | 同上 |
| 4 | `|Σ matched weight + uncovered_weight − denominator| ≤ 1e-6`，`|coverage − r6(matched/denominator)| ≤ 1e-6` | 同上 |
| 5 | `|norm[q] − r6(scores[q]/Σ scores)| ≤ 2e-6`；`pickStates(norm)` 重算的 primary/secondary 与存储一致；`|margin_pp − r6(100×(norm[p]−(norm[s]??0)))| ≤ 1e-4` | 同上 |
| 6 | `growth_axis`/`inflation_axis` 用存储的 `support` 与 `weight` 重算（§2.1 公式），差 ≤ 1e-6 | 同上 |
| 7 | F4 `claim.selected === regime.primary_state`，`claim.distribution[q]` 与 `norm[q]` 差 ≤ 1e-6，`claim.catalog_version === snapshot.catalog_version`，`|claim.margin_pp − regime.margin_pp| ≤ 1e-4` | `f4_mismatch` |

`reconcile_failed` 时响应仍带全部数字 + `reconciliation.failures[]`（不变式编号、涉及的 id、差值），卡片顶部警示条"分解与分数不一致，请报告"，数字照常显示、不改、不隐藏。

### 3.5 UI（画布 §7；文案全部在 `messages/{zh,en}/macro.json` 的 `judgment.clock.*`）

```
┌ 美林时钟 · 美国                                 快照 2026-11-07 · 方法 v1.0 · 规则表 1.0 · 目录 30bcaa2a33c5 ▸ 方法与来源 ┐
│ F4 判定：复苏 · 已发布 · 待结算 · 校准：样本不足 n=14 · macro_regime v1 ▸                                       │
│ 主状态  复苏 38.2%   次状态 过热 29.1%   主次差距 9.1 pp   覆盖 60/100（命中 4 · 未命中 2 · 缺失 1 · 受限 1）   │
│ 规则得分占比，不是概率 · 增长轴 +0.32 · 通胀轴 −0.10（规则支持度合成，非实测）                                  │
│ ┌ 复苏 ◆ 主 ──────────┐ ┌ 过热 次 ─────────────┐ ┌ 滞胀 ────────────────┐ ┌ 衰退 ────────────────┐            │
│ │ 38.2% · 分 21.0      │ │ 29.1% · 分 16.0      │ │ 17.3% · 分 9.5       │ │ 15.5% · 分 8.5       │            │
│ │ 1 联邦基金利率  7.5  │ │ 1 10Y 收益率   7.5   │ │ 1 10Y 收益率   4.5   │ │ 1 PPI 同比    3.5    │            │
│ │ 2 CPI 同比      6.0  │ │ 2 联邦基金利率 5.0   │ │ 2 联邦基金利率 2.5   │ │ 2 联邦基金利率 2.5   │            │
│ │ 3 失业率        5.0  │ │ 3 CPI 同比     4.5   │ │ 3 CPI 同比     1.5   │ │ 3 CPI 同比    1.5    │            │
│ └─────────────────────┘ └─────────────────────┘ └─────────────────────┘ └─────────────────────┘            │
│ ▸ 定量分解（8 项）                                                                                            │
│   指标 | 当前值 | 单位 | 数据期 | 快照中的比较观测 | 显示变化 | 命中规则 | 权重 | 支持系数 复/热/滞/衰 | 贡献 复/热/滞/衰 | 证据 │
│   … 合计 | 命中 60 / 100 | 21.0/16.0/9.5/8.5 = 分数 ✓ | 归一化 38.2/29.1/17.3/15.5 ✓                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

（示例数字为画布示意，不是任何真实快照。）

- 象限卡四张等宽；主状态卡 `--border-active` + `--accent-wash`，次状态卡 `--border-active` 无底色，其余中性；**不用四色**（DESIGN.md "单一铜色"）。圆角 6px（DESIGN.md 按钮 6 / 卡 8：象限卡按"按钮级"6px 以免 ≥ 8px 禁令争议）。所有颜色经 `globals.css` 令牌（`--accent`、`--accent-wash`、`--border-active`、`--warn`、`--text-dim`、`--bg-elevated`），不写十六进制。
- 卡内"前三驱动"：名称（按 locale）+ 该象限贡献（Geist Mono，2 位小数），点击 → 展开分解表（若折叠）、`scrollIntoView`、`focus` 该行、`aria-controls`/`aria-expanded` 关联、高亮 2 s。键盘可达（按钮元素）。
- 分解表默认折叠（"定量分解（N 项）"）；展开后 `matched` 行按 (max_q contribution) desc；`not_matched`/`no_data` 其后；`missing`/`restricted` 最后；非命中行 `text-text-dim`，每行写状态与理由，并写"计入分母，不计入分子"。
- 列"快照中的比较观测"：`2026-08 · 2.6（上期）· 2026-06 · 2.7（3M 前）`；缺一条就少列；脚注"上期 = 24 个月窗口内最近一条更早期（不一定相邻月）；规则以精确十进制差值判定（利率类为百分点，汇率类为百分比变化）；显示变化按目录口径（bp/pp/%/点）四舍五入到 2 位"。
- 证据列：当前值可点 → `SourceDrawer`（`DrawerTarget{seriesId, observationId: row.latest.observation_id, …}`），打开的是冻结 `observation_id`。
- 精度契约：占比 1 位小数（%），分数/贡献 2 位，`margin_pp` 1 位 + "pp"，轴值 2 位带符号，覆盖 "整数/整数"，负零显示为 0。对账只用响应里的原始数值，不用显示值。
- 页头版本链接到 `?tab=methodology`；方法 tab 在 `judgmentsEnabled` 时新增"v1.0 规则表"小节（从 `RULES` 渲染：类型 / 条件中文 / 四象限支持系数 / `rule_id`）；关态不渲染该小节（`pages.test.ts` 风格的源码断言 + 渲染测试）。
- 禁词：`judgment.clock.*` 文案不得含"概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast"，唯一豁免 `judgment.clock.notProbability`；`macro-messages.test.ts` 对 `judgment.*` 以外的既有断言不变。
- 窄屏（<640px）：象限卡 2×2；分解表改"每行一张小卡"（指标名 + 当前值 + 命中规则 + 四个贡献），比较列折进"详情"。

### 3.6 状态矩阵（每个都要能在测试中构造）

| 状态 | 触发 | 时钟卡表现 |
|---|---|---|
| judgments_disabled | `judgmentsEnabled=false` | 不挂载（OverviewOff） |
| loading / load_failed | 路由 pending / 非 2xx | 骨架 / "判定数据读取失败 · 重试"（无零） |
| version_unsupported | 快照目录/方法/规则版本 ≠ 当前 | "该快照（目录 X / 方法 Y）与当前版本（…）不一致，时钟不可用" |
| record_missing | `regimeOf` 为 null | "该快照无判定记录" |
| f4_none / f4_earlier / f4_ineligible / f4_unavailable / f4_mismatch | §3.3 | 各自文案（earlier 附快照 id 链接；ineligible 附 `abstain_reason`；unavailable 附重试）；**无数字** |
| coverage_below_threshold / zero_score | `regime===null` 且 F4 卡存在（F4 对 null regime 会弃权 → 实际走 f4_ineligible；本状态只在 F4 卡 lifecycle 合格而快照 regime 为 null 时出现，即数据不一致 → 同 `f4_mismatch` 处理） | 文案 + 分解表（无象限数字） |
| ok | 全部通过 | 全量 |
| reconcile_failed | §3.4 不变式 1–6 失败 | 全量 + 顶部警示 |
| 行级 matched / not_matched / no_data / missing / restricted | §3.3 | 行状态与理由 |

### 3.7 明确不做

- 资产配置比例、超配/低配行业。象限卡底部只放链接"剧本（假设框架）→ 传导页"。
- 不在客户端评估规则、不重选观测、不从 `/api/judgments` 推导分数；不显示 ChaosAI 的任何数值。
- 不改 `regime.ts` / `snapshots.ts` / `read-api.ts` / `flags.ts` / `freshness.ts` / `db.ts`（C6）。

### 3.8 测试

- `clock-view.test.ts`：手算 fixture（4 命中行 + 2 未命中 + 1 缺失 + 1 受限；给定 contributions/scores/norm/uncovered/F4 claim）→ 行状态、drivers 排序（含并列：同贡献按权重、再按 id）、`by_state` 权重和 = 分母、七条不变式全过；七个故意破坏用例（重复行、observation 属于别的序列、weight×support 改 0.01、Σ 改 1、uncovered 改 1、norm 改 0.001、F4 distribution 改 0.001）各触发对应失败；`regime_status` 四态；`version_unsupported`；舍入边界（n 行各 0.5e-6 累计仍通过）。
- `f4-card.test.ts`：真实卡片形状（`inputs[]` 含 `macro_snapshot`）、方法 id/version、生命周期筛选、空列表、畸形、超时。
- `regime.test.ts` 不改；新增 `regime.rules-boundary.test.ts`：fx 值 7.12 / 102.4 永不命中 `policy_rate` 规则（`matchRule('fx', …)` 只返回 fx 规则）；`growth_yoy` 值 48 不命中 pmi 规则；`RULES` 每条有非空 zh/en label。
- `macro-messages.test.ts`：新禁词断言；zh/en 对等。
- 路由测试：开关关 404；版本门槛；F4 各态；`Cache-Control`。
- 源码断言：`src/components/macro/clock/**` 不 import `regime.ts`/`catalog.ts`（客户端包不含规则表）。
- 浏览器验收（桌面 1280 + 窄屏 390）：本地 DB 冻结样本（`src/lib/macro/testing/seed.ts` 扩"完整状态"样本 + F4 本地注册 `macro_regime@v1` 并置 `publishable=true`，**仅本地**），截图进 PR；验收记录格式见 §8。

---

## 4. WP-C · 把已有图表组织得清楚

全部为展示层；不新增迁移，不改任何 manifest/回放 fixture；不依赖 WP-D；不改 C6 文件。

### 4.1 概览大图卡（C1）

概览 tab 在时钟卡（或 OverviewOff 的两张事实卡）之下、指标表之上，新增 `KeyIndicatorCards`：每地区固定 4 个序列（US：`US_DFF`、`US_DGS10`、`US_CPI_YOY`、`US_UNRATE`；CN：`CN_PMI_MFG`、`CN_CPI_YOY`、`CN_CGB_10Y`、`CN_M2_YOY`；常量 `KEY_INDICATORS` 在 `view-model.ts`）。每卡标题行取 envelope 行（名称、当前值、类型化变化、数据期）；展开后嵌 `IndicatorDetail compact`，并传 `asOf = env.snapshot.created_at`（`fetchSeriesWindow` 增 `asOf` 透传到 `/api/macro/series/[id]?asOf=`），使图中最后一点 = 标题的快照值（同一 vintage）；若仍不相等（例如快照后隔离）则在卡内显示"图表最新 X（Y）≠ 快照值"而不是静默。默认前 2 张展开、后 2 张折叠（折叠态显示 envelope 的 `sparkline`，不发请求）。

### 4.2 政策变化优先、FOMC 圆点可选（C2）

- `MacroLineChart` 增 `layers?:{derived?:boolean;calendar?:boolean}`（默认 `{derived:true, calendar:false}`）；`detail-model.ts::markersOf(events, calendar, firstPeriod, layers)` 过滤；去重键 = `(time, kind)`，同日同类只保留一条（派生事件按 `effective_date` 本就唯一）；派生与日历同日各画一个（形状不同）。
- 图上方两个开关 pill"政策变化 ▲""FOMC 会议 ●"（`aria-pressed`）。
- 图下"事件（最近 6 条）"：派生政策事件按 `effective_date` 倒序，N=6，"全部"展开现有事件表；日历条目只在圆点层开时列。
- 标记文字：派生事件 `|change_bp| ≥ 25` 才带文字，否则只画箭头。

### 4.3 可比较的周期内资产变化（C3）

`IndicatorDetail` "周期内资产区间变化"表上方加条形小图（内联 SVG）：`barGeometry` 从 `strategy-view-model.ts` **移到** `charts/chart-geometry.ts`（策略组件改 import，测试搬家）；按周期分组，**bp 与 % 分两个面板**，每面板共享值域 = 该面板内 max |值|，零轴居中，负值向左；缺值（`change_text===null`）不画条、显示"缺失"文字，不补零；tooltip 带单位与端点。表格（`DataTableToggle`）保留。颜色：资产涨跌 `--up/--down`。

### 4.4 默认关联结果卡（C4）—— 修订 P1 §3.4

P1 §3.4 规定预设"只预填表单，不预存运行，不自动重算"。**P5 修订为**：预设结果由服务端按需计算并缓存，不存为用户运行、不计用户配额、不写库；每个响应自带完整冻结输入回执，可独立复算。

- 路由 `GET /api/macro/analyses/presets?region=US|CN`：`requireSessionUser`；预设白名单 = `PRESETS`（固定 8 组，不接受任意 spec）；对每组用与 `POST /api/macro/analyses` **相同**的 `validateAnalysisRequest` → `freezeInputs` → `runAnalysis` → `explainResult`（`runAnalysis` 为纯函数，`analysis-spec.ts`/`correlation.ts` 无 I/O；读取只经 `MacroDb.seriesHistory`）；返回 `{region, snapshot_id, cutoff, computed_at, code_version, method_version:CORRELATION_VERSION, catalog_version, cards:[{preset_id, spec, inputs:FrozenInputs, inputs_hash, results|null, error|null}]}`——与 `RunJson` 同形（无 `run_id`/`request_id`），`CorrelationResult` 直接渲染。
- `cutoff` = 该地区活动快照的 `created_at`（唯一解析规则：`db.activeSnapshot(region)`；无活动快照 → 200 `{cards:[]}` + `reason:'no_published_snapshot'`）；历史读取传 `asOf = cutoff`（`seriesHistory` 支持 `asOf`），所以同一快照下不同实例、不同时间得到相同冻结输入（`inputs_hash` 相同）。
- 进程内 LRU memo：键 `region|snapshot_id|CATALOG_VERSION|CORRELATION_VERSION|code_version`，值 = 完整响应，32 项，单飞；响应头 `X-Macro-Presets-Memo: hit|miss`。多实例各自计算，但结果由 `inputs_hash` 自证。
- 卡上按钮"重新计算并保存"：以该 spec 走现有 POST（计配额、现时 cutoff）；若新运行的 `inputs_hash ≠` 卡上的 → 结果页提示"输入已更新，数值可能与预设卡不同"。
- 失败预设（`insufficient_sample` 等）照常成卡并写明原因。
- 成本：miss 时最多 6（US）/ 2（CN）组，每组 2 条历史读取；验收基准固定：本地 `npm run dev` + 冻结样本 DB，`curl -w %{time_total}` 冷 3 次 / 热 3 次取中位数；生产同法（`vercel logs` 函数耗时）记录在 PR。逐张加载**不做**（删除第 1 稿的条件分支）。
- 测试：路由与 POST 同 spec 同 cutoff 得到相同 `inputs_hash` 与 `results`；不写 `macro_analysis_runs`（memory db 断言）；memo 命中头；无活动快照；未登录 401；错误预设成卡。

### 4.5 传导节点短标签（C5）

- `NodeCard` 默认只显示：状态徽章、短标签、值 + 单位、数据期；`formula`、`reason`、输入/指标链接折进 `<details>`。
- 边文案：`TransmissionView.stages[].edge` 已有 `kind:'assumption'` 字段（契约 §4）；展示层按 `kind` 渲染，`flow.edge` 文案改为 `{text}`（不再加前缀；数据文本自带"机制假设："）；流程内只画箭头，边文案汇成流程下方折叠列表"机制假设（N 条）"（N = `edge!==null` 的段数）。`strategy-messages.test.ts` 加断言：渲染后的边文案不含两次"机制假设"。
- 剧本卡：`PLAYBOOK_DISCLAIMER_V1` 只在面板底部出现一次。

### 4.6 "已可用 / 完整目录"切换（C6）

`CycleReturnsTable` 与 `PolicyResponseMatrix`：默认"已可用"（隐藏整列为 `restricted`（历史表 `column.restricted`）/ `not_in_catalog`（政策反应 `dim.kind==='not_in_catalog'`，来自 `RESPONSE_DIMS_V1` 的真实配置条目，含 label/reason）的列），切换"完整目录（+N）"显示全部；隐藏列的名称与理由在切换旁的列表里。纯展示过滤（`visibleColumns(view, mode)` 纯函数）：`view.columns`/`dims`、manifest、`cycleScale` 分母不变；偏好存 `localStorage` 键 `macro.strategy.columns.v1`。旁注"补齐计划 → 方法与来源"，链接到方法 tab 的"数据缺口与来源计划"小节（§5.6 表，i18n 文案）。

### 4.7 测试与验收

- `detail-model.test.ts`：`markersOf` 层过滤与去重；`chart-geometry.test.ts`：`barGeometry` 搬家后同用例 + 缺值不画；`strategy-view-model.test.ts`：`visibleColumns` 不改 `cycleScale`；事件列表 N 与排序。
- 浏览器：概览首屏（桌面/窄屏）、DFF 详情两种层、关联 tab 首进、历史页两种切换。

---

## 5. WP-D · 数据缺口

### 5.1 每条序列必须落到现有体系的字段

| 字段 | 落点 |
|---|---|
| 稳定 ID、经济定义、单位、原生频率、数据期、调整、修订政策、发布滞后、权重、changeKind | `catalog.ts` 的 `MacroSeriesDef` 行（代码即配置；`macro_series` 镜像由发布时 `upsertCatalog` 覆盖） |
| 来源与取数主机、原发布机构、via、权利、署名 | `SeriesSource{adapter, fetchHost, publisher, via, seriesKey, rights, attribution}`；`missing` 行 `source:null`（CHECK `macro_series_source_iff_not_missing`） |
| 原始响应证据 | `macro_evidence_objects`（`adapter` CHECK）+ `macro_retrievals` |
| 解析器版本与定位 | `parsers/*` + `Locator{csv_row\|json_pointer\|html_cell}`（列 CHECK 与 `macro_write_observations` 内的允许表；P5 不新增定位器种类） |
| 派生关系 | `derive:{kind, from}`（`macro_series.derive` CHECK 只认 `month_end\|yoy_from_index\|index_minus_100`；P5 不新增派生种类） |
| 可得时间 | `available_at`（首次取得，`availability_basis='first_seen'`） |
| 更新任务 | FRED → `GET /api/cron/macro-sync`；中国 → `scripts/macro/collect.py` + `cn-series.json` |
| 新鲜度 | `freshness.ts::releaseTimeliness`（按 `nativeFrequency` + `releaseLagDays`）；dataset 级 cadence 不变（`macro.fred` daily、`macro.akshare` daily） |
| 质量区间 | `quality.ts::KNOWN_UNITS` + `BY_UNIT`；`macro-format.ts::KNOWN_UNITS`；`messages/*/macro.json units.*` |
| 回放 fixture | `fixtures/fred/manifest.json`（`record-fred-fixtures.ts`）、`fixtures/cn/*`（`collect.py --record-fixtures`） |

每新增一条序列的 PR 附 runbook `macro-sync.md` §10 风格"核实记录"：实际 URL、主机、HTTP 状态、Content-Type、响应片段与定位、解析器版本、首次取得时间、**单位与口径的官方元数据原文**（FRED 序列页 "Units"/"Frequency"/"Notes"；PBOC/CFETS 页面表头）、已知限制。

### 5.2 D0 + 美国流动性三序列（FRED，`P5-D1`，目录版本 → F4 `macro_regime@v2`）

**D0（manifest 语义变更，属于 v2）**：现状 `snapshots.ts::catalogItemsOf(region)` = `WEIGHTS_V1` 键，`buildRegimeInput` 只冻结 `regimeInputsOf`；weight 0 指标不在概览、不在快照。改为 `catalogItemsOf = indicatorsOf(region)`，`buildRegimeInput` 冻结 `displayInputsOf(region)`（`indicatorsOf` 中 active、月/季频，weight ≥ 0）。`classifyRegime` 只遍历 `regionWeights`，对多出来的序列视而不见（分数、覆盖、贡献不变；`regime.test.ts` 不改）。影响并在 v2 里声明：`observation_ids` = 评分观测 ∪ 展示观测（F4 v2 `gather` 冻结全部，`compute` 的 `observation_missing` 检查按 `observation_ids` 长度，仍成立）；`catalog_counts` 分母变大；`catalog.test.ts:90-93`、`snapshots.test.ts`、F4 v2 fixture 更新；时钟 `non_scoring` 列表自此有内容。这改动了 `snapshots.ts` → 本身就是 v1 漂移的一部分（与目录变更同 PR）。

| 新 ID | FRED | 官方定义（FRED 序列页，核实任务逐字记录） | 单位 | 原生频率 / period | 发布方 / via / 权利 | 派生 |
|---|---|---|---|---|---|---|
| `US_WALCL_W` | WALCL | Assets: Total Assets: Total Assets (Less Eliminations from Consolidation)，H.4.1，Wednesday level | `usd_mn`（Millions of U.S. Dollars） | **weekly** / day（period_end = 周三日期） | Board of Governors / FRED / 预期 public domain（核实） | — |
| `US_WALCL` | — | 月内最后一次周观测（**不是月末余额**） | `usd_mn` | monthly / month | 同上 | `month_end` from `US_WALCL_W` |
| `US_RRPONTSYD_D` | RRPONTSYD | Overnight Reverse Repurchase Agreements: Treasury Securities Sold by the Federal Reserve in the Temporary Open Market Operations（日成交额，Billions of U.S. Dollars） | `usd_bn` | daily / day | Federal Reserve Bank of New York / FRED / 核实 | — |
| `US_RRPONTSYD` | — | 月内最后一个交易日观测 | `usd_bn` | monthly / month | 同上 | `month_end` |
| `US_WTREGEN_W` | WTREGEN | Liabilities and Capital: Liabilities: Deposits with F.R. Banks, Other Than Reserve Balances: U.S. Treasury, General Account: Week Average（**周平均**，Millions of U.S. Dollars） | `usd_mn` | weekly / day（period_end = 周三） | Board / FRED / 核实 | — |
| `US_WTREGEN` | — | 月内最后一次周平均观测（不是月末时点） | `usd_mn` | monthly / month | 同上 | `month_end` |

- `role:'indicator'`，`type:null`，`weight:0`，`revisionPolicy:'revisable'`，`releaseLagDays` 2（周四发布）；名称 zh/en 含选择规则（"（月内最后一次周观测）"）。
- `NativeFrequency` 增 `'weekly'`：`types.ts`；迁移 `supabase/migrations/20261121090000_macro_p5_catalog.sql`：`alter table macro_series drop constraint macro_series_native_frequency_check; add constraint … check (native_frequency in ('daily','weekly','monthly','quarterly','event'))`（约束名按 `\d macro_series` 实际名核实后写入）；`freshness.ts::releaseTimeliness` 的 weekly 分支（下一个 period_end = 下周三 + lag + 3 天）；`fredCosdFor`：weekly 同 `'day'` 窗口（period 已是 `'day'`，无需改）；`memory-db.ts::CADENCES` 只管 dataset，不改。
- 单位：`usd_mn`、`usd_bn` 加入两处 `KNOWN_UNITS`；`BY_UNIT`：`usd_mn {min:0,max:20_000_000,maxRelJump:0.5}`、`usd_bn {min:0,max:10_000,maxRelJump:null}`；i18n `units.usd_mn`="百万美元"/"USD mn"、`units.usd_bn`。
- FRED 回填：`FRED_BACKFILL_DONE_BY='2000-04-15'`，WALCL（2002-12 起）、RRPONTSYD（2003-02 起）永远不满足"已回填"，每天从 `FRED_COSD` 全量取（与 `US_FED_TARGET_UPPER_D` 同行为，CSV 各 ≤ 6k 行）。为避免无意义窗口，`fredCosdFor` 增可选 `seriesStart`（目录新字段 `firstPeriod?:string`，三条序列按核实的首期填写）→ `cosd = max(FRED_COSD, firstPeriod)`。
- 传导页：`transmission-v1.ts` US 流动性段的 `not_in_catalog` 节点替换为三个 `observed` 节点 → 配置版本 `macro-transmission/2`（新常量 `TRANSMISSION_V2`，v1 常量与其回放 fixture 保留；`wiring` 选 v2）。
- 测试影响：`catalog.test.ts:97`（`collectableOf('fred_csv')` 精确列表）、`:90-93`（`indicatorsOf`）、`fred-csv.test.ts:75-78`、`replay.test.ts:116`（`expectedDerived` 加 `US_WALCL`）、`macro-sync/route.test.ts`（period `'day'` fake CSV 已覆盖）；`fred-csv.test.ts` 加 FRED 缺失值 `.` 行用例。

### 5.3 中国政策利率：LPR 1Y / 5Y（`P5-D2`，核实先行）

- **任务 D2a 来源核实**（在任何目录改动之前）：CFETS `www.chinamoney.org.cn` LPR 页面背后的数据接口（JSON 或 HTML 表），用 `curl` 记录：URL、Content-Type、字段（报价日、1Y、5Y 以上）、历史起点（新机制 2019-08-20）、是否需 Referer/Cookie、使用条款。核实失败（JS 渲染/登录）→ 两条序列保持 `missing`，理由更新为核实结果；WP-D 其余照做。
- 适配器 `adapter:'official_http'`（新）：`types.ts::Adapter`；迁移同 §5.2 文件：`macro_evidence_objects.adapter` CHECK 加 `'official_http'`（**不是** `macro_series`，该表无 adapter 列）；`collectableOf('official_http')` 并入 `cnSeriesSpecs()`（`cn-series.ts`：`collectableOf('akshare').concat(collectableOf('official_http'))`，`cnSpecOf` 增 function `http_json`/`http_html`，`seriesKey` 形如 `http_json|<path>|<pointer-prefix>`；`CN_SPEC_VERSION='cn-series/2'`）；`export-cn-series.ts` 同步；`collect.py::calls_for/collect_series` 增 `requests.get(url, headers)` 分支并经 `recorder.recording()` 录制（host 必须等于 `fetchHost`）；`test_collect.py:99-104` 的函数/主机集合扩展；`ingest/route.ts` 的 `evidence_not_allowed`（host、path、200）照旧；`parsers/index.ts::parserFor` 按 function 分派 `parsers/chinamoney.ts`（`macro-chinamoney/1`）；`catalog.test.ts:9,21-27` 的主机白名单加 `www.chinamoney.org.cn`。
- 目录：
  - `CN_LPR_1Y_Q`、`CN_LPR_5Y_Q`：`role:'event_source'`，`type:'policy_rate'`，`nativeFrequency:'event'`，`period:'day'`，`period_end` = **报价日**（原样保留），`weight:0`，`revisionPolicy:'immutable'`，source = official_http。
  - `CN_LPR_1Y`（现有行改 `active`，weight 10 不变）、新 `CN_LPR_5Y`（weight 0）：monthly，`derive:{kind:'month_end', from:'CN_LPR_*_Q'}` —— 现有 `month_end` 语义 = "该月内最后一次观测"，即**该月最后一次报价**；名称写明"（月内最后一次报价）"；无报价的月不产值（缺失保持缺失）。
- 解析确定性（`parsers/chinamoney.ts`）：行键 = 报价日；同日重复行取**文件中最后一行**并记录 `duplicate_rows` 计数到解析结果（ingest 写入 `errors[]` 为 info）；空单元格/`--` = 无值；表头列名必须精确匹配（"1年"/"5年以上"），否则 `parse_failed`；fixture = 官方原始字节。
- 事件：`events.ts` 新增 `deriveRateQuoteEvents(quotes)`：相邻报价日差 ≠ 0 → `{kind:'policy_rate_change', region:'CN', effective_date:<报价日>, from, to, change_bp, evidence:[prev,cur], source:'derived'}`；`PolicyEvent` 改为可辨识联合（US `policy_target_change` 原样）；`EVENTS_VERSION='macro-events/2'`；`series-extras.ts` 对 CN `policy_rate` 序列按 `derive.from` 的 `_Q` 序列派生事件；`cycles.ts::policyCycles` 接受两种事件（只用 `effective_date` 与符号）；`detail-model.markersOf` 按联合渲染。事件日期永远是报价日，不是月末。
- **不改** `strategy/policy-events.ts`（US 三 id 硬编码；CN 行动段不在 P5）。

### 5.4 社融存量同比（`P5-D3`，核实先行）

- **任务 D3a 核实**：PBOC 调查统计司"社会融资规模存量统计表"是否每月有 HTML 表（目录 `www.pbc.gov.cn/diaochatongjisi/116219/116319/`），列是否含官方"同比增长（%）"；PDF 不解析。无 HTML 表或无同比列 → 保持 `missing`，理由更新。**不做余额派生回退**（口径扩围跨年不可比）。
- 采集：`official_http`（host `www.pbc.gov.cn`；`backfill` 遍历列表页链接，每月一页）；解析 `html_cell`（`parsers/pboc-afre.ts`，`macro-pboc-afre/1`）：定位"社会融资规模存量"行 × "同比增长"列；表头文本精确匹配；一个页面一期；页面修订（同月重发）→ 新版本（`revisionPolicy:'revisable'`）。
- 目录：`CN_AFRE_STOCK_YOY` 改 `active`（weight 20 不变，`releaseLagDays:15`），source = official_http。

### 5.5 MLF 1Y（`P5-D4`，可延期）

- **任务 D4a 核实**：PBOC 公开市场业务交易公告列表页是否有可解析的**表格**（日期、操作、金额、中标利率）；若只有正文段落（需正则）→ **P5 不做**（不新增 `html_text` 定位器），保持 `missing`，理由更新为"公告为正文格式，无表格可定位"。
- 可做时：`CN_MLF_1Y_E`（`event_source`，event/day，period_end = 操作日，weight 0，`html_cell`）；`CN_MLF_1Y`（现有行改为 monthly，`derive:{kind:'month_end', from:'CN_MLF_1Y_E'}`，weight 10）= 该月最后一次操作的中标利率；**无操作的月不产值**（不延续、不插值）；事件派生同 §5.3（`policy_rate_change`）。

### 5.6 资产覆盖：来源计划（本规格只写计划，不新增目录行）

| 资产 | 候选一手来源 | 权利 | 口径 | 动作 |
|---|---|---|---|---|
| 美股三指数 | FRED（S&P DJI、Nasdaq 版权） | third_party，owner 未确认 | 价格指数 | 保持 `restricted`；runbook §9 流程由 owner 决定（O2） |
| 沪深 300 | 中证指数公司 | third_party | 价格指数 | 同上 |
| 港股（恒指、恒生科技） | 恒生指数公司 / HKEX | third_party；且目录 `Region` 只有 US/CN | 价格指数；恒生科技 2020-07 前无（不做回溯模拟） | **不入目录**；需要先扩 `Region`（方法/类型变更，另立规格） |
| 黄金、铜 | LBMA / LME（版权）；World Bank Commodity Price Data (Pink Sheet)（月平均，XLSX） | Pink Sheet 许可与文件格式待核实；无 CSV | 月平均 ≠ 月末 | **不入目录**；核实记录进 runbook §10 后另立 |
| 债券总回报 | 无公开一手总回报指数 | — | 收益率 bp ≠ 持有回报 | 不做；历史表债券列头 tooltip"收益率变动，非持有回报" |
| 北向资金 | 港交所披露（2024-08 起口径改为季度/半年） | 待核实 | — | 保持 `not_in_catalog`，理由更新 |
| 权益（内部） | DataGateway（Wind 适配层，证券日线契约） | owner 的 Wind 授权是否允许产品内展示 | 日线 | owner 事项 O3；不实现 |

以上表格以 i18n 文案渲染在方法 tab "数据缺口与来源计划"小节（§4.6 链接目标）。

### 5.7 F4 方法版本（C1/C6 的落实）

- 方法身份：`id='macro_regime'`，`version='v2'`，键 `macro_regime@v2`（`methodKey` 形式），文件 `src/lib/judgments/methodologies/macro-regime.v2.ts`，文档 `docs/methodologies/macro_regime/v2.md`。
- 实现：**不** import v1 的函数（v1 的 `gather`/`compute` 闭包捕获 `macroRegimeV1.params.catalog_version` 且未导出）。新建 `macro-regime.common.ts` 导出工厂 `macroRegimeMethod({version, catalogVersion, doc})`，v2 = `macroRegimeMethod({version:'v2', catalogVersion:CATALOG_VERSION, doc:'…/v2.md'})`（v1 文件保持原样，不改用工厂，避免改动已注册方法的模块）。`params.catalog_version` 取**运行时** `CATALOG_VERSION` 常量会让"同一 v2"随后续目录变动漂移——所以 v2 的 pin 写**字面量**（目录 PR 合并前由 `npx tsx` 计算后写死），`macro-regime.v2.test.ts` 断言字面量 === 运行时 `CATALOG_VERSION`（目录再变时测试先红）。
- `REGISTRY = [macroRegimeV2]`；v1 从注册表移除。v1 已存行：`methodology-sync` 只处理注册表项，已存行不动（保持 `active`，无模块 → 不再产出）。`status='retired'` 的改法：核实 `methodology-sync.ts` 是否支持对不在注册表的行改状态；不支持 → owner 事项 O4（F4 侧补 retire 路径），记入 runbook。
- v1 既有判断：目录变更后，其条件解析器 `resolvers/macro.ts` 已对 `catalog_version` 不等返回 `unavailable('catalog_version_mismatch')` → 到 `settle_by` 作废（void）。这是已有、可接受的行为；写入 v2.md"v1 判断不再结算"。v1 fixture（`fixtures/judgments/macro/us-2026-09-11.json`、`replay/macro-regime.json`）**保持不变**，`macro-regime.v1.test.ts:65,74` 中与运行时 `CATALOG_VERSION` 的比较改为与 fixture 内字面量比较（历史回归）。
- `docs/methodologies/licenses.json`：三条 FRED 序列的来源 origin 按核实结果登记（publishable 仍 false）。
- 生产顺序（prod-rollout 会话）：合并 → 部署 → `sync-methodologies.ts`（注册 v2，plan 无 drift：v1 已不在注册表）→ cron/collector 首次发布新目录版本快照 → F4 produce 对新快照出 v2 判断。写进 runbook §13 新小节。

### 5.8 PR 矩阵与迁移

| PR | 目录版本 | F4 方法 | 内容 |
|---|---|---|---|
| P5-D1 | v2（`CATALOG_VERSION` 新值 A） | `macro_regime@v2`（pin A） | D0、weekly、`official_http` 枚举（迁移 CHECK 一次到位）、三条 FRED 序列 active、单位、fixture、transmission v2、v1 测试改历史回归、runbook |
| P5-D2 / D3 / D4 | 不改目录 | — | 采集器 `http` 分支、parser、事件联合、CN fixture；目录行仍 `missing`（parser 以 fixture 字节直接单测，不经 `parserFor`） |
| P5-D5 | v3（新值 B） | `macro_regime@v3`（pin B） | 把 D2a/D3a/D4a 核实通过且适配器已合并的中国序列一次翻 `active` 并补 `source`；更新 `catalog.test.ts` 精确列表、`cn-parsers.test.ts:129-143`、`cn-series.json`、v3 fixture；runbook |

迁移 `20261121090000_macro_p5_catalog.sql`（在 foreign research `20261119*` 之后；`migrations.lock.json` 保持时间序，PR #121 锁到 `20261118`）：
- `macro_series.native_frequency` CHECK：`('daily','monthly','quarterly','event')` → 加 `'weekly'`。
- `macro_evidence_objects.adapter` CHECK：`('fred_csv','akshare')` → 加 `'official_http'`。
- 不改：`period`、`derive`、`locator`（列与 RPC）、`change_kind`、`type`、bucket MIME、freshness cadence。
- 验证 SQL 与前后合法集合写进迁移注释；`test:migrations` 非追加规则：新文件追加。
- D1 的 `catalog.test.ts` 变更清单：`:73-74` missing/restricted 精确集合不变（D1 不翻 CN 行）；`:90-93`、`:97` 更新；`:55/:72`（daily/event weight 0、lag undefined）新 weekly 行按同规则（weight 0、lag 2 允许？——`:72` 要求 daily/event/month_end 的 lag undefined：weekly 原生行给 `releaseLagDays:2`，断言需把 weekly 视同 monthly 允许 lag）。

### 5.9 测试

- parser：fixture 字节 → 期望观测（含定位、重复行计数、空值）；
- `derive.test.ts`：weekly 的 `month_end`（月末周三/周五/周日三例、缺最后一周例：取月内最后一次观测，不补）；LPR 月内两次报价取后者；无报价月无行；
- `events.test.ts`：CN 报价事件、`EVENTS_VERSION` 2、US 不变；
- `catalog.test.ts` 更新项逐条；`fred-csv.test.ts` 周频 + `.` 缺失；
- F4：v2 `gather→compute→condition` 对新目录版本快照不弃权、对旧版本弃权；`methodology-sync` 计划 = `register v2`，无 drift；
- cutoff 回归：新派生行继承输入 `available_at`（`derive.ts` 既有规则）；`read-api-asof.integration.test.ts` 加 WALCL 月末行在 `asOf` 早于其输入可得时间时不可见；
- `replay.test.ts`：新 fixture 复算 WALCL 月内最后周观测。

---

## 6. 文件清单

| 工作包 | 新增/修改文件 |
|---|---|
| WP-B | `src/lib/macro/clock-view.ts`（+test）；`src/app/api/macro/snapshots/[id]/clock/route.ts`（+test）；`src/components/macro/clock/{RegimeClockCard,QuadrantGrid,DecompositionTable,F4Strip}.tsx`、`clock/f4-card.ts`（+test）；`MacroWorkbench.tsx`（槽位、方法 tab 规则表）；删除 `MacroJudgmentSlot.tsx`、`judgment-view.ts`（末任务）；`messages/{zh,en}/macro.json`；`macro-messages.test.ts`；`regime.rules-boundary.test.ts`；`testing/seed.ts` |
| WP-C | `view-model.ts`（`KEY_INDICATORS`）；`components/macro/KeyIndicatorCards.tsx`；`MacroLineChart.tsx`、`detail-model.ts`、`IndicatorDetail.tsx`；`charts/chart-geometry.ts`；`src/app/api/macro/analyses/presets/route.ts`（+test）；`CorrelationWorkbench.tsx`、`CorrelationResult.tsx`；`strategy/{TransmissionFlow,PlaybookGrid,CycleReturnsTable,PolicyResponseMatrix}.tsx`、`strategy-view-model.ts`；`messages/*/{macro,macroStrategy}.json` |
| WP-D | `catalog.ts`、`types.ts`、`snapshots.ts`（D0）、`freshness.ts`、`quality.ts`、`macro-format.ts`、`providers/fred.ts`、`cn-series.ts`、`parsers/{index,chinamoney,pboc-afre,pboc-mlf}.ts`、`events.ts`、`series-extras.ts`、`cycles.ts`、`strategy/data/transmission-v2.ts` + `wiring.ts`、`scripts/macro/{collect.py,cn-series.json,export-cn-series.ts,test_collect.py}`、迁移 `20261121090000_macro_p5_catalog.sql`、`src/lib/judgments/methodologies/{macro-regime.common,macro-regime.v2}.ts`、`registry.ts`、`docs/methodologies/macro_regime/v2.md`、`licenses.json`、runbook §10/§13/§14、fixtures |

---

## 7. Claude Design 画布

既有画布 `https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH`（宏观工作台 GUI）新增一行"P5 · 美林时钟与图表组织（规格 2026-11-07-macro-p5）"，已发布（版本 16，2026-11-07）。

### 7.1 画板

| 画板 | 覆盖 |
|---|---|
| `Clock.dc.html` | 时钟卡 ok 态：页头版本、F4 判定行、主/次/差距/覆盖/轴、四象限（主 = 铜色描边 + 洗底，次 = 铜色描边）、前三驱动、分解表（比较观测、规则中文、支持系数、贡献、证据）、合计对账行 |
| `ClockStates.dc.html` | no_regime（coverage_below_threshold）、reconcile_failed、rules/version mismatch、F4 四态条、行级状态表 |
| `OverviewP5.dc.html` | 概览：时钟折叠摘要 + 重点指标大图卡（2 展开 2 折叠）+ 指标表 + 来源条 |
| `DetailP5.dc.html` | 指标详情：标记层开关、政策变化箭头（≥25bp 带字）、事件列表、资产条形（% 与 bp 两面板） |
| `CorrelationP5.dc.html` | 关联 tab 首进：三张默认结果卡（含失败卡）+ 创建分析表单 |
| `StrategyP5.dc.html` | 传导短标签节点 + 折叠"机制假设（5 条）"+ 历史表"已可用 / 完整目录"切换 |
| `ClockMobile.dc.html` | 390 宽：象限 2×2 + 行卡分解 |

第 2 稿与画布的差异（画布在 WP-B 开工前同步）：`Clock.dc.html` 的 F4 行改为"判定：复苏 · 已发布 · 待结算 · 校准：样本不足"（不再有"尚无已发布判断"与数字并存的状态）；`ClockStates.dc.html` D 态删除"校准概率 41%"行，增加 `f4_none/f4_earlier/f4_unavailable` 三态均**无数字**的画法；分解表"上期 → 变化 / 3M 前 → 变化"两列合并为"快照中的比较观测"+"显示变化"。数值为示意。

---

## 8. 验收（ChatGPT 交接验收表的逐项回答方式）

每项记录：命令、commit、环境开关、fixture id、预期/实际、通过数、未运行项、浏览器版本。截图只作视觉证据，数值断言只由固定 fixture 完成。

| 验收面 | 必须成立 | 证明方式（PR 里附） |
|---|---|---|
| 贡献算术 | §3.4 七条不变式 | `clock-view.test.ts` 手算 fixture + 七个破坏用例；页面合计行截图 |
| 快照一致 | 卡、驱动、分解、证据、F4 claim 同一 `snapshot_id`/方法/目录版本 | 单一响应；`f4_earlier`/`f4_mismatch`/`version_unsupported` 用例 |
| 规则类型 | FX 不命中利率阈值、GDP 不命中 PMI 阈值 | `regime.rules-boundary.test.ts`（命名与命令） |
| 缺失语义 | 行级五态 + 卡级十一态各异，无零 | 状态矩阵用例 + ClockStates 画板 + 截图 |
| 覆盖率 | 分母含应计权重；<60% 不硬判 | 不变式 4；`coverage_below_threshold` 用例 |
| 概率语义 | 规则占比不叫概率；categorical 无 percent | 禁词测试 + F4 display 原样渲染测试 |
| 数据对齐 | 不静默覆盖重复日期；月/季不混；weekly 月内最后观测 | parser/derive 测试（重复计数、缺周不补） |
| 历史可知 | cutoff 后的批次不进过去；新派生继承可得时间 | `read-api-asof.integration.test.ts` 新增用例 |
| 证据链 | 点击贡献 → 冻结 observation_id 的 drawer | 路由集成测试：drawer 请求的 `observationId` === 响应 `rows[].latest.observation_id`；浏览器点击截图 |
| UI 可读性 | 首屏可读主状态与依据；分解可完整展开；键盘可达 | 1280 / 390 截图 + 键盘走查记录 |
| 图表可用 | 事件不淹没曲线、色带可辨、表格可用 | DFF 详情两种层截图 |
| 可用数据 | 已接入资产可比较，受限资产明确但不主导 | 历史页两种切换截图 |
| 性能 | 时钟 = 1 次快照读 + 1 次 regime 读 + 2 次 F4 HTTP；预设 miss/hit；历史/政策反应页首屏耗时（交接要求） | §4.4 基准法；历史/政策反应用 `claude/macro-strategy-latency` 的 `X-Macro-Strategy-Memo` 头与 `vercel logs` 记录冷/热各 3 次中位数 |

---

## 9. 不在本规格内（另立规格或 owner 事项）

- O1：`macro_regime` 方法 publishable 决定（时钟在生产可见的既有发布条件）。
- O2：美股/沪深 300 指数来源权利；O3：DataGateway/Wind 指数在产品内展示；O4：F4 retire 路径（若同步脚本不支持）。
- 方法 v1.1：LPR 5Y 入权重、政策利率绝对阈值跨国适用性、VIX 受限期的 risk_index 处置。
- QE/QT 政策事件定义与 `response-dims` 的资产负债表维度；`Region` 扩展（港股）；Pink Sheet；北向资金口径。
- 月度复盘历史回填。

---

## 10. 分期与 PR

| PR | 内容 | 依赖 |
|---|---|---|
| P5-B | WP-B 全部（§3） | 无（#125 合并与否都可；不碰 C6 文件） |
| P5-C1 | §4.1、§4.2、§4.3、§4.5、§4.6 | 无；与 P5-B 并行（`MacroWorkbench.tsx` 两处不同区域，后合者 rebase） |
| P5-C2 | §4.4 预设路由与默认结果卡 | 无 |
| P5-D1 | §5.2 + §5.7（v2）+ 迁移 | 核实任务 D2a/D3a/D4a 可并行开始，不阻塞 D1 |
| P5-D2 / D3 / D4 | §5.3–§5.5 适配器与解析（目录不动） | D1（`official_http` 枚举、cn-series/2） |
| P5-D5 | §5.8 v3：中国序列翻 active | D2–D4 中已合并且核实通过者 |
