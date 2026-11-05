# 数据底座四 · F4 判断层框架 设计规格

日期：2026-11-04（第 1 稿。审计轨迹：`docs/audits/2026-11-04-judgment-framework/`）
状态：草案，待 owner 评审（§17 列出 owner 决策）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一，§1 把"判断层：预测登记、结算、校准"划给 F4）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二，第 3 稿：`financial_facts` / `financial_metrics` / `filings` 与读接口）；`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（宏观规格：`macro_snapshots` / `macro_regime_results` 与 `methodology_version`）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 约束 3（owner 2026-11-04 确认）："财务数字是事实；生命周期阶段、胜率、值博率、评级是判断，必须有 `methodology_version`、输入快照、可证伪条件，并被结算与校准（Brier 分数、可靠性曲线）。没有结算机制的'胜率'不得显示为百分比。"本规格逐条落实：每条判断是一条内容寻址、只追加的登记记录；输入快照按 id + 哈希指向事实层，可按 `as_of` 回放；每条判断登记时就带可证伪条件与期限；结算由 cron 对照后来的事实 / 价格 / 宏观观测写入证据；校准报告（Brier、可靠性分箱、ECE、isotonic）决定页面能不能把概率显示成百分比。
已定决策（本稿作者，待 owner 确认）：系统判断进新的公共表 `judgments` 家族，而不是扩展 S4 判断台账（理由见 §2.4）；用户私有判断复用 `recommendations` / `recommendation_scores`（经适配器进入同一契约，不复制行）；第三方判断（外资研报评级 / 目标价）本期只定接口，不入库（§12.3）。

---

## 1. 目标与非目标

### 1.1 目标

1. **一个契约。** 宏观 / 行业 / 公司 / 外资研报四个模块的任何"判断型数字"都落在同一个 TypeScript 契约与同一组表上：`subject`（发行人 / 行业代码 / 宏观区域或序列 / 文档）、`judgment_type`、`methodology_id@version`、`inputs`（id + 哈希 + 可得日期）、`claim`（概率 / 类别 / 分值 / 区间）、`condition`（可证伪条件）、`horizon`、`settle_after/settle_by`。
2. **方法注册表。** `src/lib/judgments/methodologies/*` 里每个方法是一个纯函数模块 + 一份公式文档（`docs/methodologies/<id>/<version>.md`）；数据库表 `judgment_methodologies` 是代码的镜像，供外键与公共读取。没有注册的方法不能登记判断。
3. **回放。** 任何判断可以用它登记时的 `inputs` 按 `as_of` 从事实层（规格二读接口、宏观观测、文档）重新取值、校验哈希、重跑方法，得到同一个 `judgment_id` 与同一个 `claim`（规则型生产者）；模型型生产者至少校验输入哈希。
4. **结算。** cron 扫描到期判断，按 `condition.resolver` 从后来的价格 / 事实 / 宏观观测取实现值，写只追加的 `judgment_settlements`，证据（所用 K 线、事实 id、哈希、来源、复权口径、抓取时间）随行保存，因为仓库没有持久化的日线表（§2.3）。
5. **校准决定显示。** 每个 `methodology_id@version` 的校准报告（`judgment_calibrations`）给出已结算数、Brier、ECE、可靠性分箱、isotonic 拟合；`display.ts` 用它把每条判断映射到 `uncalibrated | calibrated | settled | void | withdrawn` 五态；概率型判断只有在 `calibrated` 态才渲染为百分比。
6. **首批生产者。** 两个不需要新数据源的生产者证明链路端到端：`recommendation_call@v1`（把现有 `recommendations.confidence` + `recommendation_scores.hit` 适配进契约并出校准报告，私有）和 `macro_regime@v1`（宏观 WP-M3 发布快照时登记一条判断，公共）。行业 / 公司 / 外资三个模块的方法由各自规格按 §4 的模板注册。

成功标准（计划四退出条件）：
- `registerJudgment()` 对同一 `(subject, type, methodology, inputs, as_of)` 两次调用返回同一 `judgment_id`，第二次 `duplicate=true`，表内行数不变；同 id 不同 `claim` → `idempotency_conflict` 并进 `dq_quarantine`。
- 回放夹具（§14.4）：每条夹具判断回放后 `judgment_id` 与 `claim` 字节一致；篡改任一输入的哈希后回放报 `input_hash_mismatch`。
- 结算 cron 对夹具 K 线 / 事实跑通 `price_return`、`fact_metric`、`recommendation_hit` 三个 resolver；到期未取到数据的判断在 `settle_by` 后变 `void(no_data)`；每次运行有 `ingest_batches` 回执与 `dq_freshness('judgments.settle')` 心跳。
- 校准数学对已知样本给出已知答案（§14.1）：完美预报 Brier = 0，恒 0.5 预报 Brier = 0.25，可靠性分箱与 Wilson 区间与手算一致。
- `GET /api/judgments?subject_type=macro_region&subject_key=US` 返回 active 宏观快照对应的判断卡；`n_settled < N` 时 `state='uncalibrated'` 且响应里没有百分比字段；`/analyst` 页的"信心"列按 §9 规则显示（未校准不显示为百分比）。
- 迁移可重放、`database.types.ts` 手工补齐、含 `S4_TEST_STATE` 的新测试文件进 `scripts/ci/research-checks.ts::criticalSuites`、全量门禁绿。

### 1.2 本规格之外

- 具体业务方法（生命周期分类器、景气评分、估值结论、论点胜率、卖方评级映射）的公式与阈值：由行业 / 公司 / 外资研报规格各自按 §4 模板提交；本规格只交付框架、两个首批生产者和方法模板。
- 第三方判断（外资研报的评级 / 目标价）入库与其私有可见性：待 F3 文档管道与外资研报规格（§12.3 给接口）。
- 用户自建的"我的判断"（没有现成表的私有判断类型）：本期不做；`judgments` 表 v1 只有公共行（§5.5 给出扩展路径）。
- 组合层 `decisions` / `decision_reviews` 的适配器：与 `recommendation_call@v1` 同内核，本期不接（§18.2）。
- 持久化日线表：本期不建；结算证据随行保存（§7.4）。
- 任何对 S4 判断台账（`research_judgments` 等四表）、S6 评价、fan-out 校准脚本的改动：不动；只复用其纯函数（`isotonicFit`、`wilson`）。
- 页面像素设计：按 owner 规则在 Claude Design 画布完成（§9.6 待设计清单）。

---

## 2. 现状（2026-11-04，计划一落地后；路径均已核实）

### 2.1 已有的判断基础设施

| 组件 | 位置 | 做什么 | 与 F4 的关系 |
|---|---|---|---|
| S4 判断台账 | `supabase/migrations/20260926000000_research_judgment_ledger.sql`；`src/lib/research/s4/ledger.ts`；`docs/superpowers/specs/2026-09-26-judgment-ledger-design.md` | 四张只追加表 `research_judgments / research_labels / research_decisions / research_outcomes`，主键 `(user_id, id)`，外键到 `research_source_documents` 与 `research_theses`（都是每用户表）；`judgment_id` = RFC 9562 v8 内容寻址 uuid（`sha256(canonical{snapshot_id, question_set_version, backend, backend_model, question_id})`）；`snapshot` 固定五字段；`backend ∈ {rule, llm_deepseek, jev, jev_escalated, local_probe, human}`；`replayJudgments()` 按来源 `available_at ≤ as_of` 过滤；写入走 `transaction()`（`ALPHA_S4_DATABASE_URL` 独立连接池，`ALPHA_S4_ENABLED=1` 门控，角色 `alpha_s4_runtime`，`research_s4_immutable()` 触发器） | 它记录的是"某后端对某来源 × 论点的问题集回答"，是研究方法自检的台账（ADR `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md` §1.1 第 2 点）。F4 复用它的三个做法：内容寻址 id 的构造、`canonicalize/digest`（`src/lib/research/ingest/pa-v1/json.js`，RFC 8785）、只追加触发器 + 幂等冲突语义。不扩展它（§2.4） |
| S6 存储与臂血缘 | `src/lib/research/s6/store.ts`、`arm-lineage.ts`、`arm-report.ts`；`research_s6_evaluations`（`20260922100000_research_s6.sql`） | 对 S4 观察（`research_s4_records` 六类记录链：Observation → Decision → InputSnapshot → ChangeCard → ThesisRevision → HumanLabel）调用外部 evaluator（`dsh-trade-strategy-evaluator`，market-policy/2.0：XNYS 日历 `docs/handoffs/alpha-s4/calendar.json`、SPY/ARCX 基准、固定交易日窗口）；`validateArmS4Lineage()` 逐条校验哈希链；四臂报表按 `(thesis_id, week_of)` 配对 | 证明"输入快照哈希链 + 固定窗口 + 外部结算"这套模式在仓库里已经跑通，但它只服务 XNYS/USD/SPY 的论点观察，且全部每用户私有。F4 借用其"结算窗口按交易日计数、结果带 `data_insufficient/pending_start/resolved` 状态"的状态集（§7.2） |
| fan-out 校准 | `src/lib/research/fanout/calibration.ts`、`report.ts`、`report-db.ts`；`scripts/calibration-report.ts`；`docs/superpowers/specs/2026-09-26-calibration-refit-design.md` | 纯函数：`isotonicFit`（PAV）、`applyIsotonic`、`wilson`、`crossFittedEce`（5 折）、`MIN_LABELS = 30`、阈值重拟与停止规则；脚本只读台账写 `docs/calibration/<date>.{json,md}`，不写库 | F4 直接 import `isotonicFit / applyIsotonic / wilson`；Brier、可靠性分箱、分类混淆矩阵是新写的（§8.1）。`MIN_LABELS = 30` 是本仓库已有的"最少样本"先例，§8.3 用它推导显示阈值 |
| 分析师评分层 | `20261017090000_analyst_scoring.sql`、`20261017120000_recommendations_append_only.sql`、`20261018090000_recommendation_scores_base_close.sql`；`src/lib/scoring/forward.ts`、`src/lib/analyst/{score-store,book}.ts`；`docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`、`2026-10-18-playbook-to-recommendation-design.md` | `recommendations`（每用户、BEFORE UPDATE 触发器只允许一次撤回与一次成交价写入）带 `confidence int 0–100`、`action`、`horizon`、`target_price`；`recommendation_scores` 由 `scoreForward()` 写 5/20/60 交易日前向收益、`hit`（5 日方向）、`score`、`calibration_bucket`（信心 20 分一档）、`base_close/base_date`（当前复权基准）；K 线来自 `fetchEastmoneyKline(ticker,'D',120)`（A 股前复权，港美不复权）；评分是用户按需 POST，无 cron | 这就是"用户私有判断 + 结算"的现成实现。F4 不复制这些行：`recommendation_call@v1` 是只读适配器，把 `(confidence/100, hit)` 读成 `(p, outcome)` 做校准（§11.2）。`calibration_bucket` 的 20 分分档被 §8.1 的 10 分箱取代（只在报告层，不改表） |
| 组合决定层 | `20260702090000_decision_layer.sql`：`decisions`（`confidence 0–100`、`target_price`、`horizon`）、`trades`、`positions`、`decision_reviews`（与 `recommendation_scores` 同形）；`src/lib/portfolio/review.ts::scoreDecision` 是 `scoreForward` 的薄包装 | 实盘账本上的采纳事件 | 同内核，本期不接适配器（§18.2） |
| 宏观规格的判断期望 | `2026-11-04-macro-workbench-design.md` §4.3（`macro_snapshots{snapshot_id, methodology_version, observation_ids, coverage}`、`macro_regime_results{scores, contributions, primary_state, margin, coverage, growth_axis, inflation_axis}`）、§5.3（"归一化得分不称为概率"、`coverage < 0.6` 不发布）、§8（所有读接口响应含 `methodologyVersion`） | 规则打分型判断，已经有方法版本与快照，但没有可证伪条件、结算与校准；`REPORT.md` §10.1 明确"若后续要提供概率，需定义可检验标签、时间外验证、基准模型、可靠性曲线和 Brier score" | F4 的 `macro_regime@v1` 给它补上条件、结算与校准（§11.1）；宏观表本身不动 |
| 数据质量底座（计划一，已落地） | `20261105090000_dq_foundation.sql`：`ingest_batches`（六个固定计数器）、`dq_quarantine`（每键一条 open 项）、`dq_reconciliations`、`dq_freshness`（`consecutive_errors`，daily 宽限 2 天）；`src/lib/dq/{batches,quarantine,freshness,rules,dashboard}.ts`；`src/lib/db/table-client.ts`（Supabase / memory / pg，无事务） | 所有数据集共用的回执 / 隔离 / 新鲜度 | 结算与校准任务用 `startBatch/finishBatch`（dataset `judgments.settle` / `judgments.calibrate`）、`quarantine()`、`recordAttempt()` |
| 发行人与行业分类（计划一，已落地） | `20261105091000_issuers.sql`：`issuers(issuer_id, cik, usci, lei, …, status, merged_into)`、`issuer_securities`（持有窗口互斥）、`industry_classifications(scheme ∈ {sw2021, sw2014, gics, csrc, custom}, version, code, level)`、`issuer_industry_memberships(valid_from, valid_to)`；anon 可读 | 主体主数据 | `subject_type='issuer'` 用 `issuer_id`；`'industry'` 用 `scheme:version:code`（§3.1） |
| 披露事实（规格二，待实施） | `filings` / `financial_facts(fact_id, raw_hash, value_text, available_date, mapping_gen)` / `financial_metrics`（复合主键 `(issuer_id, metric, period_start, period_end, input_unit, basis, formula_version)`，无单列 id）；`FactsDb.factsOfIssuer(issuer, {availableLte, …})`、`metricsOfIssuer(issuer, formulaVersion)`；读接口 `/api/facts/[ticker]{,/metrics}` | 事实层 | 输入引用 `financial_fact` 用 `fact_id`，`financial_metric` 用复合键（§3.5）；结算 resolver `fact_metric` 用 `availableLte`（§7.3） |

### 2.2 对方四个页面上的判断型数字（来自 `EXPERT_PLAYBOOK_AND_BRIEF.md` §1.1 / §2.1 / §3.1、`MACRO_STRATEGY_DEEP_DIVE.md` §4.1、`REPORT.md` §3 / §6）

| 页面 | 数字 | 分类 | F4 处理 |
|---|---|---|---|
| 宏观 | 四象限主判定 + "置信度"（归一化得分 `score[q]/Σscore` 被叫作概率）、备选象限、流动性阶段、资产配置建议、超 / 低配行业、"回测准确率 2/3" | 判断（类别型，带未校准分值） | `macro_regime`：类别型判断，`claim.distribution` 存归一化得分并标 `scores_are_not_probabilities=true`；可证伪条件见 §11.1；"置信度"一词不再出现，改为 `margin` + 校准态 |
| 行业 | 6 阶段生命周期（三段 3 年 CAGR a/b/c + 宏观定性修正）、88 细分行业 × 6 阶段矩阵、Gartner 曲线位置、6 阶段选股模型 | 判断（类别型） | `industry_lifecycle_stage`：条件 = 未来 3 年行业营收 CAGR 落在该阶段定义的区间（行业规格给区间） |
| 行业 | 5 维景气雷达（估值维度 50 占位、现金流用利润增速代理，`REPORT.md` Q10） | 判断（分值型） | `industry_prosperity`：分值型；缺维度就缺（`coverage` 字段），不补 50、不用代理；方法必须声明一个二元实现事件供结算（§3.3） |
| 行业 | PE / PB / PS 11 年分位 | 派生事实（纯统计变换） | 不是判断，归行业规格的派生指标（`metric_version`） |
| 行业 | PB + PS 均值分位 30 / 70 → 高估 / 低估结论 | 判断（类别型） | `valuation_verdict`：条件 = 未来 12 个月相对基准收益的方向 |
| 公司 | 值博率星级、胜率、预期涨幅、下跌空间、赔率、凯利仓位、季度上调 / 下调 | 胜率 = 概率型判断；涨幅 / 下跌空间 = 区间型判断；赔率 / 凯利 / 星级 = 由前两者派生 | `thesis_win_rate`（概率）、`return_range`（区间）；赔率、凯利、星级**不单独登记**，读取时由底层判断计算并继承最弱状态（§9.4） |
| 公司 | 覆盖时价格、研究日期、DCF 勾选 | 事实 / 元数据 | 价格作为 `price_bar` 输入进快照 |
| 监控 | 核心跟踪指标（目标标准 / 实际 / 置信度变化 / 权重）、跟踪事件超 / 低于预期、胜率 / 赔率 / 凯利 before→after、下次跟踪节点 | 跟踪指标 = 可证伪条件的检查点；before→after = 同一 `(subject, type)` 的两条判断（后者 `as_of` 更晚） | `condition` 的检查点语义（§3.4）；不设"修改"，只有新登记 |
| 监控 | 机构评级表 | 第三方判断 | `sellside_rating` / `sellside_target_price`：本期只定接口（§12.3） |
| 外资研报 | 评级 OW / MIXED / N/A、目标价 / 空间、方法论（WACC、g、终值占比）、风险与边界 | 第三方判断 + 第三方假设 | 同上；假设是文档抽取字段，不是判断 |
| （任务书提到的）拥挤度 | 本次 teardown 三份文档与 `PAGE_INVENTORY.csv` 中均未出现 | — | 不定义类型；缺就是缺 |

### 2.3 结算可用的数据能力

- **价格**：仓库没有持久化日线表（`supabase/migrations` 无 `daily_bars` / `kline` / `price_history`；`quote_alert_window_samples` 是告警抽样函数，不是行情）。可用的日线抓取：`fetchDatagatewayDailyKline`（`src/lib/data/sources/datagateway.ts`，返回 `SourceKlineSeries{source, bars, adjustment ∈ qfq|hfq|none|intraday, volumeUnit}`，`DATAGATEWAY_DAILY_TIMEOUT_MS = 7000`，仅在 `isDatagatewayConfigured()` 时）、`fetchEastmoneyKline(ticker, 'D', n)`（分析师评分层在用；A 股前复权，港美不复权）、`fetchTencentKline` / `fetchSinaIntradayKline`。`src/lib/data/kline/types.ts` 定义 `KlineProvider{name, market, adjustment, timeoutMs, maxAttempts}` 与失败分类 `KlineProviderFailureKind`。
- **交易日历**：只有 XNYS（`docs/handoffs/alpha-s4/calendar.json`，2026–2028 冻结）。A / HK 没有日历；`scoreForward` 用"K 线序号"数交易日，不用日历。
- **事实**：规格二读接口与 `FactsDb`（待实施）。
- **宏观观测**：宏观规格 `macro_observations(series_id, period_end, value, available_at, vintage_id)`（待实施）。
- **代码版本**：`ingest_batches.code_version`（计划一）；部署环境有 `VERCEL_GIT_COMMIT_SHA`。

### 2.4 为什么新建 `judgments` 而不是扩展 `research_judgments`

1. 可见性相反：台账主键含 `user_id`，RLS 只给 owner；总纲要求系统判断公共可读。
2. 外键指向每用户表（`research_source_documents`、`research_theses`）；系统判断的主体是 `issuers` / `industry_classifications` / 宏观区域，输入是 `financial_facts` / `macro_observations`，没有来源文档与论点。
3. `snapshot` 固定为五字段、`backend` 固定枚举、键里有 `question_set_version/question_id`，是 fan-out 问题集的形状；改它等于改 `docs/contracts/judgment-ledger-v1.md` 契约（台账规格明言"先改契约再改表"）。
4. 运行环境不同：台账走 `ALPHA_S4_DATABASE_URL` 独立连接池与 `alpha_s4_runtime` 角色、`ALPHA_S4_ENABLED` 门控；公共读接口走 anon PostgREST（计划一惯例）。
5. 反过来，台账的三件事值得照搬：内容寻址 id、`canonicalize/digest`、只追加触发器与 `duplicate / idempotency_conflict` 语义。F4 照搬并引用同一实现，不复制代码（`judgmentId()` 的 uuid v8 格式化逻辑抽成 `src/lib/research/ingest/pa-v1/uuid-v8.ts` 供两处共用，台账行为不变、`ledger.test.ts` 不改）。

---

## 3. 契约 `src/lib/judgments/contract.ts`

### 3.1 主体 `Subject`

```ts
type Subject =
  | { type: 'issuer';       key: string }   // issuers.issuer_id（uuid）；登记时必须 status='active'
  | { type: 'industry';     key: string }   // `${scheme}:${version}:${code}`，三段都必须存在于 industry_classifications
  | { type: 'macro_region'; key: 'US' | 'CN' }
  | { type: 'macro_series'; key: string }   // macro_series.id（宏观规格 §4.2 白名单）
  | { type: 'document';     key: string };  // F3 文档 id（§12.3；v1 不登记）
```

`subject_key` 的格式由 `validateSubject()` 按类型校验；存在性由 `JudgmentsDb.subjectExists()` 在登记时查（发行人 `merged/dissolved` → `subject_inactive`）。

### 3.2 判断种类 `kind` 与主张 `claim`

| `kind` | `claim` | 校准指标 | 百分比规则 |
|---|---|---|---|
| `probability` | `{ p: number ∈ [0,1], event: string }`（`event` 是 `condition` 的人读描述） | Brier、可靠性分箱、ECE、isotonic | **只有 `calibrated` 态才显示 `p` 为百分比** |
| `categorical` | `{ selected: string, classes: string[], distribution?: Record<string, number>, scores_are_not_probabilities: boolean }` | 准确率（Wilson 区间）、混淆矩阵、按 `margin` 分箱的准确率 | `distribution` 永不显示为百分比；显示 `selected` + 历史准确率（`calibrated` 态） |
| `score` | `{ value: number, scale: { min: number, max: number }, dims: Array<{ id, value: number \| null, weight, coverage: boolean }>, coverage: number }` | 方法声明的二元实现事件的 Brier（把 `value` 线性映射到 `[0,1]` 作为 `p`）+ Spearman（`value` vs 实现值） | 分值本身可显示（它不是概率），但带状态徽章；缺维度显示为缺口 |
| `interval` | `{ metric: string, low: number, high: number, unit: string, central?: number }` | 覆盖率（实现值落在区间内的比例）、区间宽度中位数 | 显示区间；`calibrated` 态附历史覆盖率 |

`abstained=true` 的判断没有 `claim`，只有 `abstain_reason`（例如 `coverage_below_min`、`missing_input:<id>`）；它被登记是为了页面能说"为什么没有判断"，不进入结算与校准。

### 3.3 可证伪条件 `condition`

```ts
interface Condition {
  resolver: 'price_return' | 'fact_metric' | 'macro_axis' | 'recommendation_hit' | 'industry_aggregate';
  params: Record<string, string | number | boolean>;   // resolver 自己校验（§7.3）
  predicate: { op: '>' | '>=' | '<' | '<=' | 'in' | 'between' | 'eq'; rhs: number | string | [number, number] | string[] };
  text: { zh: string; en: string };                   // 人读版本，登记时由方法模板生成
}
```

结算把 `resolver(params)` 的实现值代入 `predicate` 得到 `hit | miss`；`categorical` 的 `predicate.op='eq'`、`rhs = claim.selected`，实现值是 resolver 给出的实现类别；`interval` 用 `between`。方法模块的 `condition(subject, inputs, claim)` 必须是纯函数，条件在登记时固定，之后不可改。

### 3.4 期限 `horizon` 与到期

```ts
type Horizon =
  | { unit: 'trading_sessions'; n: number }   // 用 K 线序号计数（同 scoreForward），不用日历
  | { unit: 'calendar_days';    n: number }
  | { unit: 'fiscal_quarters';  n: number };  // 以 as_of 所在期的下 n 个 period_end 为准
```

登记时计算两个时刻（服务器时间）：

| `unit` | `settle_after`（最早可结算） | `settle_by`（超过则 `void(no_data)`） | 依据 |
|---|---|---|---|
| `trading_sessions` | `registered_at + ceil(n × 1.52) 天` | `settle_after + 60 天` | 分析师规格 §5："60 个交易日约 86–91 个自然日"→ 91/60 = 1.52；60 天宽限覆盖长假与 K 线源故障 |
| `calendar_days` | `registered_at + n 天` | `settle_after + 30 天` | 宽限 = 计划一 daily 数据集 2 天宽限的量级放大到月度观测的发布滞后（宏观 CPI/PMI 月度发布晚于数据期 ≤ 30 天） |
| `fiscal_quarters` | `as_of + n × 92 天` | `settle_after + 120 天` | 规格一 §5.2 财报日历：A 股年报截止 4-30（期末后 120 天），美股 10-K 60/75/90 天；取最长 |

`settle_after` 只是扫描触发条件；精确到期由 resolver 判定（例如 `trading_sessions` 要数到第 n 根 K 线才算到期，不够返回 `pending`）。

### 3.5 输入引用 `InputRef`

```ts
type InputRef =
  | { kind: 'financial_fact';   ref: { fact_id: string };                                        hash: string; available_at: string }
  | { kind: 'financial_metric'; ref: { issuer_id, metric, period_start, period_end, input_unit, basis, formula_version }; hash: string; available_at: string }
  | { kind: 'macro_observation'; ref: { series_id: string; period_end: string; vintage_id: string }; hash: string; available_at: string }
  | { kind: 'macro_snapshot';   ref: { snapshot_id: string };                                     hash: string; available_at: string }
  | { kind: 'price_bar';        ref: { ticker: string; market: 'A'|'HK'|'US'; date: string; source: KlineSourceName; adjustment: KlineAdjustment }; hash: string; available_at: string }
  | { kind: 'document_span';    ref: { document_id: string; version_hash: string; page: number; span?: string }; hash: string; available_at: string }
  | { kind: 'judgment';         ref: { judgment_id: string };                                     hash: string; available_at: string }
  | { kind: 'table_rows';       ref: { table: string; natural_key: string };                      hash: string; available_at: string };
```

`hash = digest(projection)`，`projection` 按 `kind` 在 `src/lib/judgments/inputs.ts` 固定：`financial_fact` → `{fact_id, concept, period_start, period_end, value_text, unit, available_date, mapping_gen}`；`financial_metric` → `{复合键…, value_text, as_of}`；`macro_observation` → `{series_id, period_end, value, vintage_id, available_at}`；`macro_snapshot` → `{snapshot_id, methodology_version, observation_ids, primary_state, scores, coverage, margin}`；`price_bar` → `{ticker, market, date, source, adjustment, open, high, low, close, volume}`；`document_span` → `{document_id, version_hash, page, span_text_sha256}`；`judgment` → `{judgment_id, claim}`；`table_rows` → `{table, natural_key, rows_sha256}`（行业聚合等多行输入，行集合由各规格定义并给出自然键）。`available_at` 是该输入的可得日期（事实 `available_date`、宏观 `available_at`、K 线为 `date` 当日收盘、文档为入库 `available_at`）；登记校验 `max(available_at) ≤ as_of`，否则 `lookahead`。

`inputs_hash = digest(inputs 按 (kind, canonical(ref)) 排序后的数组)`。

### 3.6 生产者

`producer_kind ∈ {rule, model, human, third_party}`；`producer_ref`：`rule` → `{}`；`model` → `{ model: string, prompt_sha256: string, run_id: string }`；`human` → `{ analyst_id: string }`；`third_party` → `{ institution: string, document_id: string }`。`producer_nonce`（进 id，§6.1）：`rule` 为空串；`model` 为 `prompt_sha256 + ':' + model`；`human` 为 `analyst_id + ':' + registered_at`；`third_party` 为 `document_id + ':' + version_hash`。

---

## 4. 方法注册表 `src/lib/judgments/methodologies/`

### 4.1 模块接口

```ts
export interface Methodology<I, C extends Claim> {
  id: string;                 // 'macro_regime'
  version: string;            // 'v1'（整数递增；任何公式、阈值、输入集合、条件或期限的改动都是新版本）
  judgment_type: JudgmentType;
  kind: Kind;
  producer_kind: ProducerKind;
  subject_types: Subject['type'][];
  doc: string;                // 'docs/methodologies/macro_regime/v1.md'
  params: Record<string, number | string>;   // 公式参数，写入 judgment_methodologies.params，进 formula_hash
  horizon: Horizon;
  gather(subject: Subject, asOf: string, db: JudgmentInputsDb): Promise<InputRef[] | Abstain>;   // 取输入并算哈希
  compute(subject: Subject, inputs: ResolvedInput[]): C | Abstain;                               // 纯函数
  condition(subject: Subject, inputs: ResolvedInput[], claim: C): Condition;                     // 纯函数
}
```

- `gather` 是唯一允许 I/O 的函数，且只能通过 `JudgmentInputsDb`（§5.6）读事实层；`compute / condition` 对同一输入必须字节一致（属性测试，§14.1）。
- `formula_hash = digest({ id, version, params, horizon, doc_sha256 })`；文档改动即哈希改动 → 必须升版本（CI 测试：注册表里每个 `id@version` 的 `formula_hash` 与 `judgment_methodologies` 行一致，§14.2）。
- `REGISTRY: Map<'${id}@${version}', Methodology>`；`status ∈ {draft, active, retired}`：`draft` 只能在测试与 `--dry-run` 下登记；`retired` 不再登记但仍结算与校准已有判断。

### 4.2 公式文档 `docs/methodologies/<id>/<version>.md` 固定章节

1 判断回答什么问题；2 主体与输入（每个输入的 `kind`、来源表、`available_at` 口径）；3 公式与参数（与 `params` 一致，参数来源注明"读自何处"）；4 可证伪条件与期限（人读与 `Condition` 一致）；5 结算 resolver 与实现值定义；6 已知局限与不适用情形（何时 `abstain`）；7 版本历史（与上一版的差异）。读接口 `/api/methodologies/[id]` 原样返回该文档（§10）。

### 4.3 v1 声明的判断类型

| `judgment_type` | `kind` | 主体 | 首个方法 | 归属规格 |
|---|---|---|---|---|
| `macro_regime` | categorical | macro_region | `macro_regime@v1`（§11.1） | 本规格 + 宏观 |
| `recommendation_call` | probability | issuer（经 ticker） | `recommendation_call@v1`（§11.2，私有适配器） | 本规格 |
| `industry_lifecycle_stage` | categorical | industry | — | 行业规格 |
| `industry_prosperity` | score | industry | — | 行业规格 |
| `valuation_verdict` | categorical | industry / issuer | — | 行业规格 |
| `thesis_win_rate` | probability | issuer | — | 公司规格 |
| `return_range` | interval | issuer | — | 公司规格 |
| `sellside_rating` | categorical（third_party） | issuer | — | 外资研报规格（需 §12.3） |
| `sellside_target_price` | interval（third_party） | issuer | — | 同上 |

类型表在 `src/lib/judgments/types.ts`，新增类型是代码改动 + 本表更新。

---

## 5. 数据模型

迁移 `supabase/migrations/20261108090000_judgments.sql`（时间戳晚于规格二的 `20261106090000`；若与并行规格撞号，取更晚的分钟位），可重放；补 `supabase/migrations.lock.json`；`src/lib/supabase/database.types.ts` 手工补四个 Row 类型。所有表先 `revoke all from public, anon, authenticated`，再按 §5.5 授权（计划一模式）。

### 5.1 `judgment_methodologies`（代码镜像）

```
methodology_id    text not null check (methodology_id ~ '^[a-z][a-z0-9_]{1,63}$')
version           text not null check (version ~ '^v[1-9][0-9]{0,3}$')
judgment_type     text not null
kind              text not null check (kind in ('probability','categorical','score','interval'))
producer_kind     text not null check (producer_kind in ('rule','model','human','third_party'))
subject_types     text[] not null
title_zh          text not null
title_en          text not null
doc_path          text not null
doc_sha256        text not null check (doc_sha256 ~ '^[0-9a-f]{64}$')
params            jsonb not null default '{}' check (jsonb_typeof(params) = 'object')
horizon           jsonb not null check (jsonb_typeof(horizon) = 'object')
formula_hash      text not null check (formula_hash ~ '^[0-9a-f]{64}$')
status            text not null check (status in ('draft','active','retired'))
code_version      text not null
synced_at         timestamptz not null default now()
primary key (methodology_id, version)
```

只由 `scripts/judgments/sync-methodologies.ts` 写（service role，`upsert` 允许改 `status / synced_at / code_version`，其余列变化 → 触发器 `23514 append_only:judgment_methodologies`，即公式一旦同步过就不可改，只能升版本）。

### 5.2 `judgments`

```
judgment_id         uuid primary key                       -- 内容寻址（§6.1）
subject_type        text not null check (subject_type in ('issuer','industry','macro_region','macro_series','document'))
subject_key         text not null check (length(subject_key) between 1 and 128)
judgment_type       text not null
methodology_id      text not null
methodology_version text not null
kind                text not null check (kind in ('probability','categorical','score','interval'))
producer_kind       text not null check (producer_kind in ('rule','model','human','third_party'))
producer_ref        jsonb not null default '{}' check (jsonb_typeof(producer_ref) = 'object')
producer_nonce      text not null default ''
as_of               date not null                           -- 信息截止日（§3.5）
registered_at       timestamptz not null                    -- 服务器时间
inputs              jsonb not null check (jsonb_typeof(inputs) = 'array')
inputs_hash         text not null check (inputs_hash ~ '^[0-9a-f]{64}$')
abstained           boolean not null default false
abstain_reason      text
claim               jsonb check (jsonb_typeof(claim) = 'object')
condition           jsonb check (jsonb_typeof(condition) = 'object')
horizon             jsonb check (jsonb_typeof(horizon) = 'object')
settle_after        timestamptz
settle_by           timestamptz
code_version        text not null check (length(code_version) between 7 and 64)
batch_id            uuid not null references ingest_batches(batch_id) on delete restrict
created_at          timestamptz not null default now()
foreign key (methodology_id, methodology_version) references judgment_methodologies(methodology_id, version) on delete restrict
constraint judgments_claim_iff_not_abstained check (abstained = (claim is null) and abstained = (condition is null) and abstained = (settle_after is null))
constraint judgments_abstain_reason check (not abstained or abstain_reason is not null)
constraint judgments_settle_order check (settle_by is null or settle_by > settle_after)
index (subject_type, subject_key, judgment_type, as_of desc, registered_at desc)
index (methodology_id, methodology_version, settle_after) where not abstained
index using gin (inputs jsonb_path_ops)
```

触发器 `judgments_append_only`：`update` / `delete` 一律 `23514 append_only:judgments`。没有状态列：状态由最新结算行派生（§9.1）。"替换"= 同主体同类型同方法登记一条 `as_of` 更晚的判断；读取默认取最新 `as_of`（§10）。

### 5.3 `judgment_settlements`

```
settlement_id     uuid primary key
judgment_id       uuid not null references judgments(judgment_id) on delete restrict
seq               integer not null check (seq >= 1)           -- 同一判断第 seq 次结算记录；最新 seq 有效
kind              text not null check (kind in ('settled','void','withdrawn'))
outcome           text check (outcome in ('hit','miss'))     -- settled 必填；其余 null
realized          jsonb check (jsonb_typeof(realized) = 'object')   -- {value, label?, unit, at, from, to}
evidence          jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object')
resolver          text not null
resolver_version  text not null
reason            text                                        -- void / withdrawn 必填
actor             text not null check (actor ~ '^(cron|script|admin:[0-9a-f-]{36})$')
settled_at        timestamptz not null
code_version      text not null
batch_id          uuid not null references ingest_batches(batch_id) on delete restrict
unique (judgment_id, seq)
constraint settlements_outcome_iff_settled check ((kind = 'settled') = (outcome is not null) and (kind = 'settled') = (realized is not null))
constraint settlements_reason_unless_settled check (kind = 'settled' or reason is not null)
index (judgment_id, seq desc)
index (settled_at desc)
```

只追加触发器同上。`seq > 1` 只允许两种情形：前一条是 `settled` 且本条是 `withdrawn`（管理员作废错误结算，`reason` 必填，`evidence.supersedes_settlement_id`），或前一条是 `void` 且本条是 `settled`（数据迟到后补结算）。其他组合触发器拒绝（`23514 settlement_sequence`）。

### 5.4 `judgment_calibrations`

```
calibration_id      uuid primary key
methodology_id      text not null
methodology_version text not null
scope_type          text not null check (scope_type in ('all','market','subject_type'))
scope_key           text not null default ''
window_from         date not null
window_to           date not null
n_registered        integer not null check (n_registered >= 0)
n_settled           integer not null check (n_settled >= 0)
n_void              integer not null check (n_void >= 0)
threshold_n         integer not null                      -- 计算时生效的 N（§8.3）
state               text not null check (state in ('insufficient','calibrated'))
metrics             jsonb not null check (jsonb_typeof(metrics) = 'object')
reliability         jsonb not null check (jsonb_typeof(reliability) = 'array')
isotonic            jsonb check (isotonic is null or jsonb_typeof(isotonic) = 'array')
settlement_ids_hash text not null check (settlement_ids_hash ~ '^[0-9a-f]{64}$')   -- 输入集合指纹，报告可回放
code_version        text not null
computed_at         timestamptz not null
batch_id            uuid not null references ingest_batches(batch_id) on delete restrict
foreign key (methodology_id, methodology_version) references judgment_methodologies(methodology_id, version)
index (methodology_id, methodology_version, scope_type, scope_key, computed_at desc)
```

只追加；显示用"每 `(methodology, scope)` 最新一条"。私有适配器（§11.2）的校准**不写本表**，按请求实时计算（§8.4）。

### 5.5 权限

- `judgment_methodologies`、`judgments`、`judgment_settlements`、`judgment_calibrations`：`enable row level security`；`grant select to anon, authenticated` + 策略 `"<t> public read" for select using (true)`；`grant select, insert to service_role`（无 update/delete 授权；触发器再兜底）。写入者只有 cron 路由（`CRON_SECRET`）、脚本与 `requireAdminUser()` 门控的管理员路由，全部经 `getAdminSupabase()`。
- v1 没有私有行。扩展路径（不在本期）：加 `owner_user_id uuid null` + `visibility` + `"own select/insert"` 策略；内容寻址 id 不含 owner，所以私有行与公共行不会撞 id，但 `producer_nonce` 对 `human` 含 `analyst_id`，足以区分。

### 5.6 数据访问契约 `src/lib/judgments/db.ts`

```ts
export interface JudgmentsDb {
  methodology(id, version): Promise<MethodologyRow | null>;
  subjectExists(subject): Promise<'active' | 'inactive' | 'missing'>;
  getJudgment(id): Promise<JudgmentRow | null>;
  insertJudgment(row): Promise<void>;                                   // 23505 → 调用方按 §6.2 处理
  latestJudgments(subject, opts: { types?, asOf?, includeAbstained? }): Promise<JudgmentRow[]>;   // 每 (type, methodology) 一条
  dueJudgments(now, limit): Promise<JudgmentRow[]>;                     // settle_after <= now 且最新结算不是 settled/withdrawn
  settlementsOf(judgmentIds): Promise<SettlementRow[]>;
  insertSettlement(row): Promise<void>;
  settledRows(methodology, version, window, scope): Promise<Array<{ judgment: JudgmentRow; settlement: SettlementRow }>>;
  latestCalibration(methodology, version, scope): Promise<CalibrationRow | null>;
  insertCalibration(row): Promise<void>;
}
export interface JudgmentInputsDb {                                     // gather / replay / resolver 的只读事实层入口
  facts: Pick<FactsDb, 'factsOfIssuer' | 'metricsOfIssuer' | 'filingsOfIssuer'>;   // 规格二 §4.8
  macro: MacroReadApi;                                                   // §12.1
  kline(ticker, market, opts: { bars: number; adjustment }): Promise<SourceKlineSeries | KlineFailure>;
  issuerPrimarySecurity(issuer_id, on: string): Promise<{ ticker; market } | null>;   // issuer_securities 持有窗口
}
```

三种实现：`supabaseJudgmentsDb`（PostgREST；读用 anon 客户端子集，写用 service role）、`memoryJudgmentsDb`（单测，实现触发器语义：只追加、`seq` 规则）、`pgJudgmentsDb`（集成测试直连 SQL）。批次 / 隔离 / 新鲜度仍走计划一 `TableClient`。

---

## 6. 登记、内容寻址与回放 `src/lib/judgments/register.ts`、`replay.ts`

### 6.1 内容寻址 id

```
judgment_id = uuidV8(sha256(canonicalize({
  subject_type, subject_key, judgment_type, methodology_id, methodology_version, as_of, inputs_hash, producer_nonce
})))
```

`uuidV8` 与台账 `judgmentId()` 同一实现（§2.4 第 5 点）。`claim` 不进 id：规则型生产者对同输入必须给同 `claim`，所以同 id 不同 `claim` 就是代码漂移或非确定性，按 §6.2 当冲突处理；这正是把 `claim` 排除在外的目的。

### 6.2 `registerJudgment(actor, input)` 流程

1. 校验：方法存在且 `status ∈ {active}`（`draft` 仅 `dryRun`）；`subject` 格式与存在性；`code_version` 非空；`inputs` 非空且每个 `hash` 形状合法；`max(inputs.available_at) ≤ as_of`（否则 `lookahead`）；`registered_at = serverTime`（`select now()` 经 `rpc` 或由 `pg` 直连；不用进程时钟）。
2. 若非 `abstain`：`claim` 按 `kind` 校验（概率 ∈ [0,1]；类别 `selected ∈ classes`；区间 `low ≤ high`；分值 `value ∈ scale`）；`condition.resolver` 在注册的 resolver 表内且 `params` 过 resolver 的校验；`horizon` 与方法声明一致；算 `settle_after / settle_by`（§3.4）。
3. 算 id；`getJudgment(id)`：存在且 `canonical(claim, condition, abstained, abstain_reason)` 相同 → `{ id, duplicate: true }`；不同 → `quarantine(dataset='judgments', table='judgments', natural_key=id, reason='idempotency_conflict', payload={registered: 旧, attempted: 新})`，抛 `idempotency_conflict`。
4. `insertJudgment`；23505（并发同 id）→ 重读按第 3 步判定。
5. 返回 `{ id, duplicate: false }`。调用方（生产者）负责 `startBatch/finishBatch`（dataset `judgments.<methodology_id>`，counts：`inserted` = 新行、`duplicates`、`quarantined`、`failed`）。

`registerJudgment` 不在事务内（`TableClient` 无事务）：第 3–4 步的竞争由主键与重读收敛，与计划一 `quarantine()` 的 23505 收敛同模式。

### 6.3 回放 `replayJudgment(id, inputsDb)` 与脚本 `scripts/judgments/replay.ts --id <uuid> [--json]`

1. 读判断行；对每个 `InputRef` 按 `kind` 从 `JudgmentInputsDb` 以 `asOf = judgment.as_of` 重新取值（事实用 `availableLte`，宏观用 `available_at ≤ as_of` 的最新 vintage，K 线用登记的 `source/adjustment` 重抓并取该 `date` 的 bar），重算投影哈希；任一不等 → `input_hash_mismatch`（报告列出哪一个）。K 线 `adjustment ∈ {qfq, hfq}` 的 bar 允许因后续复权重算而变化：此时记 `basis_shift`（信息）而不是 mismatch，并同时用 `none` 口径复核 `close` 相对关系（§7.4）。
2. `producer_kind='rule'`：重跑 `compute / condition`；`claim`、`condition`、`judgment_id` 三者字节一致 → `replay: 'exact'`；否则 `replay: 'diverged'`（列差异）。`model / human / third_party`：只到第 1 步，`replay: 'inputs_only'`。
3. 输出 JSON `{ judgment_id, as_of, inputs: [{kind, ref, stored_hash, replayed_hash, status}], replay, diff? }`。不写库；CI 对夹具跑（§14.4）。

### 6.4 生产者 runner `src/lib/judgments/produce.ts`

`produce(methodology, subjects, asOf, { db, inputsDb, batch })`：对每个主体 `gather → compute → condition → registerJudgment`；一个主体失败不影响其他；回执 `errors` 带 `{code, key: subject_key}`。宏观 WP-M3 的发布步骤与行业 / 公司规格的 cron 都调它。

---

## 7. 结算 `src/lib/judgments/settle.ts`、`resolvers/*`

### 7.1 任务

`GET|POST /api/cron/judgments-settle`（`CRON_SECRET` Bearer，`force-dynamic`，`maxDuration = 300`；`vercel.json` 增 `{ "path": "/api/cron/judgments-settle", "schedule": "0 3 * * *" }`——03:00 UTC 时前一交易日的美股、A 股、港股收盘都已可得；现有 cron 时段为 00:00 / 00:30 / 01:30 / 16:15 / 21:30 UTC，不冲突）。可选 `?preview=1` 不写库。本机脚本 `scripts/judgments/settle.ts` 共用核心。

流程：`startBatch({producer:'ts-judgments', dataset:'judgments.settle', triggeredBy, codeVersion})` → `dueJudgments(now, 200)` → 按 `condition.resolver` 分组 → 每个 resolver 以 ≤ 4 并发取实现值 → 对每条：`pending`（未到期）跳过；`resolved` → 代入 `predicate` → `insertSettlement(kind='settled')`；`unavailable` 且 `now > settle_by` → `insertSettlement(kind='void', reason='no_data:<failure_kind>')`；`unavailable` 且未超期 → 跳过（`errors` 记 `{code:'skipped_summary', key:'unavailable', message:'n=…'}`）；`inconsistent` → `quarantine(...)`（§7.5），不写结算 → 截止前 240 s 停止取新判断（`deadline_hit` 信息码）→ `finishBatch` → `recordAttempt('judgments.settle', {ok, cadence:'daily'})`。200 条 / 次的上限：每条 resolver 调用 ≤ 7 s（`DATAGATEWAY_DAILY_TIMEOUT_MS`），4 并发，≤ 350 s 的最坏情况被截止保护。

### 7.2 结算状态（借 S6 市场评价的状态集）

resolver 返回 `{ status: 'resolved', value, label?, from, to, evidence } | { status: 'pending', reason } | { status: 'unavailable', failure: KlineProviderFailureKind | 'no_fact' | 'no_observation' } | { status: 'inconsistent', detail }`。

### 7.3 v1 resolvers

| resolver | `params` | 实现值 | 到期判定 | 证据 `evidence` |
|---|---|---|---|---|
| `price_return` | `{ ticker, market, base_date, adjustment, benchmark?: 'SPY'\|'000300'\|'HSI' }` | `close[base + n] / close[base] − 1`（`horizon.unit='trading_sessions'`，`n` 从 `horizon`）；`calendar_days` 则取 ≤ `base_date + n` 的最后一根 | 第 `base + n` 根 bar 存在 | `{ source, adjustment, base_bar, end_bar, bars_sha256, fetched_at, benchmark_bars? }` |
| `fact_metric` | `{ issuer_id, metric, period_end, basis?, formula_version?, compare: 'value'\|'yoy' }` | 规格二 `metricsOfIssuer` / `factsOfIssuer` 以 `availableLte = now` 取 `period_end` 的当前值（`yoy` 则再取上年同期） | 该期事实 `status='ok'` 已存在 | `{ fact_ids, filing_ids, available_dates, values, mapping_gen }` |
| `macro_axis` | `{ region, series_ids: string[], from_period, to_period, rule: 'delta_sign' }` | 宏观观测在 `to_period` 相对 `from_period` 的变化符号（按 §12.1 接口） | `to_period` 的观测 `available_at ≤ now` | `{ observation_refs:[{series_id, period_end, vintage_id, value}] }` |
| `recommendation_hit` | `{ recommendation_id }` | `recommendation_scores.hit`（布尔） | 该行 `hit is not null` | `{ recommendation_id, scored_at, base_close, base_date, forward_5d_pct }` |
| `industry_aggregate` | 由行业规格定义 | — | — | — |

K 线选择（`JudgmentInputsDb.kline`）：`isDatagatewayConfigured()` → `fetchDatagatewayDailyKline`；否则 `fetchEastmoneyKline(ticker,'D', bars)`。`adjustment` 由方法在登记时固定（默认与分析师评分层一致：A 股 `qfq`，HK / US `none`），结算与回放都按登记值取。`bars` = 到期所需根数 + 登记日前 5 根（定位 `base_date`，同 `scoreForward` 的 `findIndex(b => b.time >= date)`）。

### 7.4 价格证据与复权口径

同一次抓取内的 `base_bar` 与 `end_bar` 口径一致，收益按它们计算（与分析师规格 §6"成交价与最新价同出一个 K 线源"一致）。登记时快照里的 `price_bar.close` 与结算抓到的 `base_bar.close` 比较：`adjustment='none'` 且 |差| > 0.5% → `inconsistent`（供应商改了历史数据；0.5% 沿用计划一恒等式容差）；`qfq/hfq` 下差异记入 `evidence.basis_shift = {registered_close, refetched_close}`，不算不一致。港美股不复权在拆股日的失真沿用分析师规格的"如实显示，不修正"：拆股后的 `end_bar/base_bar` 会把收益算错，v1 不处理（§18.3 开放问题；方法可通过 `benchmark` 参数记录基准同窗收益供人工判读）。

### 7.5 隔离与警告

| reason_code | 触发 | natural_key | payload |
|---|---|---|---|
| `idempotency_conflict` | §6.2 | `judgment_id` | `{registered, attempted}` |
| `settlement_basis_mismatch` | §7.4 `none` 口径 > 0.5% | `judgment_id` | `{registered_bar, refetched_bar, source}` |
| `settlement_fact_revised` | `fact_metric` 的实现值在 `settle_by` 前被修订（同一 `period_end` 出现 `is_revision=true` 的更晚披露） | `judgment_id` | `{values_by_available_date}`；结算等待至 `settle_by` 再以当时当前值结算 |
| `resolver_param_invalid` | 结算时 resolver 拒绝参数（方法 bug） | `judgment_id` | `{condition}` |

接受处理钩子（`src/lib/dq/judgments-resolver.ts`，挂到 `/api/admin/dq/quarantine/[id]`）：`resolved_accept` → 下次 cron 对该判断重试结算（`basis_mismatch` 接受 = 以重抓 bar 为准）；`resolved_reject` → 写 `void(reason='quarantine_rejected')`。

---

## 8. 校准 `src/lib/judgments/calibration.ts`

### 8.1 纯函数

输入 `rows: Array<{ p: number; outcome: 0|1 }>`（概率型；分值型先把 `value` 线性映射到 `[0,1]`；类别型把 `selected` 的 `distribution` 归一化值作 `p`，`outcome = selected == realized`，并另算混淆矩阵）：

- `brier(rows) = mean((p − outcome)²)`；`brier_climatology = mean((base_rate − outcome)²)`，`base_rate = mean(outcome)`；`brier_skill = 1 − brier / brier_climatology`（`brier_climatology = 0` 时 `null`）。
- `reliability(rows, bins = 10)`：等宽分箱 `[0,0.1), …, [0.9,1]`；每箱 `{ bin_low, bin_high, n, mean_p, hit_rate, wilson_low, wilson_high }`（`wilson` 来自 `fanout/calibration.ts`，95%）；`n = 0` 的箱保留但 `hit_rate = null`。
- `ece(rows) = Σ_bins (n_b / n) × |mean_p_b − hit_rate_b|`；`ece_cross_fitted` 复用 `isotonicFit` 做 5 折（折分按 `judgment_id` 字节序确定性切分，同 fan-out 的"按行序确定性分折"）。
- `isotonic(rows)` = `isotonicFit(rows.map(r => ({score: p, hit: outcome})))`。
- 区间型：`coverage = mean(low ≤ realized ≤ high)`，`width_median`；类别型：`accuracy` + Wilson + `confusion: Record<selected, Record<realized, n>>` + 按 `margin` 分箱（`[0,5), [5,15), [15,∞)`，与宏观规格 §5.3 的三档文案阈值一致）的准确率；分值型另加 Spearman（`value` vs 实现值）。

### 8.2 报告任务

`judgments-settle` cron 的第二阶段（同一请求，结算后）：对每个 `active/retired` 方法 × scope（`all`；再按 `market`（issuer 主体按主证券市场）与 `subject_type`）取窗口 `[computed_at − 3 年, computed_at]` 内最新 `seq` 为 `settled` 的行 → 算 §8.1 → `insertCalibration`（`state = n_settled ≥ threshold_n ? 'calibrated' : 'insufficient'`；`settlement_ids_hash = digest(sorted settlement_ids)`）。同一输入集合指纹重复则不写新行（`duplicates`）。3 年窗口：覆盖 `fiscal_quarters` 期限（最长 4 季 + 120 天宽限）的 2 轮以上；旧版本方法 `retired` 后仍出报告，页面能展示历史。

### 8.3 显示阈值 N（提案，owner 决策 O2）

**N = 100 条已结算（`settled`，不含 `void`）判断，按 `(methodology_id@version, scope='all')` 计。**

推导：
- 可靠性分箱的意义在于能分辨"声称 0.8 实际 0.5"这种粗差。10 等宽箱下，实际登记的概率通常集中在 3–5 个箱；n = 100 时每个有效箱约 20–30 条，Wilson 95% 区间半宽约 0.18–0.21（p ≈ 0.5、n = 25：1.96 × √(0.25/25) ≈ 0.196），能把 0.3 的偏差判为显著，但分辨不了 0.1。
- 整体命中率在 n = 100 时半宽约 0.10（1.96 × √(0.25/100) ≈ 0.098）：足以给出"历史命中 62%（52–72%）"这种可读区间。
- 仓库先例：fan-out 校准对每个问题要求 `MIN_LABELS = 30` 才报 isotonic 后 ECE（`calibration.ts:70`）；N = 100 对应每个有效箱 ≈ 30 的量级。
- 备选：N = 50（每箱 ≈ 12，半宽 ≈ 0.28，只能发现极端失准）、N = 200（半宽 ≈ 0.07，但按分析师评分层目前的登记节奏要数年才达到）。

`threshold_n` 写进每条校准行，改阈值不改历史。`scope='market'` 等细分报告只做展示，不参与状态判定（避免同一方法在不同页面状态不一致）；是否按市场分层判定是 owner 决策 O2 的一部分。

### 8.4 私有适配器的校准

`recommendation_call@v1` 的行是用户私有的，不写 `judgment_calibrations`。`GET /api/analyst/book?analyst=` 响应增加 `calibration` 字段（服务端用用户会话读 `recommendations ⟕ recommendation_scores`，调同一 `calibration.ts`），`threshold_n` 同 §8.3；`n_settled` 很少会到 100，这正是总纲要求的效果——分析师页的"信心"在达到之前不显示为百分比（§11.2）。

---

## 9. 显示契约 `src/lib/judgments/display.ts`

### 9.1 状态机

```
最新结算 kind = 'withdrawn'                      → 'withdrawn'
最新结算 kind = 'void'                           → 'void'
最新结算 kind = 'settled'                        → 'settled'
无结算，方法最新校准 state = 'calibrated'          → 'calibrated'
其余（无结算、无校准或 insufficient）              → 'uncalibrated'
abstained = true                                 → 'abstained'（独立于上面）
```

### 9.2 `JudgmentCard`（读接口与组件共用）

```ts
interface JudgmentCard {
  judgment_id: string;
  subject: Subject;
  judgment_type: JudgmentType;
  kind: Kind;
  state: 'uncalibrated' | 'calibrated' | 'settled' | 'void' | 'withdrawn' | 'abstained';
  as_of: string; registered_at: string;
  methodology: { id: string; version: string; title: {zh,en}; href: string };            // /intel/methods/<id>/<version>
  display: {                                                                             // 由 kind × state 决定（§9.3），服务端生成
    headline: { zh: string; en: string };                                                // 例："研究员信心：高（未校准，已结算 12/100）"
    percent: number | null;                                                              // 只在 probability × calibrated 非空
    value: number | string | [number, number] | null;                                    // 分值 / 类别 / 区间
    scale?: { min: number; max: number };
    dims?: Array<{ id; label: {zh,en}; value: number | null; coverage: boolean }>;       // 分值型，缺维度 value=null
    band?: 'low' | 'mid' | 'high';                                                       // 概率型未校准：按三分位 [0,1/3) [1/3,2/3) [2/3,1]
  };
  condition: { text: {zh,en}; horizon: Horizon; settle_after: string; settle_by: string };
  settlement: { kind; outcome; realized; settled_at; evidence_summary } | null;
  calibration: { n_settled: number; threshold_n: number; brier: number | null; ece: number | null; hit_rate: {rate, low, high} | null; href: string } | null;
  inputs: Array<{ kind; ref; available_at; href: string | null }>;                      // 抽屉；href 指向事实 / 宏观 / 文档的来源抽屉
  abstain_reason?: string;
}
```

### 9.3 kind × state 渲染规则

| kind | uncalibrated | calibrated | settled |
|---|---|---|---|
| probability | `percent = null`；`band` + 文案"研究员信心 / 模型信心（未校准，已结算 n/N）"；登记值只在抽屉里以小数显示并标"登记值（未校准）" | `percent = round(p × 100)` + "历史命中 x%（Wilson 区间）" + 可靠性图链接 | 结果 `hit/miss` + 实现值 + 登记的 `p` |
| categorical | `selected` + "未校准"徽章；`distribution` 只在抽屉显示为"得分"，永不带 % | `selected` + "该方法历史准确率 x%（n）" | `selected` vs 实现类别 |
| score | 分值 + 刻度 + 维度条（缺维度画缺口并写"缺失：估值维度无数据"）+ "未校准"徽章 | 同左 + "分值 ≥ 阈值的实现率 x%" | 分值 + 实现值 |
| interval | 区间 + "未校准" | 区间 + "历史覆盖率 x%" | 区间 vs 实现值（在内 / 在外） |

共同：每张卡底部一行"方法 `id@version` · 截至 `as_of` · 条件：… · 结算 `settle_after`"；`void` / `withdrawn` 显示原因；所有卡的图（可靠性、维度雷达）都有表格等价视图（`reliability` 数组本身就是表）。

### 9.4 派生判断

赔率 = `E[up] / E[down]`、分数凯利 `f = ¼ × (p × b − (1 − p)) / b`（b = 赔率）、值博率星级（公司规格定义映射）等由 `p`（`thesis_win_rate`）与区间（`return_range`）在读取时计算，不登记、不结算；`state = min(输入判断的 state)`（顺序 `uncalibrated < calibrated < settled`）；任一输入 `uncalibrated` 时凯利只显示为"不计算（胜率未校准）"。¼ 凯利取总纲 §2.2"分数凯利（¼–½ Kelly）"区间的下限；具体分数是公司规格的参数。

### 9.5 UI 流程（页面级实现归各模块规格，这里定公共部分）

- 入口：宏观 / 行业 / 公司页面在相应位置嵌 `JudgmentCard` 组件（`src/components/judgments/JudgmentCard.tsx`）；点击方法名 → `/intel/methods/[id]/[version]`（公式文档、参数、版本历史、校准报告：可靠性图 + 分箱表、Brier / ECE / n、最近结算列表）；点击"输入" → `InputsDrawer`（列表 → 各自来源抽屉：事实行 → 规格二 `citation`，宏观观测 → 宏观 `SourceDrawer`，文档 → F3）；点击"结算" → `SettlementTimeline`（登记 → 到期 → 结算 / 作废，证据摘要）。
- `/intel/methods`：方法注册表页（表格：方法、类型、版本、状态、已登记 / 已结算 / N、Brier、最新校准时间）。
- `/admin/judgments`：到期队列（`dueJudgments`）、隔离项（链接 `/admin/dq`）、"作废结算"（写 `withdrawn`，`reason` 必填，`actor='admin:<uuid>'`，`research_audit_log` 记录）、"立即结算一条"（调同一核心）。
- 空 / 缺失：主体没有任何判断 → 卡不渲染，页面位置显示"尚无判断：方法 X 需要输入 Y（缺 Z）"（来自 `abstained` 行的 `abstain_reason`，没有 abstain 行则"方法未对该主体运行"）；校准不足 → 永远可见的徽章，不是隐藏。
- zh / en：`messages/{zh,en}/judgments.json` 注册到 `src/i18n/request.ts::MESSAGE_DOMAINS`；`display.headline` 两语都由服务端生成；`src/i18n/messages-parity.test.ts` 自动覆盖。
- `DESIGN.md`：单一黄铜强调色只用于 `calibrated` 徽章与当前选中；`uncalibrated` 用中性灰；`hit/miss` 用 `--up/--down`（随 `data-color-scheme`）；数字 Geist Mono；无渐变 / 紫色。

### 9.6 Claude Design 画布待设计清单

1. `JudgmentCard` 四种 kind × 六种 state 的全部组合（24 态）+ 抽屉触发区。
2. `InputsDrawer`（输入列表、哈希校验态、来源跳转）。
3. `SettlementTimeline`（登记 / 到期 / 结算 / 作废 / 证据摘要）。
4. `/intel/methods` 列表与 `/intel/methods/[id]/[version]` 详情（公式文档、可靠性图 + 等价表、混淆矩阵表、版本历史）。
5. `/admin/judgments`（到期队列、隔离、作废对话框）。
6. `/analyst` 页"信心"列的未校准 / 已校准两态（§11.2）。
7. 移动端：卡片折叠态（只显 headline + 状态徽章 + 方法名）。

---

## 10. 读取接口

共同约定：公共只读（anon 客户端的 `supabaseJudgmentsDb` 读子集）；`force-dynamic`；参数重复 → 400 `invalid_parameter:<name>`；错误与空结果 `no-store`；成功 `Cache-Control: public, max-age=300, s-maxage=600`（判断与结算只追加，缓存失效只影响"最新"的切换时延）；响应顶层含 `codeVersion`。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/judgments` | `subject_type`、`subject_key`（必填）、`types`（逗号，白名单）、`asOf`（`YYYY-MM-DD`，取 `as_of ≤ asOf` 的最新）、`include_abstained=1` | `{ subject, asOf, cards: JudgmentCard[] }`，每 `(judgment_type, methodology)` 一张 |
| `GET /api/judgments/[id]` | — | `{ card: JudgmentCard, judgment: 全行, settlements: [...], calibration: 最新报告摘要 }` |
| `GET /api/judgments/[id]/history` | `limit`（默认 50，最大 500） | 同主体同类型同方法按 `as_of` 倒序的 `cards`（监控页 before→after） |
| `GET /api/methodologies` | `status` | 注册表行 + 最新校准摘要 |
| `GET /api/methodologies/[id]/[version]` | — | `{ row, doc_markdown, calibrations: [{scope, …最新}], recent_settlements }` |
| `GET /api/methodologies/[id]/[version]/calibration` | `scope_type`、`scope_key` | 最新 `judgment_calibrations` 行（含 `reliability` 表） |
| `POST /api/admin/judgments/[id]/withdraw` | body `{ reason }` | `requireAdminUser()`；写 `withdrawn`；审计 |
| `POST /api/admin/judgments/[id]/settle` | — | 立即跑结算核心；返回 resolver 状态 |
| `GET\|POST /api/cron/judgments-settle` | `preview=1` | 批次回执 `{ batchId, status, counts, calibrations }` |

分析师：`GET /api/analyst/book` 响应增 `calibration`（§8.4）；`GET /api/analyst/recommendations` 每行增 `judgment_card`（§11.2）。

---

## 11. 首批生产者

### 11.1 `macro_regime@v1`（公共，`producer_kind='rule'`）

- 触发：宏观 WP-M3 `snapshots.publish()` 把快照置 `active` 后调用 `produce(macro_regime_v1, [{type:'macro_region', key: region}], as_of = snapshot.as_of)`（§12.1 接口）。
- `gather`：`[{ kind:'macro_snapshot', ref:{snapshot_id}, hash, available_at: snapshot.created_at }]` + 该快照 `observation_ids` 对应的 `macro_observation` 引用（逐条 id + 哈希，让回放不依赖快照表）。
- `compute`：直接搬 `macro_regime_results`：`selected = primary_state`，`classes = [recovery, overheat, stagflation, recession]`，`distribution = norm`，`scores_are_not_probabilities = true`；`coverage < 0.6` 时宏观根本不发布快照，所以这里不会 abstain；`margin` 写进 `claim.margin`。
- `condition`（提案，owner 决策 O3）：美林时钟对象限的资产含义是这个判断唯一可外部检验的内容。`resolver='price_return'` 的配对版本 `params = { pair: [long_series, short_series], region, base_date: as_of }`，`horizon = { unit:'calendar_days', n: 91 }`（与宏观规格 §5.2 规则表用的 Δ(3M) 同一时间尺度），`predicate: { op:'>', rhs: 0 }` 作用在 `return(long) − return(short)`：

  | 象限 | long | short | 来源 |
  |---|---|---|---|
  | recovery | 股票指数 | 国债 ETF / 10Y 指数 | 美林时钟：复苏期股票优于债券 |
  | overheat | 商品（原油 / 铜） | 债券 | 过热期商品优于债券 |
  | stagflation | 现金（短期国债 / 货币基金代理序列） | 股票 | 滞胀期现金优于股票 |
  | recession | 债券 | 股票 | 衰退期债券优于股票 |

  具体序列 id 取宏观目录（§12.1）里 US / CN 各自的资产序列；目录没有某类资产时该象限 abstain 并记 `missing_input:<asset>`，不用代理。备选条件（持续性检验：3 个月后用当时可得数据重算主判定是否相同）只检验稳定性不检验正确性，列为 O3 的选项 B。
- 展示：宏观状态卡的"主判定 / 次判定 / margin / coverage"保持宏观规格 §3.2 的形式，增加一枚 `JudgmentCard` 状态徽章与"历史命中（n）"；`distribution` 不再被称为"概率 / 置信度"。

### 11.2 `recommendation_call@v1`（私有适配器，`producer_kind='human'`）

- 不写 `judgments` 行。`src/lib/judgments/adapters/recommendation.ts::toJudgmentCard(rec, score, calibration)`：`subject = issuer`（经 `issuer_securities` 由 `(ticker, market)` 反查；查不到则 `subject_key = '<market>:<ticker>'` 并标 `unresolved_issuer`）；`kind='probability'`；`claim.p = confidence / 100`，`event = "5 个交易日内收盘价沿建议方向变动"`；`condition = { resolver:'recommendation_hit', params:{recommendation_id}, predicate:{op:'eq', rhs:true} }`；`horizon = { unit:'trading_sessions', n: 5 }`；`settle_after` 按 §3.4；`inputs = [{ kind:'price_bar', ref:{ticker, market, date: fill_date, source:'eastmoney', adjustment: market==='A'?'qfq':'none'}, hash: digest({…, close: fill_price}) }]`（`fill_price` 是首评分时冻结的基准收盘，分析师规格 §6）。`confidence` 为 null 或 `action='hold'` → `abstained`（`no_confidence` / `no_direction`）。`withdrawn_at` 非空 → `state='withdrawn'`。
- 结算：已有 `recommendation_scores.hit`；`state='settled'` 当 `hit is not null`。
- 校准：§8.4，scope 为 `analyst_id`。
- `/analyst` 页改动：建议表的"信心"列改为 `JudgmentCard.display.headline`（未校准：`高 / 中 / 低（未校准，n/100）`，登记值移到行展开里）；统计摘要的"命中率"已是结算统计，保留；增加"校准：Brier、n、状态"。免责声明不变。这是对 2026-10-17 规格 §3.2 的最小修订，表与 API 形状不变。

---

## 12. 依赖接口（待对齐）

### 12.1 宏观工作台（WP-M3）

需要：`publishSnapshot()` 完成后调用 `produce(...)`（§11.1）；`MacroReadApi { observation(series_id, period_end, asOf): {value, vintage_id, available_at} | null; snapshot(snapshot_id): {methodology_version, observation_ids, regime: RegimeResult, as_of, created_at} | null; assetSeriesFor(region): { equity, bond, commodity, cash } → series_id | null }`；资产序列按 `available_at ≤ asOf` 的月末或日频取值规则由宏观 `normalize.ts` 提供。宏观规格 §8 的 `GET /api/macro/overview` 响应增 `judgment: JudgmentCard`（或前端另请求 `/api/judgments?subject_type=macro_region&subject_key=US`）。

### 12.2 披露事实（规格二）

`FactsDb` 的 `factsOfIssuer / metricsOfIssuer / filingsOfIssuer` 已满足 `gather` 与 `fact_metric`；需要补一个 `metricsOfIssuer(issuer, formulaVersion, { availableLte })`（规格二 §9 的 `asOf` 实时 derive 路径已有此能力，只需暴露给库调用）。`financial_metrics` 没有单列 id，F4 用复合键 + `value_text` 做哈希（§3.5）。

### 12.3 文档管道（F3）与外资研报

需要：文档稳定 id、`version_hash`、页码 / 跨度定位、`available_at`、以及**每文档的可见范围**（用户私有 / 团队 / 公开元数据）。`sellside_rating / sellside_target_price` 的登记要等 `judgments` 加 `owner_user_id/visibility`（§5.5 扩展路径）且 F3 给出可见范围判定函数；在此之前外资研报页只展示文档抽取字段，不作为判断登记。

### 12.4 计划三（标识符与对账）

发行人合并后的判断归属：`subject_key` 是合并前的 `issuer_id`，读取时按 `issuers.merged_into` 链跟随到当前发行人并在卡上标"登记于合并前主体"；`issuer_securities` 的历史持有窗口用于 `issuerPrimarySecurity(issuer_id, on)`。

### 12.5 评测（F6）

`producer_kind='model'` 的方法在进入 `active` 前需要 F6 的黄金集分数；`judgment_methodologies.status` 从 `draft` 升 `active` 的条件由 F6 规格定义，本规格只要求 `draft` 不能登记正式判断。

---

## 13. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| 方法不存在 / `draft` / `retired` 登记 | 拒绝该主体 | `methodology_unavailable` | partial |
| 主体不存在 / 非活跃 | 拒绝 | `subject_missing` / `subject_inactive` | partial |
| 输入可得日期晚于 `as_of` | 拒绝 | `lookahead` | partial |
| 同 id 不同内容 | 隔离 + 拒绝 | `idempotency_conflict` | partial |
| `claim` / `condition` 校验失败（方法 bug） | 拒绝 | `invalid_claim` / `invalid_condition` | partial |
| `code_version` 缺失 | 整批拒绝 | `code_version_missing` | rejected |
| resolver 数据源超时 / 限频 | 该判断跳过，下次重试 | `skipped_summary(unavailable:<kind>)` | — |
| 超过 `settle_by` 仍无数据 | `void(no_data)` | `voided_summary`（信息） | — |
| 价格基准不一致 | 隔离，不结算 | `settlement_basis_mismatch` | partial |
| 事实在期限内被修订 | 隔离（信息），到期后以当前值结算 | `settlement_fact_revised` | — |
| 截止 | 不再取新判断 | `deadline_hit`（信息） | — |
| 无到期判断 | 空转，新鲜度心跳 ok | `detail.idle=true` | success |
| 校准输入集合未变 | 不写新报告 | `duplicates` 计数 | success |
| 回放输入哈希不符 | 脚本退出码 2，列出不符项 | `input_hash_mismatch` | — |
| 读接口 | 400 `invalid_parameter:<name>` / 404 `unknown_judgment` / `unknown_methodology` | | |
| 管理员作废已作废的结算 | 409 `already_withdrawn` | | |

---

## 14. 测试策略

### 14.1 单元（vitest，`memoryJudgmentsDb`）

- `contract.test.ts`：主体格式、`claim` 按 kind 校验、`horizon → settle_after/settle_by` 三种单位的日期算术（含闰年、月末）。
- `inputs.test.ts`：每种 `InputRef` 投影哈希对固定夹具稳定；字段顺序无关；`financial_fact` 夹具取规格二 `fixtures/edgar/CIK0000320193.trimmed.json` 派生的事实行；`inputs_hash` 与数组顺序无关。
- `register.test.ts`：同输入同 id；任一字段变 id 变；`claim` 不进 id；`duplicate` / `idempotency_conflict` 两支；`lookahead`；`abstain` 行无 `claim/condition/settle_after`；23505 重读。
- 属性测试（种子随机 200 次）：对注册表中每个 `rule` 方法，`compute / condition` 对同一输入两次调用字节一致；打乱 `inputs` 顺序 id 不变。
- `settle.test.ts`：resolver 分派；`price_return` 用夹具 K 线（从 `fetchEastmoneyKline` 录制 120 根：600519、00700、AAPL，各含一个交易日缺口）验证第 n 根 bar 的到期判定、`pending`、`calendar_days` 取值、证据形状、`basis_mismatch` 阈值两侧；`fact_metric` 用规格二 `memoryFactsDb`；`void` 在 `settle_by` 后才写；`seq` 规则（`settled→withdrawn` 允许，`settled→settled` 拒绝）；截止；200 条上限。
- `calibration.test.ts`：完美预报 Brier 0；恒 0.5 → 0.25；`brier_skill`；分箱计数与手算；Wilson 与 fan-out 同函数；ECE 对已知样本；交叉拟合分折确定性；区间覆盖率；混淆矩阵；分值 Spearman；`n < N → insufficient`。
- `display.test.ts`：状态机六态；概率型 `uncalibrated` 的 `percent === null` 且 `band` 正确；`calibrated` 的 `percent`；派生判断继承最弱状态；zh / en headline 都非空。
- `macro-regime.v1.test.ts`：用宏观规格 §14 验收样例 9 的夹具（对方 2026-09-11 快照经 v1.0 规则）构造 `RegimeResult`，登记 → 条件里的 long/short 序列正确；缺资产序列 → abstain。
- `recommendation.adapter.test.ts`：`hold` / 无信心 → abstain；撤回 → withdrawn；`hit` → settled；ticker 反查失败标记。
- 路由测试：参数校验、缓存头、`include_abstained`、`asOf` 取最新、admin 鉴权、cron Bearer。

### 14.2 数据库（`test:db`）

`src/lib/judgments/judgments.integration.test.ts`（含 `S4_TEST_STATE`，进 `criticalSuites`）：迁移可重放；四表只追加触发器（update / delete 被拒）；`judgment_methodologies` 只允许 `status/synced_at/code_version` 变化；`seq` 触发器；RLS 真实角色（anon 读得到四表、写被拒；service_role 可插入）；注册表 ↔ 表 `formula_hash` 一致（`sync-methodologies` 后比对）；`dueJudgments` SQL 与内存实现对同一数据集结果一致；GIN 索引下按 `inputs @> [{"ref":{"fact_id":…}}]` 能查到引用该事实的判断。

### 14.3 离线集成

`src/lib/judgments/settle.integration.test.ts`（critical）：夹具 K 线 + `pgJudgmentsDb`，跑两遍 cron 核心：第一遍 `inserted > 0`，第二遍全部 `duplicates`、`success`；注入迟到数据 → 原 `void` 行后出现 `seq=2 settled`。

### 14.4 回放夹具（黄金）

`fixtures/judgments/replay/*.json`：至少 3 条判断（`macro_regime@v1` 一条、`recommendation_call@v1` 一条、一条用规格二夹具事实的合成 `fact_metric` 判断），每条含登记行 + 全部输入投影；`replay.test.ts` 对每条断言 `replay==='exact'`（规则型）或 `'inputs_only'`，篡改任一输入后断言 `input_hash_mismatch`。夹具由实施者之外的人核对一次（§16）。

### 14.5 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`；`messages-parity`、`typecheck`、`lint`、`build`、`test:migrations` 全绿才算完成。

---

## 15. 分期（供计划四拆任务）

| 工作包 | 交付 | 退出条件 | 估算 |
|---|---|---|---|
| F4-0 契约与迁移 | `contract.ts`、`types.ts`、迁移（四表、触发器、权限）、锁文件、`database.types.ts`、`JudgmentsDb` 三实现、`uuid-v8.ts` 抽取（台账测试不变）、集成测试 §14.2 | `test:db`、`test:migrations` 绿；`ledger.test.ts` 原样通过 | 2.5 人日 |
| F4-1 注册表、登记、回放 | `registry.ts`、方法接口、`sync-methodologies.ts`、`docs/methodologies/README.md`（§4.2 模板）、`inputs.ts`、`register.ts`、`produce.ts`、`replay.ts` + 脚本、回放夹具 | 单测 + 回放夹具绿 | 2.5 |
| F4-2 结算 | `settle.ts`、`resolvers/{price,facts,macro,recommendation}.ts`、隔离钩子、cron 路由、`vercel.json`、脚本、夹具 K 线录制 | `settle.test.ts` + 离线集成绿；`preview=1` 对真实库空转回执 | 3 |
| F4-3 校准与显示 | `calibration.ts`、报告阶段、`display.ts`、`judgment_calibrations` 写入 | 校准数学单测绿；阈值行为可配 | 2 |
| F4-4 读接口与 UI 契约 | 六个读路由、两个 admin 路由、`JudgmentCard` / `InputsDrawer` / `SettlementTimeline` 组件（按画布稿）、`/intel/methods*`、`/admin/judgments`、`messages/*/judgments.json` | 路由测试绿；parity 绿；DESIGN.md 审查 | 3 |
| F4-5 首批生产者 | `macro_regime@v1`（含文档）、`recommendation_call@v1` 适配器、`/analyst` 页信心列改造、`/api/analyst/book.calibration` | 宏观 WP-M3 合并后端到端登记一条；分析师页显示未校准态 | 2 |
| F4-6 文档与收尾 | runbook（cron、隔离处理、作废、回放）、宏观 / 规格二接口对齐记录、§19 偏差记录 | 全量门禁绿；Codex 复审无 P1 | 1 |

合计约 16 人日。F4-5 的宏观部分依赖 WP-M3；若先合并，F4-5 用夹具 `RegimeResult` 完成并在 §19 记录待接。

验收样例：
1. 对同一 `RegimeResult` 两次 `produce` → 第二次 `duplicates=1`，表行数不变。
2. 篡改回放夹具里一个 `macro_observation` 的 `value` → `replay.ts` 退出码 2 并指出该 `series_id`。
3. 登记一条 `trading_sessions n=5` 的合成判断，夹具 K 线只有 4 根后续 bar → `pending`；补第 5 根 → `settled`，`evidence.end_bar.time` 是第 5 根。
4. 99 条已结算 → `insufficient`，`percent=null`；第 100 条后 cron → `calibrated`，`percent` 非空。
5. 管理员作废一条结算 → `seq=2 withdrawn`，卡状态 `withdrawn`，校准报告下一次不再计入它。
6. 断网跑 cron：批次 `failed`，无结算写入，`dq_freshness` 连续两次后 `error`。

---

## 16. 独立验证

- Codex（gpt-6-astra，medium）：规格两轮（`01`、`02`）与处置（`03`）；每个工作包提交再审。
- 校准数学对照：用 Python（`sklearn.calibration.calibration_curve` + 手写 Brier）对同一合成样本算一遍，把结果抄进 `calibration.test.ts` 的期望值（由实施者之外的人跑）。
- 回放夹具由实施者之外的人核对输入投影与来源。
- 宏观条件（§11.1）与行业 / 公司方法的"可证伪条件是否真的可证伪"请一位买方分析师读 `docs/methodologies/*` 并记录意见到 `docs/audits/2026-11-04-judgment-framework/expert-notes.md`。
- 上线后 6 个月：第一份真实校准报告（`macro_regime@v1` 两区域 + 分析师私有）作为本框架的客观证据（总纲 §2.6"结算即验证"）。

---

## 17. owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 O1**：首批生产者 = `macro_regime@v1` + `recommendation_call@v1`（本稿默认）；是否把组合 `decisions` 也接适配器（§18.2） | owner | 计划编写前 |
| **决策 O2**：显示阈值 N = 100（§8.3）；备选 50 / 200；是否按市场分层判定状态 | owner | 计划编写前 |
| **决策 O3**：`macro_regime@v1` 的可证伪条件：A 资产含义配对（默认）或 B 3 个月持续性检验，或两者都登记为两个方法版本 | owner（与宏观规格作者） | F4-5 前 |
| **决策 O4**：`trading_sessions` 期限统一用 K 线序号（默认，与 `scoreForward` 一致）还是引入 A / HK 交易日历（新数据源） | owner | F4-2 前 |
| **决策 O5**：`/analyst` 页信心列改为未校准带状显示（§11.2）——这是对已上线页面的可见改动 | owner | F4-5 前 |
| 画布：§9.6 七项 | owner（Claude Design） | F4-4 前 |
| 生产：执行迁移、`sync-methodologies`、`vercel.json` cron 生效、`CRON_SECRET` 已有 | owner | 合并后 |
| 买方分析师阅读方法文档（§16） | owner 安排 | F4-6 前 |

---

## 18. 开放问题（实施前核对）

1. 宏观目录是否含"现金"类资产序列（短期国债收益率或货币基金指数）；没有则 `stagflation` 象限只能 abstain（§11.1）。
2. `decisions` / `decision_reviews` 适配器：与建议同内核，但 `decisions` 表没有只追加触发器（分析师规格明言是 v4 M1a 既有债务），登记前是否先补触发器。
3. 港美股不复权下的拆股：`price_return` 在拆股日跨窗会错；是否接入 DataGateway 的 `hfq` 作为港美默认口径（需确认 DataGateway 对 HK / US 的复权支持）。
4. `financial_metrics` 的 `availableLte` 读法是否由规格二直接暴露（§12.2）。
5. 发行人主证券在期限内切换（退市 / 换代码）时 `price_return` 的 ticker 取登记时的还是结算时的；默认登记时的，退市则 `void(delisted)`。
6. 校准 3 年窗口是否对 `fiscal_quarters` 方法够用，待行业规格确定期限后复核。

---

## 19. 实施记录与偏差

（实施后补记。）
