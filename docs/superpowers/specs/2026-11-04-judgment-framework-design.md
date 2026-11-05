# 数据底座四 · F4 判断层框架 设计规格

日期：2026-11-04（第 5 稿。审计轨迹：`docs/audits/2026-11-04-judgment-framework/` —— 01 Codex 第一轮（8 P1 / 21 P2 / 1 P3）、02 Codex 第二轮（对第 2 稿：4 P1 / 25 P2 / 3 P3）、03 处置表、04 Codex 第三轮（对第 3 稿：3 个新 P1 N1–N3 + 11 个 PARTIAL，判定"not ready"）、05 Codex 第四轮（对第 4 稿，只审新引入缺陷：N1–N3 RESOLVED，新 R01–R06）。第 4 稿修 N1–N3 与全部 PARTIAL；第 5 稿按 05 的处方逐字实施 R01–R06（见 03 第四轮节），未再送审）
状态：草案，待 owner 评审（§17 列出 owner 决策）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一，§1 把"判断层：预测登记、结算、校准"划给 F4）；`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二，**第 8 稿**：`fact_sync_runs` / `filings` / `financial_facts` / `financial_metrics`（主键含 `market`、`based_on_rev`）/ `FactsDb{readFacts, factsByIds, metricsOfIssuer, …}`；本规格以该稿为准，规格二再改动时 §12.2 随之更新）；`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（宏观规格：`macro_snapshots` / `macro_regime_results` 与 `methodology_version`）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 约束 3（owner 2026-11-04 确认）："财务数字是事实；生命周期阶段、胜率、值博率、评级是判断，必须有 `methodology_version`、输入快照、可证伪条件，并被结算与校准（Brier 分数、可靠性曲线）。没有结算机制的'胜率'不得显示为百分比。"本规格逐条落实：每条判断是一条内容寻址、只追加的登记记录；输入快照把**值本身**（不只是哈希）冻结在登记行里，所以回放不依赖供应商重抓；每条判断登记时就固定可证伪条件、目标期与标签政策；结算由 cron 对照后来的事实 / 价格 / 宏观观测写入证据；校准报告决定页面能不能把概率显示成百分比，且"样本够"与"校准通过"是两道门。
已定决策（本稿作者，待 owner 确认）：系统判断进新的公共表 `judgments` 家族，而不是扩展 S4 判断台账（§2.4）；v1 只登记**公共生产者 + 公共输入白名单**的判断（§3.5、§5.5）；用户私有判断复用 `recommendations` / `recommendation_scores`（只读适配器，不复制行，且不解锁百分比显示，§11.2）；第三方判断（外资研报评级 / 目标价）本期只定接口（§12.3）。

---

## 1. 目标与非目标

### 1.1 目标

1. **一个契约。** 宏观 / 行业 / 公司 / 外资研报的任何"判断型数字"都落在同一个 TypeScript 契约与同一组表上：`subject`、`judgment_type`、`methodology_id@version`、`inputs`（冻结投影 + 哈希 + 可得日期 + 原始来源定位）、`claim`（概率 / 类别 / 分值 / 区间）、`condition`（按 resolver 区分的可证伪条件）、`target`（登记时已固定的目标 session / 日期 / 财期）、`label_policy`。
2. **方法注册表。** `src/lib/judgments/methodologies/*` 里每个方法是纯函数模块 + 公式文档（`docs/methodologies/<id>/<version>.md`）；`judgment_methodologies` 是代码的镜像，`formula_hash` 覆盖文档、参数、期限**和实现源码**；没有注册的方法不能登记。
3. **回放不靠重抓。** 登记行里冻结了每个输入的投影值；`replay` 用冻结输入重跑方法得到同 id 同 `claim`；对供应商的重抓只是额外的对账结果，不是回放的前提。
4. **结算。** cron 扫描到期判断（独立的可变队列表负责公平调度与重试），按 `condition.resolver` 取实现值，写只追加的 `judgment_settlements`，证据里保存重算所需的完整窗口（整段 K 线、事实 id 与值、宏观观测与 vintage）。价格判断只在能拿到复权口径一致的序列时结算，拿不到就是 `void`，不进校准。
5. **校准决定显示。** 每个 `methodology_id@version` 的校准报告给出独立样本数、Brier、Brier skill、**原始 `p` 在时间外留出段上的 ECE**、可靠性分箱、isotonic 拟合；方法级校准态 `insufficient | failed | calibrated`（score 型为 `evaluated`）；概率型判断只有在方法 `calibrated` 时才渲染为百分比。门控验证的就是页面显示的那个预测器（原始 `p`）；isotonic 映射只进报告（§8.5）。
6. **首批生产者。** `macro_regime@v1`（公共，宏观 WP-M3 发布快照时登记，补偿扫描保证不断链）和 `recommendation_call@v1`（私有只读适配器，把 `recommendations` 读成卡片；其"自评校准"永不解锁百分比）。行业 / 公司 / 外资三个模块的方法由各自规格按 §4 模板注册。

成功标准（计划四退出条件）：
- `registerJudgment()` 对同一 `(subject, type, methodology, inputs, as_of, nonce)` 两次调用返回同一 `judgment_id`，第二次 `duplicate=true`，表内行数不变；同 id 不同语义字段 → `idempotency_conflict` 并进 `dq_quarantine`。
- 回放夹具（§14.4）：每条夹具判断用冻结输入回放后 `judgment_id` 与 `claim` 字节一致；篡改任一冻结投影后回放报 `input_hash_mismatch`。
- 结算 cron 对夹具 K 线 / 事实跑通 `price_return`、`fact_metric`、`macro_regime_replay` 三个 resolver；超过 `settle_by` 仍无数据 → `void(no_data)`；每次运行有 `ingest_batches` 回执与 `dq_freshness('judgments.settle')` 心跳；连续两次 cron 不重复处理同一条。
- 校准数学对已知样本给出已知答案（§14.1，期望值由实施者之外的人用 Python 算出）。
- `GET /api/judgments?subject_type=macro_region&subject_key=US` 返回 active 宏观快照对应的判断卡；方法未 `calibrated` 时响应里没有 `percent` 字段；`/analyst` 页"信心"列不再显示百分比（§11.2）。
- 迁移可重放、`database.types.ts` 手工补齐、含 `S4_TEST_STATE` 的新测试文件进 `scripts/ci/research-checks.ts::criticalSuites`、全量门禁绿。

### 1.2 本规格之外

- 具体业务方法（生命周期分类器、景气评分、估值结论、论点胜率、卖方评级映射）的公式与阈值：由行业 / 公司 / 外资规格各自按 §4 提交。
- 第三方判断入库与其可见性：待 F3 与外资规格（§12.3）。
- 用户自建私有判断：本期不做；`judgments` v1 只有公共行（§5.5 给扩展路径，含 id 命名空间）。
- 组合层 `decisions` / `decision_reviews` 的适配器（§18.2）。
- 持久化日线表：本期不建；结算证据保存完整窗口（§7.4）。
- 可信的私有结算证据表（让分析师信心可以解锁百分比）：§17 O5 的第二阶段。
- 对 S4 台账、S6、fan-out 校准脚本的行为改动：不动；只抽出 `uuidV8()` 纯函数（§2.4 第 5 点，台账测试不变）并 import `isotonicFit / applyIsotonic / wilson`。
- 页面像素设计：Claude Design 画布（§9.6）。

---

## 2. 现状（2026-11-04，计划一落地后；路径均已核实）

### 2.1 已有的判断基础设施

| 组件 | 位置 | 做什么 | 与 F4 的关系 |
|---|---|---|---|
| S4 判断台账 | `supabase/migrations/20260926000000_research_judgment_ledger.sql`；`src/lib/research/s4/ledger.ts`；`docs/superpowers/specs/2026-09-26-judgment-ledger-design.md` | 四张只追加表 `research_judgments / research_labels / research_decisions / research_outcomes`，主键 `(user_id, id)`，外键到 `research_source_documents` 与 `research_theses`（每用户表）；`judgmentId()` = sha256 前 32 位十六进制改写版本位 `8` 与变体位后格式化为 uuid（RFC 9562 v8）；`snapshot` 固定五字段；`backend` 固定枚举；`replayJudgments()` 按来源 `available_at ≤ as_of` 过滤；写入走 `transaction()`（`ALPHA_S4_DATABASE_URL` 独立连接池，`ALPHA_S4_ENABLED=1` 门控，角色 `alpha_s4_runtime`，`research_s4_immutable()` 触发器） | 研究方法自检台账（ADR `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md` §1.1 第 2 点）。F4 照搬三个做法：内容寻址 id 的构造、`canonicalize/digest`（`src/lib/research/ingest/pa-v1/json.js`，RFC 8785）、只追加触发器 + `duplicate / idempotency_conflict` 语义。不扩展它（§2.4） |
| S6 存储与臂血缘 | `src/lib/research/s6/store.ts`、`arm-lineage.ts`、`arm-report.ts`；`research_s6_evaluations` | 对 S4 观察六类记录链逐条校验哈希；外部 evaluator（market-policy/2.0：XNYS 日历 `docs/handoffs/alpha-s4/calendar.json`、SPY/ARCX 基准、固定交易日窗口）；报表状态 `resolved / open / pending_start / data_insufficient` | 证明"输入哈希链 + 固定窗口 + 外部结算"在仓库已跑通，但只服务 XNYS/USD/SPY 且全部私有。F4 借用其结算状态集（§7.2） |
| fan-out 校准 | `src/lib/research/fanout/calibration.ts`、`report.ts`、`report-db.ts`；`scripts/calibration-report.ts`；`docs/superpowers/specs/2026-09-26-calibration-refit-design.md` | 纯函数 `isotonicFit(points) → {segments}`、`applyIsotonic(fit, score)`、`wilson(k, n)`、`crossFittedEce`（5 折）、`MIN_LABELS = 30`（每问题的标签总量门槛）；脚本只读台账写 `docs/calibration/<date>.{json,md}` | F4 import 前三个函数；Brier、可靠性分箱、混淆矩阵、有效样本分组是新写的（§8.1） |
| 分析师评分层 | `20261017090000_analyst_scoring.sql`、`20261017120000_recommendations_append_only.sql`、`20261018090000_recommendation_scores_base_close.sql`；`src/lib/scoring/forward.ts`、`src/lib/analyst/score-store.ts`；两份 2026-10-17/18 规格 | `recommendations`（每用户；BEFORE UPDATE 触发器只允许一次撤回与一次 `fill_price/fill_date` 写入）带 `confidence int 0–100`；`recommendation_scores` 由 `scoreForward()` 写 5/20/60 交易日前向收益、`hit`（第 5 根后续 bar 的方向）、`calibration_bucket`、`base_close/base_date`；**RLS 给 owner select/insert/update/delete，评分刷新是 upsert**；K 线 `fetchEastmoneyKline(ticker,'D',120)`；评分由用户按需 POST | 现成的"私有判断 + 前向评分"。但 `recommendation_scores` 可被 owner 改写、刷新会重写，所以它是**自评**而非可信结算证据（审计 F07）。F4 的 `recommendation_call@v1` 只读它做卡片与自评报告，不据此解锁百分比（§11.2） |
| 组合决定层 | `20260702090000_decision_layer.sql`：`decisions`、`decision_reviews`（与 `recommendation_scores` 同形）；`src/lib/portfolio/review.ts::scoreDecision` | 实盘账本上的采纳事件；`decisions` 没有只追加触发器 | 同内核，本期不接（§18.2） |
| 宏观规格的判断期望 | 宏观规格 §4.3、§5.3、§8 | 规则打分型判断，有方法版本与快照（`macro_snapshots.observation_ids`、`coverage`、`margin`、`growth_axis`、`inflation_axis`），"归一化得分不称为概率"，`coverage < 0.6` 不发布；`REPORT.md` §10.1："若后续要提供概率，需定义可检验标签、时间外验证、基准模型、可靠性曲线和 Brier score" | F4 的 `macro_regime@v1` 给它补上可检验标签（§11.1）、结算与校准；宏观表不动 |
| 数据质量底座（计划一，已落地） | `20261105090000_dq_foundation.sql`；`src/lib/dq/{batches,quarantine,freshness,rules,dashboard}.ts`；`src/lib/db/table-client.ts`（Supabase / memory / pg；**无事务、无 rpc**） | `ingest_batches` 六个固定计数器，`INFO_CODES = ['skipped_summary','relink']`，`batchStatusFromCounts`：`fetched > 0` 且无 accounted → `failed`；非信息码错误 → partial/failed；`dq_quarantine` 每键一条 open；`dq_freshness` daily 宽限 2 天 | 结算 / 校准任务用 `startBatch/finishBatch`、`quarantine()`、`recordAttempt()`；需要在 `INFO_CODES` 里显式加 F4 的信息码，并加 `deferred` 计数器（§7.5） |
| 发行人与行业分类（计划一，已落地） | `20261105091000_issuers.sql`：`issuers(status, merged_into)`、`issuer_securities`（持有窗口互斥）、`industry_classifications(scheme, version, code)`、`issuer_industry_memberships(valid_from, valid_to)`；anon 可读 | 主体主数据 | `subject_type='issuer'` 用 `issuer_id`；`'industry'` 用 `scheme:version:code` |
| 披露事实（规格二第 8 稿，待实施） | `financial_facts(fact_id, raw_hash, value_text, available_date, mapping_gen, status)`；`financial_metrics` 主键 `(issuer_id, market, metric, period_start, period_end, input_unit, basis, formula_version)`，含 `inputs[{fact_id,…}]`、`based_on_rev`；`FactsDb.readFacts(issuer, market, {concepts, asOf, …}) → {stateRev, rows, truncated}`（rpc `read_facts`）、`factsByIds(ids)`、`metricsOfIssuer(issuer, market, formulaVersion)`；读接口 `GET /api/facts/[ticker]?factIds=`（≤ 100） | 事实层 | 输入引用 `financial_fact` 用 `fact_id`（回放走 `factsByIds`）；`financial_metric` 引用复合键 + 物化行的 `inputs` 事实 id 列表 + `based_on_rev`，冻结投影里带全部底层 `fact_id`（§3.5）；结算 `fact_metric` 用 `readFacts(…, asOf = 截止日)`（§7.3） |

### 2.2 对方四个页面上的判断型数字（`EXPERT_PLAYBOOK_AND_BRIEF.md` §1.1 / §2.1 / §3.1、`MACRO_STRATEGY_DEEP_DIVE.md` §4.1、`REPORT.md` §3 / §6）

| 页面 | 数字 | 分类 | F4 处理 |
|---|---|---|---|
| 宏观 | 四象限主判定 + "置信度"（归一化得分 `score[q]/Σscore` 被叫作概率）、备选象限、流动性阶段、资产配置建议、超 / 低配行业、"回测准确率 2/3" | 判断（类别型，带非概率得分） | `macro_regime`：类别型；`claim.distribution` 存归一化得分并标 `scores_are_not_probabilities=true`；标签 = **同一分类函数、同一参考期、截止 vintage** 下重算的主判定（§11.1）；"置信度"一词不再出现 |
| 行业 | 6 阶段生命周期、88 细分行业 × 6 阶段矩阵、Gartner 曲线位置、6 阶段选股模型 | 判断（类别型） | `industry_lifecycle_stage`：标签 = 未来 3 年行业营收 CAGR 落在该阶段的区间（行业规格给区间与 `fiscal_quarters` 期限） |
| 行业 | 5 维景气雷达（估值维度 50 占位、现金流用利润增速代理，`REPORT.md` Q10） | 判断（分值型） | `industry_prosperity`：分值型；缺维度就缺（`coverage`），不补 50、不用代理；方法必须声明实现指标（排序评估，§8.1） |
| 行业 | PE / PB / PS 11 年分位 | 派生事实 | 不是判断，归行业规格的派生指标 |
| 行业 | PB + PS 均值分位 30 / 70 → 高估 / 低估结论 | 判断（类别型） | `valuation_verdict`：标签 = 未来 12 个月相对基准收益的方向 |
| 公司 | 值博率星级、胜率、预期涨幅、下跌空间、赔率、凯利仓位、季度上调 / 下调 | 胜率 = 概率型；涨幅 / 下跌空间 = 情景区间型；赔率 / 凯利 / 星级 = 派生 | `thesis_win_rate`（概率）、`return_range`（区间，必须带情景概率，§9.4）；赔率、凯利、星级**不单独登记**，读取时派生并受 §9.4 门控 |
| 公司 | 覆盖时价格、研究日期、DCF 勾选 | 事实 / 元数据 | 价格作为 `price_bar` 输入冻结进快照 |
| 监控 | 核心跟踪指标（目标标准 / 实际 / 置信度变化 / 权重）、跟踪事件、胜率 / 赔率 / 凯利 before→after、下次跟踪节点 | 检查点 = 可证伪条件；before→after = 同主体同类型的两条判断 | 不设"修改"，只有新登记；历史接口 §10 |
| 监控 / 外资研报 | 机构评级、目标价 / 空间、OW / MIXED / N/A、方法论假设（WACC、g、终值占比）、风险 | 第三方判断 + 第三方假设 | `sellside_rating` / `sellside_target_price` 本期只定接口（§12.3）；假设是文档抽取字段，不是判断；在登记为判断之前，页面必须把它们标为"第三方判断（未结算）"，不得以事实样式展示 |
| （任务书提到的）拥挤度 | 三份 teardown 文档与 `PAGE_INVENTORY.csv` 均未出现 | — | 不定义类型 |

### 2.3 结算可用的数据能力

- **价格**：仓库没有持久化日线表（`supabase/migrations` 无 `daily_bars` / `kline` / `price_history`；`quote_alert_window_samples` 是告警抽样函数）。日线抓取：`fetchDatagatewayDailyKline(ticker, market, limit, adjustment, {signal, timeoutMs})`（`datagatewayDailyKlineBody` 以**当前时间**为终点、`max(30, limit × 3)` 天为窗口；`DATAGATEWAY_DAILY_TIMEOUT_MS = 7000`；仅 `isDatagatewayConfigured()` 时）；`fetchEastmoneyKline(ticker, 'D', limit, {adjustment, signal, timeoutMs})`（URL 固定 `end=20500101`，即"最新 `limit` 根"；美股 `tickerToSecid` 失败时按前缀逐个尝试；每次默认 5 s；A 股默认 `qfq`，HK / US 默认 `none`，但 `adjustment` 参数可传 `qfq/hfq`——**东方财富对港美股的复权是否有效未验证**）；`fetchTencentKline` / `fetchSinaIntradayKline`。两个日线适配器都**没有"按历史日期范围取"的参数**：F4 必须给它们加 `endDate` 选项（东方财富 `end=` 参数本就存在；DataGateway body 已有 `startDate/endDate`），否则迟到结算会取不到基准 bar（审计 F17）。
- **交易日历**：只有 XNYS（`calendar.json`，2026–2028 冻结）。A / HK 无日历；`scoreForward` 用 K 线序号数交易日。
- **事实**：规格二第 8 稿 `FactsDb`（待实施）。
- **宏观观测**：宏观规格 `macro_observations(series_id, period_end, value, available_at, vintage_id)`（待实施）。
- **代码版本**：`ingest_batches.code_version`；部署环境 `VERCEL_GIT_COMMIT_SHA`。
- **数据源许可**：东方财富 / DataGateway / Tushare 都是**适配器**，原发布方分别是交易所行情（经数据商转发）、SEC / 交易所。F4 在输入与证据里记录 `origin`（原发布方）、`adapter`、`locator`、`transform`；展示许可是 owner 事项（§17），仓库里没有证据能证明。

### 2.4 为什么新建 `judgments` 而不是扩展 `research_judgments`

1. 可见性相反：台账主键含 `user_id`，RLS 只给 owner；总纲要求系统判断公共可读。
2. 外键指向每用户表；系统判断的主体是 `issuers` / `industry_classifications` / 宏观区域，输入是 `financial_facts` / `macro_observations`。
3. `snapshot` 固定五字段、`backend` 固定枚举、键里有 `question_set_version/question_id`，是 fan-out 问题集的形状；改它等于改 `docs/contracts/judgment-ledger-v1.md` 契约（台账规格明言"先改契约再改表"）。
4. 运行环境不同：台账走独立连接池与 `alpha_s4_runtime` 角色；公共读接口走 anon PostgREST（计划一惯例）。
5. 台账里值得照搬的只有三件事（§2.1 第一行）。其中 uuid v8 格式化是 `judgmentId()` 内 4 行纯逻辑，抽到 `src/lib/research/ingest/pa-v1/uuid-v8.ts::uuidV8(hex64)` 供两处调用——这是对 S4 代码的一次有限、行为不变的改动（`ledger.test.ts` 原样通过是 F4-0 的退出条件）。

---

## 3. 契约 `src/lib/judgments/contract.ts`

### 3.1 主体 `Subject`

```ts
type Subject =
  | { type: 'issuer';       key: string }   // issuers.issuer_id；登记时 status='active'
  | { type: 'industry';     key: string }   // `${scheme}:${version}:${code}`，三段都在 industry_classifications
  | { type: 'macro_region'; key: 'US' | 'CN' }
  | { type: 'macro_series'; key: string }   // macro_series.id（宏观规格 §4.2 白名单）
  | { type: 'security';     key: string }   // `${market}:${ticker}`；只给私有适配器用（§11.2），公共表拒绝
  | { type: 'document';     key: string };  // F3 文档 id（§12.3；v1 公共表拒绝）
```

`validateSubject()` 校验格式；`JudgmentsDb.subjectExists()` 查存在性（发行人 `merged/dissolved` → `subject_inactive`）。公共表 v1 只接受前四种。

### 3.2 判断种类 `kind` 与主张 `claim`

| `kind` | `claim` | 校准指标（§8.1） | 百分比规则 |
|---|---|---|---|
| `probability` | `{ p: number ∈ [0,1], event: {zh,en} }` | Brier、Brier skill、可靠性分箱、ECE、isotonic | **只有方法校准态 `calibrated` 才显示 `p` 为百分比** |
| `categorical` | `{ selected, classes: string[], distribution?: Record<string, number>, scores_are_not_probabilities: boolean, margin?: number }` | 准确率（Wilson）、混淆矩阵、按 `margin` 分箱的准确率；`distribution` **不**进 Brier | `distribution` 永不显示为百分比 |
| `score` | `{ value, scale: {min, max}, dims: Array<{id, value: number \| null, weight, coverage: boolean}>, coverage: number, realized_metric: string }` | Spearman（`value` vs 实现指标）、按分值三分位分组的实现指标均值；**不做 Brier** | 分值可显示（不是概率），带校准徽章；缺维度显示缺口 |
| `interval` | `{ metric, low, high, unit, nominal_coverage: number ∈ (0,1), scenarios?: Array<{label, p, value}> }` | 实际覆盖率 vs `nominal_coverage`（Wilson）、区间宽度分布 | 显示区间 + 名义覆盖；`calibrated` 态附实际覆盖率 |

主张是判别联合 `Active | Abstained`：`Abstained = { abstained: true, reason: string, missing?: string[] }`，允许 `inputs` 为空（缺输入正是常见的弃权原因）；`Active` 必须有 `claim / condition / target / horizon / label_policy`。弃权行被登记是为了页面能说"为什么没有判断"，不结算、不进校准。

### 3.3 可证伪条件 `condition`（按 resolver 区分的联合类型）

```ts
type Condition =
  | { resolver: 'price_return';   params: { ticker; market; adjustment: 'qfq'|'hfq'; base_date: string; benchmark?: { ticker; market } };
      predicate: { op: '>'|'>='|'<'|'<='|'between'; rhs: number | [number, number] }; text: {zh,en} }
  | { resolver: 'fact_metric';    params: { issuer_id; market; metric; period_start; period_end; duration; unit; input_unit; basis; formula_version; compare: 'value'|'yoy' };   // 完整 financial_metrics 自然键
      predicate: { op: '>'|'>='|'<'|'<='|'between'; rhs: number | [number, number] }; text }
  | { resolver: 'macro_regime_replay'; params: { region; reference_period: string /* YYYY-MM */; macro_methodology_version: string; catalog_version: string };
      predicate: { op: 'eq'; rhs: 'recovery'|'overheat'|'stagflation'|'recession' }; text }   // §11.1：同一分类函数在截止 vintage 下重算
  | { resolver: 'industry_aggregate'; params: Record<string, string|number>; predicate: …; text }   // 行业规格定义
  | { resolver: 'recommendation_hit'; params: { recommendation_id }; predicate: { op: 'eq'; rhs: true }; text };   // 仅私有适配器；公共表拒绝
```

`categorical` 的 `predicate.op='eq'`、`rhs = claim.selected`，实现值是 resolver 给出的实现类别；`interval` 用 `between [low, high]`；`probability` 的事件由 `predicate` 定义，`hit = predicate(实现值)`。方法模块的 `condition()` 是纯函数；条件登记后不可改。每个 resolver 导出 `validateParams()`（JSON Schema，ajv，仓库已有）与 `labelAvailableAt(params, target)`（标签最早可得时刻的估计，§3.4 前瞻资格用），登记时调用。"资产配对"条件（`r_long − r_short`）**不在 v1 的联合类型里**：它需要独立的 resolver、序列配对读取、币种与回报口径契约，列为未实现能力（§11.1、§18.1）。

### 3.4 目标期 `target`、期限 `horizon`、标签政策 `label_policy`

```ts
type Horizon = { unit: 'trading_sessions' | 'calendar_days' | 'calendar_months' | 'fiscal_quarters'; n: number };
type Target  =
  | { kind: 'session_index'; base_date: string; n: number }                 // 第 n 根 base_date 之后的 bar（含义同 scoreForward）
  | { kind: 'date';          date: string }                                 // 交易所本地 / UTC 日期（§3.7）
  | { kind: 'period';        period: string }                               // YYYY-MM（calendar_months：as_of 所在月 + n；n=0 表示 as_of 所在月本身）
  | { kind: 'fiscal_period'; period_end: string; calendar: { anchor_period_end: string; months: 3 }; extrapolated: boolean };
type LabelPolicy = 'first_observed' | 'cutoff_vintage';
```

- `target` 在登记时由方法的 `resolveTarget(subject, asOf, horizon, inputsDb)` 固定（方法级解析器；本规格给默认实现）：`session_index` 需要 `base_date` = 登记输入里的 `price_bar.date`；`date` = `as_of + n 天`；`period` = `as_of 所在月 + n`；`fiscal_period`：`anchor_period_end` = `filingsOfIssuer` 已知的最新 `period_end`，以 3 个月为步长外推得到 `as_of` 之后第 n 个季末（`n ≥ 1`，允许多季；冻结 `calendar` 使回放不依赖之后的 filing；已知序列覆盖时 `extrapolated=false`）；无任何 filing → abstain `target_unresolvable`。
- `settle_after`（扫描提示，不是期限）= `session_index`: `base_date + n 天`（交易日 ≥ 自然日，这是最早可能到期）；`date`: 该日；`period`: 该月末；`fiscal_period`: `period_end + 1 天`。`settle_by`（超过即 `void(no_data)`）= `settle_after + grace`，`grace` 是**方法参数**（`params.grace_days`），本规格给默认值并说明依据：价格类 60 天（覆盖分析师规格 §5 记录的 60 交易日 ≈ 86–91 自然日的长假偏差再留余量——政策常量，非推导）；`calendar_days / calendar_months` 类 30 天（一个月度发布周期——政策常量）；`fiscal_period` 类 120 天（规格一 §5.2 财报日历：A 股年报截止期末后 120 天，美股 10-K 最长 90 天；取最长）。
- `label_policy`：`first_observed` = 结算 cron **首次观测到**实现值时结算（实现值是当时的当前值，之后的修订不再改动结算；证据记录观测时刻与 `state_rev / vintage`，这个政策对调度时刻有依赖，文档如实披露）；`cutoff_vintage` = 只在 `settle_by` 当天用当时可见的当前值结算（宏观默认，因修订频繁）。两种政策都要求实现值的可得时刻 `≤ settle_by`，否则 `void(no_data)`。
- **预测承诺时刻** = `registered_at`。`retrospective = true` 当且仅当以下任一成立：`as_of < registered_at::date`；`target` 对应的最早到期时刻 `≤ registered_at`；resolver 的 `labelAvailableAt(params, target) ≤ registered_at`（标签在登记时已可得）。`retrospective` 的判断照常结算，但**不进前瞻校准**（§8.2）。历史补登记只有在能给出不可变的发布证据（例如当时已发布的宏观快照 `created_at` 与内容哈希）时才可申请"恢复前瞻资格"（§17 O7，v1 不实现）。

### 3.5 输入引用 `InputRef`（冻结投影 + 哈希 + 来源定位）

```ts
interface InputRef<K, R, S> {
  kind: K; ref: R;                 // 定位（可查回）
  snapshot: S;                     // 登记时冻结的投影值（回放用它，不重抓）
  hash: string;                    // digest(snapshot)
  available_at: string;            // 该输入的可得时刻（§3.7）
  origin: { publisher: string; adapter: string; locator: string; transform?: string; license?: string };
}
type Input =
  | InputRef<'financial_fact',   { fact_id },                                                    { fact_id, issuer_id, market, concept, period_start, period_end, duration, value_text, unit, consolidation, available_date, filing_id, mapping_gen }>
  | InputRef<'financial_metric', { issuer_id, market, metric, period_start, period_end, input_unit, basis, formula_version }, { …复合键, value_text, unit, duration, as_of, based_on_rev, input_facts: FactProjection[] }>   // input_facts = 全部底层事实的完整投影（同 financial_fact 的 snapshot 形状），回放不需要再读事实层（审计 G20）
  | InputRef<'macro_observation',{ series_id, period_end, vintage_id },                            { series_id, period_end, value, unit, vintage_id, available_at }>
  | InputRef<'macro_snapshot',   { snapshot_id },                                                 { snapshot_id, region, as_of, methodology_version, observation_ids, primary_state, secondary_state, scores, coverage, margin, growth_axis, inflation_axis }>
  | InputRef<'price_bar',        { ticker, market, date, source: KlineSourceName, adjustment },   { ticker, market, date, source, adjustment, open: number|null, high: number|null, low: number|null, close, volume: number|null, amount?: number|null, fields_present: string[] }>   // DataGateway close-only 分支只有 close：其余字段 null，不合成（审计 G27）
  | InputRef<'table_rows',       { table: PublicTable, natural_key },                             { table, natural_key, rows: Row[] }>        // PublicTable = anon 可读表白名单（issuer_industry_memberships、industry_classifications、macro_series…）
  | InputRef<'judgment',         { judgment_id },                                                 { judgment_id, claim, as_of }>              // 只能引用公共表里的判断
  | InputRef<'legacy_fill',      { recommendation_id },                                           { recommendation_id, fill_price, fill_date, market, ticker }>   // 仅私有适配器
  | InputRef<'document_span',    …>;                                                              // 保留给 F3；v1 公共表拒绝
```

- `hash = digest(snapshot)`；`inputs_hash = digest(inputs 按 (kind, canonical(ref)) 排序后的 [kind, ref, hash] 数组)`。
- **公共输入白名单**（v1 公共表接受的 `kind`）：`financial_fact`、`financial_metric`、`macro_observation`、`macro_snapshot`、`price_bar`、`table_rows`（表白名单）、`judgment`（公共）。每个方法再声明自己的 `input_kinds ⊆ 白名单`；登记时双重检查（审计 F01）。
- **输入只能由固定构造器生成**（审计 G03）：`src/lib/judgments/inputs.ts` 对每种 `kind` 导出 `buildInput(ref, inputsDb)`，它只通过 `JudgmentInputsDb` 的**公共读取路径**（facts / macro / table_rows 用 **anon 客户端**实现，RLS 生效：只看得到 `status='ok'`、公开的行；`judgment` 只查公共表；`price_bar` 走 K 线适配器）取值并生成 `snapshot`、`available_at`、`origin`。`registerJudgment` 对每个输入**重新执行构造器**并要求结果与提交的 `snapshot` 字节一致（`input_snapshot_mismatch`）；构造器取不到（行不存在、被隔离、不公开）→ `input_not_public`。service-role 能读到的隔离行因此进不了公共表。结算证据走同一规则（§7.3 的 `fact_metric / macro_regime_replay` 用 anon 路径取值）。
- `origin` 不是自由文本：`publisher / adapter / locator 模板 / transform / license_status` 来自冻结表 `src/lib/judgments/origins.ts`（按 `kind × adapter` 键；例如 `price_bar × eastmoney → publisher: '交易所行情（经东方财富转发）', license_status: 'unverified'`），构造器填充，登记校验键存在。`license_status='unverified'` 的输入可以登记，但该方法的 `publishable=false` 直到 owner 确认（§4.1、§17）。
- 登记校验 `max(inputs.available_at) ≤ as_of 的日终`（§3.7），否则 `lookahead`。
- `financial_metric` 的冻结投影带 `input_facts`（完整事实投影），回放直接用它们重算派生值（物化行是可替换缓存，不是版本；审计 F03 / G20）；`factsByIds` 只在 `--reconcile` 对账时用。

### 3.6 生产者与 nonce

`producer_kind ∈ {rule, model, human, third_party}`；`producer_ref`：`rule` → `{}`；`model` → `{ model, prompt_sha256, run_id }`；`human` → `{ analyst_id, source_record: { table, id } }`；`third_party` → `{ institution, document_id, version_hash }`。`producer_nonce`（进 id）：`rule` → `''`；`model` → `run_id`（同一 run 重试 → 同 id；新采样 = 新 run_id）；`human` → `${analyst_id}:${source_record.table}:${source_record.id}`（稳定，重试收敛）；`third_party` → `${document_id}:${version_hash}`。

### 3.7 日期与时刻语义

- `as_of` 是**日期**；"可见"⇔ `available_at ≤ as_of 的 23:59:59.999Z（UTC）`。
- 各输入的 `available_at`：事实 = `available_date` 的 UTC 日终（规格二只到日期精度）；宏观观测 = `macro_observations.available_at`（timestamptz）；宏观快照 = **其 `observation_ids` 的 `available_at` 最大值**（不是快照 `created_at`，审计 F10）；K 线 = 该交易日在交易所时区的收盘时刻换算到 UTC（`EXCHANGE_TZ` 来自 `forward.ts`；收盘时刻 A 15:00、HK 16:00、US 16:00 本地）；`table_rows` = 行的 `updated_at` 或 `valid_from` 日终。
- `price_bar.date`、`target.base_date` 是交易所本地日期（`exchangeDate()`）；`target.date`（`calendar_days`）是 UTC 日期；`period_end` 是财务日期。
- `registered_at` 是数据库 `now()`（§5.6 `judgments_server_time()`），不是进程时钟。

---

## 4. 方法注册表 `src/lib/judgments/methodologies/`

### 4.1 模块接口

```ts
export interface Methodology<C extends Claim> {
  id: string; version: string;                         // 'v1'；任何公式、阈值、输入集合、条件、期限、标签政策或实现的改动都是新版本
  judgment_type: JudgmentType; kind: Kind; producer_kind: ProducerKind;
  subject_types: Subject['type'][]; markets?: Array<'A'|'HK'|'US'>;   // 价格类方法声明支持的市场（§7.4）
  input_kinds: Input['kind'][];                        // ⊆ 公共白名单
  upstream?: { macro_methodology_version?: string; facts_formula_version?: string };   // 上游方法版本绑定（审计 F28）
  doc: string;                                         // docs/methodologies/<id>/<version>.md
  params: Record<string, number | string>;             // 含 grace_days、label_policy 等（标量）；需要表状参数的方法用 params_json（JSON Schema 校验）
  params_json?: Record<string, unknown>;
  horizon: Horizon;
  deps: string[];                                      // 本方法依赖的共享模块路径（resolver、规则表、目录快照…），进 formula_hash（审计 G20）
  gather(subject, asOf, db: JudgmentInputsDb): Promise<Input[] | Abstained>;   // 唯一允许 I/O 的函数；只能经 inputs.ts 的构造器
  resolveTarget(subject, asOf, horizon, db): Promise<Target | Abstained>;       // §3.4
  compute(subject, inputs: Input[]): Active<C> | Abstained;                   // 纯函数
  condition(subject, inputs, claim: C): Condition;                            // 纯函数
}
```

- `formula_hash = digest({ id, version, params, params_json, horizon, upstream, doc_sha256, implementation_sha256, deps_sha256 })`，`implementation_sha256` = 方法模块**本地 import 闭包**（`sync-methodologies.ts` 从方法模块出发遍历所有相对 / `@/` 导入，不区分是否在 `src/lib/judgments/` 内，排除 `node_modules`）中每个文件 sha256 的有序 digest；`deps_sha256` = `deps` 列出的**非 import 依赖**（数据文件、规则表 JSON、能力表、目录快照）的有序 digest。闭包自动计算，`deps` 只补 import 图看不到的东西，所以不存在"漏列共享模块"（审计 G20）；改实现或依赖不升版本 → 同步脚本报 `formula_hash_drift` 并拒绝同步（审计 F22）。
- `status ∈ {draft, active, retired}`：`draft` 只能在测试与 `--dry-run` 下登记；`retired` 不再登记但继续结算与校准。`publishable boolean`（默认 `false`）：只有 owner 确认该方法全部输入 `origin.license_status='confirmed'` 后由同步脚本置 `true`；`publishable=false` 的方法照常登记、结算、校准，但读接口**不返回**它的卡片（`/admin/judgments` 可见）。这是总纲"一手来源 + 许可先行"的发布准入（审计 F29）。

### 4.2 公式文档固定章节

1 回答什么问题；2 主体与输入（每个 `kind`、来源表、`available_at` 口径、`origin`）；3 公式与参数（与 `params` 一致，参数来源注明）；4 可证伪条件、目标期、标签政策；5 结算 resolver 与实现值定义（自然键、单位、覆盖要求）；6 不适用情形（何时 abstain）；7 版本历史。

### 4.3 v1 声明的判断类型

| `judgment_type` | `kind` | 主体 | 首个方法 | 归属规格 |
|---|---|---|---|---|
| `macro_regime` | categorical | macro_region | `macro_regime@v1`（§11.1） | 本规格 + 宏观 |
| `macro_regime_asset_pair` | probability | macro_region | —（**未实现能力**：需要配对 resolver 与回报序列契约，§11.1、§18.1；O3 决定是否立项） | 本规格 + 宏观 |
| `recommendation_call` | probability | security / issuer | `recommendation_call@v1`（§11.2，私有适配器） | 本规格 |
| `industry_lifecycle_stage` | categorical | industry | — | 行业规格 |
| `industry_prosperity` | score | industry | — | 行业规格 |
| `valuation_verdict` | categorical | industry / issuer | — | 行业规格 |
| `thesis_win_rate` | probability | issuer | — | 公司规格 |
| `return_range` | interval | issuer | — | 公司规格 |
| `sellside_rating` / `sellside_target_price` | categorical / interval（third_party） | issuer | — | 外资规格（需 §12.3） |

---

## 5. 数据模型

迁移 `supabase/migrations/20261108090000_judgments.sql`（晚于规格二 `20261106090000`；并行规格撞号时取更晚的分钟位），可重放；补 `migrations.lock.json`；`database.types.ts` 手工补八个 Row 类型（§5.1–§5.5b 八张表）与 §5.6 的全部 `Functions`。

### 5.1 `judgment_methodologies`（代码镜像）

```
methodology_id    text not null check (methodology_id ~ '^[a-z][a-z0-9_]{1,63}$')
version           text not null check (version ~ '^v[1-9][0-9]{0,3}$')
judgment_type     text not null
kind              text not null check (kind in ('probability','categorical','score','interval'))
producer_kind     text not null check (producer_kind in ('rule','model','human','third_party'))
subject_types     text[] not null
input_kinds       text[] not null
markets           text[]
title_zh          text not null
title_en          text not null
doc_path          text not null
doc_sha256        text not null check (doc_sha256 ~ '^[0-9a-f]{64}$')
implementation_sha256 text not null check (implementation_sha256 ~ '^[0-9a-f]{64}$')
params            jsonb not null default '{}' check (jsonb_typeof(params) = 'object')
params_json       jsonb not null default '{}' check (jsonb_typeof(params_json) = 'object')
horizon           jsonb not null check (jsonb_typeof(horizon) = 'object')
upstream          jsonb not null default '{}' check (jsonb_typeof(upstream) = 'object')
deps_sha256       text not null check (deps_sha256 ~ '^[0-9a-f]{64}$')
formula_hash      text not null check (formula_hash ~ '^[0-9a-f]{64}$')
status            text not null check (status in ('draft','active','retired'))
publishable       boolean not null default false
code_version      text not null
created_at        timestamptz not null default now()      -- 首次同步时刻，不可变（审计 N3）
synced_at         timestamptz not null default now()      -- 最近一次同步（运行元数据，不参与历史判定）
primary key (methodology_id, version)
```

触发器 `judgment_methodologies_limited_update`：`update` 只允许改 `status / publishable / synced_at / code_version`，其余列（含 `created_at`）变化 → `23514 append_only:judgment_methodologies`；`delete` 禁止。当前行只是"现在的状态"；历史状态来自下表。

#### 5.1b `judgment_methodology_events`（方法状态的只追加事件史，审计 N3）

```
event_id         uuid primary key
methodology_id   text not null
version          text not null
seq              integer not null check (seq >= 1)
event            text not null check (event in ('registered','status_changed','publishable_changed','resynced'))
status           text not null check (status in ('draft','active','retired'))     -- 事件后的状态
publishable      boolean not null                                                 -- 事件后的值
formula_hash     text not null
code_version     text not null
actor            text not null check (actor ~ '^(script|admin:[0-9a-f-]{36})$')
reason           text
occurred_at      timestamptz not null
unique (methodology_id, version, seq)
foreign key (methodology_id, version) references judgment_methodologies(methodology_id, version)
index (methodology_id, version, occurred_at)
```

只追加触发器。`sync_methodology` RPC（§5.6）在一个事务里：首次 → 插当前行 + `registered` 事件；状态 / 可发布变化 → 更新当前行允许列 + 对应事件；无变化的重同步 → 只更新 `synced_at` + `resynced` 事件（不改 `created_at`）。"截至 `cutoff` 的方法状态" = `occurred_at ≤ cutoff` 的最后一条事件（没有 → 该方法当时不存在）。

### 5.2 `judgments`

```
judgment_id         uuid primary key
subject_type        text not null check (subject_type in ('issuer','industry','macro_region','macro_series'))   -- v1 公共表只收这四种
subject_key         text not null check (length(subject_key) between 1 and 128)
judgment_type       text not null
methodology_id      text not null
methodology_version text not null
kind                text not null check (kind in ('probability','categorical','score','interval'))
producer_kind       text not null check (producer_kind in ('rule','model'))                  -- v1 公共表：human/third_party 拒绝（§5.5）
producer_ref        jsonb not null default '{}' check (jsonb_typeof(producer_ref) = 'object')
producer_nonce      text not null default ''
as_of               date not null
registered_at       timestamptz not null
retrospective       boolean not null
inputs              jsonb not null check (jsonb_typeof(inputs) = 'array')                     -- 可为空数组（仅弃权）
inputs_hash         text not null check (inputs_hash ~ '^[0-9a-f]{64}$')
abstained           boolean not null
abstain_reason      text
claim               jsonb check (claim is null or jsonb_typeof(claim) = 'object')
condition           jsonb check (condition is null or jsonb_typeof(condition) = 'object')
horizon             jsonb check (horizon is null or jsonb_typeof(horizon) = 'object')
target              jsonb check (target is null or jsonb_typeof(target) = 'object')
label_policy        text check (label_policy in ('first_observed','cutoff_vintage'))
settle_after        timestamptz
settle_by           timestamptz
code_version        text not null check (length(code_version) between 7 and 64)
batch_id            uuid not null references ingest_batches(batch_id) on delete restrict
created_at          timestamptz not null default now()
foreign key (methodology_id, methodology_version) references judgment_methodologies(methodology_id, version) on delete restrict
constraint judgments_active_shape check (
  (abstained and claim is null and condition is null and horizon is null and target is null and label_policy is null and settle_after is null and settle_by is null and abstain_reason is not null)
  or (not abstained and claim is not null and condition is not null and horizon is not null and target is not null and label_policy is not null and settle_after is not null and settle_by is not null and abstain_reason is null))
constraint judgments_active_has_inputs check (abstained or jsonb_array_length(inputs) > 0)
constraint judgments_settle_order check (settle_by is null or settle_by > settle_after)
index (subject_type, subject_key, judgment_type, as_of desc, registered_at desc, judgment_id)
index (methodology_id, methodology_version, as_of) where not abstained
index using gin (inputs jsonb_path_ops)
```

触发器 `judgments_append_only`：`update` / `delete` 一律 `23514 append_only:judgments`。没有状态列；生命周期由最新结算行与队列派生（§7.2、§9.1）。

### 5.3 `judgment_settlements`（证据，只追加）

```
settlement_id     uuid primary key
judgment_id       uuid not null references judgments(judgment_id) on delete restrict
seq               integer not null check (seq >= 1)
kind              text not null check (kind in ('settled','void','withdrawn','reopened'))
outcome           text check (outcome in ('hit','miss'))
realized          jsonb check (realized is null or jsonb_typeof(realized) = 'object')     -- {value, label?, unit, from, to, label_policy}
evidence          jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object')
resolver          text not null
resolver_version  text not null
reason            text
actor             text not null check (actor ~ '^(cron|script|admin:[0-9a-f-]{36})$')
settled_at        timestamptz not null
request_key       text not null check (length(request_key) between 8 and 128)   -- 调用方幂等键（cron: `<batch_id>:<judgment_id>:<seq 预期>`；admin: 请求 uuid）；持久化供重放判定（审计 G10）
request_digest    text not null check (request_digest ~ '^[0-9a-f]{64}$')          -- digest(canonical 操作载荷：kind/outcome/realized/evidence/resolver/reason/actor)；重放比对用（R06）
code_version      text not null
batch_id          uuid not null references ingest_batches(batch_id) on delete restrict
unique (judgment_id, seq)
unique (request_key)
constraint settlements_outcome_iff_settled check ((kind = 'settled') = (outcome is not null) and (kind = 'settled') = (realized is not null))
constraint settlements_reason_unless_settled check (kind = 'settled' or reason is not null)
index (settled_at desc)
```

只追加触发器 + `settlement_sequence` 触发器：`seq` 必须等于 `1 + max(seq)`（`append_settlement` RPC 在锁住队列行后计算；直接插入的行若 `seq` 不连续 → `23514 settlement_sequence`）；允许的转移：`∅ → settled | void`；`void → reopened`（仅 admin）；`reopened → settled | void`；`settled → withdrawn`（仅 admin）；`withdrawn → reopened`（仅 admin，纠错后重结算）。其他转移 `23514 settlement_sequence`。**只有 `settled` 行有 `outcome / realized`**（与 CHECK 一致）。序号示例：`settled(1) → withdrawn(2) → reopened(3) → settled(4)`；`void(1) → reopened(2) → settled(3)`。

### 5.4 `judgment_settle_queue`（可变的调度状态，不是证据）

```
judgment_id       uuid primary key references judgments(judgment_id) on delete restrict
settle_after      timestamptz not null
settle_by         timestamptz not null
label_policy      text not null
next_attempt_at   timestamptz not null
attempts          integer not null default 0
last_status       text check (last_status in ('pending','unavailable','inconsistent','error'))
last_detail       jsonb not null default '{}'
leased_until      timestamptz
lease_token       uuid                         -- 领取时生成；释放 / 追加必须带同一 token（fencing，审计 G10）
override          jsonb                        -- 隔离项接受后的裁决：{reason_code, resolution, resolved_by, at}（§7.6）
closed_at         timestamptz                  -- 终态（settled / void / withdrawn）时填；reopened 清空
updated_at        timestamptz not null default now()
index (next_attempt_at, judgment_id) where closed_at is null
```

登记活跃判断时同事务（RPC，§5.6）插入一行；结算写入后更新。扫描顺序 `next_attempt_at asc, judgment_id asc`，取 `closed_at is null and next_attempt_at <= now and (leased_until is null or leased_until < now)`；领取时 `leased_until = now + 10 分钟`（一次 cron 的最长时间 300 s 的两倍）并生成 `lease_token`；`releaseLease / append_settlement` 带 token，不匹配 → `lease_lost`（过期 worker 不能覆盖新 worker）。退避：`pending` = `max(1 天, (target 估计到期 − now) / 2)`；`unavailable` = 1 天 × min(attempts, 7)；`inconsistent` = 等隔离处理，`next_attempt_at = min(settle_by, now + 7 天)`，到 `settle_by` 仍未处理 → `void(unresolved_inconsistency)`（隔离项保留作审计；审计 G09）。任何退避都不能把 `next_attempt_at` 设成过去的时刻。

### 5.5 `judgment_calibrations`（只追加）

```
calibration_id      uuid primary key
methodology_id      text not null
methodology_version text not null
scope_type          text not null check (scope_type in ('all','market','subject_type'))
scope_key           text not null default ''
window_from         date not null
window_to           date not null
n_registered        integer not null                      -- 窗口内全部活跃登记（cohort）
n_settled           integer not null
n_independent       integer not null                      -- §8.2 独立样本（非重叠抽样）
n_void              integer not null
n_retrospective_excluded integer not null
threshold_n         integer not null
ece_max             numeric not null
kind                text not null check (kind in ('probability','categorical','score','interval'))
state               text not null check (
  (kind = 'score' and state in ('insufficient','evaluated')) or
  (kind <> 'score' and state in ('insufficient','failed','calibrated')))
valid_until         timestamptz not null                  -- computed_at + 2 × 校准周期（周跑 → 14 天）；过期按 insufficient 显示（§9.1）
validity_revision   bigint not null                       -- 计算开始时读到的 judgment_calibration_validity.revision；与当前不等即失效（审计 N2 / G19）
metrics             jsonb not null check (jsonb_typeof(metrics) = 'object')
reliability         jsonb not null check (jsonb_typeof(reliability) = 'array')
isotonic_segments   jsonb check (isotonic_segments is null or jsonb_typeof(isotonic_segments) = 'array')   -- isotonicFit().segments
cohort_path         text not null                         -- 桶 judgments-calibration/<calibration_id>.json：窗口内全部登记 {judgment_id, lifecycle, retrospective, settlement_id?, group, selected_for_independent, p|value|selected, realized?}
cohort_sha256       text not null
query_bounds        jsonb not null                        -- {window_from, window_to, max_settled_at, max_registered_at}：重算的查询边界
fingerprint         text not null                         -- digest({methodology, version, scope, window, threshold_n, ece_max, algorithm_version, cohort_sha256, validity_revision, query_bounds})（R05：窗口外撤回会升 revision 而不改 cohort，指纹必须随之变化）
algorithm_version   text not null
code_version        text not null
computed_at         timestamptz not null
batch_id            uuid not null references ingest_batches(batch_id) on delete restrict
unique (fingerprint)
index (methodology_id, methodology_version, scope_type, scope_key, computed_at desc)
```

### 5.5b `judgment_calibration_validity` 与 `judgment_job_state`（可变运行状态；不再借用 `dq_freshness.detail`，审计 N2）

```
judgment_calibration_validity
  methodology_id   text not null
  version          text not null
  revision         bigint not null default 1
  bumped_at        timestamptz not null default now()
  reason           text                                  -- 'withdrawn:<settlement_id>' | 'reopened:<settlement_id>' | 'initial'
  primary key (methodology_id, version)
  foreign key (methodology_id, version) references judgment_methodologies(methodology_id, version)

judgment_job_state
  job              text primary key check (length(job) between 1 and 512)   -- 由 jobKey() 中心化构造（R01）：'produce:<id>@<version>' | 'calibrate:<id>@<version>:<scope_type>:<encoded_scope_key>'
  state            jsonb not null default '{}' check (jsonb_typeof(state) = 'object')
  updated_at       timestamptz not null default now()
```

- `validity.revision` 由 `append_settlement` 在 `withdrawn / reopened` 转移时原子 `+1`（同一事务）；`sync_methodology` 首次注册时插 `revision=1`。它只有一列数字，没有被"整体替换"的可能（`recordAttempt()` 整体替换 `dq_freshness.detail` 的行为因此与它无关；`dq_freshness` 只用于心跳）。
- `judgment_job_state` 保存 §7.1 的补偿 marker 与 §8.3 的校准续跑状态（代际 id + 页 manifest + 游标）；只经服务写 RPC `set_job_state(job, expected_updated_at, state)`（乐观锁）更新。键由 `src/lib/judgments/job-keys.ts::jobKey()` 中心化构造（R01）：`produce:<id>@<version>`、`calibrate:<id>@<version>:<scope_type>:<encoded_scope_key>`，每个组件先 percent-encoding（`encodeURIComponent`），所以 `v1`、`US`、含 `:` 或非 ASCII 的 scope key 都合法；`job-keys.test.ts` 覆盖 `v1`、`US` 与全部支持的 scope key。

### 5.6 权限与 SQL 函数

- 八张表全部 `revoke all on … from public, anon, authenticated, service_role`，再按下面授权。**发布准入在 RLS 读边界执行**（审计 N1）：anon / authenticated 的 `select` 策略不是 `using (true)`，而是
  - `judgment_methodologies`、`judgment_methodology_events`、`judgment_calibration_validity`：`using (true)`（只有方法元数据、状态、修订号，没有被许可约束的数据）；
  - `judgments`：`using (exists (select 1 from judgment_methodologies m where m.methodology_id = judgments.methodology_id and m.version = judgments.methodology_version and m.publishable))`；
  - `judgment_settlements`：`using (exists (select 1 from judgments j join judgment_methodologies m on … where j.judgment_id = judgment_settlements.judgment_id and m.publishable))`；
  - `judgment_calibrations`：按 `(methodology_id, methodology_version)` 的 `publishable`；
  - `judgment_settle_queue`、`judgment_job_state`：无 anon / authenticated 读。
  公共读 RPC 都是 `security invoker`，所以同样受这些策略约束（`calibration_cohort` 对 `publishable=false` 的方法返回空）。方法被改回 `publishable=false` 时，它的判断、结算、校准立即从公共读路径消失（当前值生效，历史查询也不例外——许可不是历史状态）。
- `service_role`（Supabase 下绕过 RLS）：`select` 八张表（内部读：登记时的 `getJudgment`、结算时的 `settlementsOf`、校准页经服务端读；审计 G06）；**对 `judgments / judgment_settlements / judgment_methodology_events / judgment_settle_queue / judgment_calibration_validity / judgment_job_state` 没有直接 insert / update 权限**，只能经服务写 RPC；`judgment_calibrations` 也只经 `insert_calibration` RPC；`judgment_methodologies` 只经 `sync_methodology` RPC。写 RPC 的调用者只有 cron 路由、脚本与 `requireAdminUser()` 门控的管理员路由，全部经 `getAdminSupabase()`。
- SQL 函数分两组（`search_path=''`；PostgREST 的 `max_rows` 在托管端未核实，所以所有多行读取都走带 keyset 的 RPC）。**公共读 RPC**：`security invoker`，`grant execute to anon, authenticated, service_role`；**服务写 RPC**：`security definer`，函数 owner 为迁移执行者，`revoke execute from public, anon, authenticated`、`grant execute to service_role`：

| 函数 | 组 | 作用 |
|---|---|---|
| `judgments_server_time() → timestamptz` | 公共读 | `now()`；登记与结算的时间戳 |
| `latest_judgment_cards(p_subject_type, p_subject_key, p_types text[], p_view text, p_cutoff timestamptz) → setof judgment_envelope` | 公共读 | `judgment_envelope = (judgment judgments, settlement judgment_settlements, calibration judgment_calibrations, calibration_valid boolean, methodology_state judgment_methodology_events)`；每 `(judgment_type, methodology)` 一条；排序 `as_of desc, registered_at desc, judgment_id`；`p_view='as_known'` 时判断 `registered_at ≤ p_cutoff`、结算 `settled_at ≤ p_cutoff`、校准 `computed_at ≤ p_cutoff`、`methodology_state` = `occurred_at ≤ p_cutoff` 的最后一条事件（没有 → 该判断不返回）（§10）；`calibration_valid = (calibration.validity_revision = validity.revision and calibration.valid_until > coalesce(p_cutoff, now()))`；发布准入由 RLS 施加（当前值）；合并发行人反查（§12.4） |
| `judgment_history(p_subject_type, p_subject_key, p_type, p_methodology, p_version, p_view, p_cutoff, p_before uuid, p_limit) → setof judgment_envelope` | 公共读 | keyset 分页；`as_known` 语义同上（审计 G22） |
| `calibration_cohort(p_methodology, p_version, p_window_from, p_window_to, p_cutoff timestamptz, p_after uuid, p_limit) → setof judgment_envelope` | 公共读 | 窗口内（按 `as_of`）且 **`registered_at ≤ p_cutoff`** 的全部活跃登记（含未结算 / void / retrospective）+ `settled_at ≤ p_cutoff` 的最新结算（R03：登记与结算都按同一固定截止，使分页间的新登记、新结算都不混入）；keyset 分页（`judgment_id > p_after`）；这是**公共**路径（invoker，受发布门控）；校准 cron 走 `calibration_cohort_internal`（下一行） |
| `calibration_cohort_internal(…同参数…) → setof judgment_envelope` | 服务写组（definer，仅 service_role 执行；只读） | 与 `calibration_cohort` 同一查询与同一截止语义，但**不受 `publishable` 门控**：未发布的方法也照常校准（R04，对应 §4.1）；`publishable` 过滤只存在于公共路径 |
| `methodology_state_at(p_methodology, p_version, p_cutoff) → judgment_methodology_events` | 公共读 | §10 历史读取用 |
| `sync_methodology(row jsonb, p_actor, p_reason) → (changed boolean, seq integer)` | 服务写 | §5.1b 的事务：首次插当前行 + validity 行 + `registered` 事件；允许列变化 → 更新 + 事件；无变化 → `synced_at` + `resynced` 事件；`formula_hash` 与已有行不等 → `formula_hash_drift` 拒绝 |
| `register_judgment(row jsonb, queue jsonb) → uuid` | 服务写 | 一个事务：校验方法 `active`、`kind/producer_kind/subject_types/input_kinds` 与方法行一致、形状约束、`settle_after/settle_by` 与 `target`+方法 `grace_days` 重算一致（审计 G21）；`registered_at = now()`；插 `judgments`；活跃判断同时插 `judgment_settle_queue`；23505 原样抛出 |
| `claim_due_judgments(p_limit, p_lease_seconds) → setof judgment_settle_queue` | 服务写 | 按 §5.4 顺序 `for update skip locked` 领取，写 `leased_until / lease_token` |
| `release_lease(p_judgment_id, p_lease_token, p_patch jsonb) → void` | 服务写 | token 不匹配 → `lease_lost`；更新 `last_status / last_detail / next_attempt_at / attempts`，清空租约 |
| `append_settlement(p_judgment_id, p_lease_token, p_request_key text, row jsonb) → (seq integer, status text)` | 服务写 | 一个事务：**先**按 `p_request_key` 查 `judgment_settlements`（R06）：命中且该行的 `judgment_id = p_judgment_id` 且 `request_digest = digest(canonical(row 的操作载荷))` → `('already_applied', 该行 seq)`，**不校验租约**（响应丢失后的重试在租约已被清空后仍能收敛）；命中但 judgment_id 或载荷摘要不同 → `('request_key_conflict', 该行 seq)`；未命中 → 新操作：锁队列行；token 校验（admin 路径传 null 且 `actor` 为 `admin:*`）；队列已 `closed_at` 且请求是自动结算 → `('already_final', seq)`（不是错误）；`seq = coalesce(max,0)+1`；校验转移；插入（含 `request_key`、`request_digest`）；`unique(request_key)` 23505 → 重读该键并按同一比较返回 `already_applied` / `request_key_conflict`；更新队列（`closed_at` / `next_attempt_at` / `attempts` / 清租约）；`withdrawn / reopened` 时 `judgment_calibration_validity.revision + 1`（同事务，审计 N2）；返回 `('applied', seq)` |
| `apply_quarantine_override(p_judgment_id, p_override jsonb, p_quarantine_id, p_audit jsonb) → void` | 服务写 | §7.6 钩子：写 `override`，`next_attempt_at = now()`，翻转 `dq_quarantine` 项，写 `research_audit_log`，同一事务 |
| `insert_calibration(row jsonb, p_expected_revision bigint) → (status text)` | 服务写 | 锁 validity 行；要求 `row.validity_revision = p_expected_revision = 锁住的 validity.revision`，任一不等 → `('stale_revision')`，不写（审计 G19 的并发撤回；R05）；`fingerprint` 已存在 → `('duplicate')`；否则插入 → `('inserted')` |
| `set_job_state(p_job, p_expected_updated_at, p_state jsonb) → boolean` | 服务写 | 乐观锁更新 `judgment_job_state`；首次 `p_expected_updated_at = null` |
| `repair_stale_batches(p_dataset, p_older_than interval) → integer` | 服务写 | 把 `judgments.*` 数据集中 `running` 超过 `p_older_than`（默认 15 分钟）的批次标 `failed`（`errors += {code:'stale_running'}`）；每次 cron 开头调用（审计 G26） |

### 5.7 数据访问契约 `src/lib/judgments/db.ts`

```ts
export interface JudgmentsDb {        // 生产实现 = PostgREST from() + rpc()；memory 实现复刻触发器与 RPC 语义；pg 实现只用于集成测试
  serverTime(): Promise<string>;
  methodology(id, version): Promise<MethodologyRow | null>;
  subjectExists(subject): Promise<'active' | 'inactive' | 'missing'>;
  getJudgment(id): Promise<JudgmentRow | null>;
  registerJudgment(row, queue | null): Promise<void>;            // rpc register_judgment
  latestCards(subject, opts: { types?; view; cutoff? }): Promise<Envelope[]>;   // rpc latest_judgment_cards（anon）
  historyOf(subject, type, methodology, opts: { before?: string; limit }): Promise<Envelope[]>;   // rpc judgment_history（anon）
  claimDue(limit): Promise<QueueRow[]>;                          // rpc claim_due_judgments
  releaseLease(judgmentId, leaseToken, patch): Promise<void>;    // rpc release_lease
  settlementsOf(judgmentIds): Promise<SettlementRow[]>;
  appendSettlement(judgmentId, leaseToken | null, requestKey, row): Promise<{ seq; status: 'applied'|'already_applied'|'already_final'|'request_key_conflict' }>;
  calibrationCohort(methodology, version, window, cutoff, after?): AsyncIterable<Envelope>;   // 公共读：rpc calibration_cohort（anon，受发布门控；校准页用）
  calibrationCohortInternal(methodology, version, window, cutoff, after?): AsyncIterable<Envelope>;   // 服务读：rpc calibration_cohort_internal（service_role，不受发布门控；校准 cron 用，R04）
  latestCalibration(methodology, version, scope): Promise<{ row: CalibrationRow; valid: boolean } | null>;   // valid = revision 相等且未过期
  calibrationValidity(methodology, version): Promise<{ revision: bigint }>;
  insertCalibration(row, expectedRevision): Promise<'inserted' | 'duplicate' | 'stale_revision'>;   // rpc insert_calibration（row.validity_revision 必须等于 expectedRevision）
  syncMethodology(row, actor, reason): Promise<{ changed; seq }>;  // rpc sync_methodology
  methodologyStateAt(id, version, cutoff): Promise<MethodologyEvent | null>;
  jobState(job): Promise<{ state; updated_at } | null>;
  setJobState(job, expectedUpdatedAt, state): Promise<boolean>;   // rpc set_job_state
}
export interface JudgmentInputsDb {   // gather / replay / resolver 的只读事实层入口；facts / macro / tableRows 的实现用 anon 客户端（§3.5）
  facts: Pick<FactsDb, 'readFacts' | 'factsByIds' | 'metricsOfIssuer' | 'filingsOfIssuer'> & { deriveMetricsAsOf(issuer, market, asOf, formulaVersion): Promise<MetricRow[]> };   // 规格二 §4.8 + §12.2
  macro: MacroReadApi;                                           // §12.1
  tableRows(table: PublicTable, naturalKey): Promise<Row[]>;
  kline(req: { ticker; market; adjustment: 'qfq'|'hfq'; source: KlineSourceName; from: string; to: string; signal: AbortSignal }): Promise<SourceKlineSeries | KlineFailure>;   // 按冻结的 source 与日期范围（含两端）取；§7.4
  issuerPrimarySecurity(issuer_id, on: string): Promise<{ ticker; market } | null>;   // issuer_securities ⋈ stocks_universe(market)
}
```

批次 / 隔离 / 新鲜度仍走计划一 `TableClient`。

---

## 6. 登记、内容寻址与回放

### 6.1 内容寻址 id

```
judgment_id = uuidV8(sha256(canonicalize({
  subject_type, subject_key, judgment_type, methodology_id, methodology_version, as_of, inputs_hash, producer_nonce
})))
```

`claim` 不进 id：规则型生产者对同输入必须给同 `claim`，所以同 id 不同语义字段就是代码漂移或非确定性，按 §6.2 当冲突处理。未来私有行（§1.2）进表前必须把 `owner_user_id` 加进哈希（id 命名空间按租户），本稿不实现。

### 6.2 `registerJudgment(actor, input)` 流程

1. 校验：方法存在且 `active`（`draft` 仅 `dryRun`）；`subject` 格式、类型在方法 `subject_types` 与公共表允许集内、存在性；`producer_kind ∈ {rule, model}`；`code_version` 非空；每个输入 `kind ∈ 方法.input_kinds ∩ 公共白名单`，**重跑构造器**并与提交的 `snapshot` 字节一致（§3.5），`origin` 键在冻结表内；`max(available_at) ≤ as_of 日终`（否则 `lookahead`）；`registered_at = serverTime()`；`retrospective` 按 §3.4（含 `labelAvailableAt` 检查）。
2. 活跃判断：`claim` 按 kind 校验；`condition` 走对应 resolver 的 `validateParams()`；`horizon` 与方法声明一致；`target = resolveTarget(...)`（失败 → 转为 abstain `target_unresolvable`）；算 `settle_after / settle_by`。
3. 算 id；`getJudgment(id)`：存在且**完整规范化登记载荷**相同 → `{ id, duplicate: true }`；不同 → `quarantine(dataset='judgments', table_name='judgments', natural_key=id, reason_code='idempotency_conflict', payload={registered, attempted})`，抛 `idempotency_conflict`。规范化载荷 = 行的全部列**减去**真正的运行元数据 `registered_at / retrospective / code_version / batch_id / created_at`（由登记时刻或环境决定），即含 `subject_*, judgment_type, methodology_*, kind, producer_kind, producer_ref, producer_nonce, as_of, inputs, inputs_hash, abstained, abstain_reason, claim, condition, horizon, target, label_policy, settle_after, settle_by`——`settle_after / settle_by` 由 `target` 与方法 `grace_days` 确定性导出（§3.4），所以参与比较，且 `register_judgment` RPC 会重算核对（审计 G21）。
4. `registerJudgment` RPC；23505 → 回到第 3 步重读。
5. 返回 `{ id, duplicate: false }`。调用方负责批次（dataset `judgments.produce.<methodology_id>`，counts：`inserted` 新行、`duplicates`、`quarantined`、`failed`；弃权行计 `inserted`，`errors` 加信息码 `abstained_summary`）。

### 6.3 回放 `replayJudgment(id, inputsDb?)` 与脚本 `scripts/judgments/replay.ts --id <uuid> [--reconcile] [--json]`

1. 读判断行；对每个输入复算 `digest(snapshot)` 与存储的 `hash` 比较 → 不等即 `input_hash_mismatch`（存储层被改动）。
2. `producer_kind='rule'`：用冻结的 `snapshot` 重跑 `compute / condition`；`claim`、`condition`、`judgment_id` 字节一致 → `replay='exact'`，否则 `'diverged'`（列差异）。`model`：`replay='inputs_only'`。
3. `--reconcile`（可选）：按 `ref` 从 `JudgmentInputsDb` 以 `asOf` 重取并与 `snapshot` 比较，输出 `reconcile: [{kind, ref, status: 'same'|'changed'|'unavailable', diff?}]`——这是对上游的对账，不影响 `replay` 结论。
4. 不写库；CI 对夹具跑（§14.4）。

### 6.4 生产者 runner `src/lib/judgments/produce.ts`

`produce(methodology, work: Array<{ subject, asOf, binding?: Record<string, string> }>, { db, inputsDb, batch, signal })`：逐项 `gather(subject, asOf, binding, db) → compute → condition → registerJudgment`；`binding` 是生产者要绑定的上游对象（宏观：`{ snapshot_id }`），`gather` 必须把它作为输入引用（宏观：`macro_snapshot` 的 `ref.snapshot_id`），所以同区域同日的两个快照得到两条不同 `inputs_hash`、不同 id 的判断，补偿扫描按 `snapshot_id` 逐个核对（审计 G25）；单项失败不影响其他；回执 `errors` 带 `{code, key: subject_key, binding}`。宏观 WP-M3 的发布步骤、§7.1 的补偿扫描、行业 / 公司规格的 cron 都调它。

---

## 7. 结算 `src/lib/judgments/settle.ts`、`resolvers/*`

### 7.1 任务与调度

- `GET|POST /api/cron/judgments-settle`（`CRON_SECRET` Bearer，`force-dynamic`，`maxDuration = 300`——仓库已有先例 `securities-sync`，部署套餐是否允许由 owner 在生产确认；`vercel.json` 增 `{ "path": "/api/cron/judgments-settle", "schedule": "0 3 * * *" }`：03:00 UTC 时前一交易日的美、A、港收盘都已可得；现有 cron 时段 00:00 / 00:30 / 01:30 / 16:15 / 21:30 UTC，不冲突）。`?preview=1` 不写库。脚本 `scripts/judgments/settle.ts` 共用核心。
- 预算：整个运行用一个 `deadline = start + 280 s` 与派生的 `AbortSignal` 贯穿 resolver 与 provider 调用（`fetchEastmoneyKline` / `fetchDatagatewayDailyKline` 都接受 `signal`）。领取按**小批**进行：每批 20 条，只有当"剩余预算 > 批内最坏取数时间 + 30 s 收尾"时才领取下一批；批内最坏取数时间 = `20 / 4 并发 × 每条最坏`，每条最坏 = resolver 声明的 `maxFetchMs`（`price_return`：主序列 + 基准序列，各按 provider 的超时 × 尝试次数；东方财富美股多前缀尝试每个默认 5 s，DataGateway 7 s）。`start + 200 s` 后不再领取。`finally` 里 `finishBatch`；无论如何每次 cron 开头先 `repair_stale_batches('judgments.settle', '15 minutes')`，所以进程被硬终止也不会留下永久 `running`（审计 G26）。未处理完的租约按 §5.4 自然过期。
- 步骤 0（补偿，审计 F28 / G25 / N2）：`judgment_job_state['produce:macro_regime@v1'].state = { marker_created_at, marker_snapshot_id }` 记录上次处理到的宏观快照；本次用 `MacroReadApi.snapshotsSince(marker, 200)` 取 `status ∈ {active, superseded}`（失败快照除外）的快照，按 `(created_at, snapshot_id)` 顺序逐个：GIN 查 `inputs @> [{"kind":"macro_snapshot","ref":{"snapshot_id":…}}]` 是否已有判断（含弃权行），缺的调 `produce(macro_regime_v1, [{ subject, asOf: snapshot.as_of, binding: { snapshot_id } }])`；每成功一个就 `set_job_state` 推进 marker（乐观锁；失败的那个不推进，下次从它开始）。
- 步骤 1：`startBatch({producer:'ts-judgments', dataset:'judgments.settle', codeVersion})` → 循环 `claimDue(20)` → 按 resolver 分组，≤ 4 并发 → 每条按 §7.2 处理 → `finishBatch` → `recordAttempt('judgments.settle', {ok, cadence:'daily'})`。
- 校准不在本任务里：独立 `GET|POST /api/cron/judgments-calibrate`（`0 4 * * 1`，每周一；§8.3），同样的预算与小单元续跑规则。

### 7.2 结算状态机（队列 × 证据）

resolver 返回 `Resolved{value, label?, from, to, label_available_at, evidence} | Pending{reason, estimated_at?} | Unavailable{failure} | Inconsistent{detail, evidence_hash, evidence}`。`label_available_at` = 实现值的可得时刻（价格：end bar 的收盘时刻；事实：`available_date` 日终；宏观：所用观测 `available_at` 的最大值）。

| 返回 | `label_policy` | 动作 |
|---|---|---|
| `Resolved`，`label_available_at ≤ settle_by` | `first_observed` | `append_settlement(settled)`，`realized.label_policy='first_observed'`，证据记录观测时刻 |
| `Resolved`，`label_available_at > settle_by` | 任意 | `void(reason='no_data:late')`（数据在截止后才可得；按可得时刻判断，不按执行时刻） |
| `Resolved` | `cutoff_vintage` 且 `now < settle_by` | 不写；队列 `pending`，`next_attempt_at = settle_by` |
| `Resolved` | `cutoff_vintage` 且 `now ≥ settle_by` | 以 `cutoff = settle_by` 重取（resolver 收到 `cutoff` 参数，只用 `available_at ≤ cutoff` 的 vintage）→ `settled`（证据记录 vintage） |
| `Pending` | 任意，`now ≤ settle_by` | 队列退避（§5.4） |
| `Pending` / `Unavailable` | `now > settle_by` | `void(reason='no_data:<failure 或 pending reason>')` |
| `Unavailable` | `now ≤ settle_by` | 队列退避；`attempts` +1 |
| `Unavailable{failure:'adjustment_unsupported' \| 'delisted'}` | 任意 | 立即 `void`（不可能再可得） |
| `Inconsistent` | 任意 | `quarantine(reason_code 见 §7.6, payload 含完整 evidence)`；队列 `inconsistent`（退避见 §5.4）；若队列 `override` 存在且与本次情形匹配（§7.6），按 `override.resolution` 得到 `Resolved` |
| 任意，队列 `now > settle_by` 且仍 `inconsistent` | 任意 | `void(reason='unresolved_inconsistency')` |

终态 `settled / void / withdrawn` → 队列 `closed_at`；admin `reopened` → 清空 `closed_at`、`next_attempt_at = now`。

### 7.3 v1 resolvers（实现值定义必须唯一）

| resolver | 实现值 | 到期判定 | 证据 `evidence` |
|---|---|---|---|
| `price_return` | `r = close[end] / close[base] − 1`；读取按冻结的 `source / adjustment`，日期范围 `[base_date − 10 自然日, to]`，`to` = `session_index`: `base_date + ceil(n × 1.52) + 10 天`（§3.4 的自然日上界），`date`: `target.date + 20 天`；返回不含 `base_date` 根（`time == base_date`，必须与登记输入 `price_bar.date` 同日）→ `Inconsistent(base_bar_missing)`；`session_index`：`end = base + n`（范围内不足 n 根 → 按 `to` 再向后分页一次，仍不足 → `Pending`）；`date`：`end` = `time ≥ target.date` 的第一根（没有 → `Pending`；`to` 之后仍没有 → `Unavailable(empty)`）；有 `benchmark` 时基准序列按**同一组 bar 日期**对齐（基准缺任一日 → `Inconsistent(benchmark_gap)`），`r_rel = (1 + r) / (1 + r_b) − 1` | `end` 根存在 | `{ source, adjustment, from, to, bars: 全部 bar（base 前 5 根到 end，即至少 n + 6 根）, bars_sha256, benchmark_bars?, fetched_at, origin, capability: §7.4 能力表条目 }` |
| `fact_metric` | `deriveMetricsAsOf(issuer, market, cutoff, formula_version)`（不读物化缓存，审计 G13）后按**完整自然键** `(metric, period_start, period_end, duration, unit, input_unit, basis, formula_version)` 精确匹配；多于一条 → `Inconsistent(ambiguous_fact)`；`compare='yoy'` 再取上年同期同键；底层事实经 `readFacts(…, asOf: cutoff)` 读取，返回 `truncated=true` → `Unavailable(truncated)`（不用不完整数据） | 该期底层事实在 `cutoff` 可见 | `{ fact_ids, filing_ids, available_dates, value_texts, mapping_gen, state_rev, cutoff, formula_version }` |
| `macro_regime_replay` | `MacroReadApi.classifyAsOf(region, reference_period, cutoff, macro_methodology_version)`：用宏观 `regime.ts` 的**同一分类函数**（同版本规则表、同目录权重 `catalog_version`）对 `reference_period` 的观测在 `available_at ≤ cutoff` 的 vintage 上重算 → `primary_state`；宏观自身的 `coverage < 0.6` 规则在此同样生效 → `Unavailable(coverage)` | `cutoff` 已到（`cutoff_vintage`） | `{ observation_refs: [{series_id, period_end, vintage_id, value, available_at}], catalog: {version, weights, rules_version}, regime_result }` |
| `recommendation_hit` | `recommendation_scores.hit`（私有适配器专用，不写公共结算） | `hit is not null` | — |
| `industry_aggregate` | 行业规格定义 | — | — |

`cutoff` 对 `first_observed` = `now`（证据记录）；对 `cutoff_vintage` = `settle_by`。

### 7.4 价格口径与证据

- 方法在登记时固定 `source ∈ KlineSourceName` 与 `adjustment ∈ {qfq, hfq}`（**不允许 `none`**：不复权序列跨拆股会给出错误收益且仓库没有公司行动数据；审计 F08）。结算与回放都按冻结的 `source` 读，不随环境配置换源（审计 G16）。
- **复权能力表** `src/lib/judgments/resolvers/price-capabilities.ts`（冻结，进 `deps`）：行 = `(source, market, adjustment) → { status: 'verified' | 'unverified' | 'unsupported', evidence: fixture path, verified_at }`。初始状态**全部 `unverified`**（审计 G04：`datagateway.ts` 在上游省略字段时把 `adjustment` 回填为请求值，`eastmoney.ts` 也只是回显请求的 `fqt`，所以"返回值等于请求值"不是证据）。验证程序（F4-2）：对每个 `(source, market)` 取一只在录制窗口内有已知除权 / 拆股事件的证券（事件日期来自交易所公告，记在夹具头），录制 `qfq` / `hfq` / `none` 三份序列；`qfq` 或 `hfq` 在事件日前后与 `none` 的收盘比值发生与公告比例一致的跳变 → 该 `(source, market, adjustment)` 标 `verified` 并把夹具路径写进表；三份序列相同 → `unsupported`。只有 `verified` 条目可用于登记与结算；`gather` 对方法 `markets` 里无 `verified` 条目的市场 abstain `market_unsupported`；结算时能力表条目被改回非 `verified`（新证据）→ `Unavailable(adjustment_unsupported)` → `void`。
- 两个适配器都加 `endDate`（东方财富 URL `end=`；DataGateway body `endDate`）；`JudgmentInputsDb.kline` 以 `[from, to]` 含两端语义读取，必要时向前 / 向后分页直到覆盖所需窗口；返回序列校验：按 `time` 升序、无重复、`base_date` 根存在、`time` 连续性不做假设。DataGateway 的 close-only 分支（适配器合成 OHLC、`volume=0`）在 `price_bar.snapshot` 里只保留 `close`，其余 `null` 且 `fields_present=['close']`，`origin.transform='close_only'`；证据同样如此（审计 G27）。
- 登记输入 `price_bar.close` 与结算 `base` 根 `close` 之差 > 0.5%（政策常量，取自计划一恒等式容差，仅表示"同一来源同一口径应几乎一致"）→ `Inconsistent(basis_mismatch)`；复权序列的历史重算会让两者差异超限，这时管理员在 `/admin/dq` 接受（`override`），结算以本次抓取的 `base/end` 同口径收益为准，证据记录两者。

### 7.5 批次计数与信息码

`fetched` = 领取条数；`inserted` = 本次写 `settled`；`versioned` = 本次写 `void`；`duplicates` = 领取后发现已终态（`already_final`）；`quarantined`；`failed` = resolver 抛错；**新增第七个计数器 `deferred`** = `pending / unavailable` 退避的条数。这需要改 `src/lib/dq/batches.ts`：`BatchCounts` 加 `deferred`（默认 0，`emptyCounts()` 同步），`accounted()` 把它计入，`batchStatusFromCounts` 不变地沿用"`fetched > 0` 且无 accounted → failed"（全 deferred 的运行因此是 `success`，审计 G05），`assertCounts` 允许新键；`batches.test.ts` 补用例；规格二等已有生产者不传 `deferred` 时按 0 处理（向后兼容）。信息码 `pending_summary`、`unavailable_summary`、`deadline_hit`、`voided_summary`、`abstained_summary` 显式加入 `INFO_CODES`。新鲜度：批次 `success | partial` → `ok=true`；`failed | rejected` → `ok=false`。

### 7.6 隔离与处理钩子

| reason_code | 触发 | natural_key | payload |
|---|---|---|---|
| `idempotency_conflict` | §6.2 | `judgment_id` | `{registered, attempted}` |
| `settlement_basis_mismatch` | §7.4 | `judgment_id` | `{registered_bar, refetched_bar, source, evidence（完整 bars）, evidence_hash}` |
| `settlement_ambiguous_fact` | §7.3 | `judgment_id` | `{candidates: [{ key, value_text, derivation: { formula_version, input_facts: FactProjection[], state_rev, cutoff } }], evidence_hash}`（每个候选是完整的派生行，含全部底层事实投影与可得日期） |
| `settlement_base_bar_missing` | §7.3 | `judgment_id` | `{base_date, series_from, series_to, bars_near_base, evidence_hash}` |
| `settlement_benchmark_gap` | §7.3 | `judgment_id` | `{missing_dates, evidence_hash}` |

钩子 `src/lib/dq/judgments-resolver.ts`（挂 `/api/admin/dq/quarantine/[id]`；`POST` body 可带 `resolution`）：`resolved_accept` 的裁决按原因码定义，必须能直接推出唯一实现值（审计 G12）：`basis_mismatch` → `resolution = {kind:'accept_refetched', evidence_hash}`（以隔离时保存的完整 `evidence` 结算，不再重抓）；`ambiguous_fact` → `resolution = {kind:'choose_fact', chosen: <candidates 之一的完整对象，含 derivation>}`（钩子校验 `digest(chosen)` 在 `candidates` 的 digest 集合内）；`base_bar_missing` / `benchmark_gap` → 只能 `resolved_reject`（缺的 bar 无法由人补出；接受请求 → 400 `resolution_not_applicable`）。`apply_quarantine_override` 把 `override = {reason_code, resolution, evidence_hash, resolved_by, at}` 写入队列并 `next_attempt_at = now`；下次结算**不读事实层、不重抓**，直接从 `override.resolution` 里冻结的完整证据构造 `Resolved`（`accept_refetched` 用隔离时的完整 bars，`choose_fact` 用 `chosen.derivation`），`label_available_at` 取自该证据，证据里带 `override`（审计 G12）。`resolved_reject` → `append_settlement(void, reason='quarantine_rejected')`。钩子幂等；写队列、写 `research_audit_log`、翻转隔离项在同一个 RPC 事务内（`apply_quarantine_override`）。

---

## 8. 校准 `src/lib/judgments/calibration.ts`

### 8.1 按 kind 的评估（纯函数）

所有指标都只在 §8.2 选出的**独立样本**上计算（Wilson、ECE、Brier 的 `n` 都是独立样本数）；全体样本只报 `n_total` 与同一指标的"参考值"（标 `correlated`，不进门控）。
- **probability**：`brier = mean((p − y)²)`；`brier_climatology = mean((ȳ − y)²)`；`brier_skill = 1 − brier / brier_climatology`（分母 0 → null）；`reliability(bins=10)` 等宽分箱 `[0,0.1),…,[0.9,1]`，每箱 `{bin_low, bin_high, n, mean_p, hit_rate, wilson_low, wilson_high}`（`wilson` 来自 fan-out，95%），空箱保留 `hit_rate=null`；`ece_raw = Σ_b (n_b/n)·|mean_p_b − hit_rate_b|`（**原始 `p`**，即页面显示的预测器）；时间外留出：按 `as_of` 排序取后 30% 为留出段（边界处与前段目标窗口重叠的样本剔除，避免泄漏），报 `ece_raw_holdout`、`brier_holdout`、`brier_skill_holdout`；isotonic（`isotonicFit(前 70%).segments`，`applyIsotonic` 在留出段上的 `ece_mapped_holdout`）只进报告。
- **categorical**：`accuracy` + Wilson；基准 = 独立样本中实现类别的最大占比 `majority_rate`（不是 `1/|classes|`）；`confusion[selected][realized]`；按 `margin_pp` 分箱 `[0,5),[5,15),[15,100]`（宏观规格 §5.3 的三档文案阈值；**`margin_pp` = `(norm[primary] − norm[secondary]) × 100`，百分点**——宏观规格 §5.3 的 `norm` 是比例、文案阈值 5/15 是百分点，F4 在 `claim.margin_pp` 冻结百分点值并在 §12.1 要求宏观规格同样写明单位；审计 G28）的准确率。不算 Brier（`distribution` 不是概率）。
- **score**：`spearman(value, realized_metric)`；按分值三分位分组的实现指标均值与 Wilson（当实现指标是二元时）；不算 Brier。
- **interval**：`coverage = mean(low ≤ realized ≤ high)` + Wilson；`coverage − nominal_coverage`；`width_median` 与基准宽度（同主体实现值在窗口内的经验分位区间宽度）之比 `width_ratio`；`scenarios` 存在时对每个情景的 `p` 另做 probability 评估。

### 8.2 样本、分组与有效样本

- cohort = 该 `methodology@version` 在窗口 `[computed_at − window_years, computed_at]` 内（按 `as_of`）的全部活跃登记（`calibration_cohort` RPC）；样本 = 其中最新 `seq` 为 `settled` 且 `retrospective=false` 的（`window_years` 是方法参数，默认 3——政策常量，须 ≥ 方法 `horizon` 对应自然日的 3 倍，sync 脚本校验）。
- **独立样本（非重叠抽样）**（审计 F19 / G17 / G18）：按 `subject_key` 分流，每流内按 `as_of` 升序扫描，取第一条，然后跳过所有目标窗口 `[as_of, target 对应日期]` 与已选中那条重叠的判断，再取下一条不重叠的……（贪心，确定性）；跨主体不合并。`n_independent` = 选中条数；未选中的只进 `n_total`。这样宏观每区域每 91 天贡献 1 条（不是连通分量 1 条，也不是日度 n 条），同一股票连续建议按窗口去重。方法可在 `params.embargo_days` 要求相邻窗口再隔开若干天（默认 0）。
- **状态**：`n_independent < threshold_n` → `insufficient`；否则 probability 型要求 `ece_raw_holdout ≤ ece_max` 且 `brier_skill_holdout > 0` → `calibrated`，不满足 → `failed`（门控验证的是**原始 `p` 在时间外留出段**的表现，即页面显示的预测器；审计 G01）；categorical 型要求 `accuracy 的 Wilson 下界 > majority_rate` → `calibrated`，否则 `failed`；interval 型要求 `|coverage − nominal| ≤ ece_max` 且 `width_ratio ≤ 1` → `calibrated`，否则 `failed`；score 型 `n_independent ≥ threshold_n` → `evaluated`（不存在"校准"概念，徽章显示 Spearman）。

### 8.3 任务与持久化

`/api/cron/judgments-calibrate`：工作单元 = 一个 `(methodology@version, scope)`；每次运行按注册表顺序逐单元处理，预算规则同 §7.1。单元的续跑状态在 `judgment_job_state[jobKey('calibrate', …)]`：`{ generation: uuid, cutoff, expected_revision, query_bounds, after: judgment_id | null, manifest: Array<{ start_after, end_after, path, sha256 }> }`（审计 G26；R02）。流程：开始时生成 `generation`、读 `validity.revision` 为 `expected_revision`、`cutoff = now()`，并把 `query_bounds = { window_from, window_to, registered_at_lte: cutoff, settled_at_lte: cutoff }` 一次性固定（R03）；cron 用 **service-role 客户端**调 `calibration_cohort_internal(…, cutoff, after)`（R04：未发布的方法照常校准；公共 `calibration_cohort` 只给校准页）逐页取；每页先上传到**唯一的不可变对象** `judgments-calibration/partial/<unit>/<generation>/<start_after>.json`，再用**一次** `set_job_state`（乐观锁）同时追加 manifest 条目 `{start_after, end_after, path, sha256}` 并推进 `after`；CAS 失败（并发 worker 已推进）→ 丢弃本 worker 的对象，从已提交状态重新读 `after`；崩溃在上传后、CAS 前 → 对象成为孤儿（不在 manifest 内，永不被消费，按前缀定期清理），重试从已提交的 `after` 重新取同一页。预算不足就停，下次从 `after` 继续同一 `generation / cutoff / query_bounds`。全部页取完后**只按 manifest 列出的对象**（逐个校验 `sha256`）重组 cohort → 算 §8.1 / §8.2 → 写最终 cohort 清单（§5.5 `cohort_path`，含 `query_bounds`）→ `insert_calibration(row{validity_revision: expected_revision, …}, expected_revision)`：`inserted` **或** `duplicate`（同指纹，即同 cohort、同 revision、同 bounds 的报告已存在）→ CAS 清空该 `generation` 的单元状态（R05：`duplicate` 不再把已完成的截止钉在队列里）；清空失败（CAS 冲突）→ 下次运行发现 manifest 完整且 `insert_calibration` 再次返回 `duplicate` 时重试清空；`stale_revision`（期间有撤回 / 重开）→ 清空单元状态并以新的 `generation / cutoff / bounds` 重算。只有 `scope='all'` 的行决定状态（§9.1）；分层行只展示。报告据 `cohort_sha256 + query_bounds` 可完全重算 `n_registered / n_settled / n_void / n_retrospective_excluded / n_independent` 与全部指标（审计 G19）。**失效**（审计 N2）：显示有效 ⇔ `calibration.validity_revision = validity.revision` **且** `valid_until > now`（`valid_until = computed_at + 14 天`，两个周跑周期）；`append_settlement` 在 `withdrawn / reopened` 时原子 `revision + 1`，所以撤回后旧报告立即失效，无论校准任务何时再跑；校准任务开始后发生的撤回由 `insert_calibration` 的 `stale_revision` 拦截。

### 8.4 显示阈值 `threshold_n` 与 `ece_max`（**运营门槛，不是统计保证**；owner 决策 O2）

- 默认 `threshold_n = 100`（独立样本数）、`ece_max = 0.10`。
- 依据：n = 100、p ≈ 0.5 时整体命中率的 95% 区间半宽 ≈ 0.10（正态近似 1.96·√(0.25/100)，Wilson 在此 n 下相近）；把 `ece_max` 设为这个分辨率意味着"报告能分辨的失准才算失准"。每箱样本数由数据决定，报告如实列出各箱 `n`，不假设分布。fan-out 的 `MIN_LABELS = 30` 是每问题总量门槛，只说明仓库先例的量级，不是每箱先例。
- 后果（如实写明）：`macro_regime@v1` 每区域每 91 天只贡献 1 条独立样本，US + CN 合计一年约 8 条，按默认阈值要十几年才能 `calibrated`——这意味着宏观象限在可预见的时间内一直显示为"未校准"，这是正确的结果（它本来就没有足够的独立检验），不是要通过降低阈值解决的问题；O2 若为宏观单独设更低阈值，必须同时接受更宽的区间。
- 备选：`threshold_n = 50`（半宽 ≈ 0.14）或 `200`（≈ 0.07）。`threshold_n / ece_max / algorithm_version` 写进每条校准行，改阈值不改历史。
- 留出段（§8.1）既是门控依据也是报告内容；留出段独立样本 < 20 时（政策常量：留出段 30% × 阈值 100 的下取整量级）`ece_raw_holdout` 记 `null` 并判 `insufficient`。

### 8.5 isotonic 映射的用途

只进报告（校准页画"映射后 vs 原始"），v1 不用映射值替代显示；要显示映射值必须作为新方法版本（`params.display_mapping = 'isotonic@<calibration_id>'`），因为映射本身就是公式的一部分。

### 8.6 私有适配器的自评

`recommendation_call@v1` 的样本来自可被 owner 改写的 `recommendation_scores`（§2.1），所以只算**自评报告**（`GET /api/analyst/book` 响应 `self_assessment` 字段：同一套 §8.1 数学，`state` 固定为 `self_assessed`，显示时标"自评，不可审计"），永不进入 `judgment_calibrations`、永不解锁百分比。可审计的私有结算（append-only 证据表、service role 写）是 §17 O5 的第二阶段。

---

## 9. 显示契约 `src/lib/judgments/display.ts`

### 9.1 两个维度

```
lifecycle   := abstained | open | settled(hit|miss) | void | withdrawn | pending_fill   // 单条判断：最新结算行 + 队列；pending_fill 仅私有适配器（§11.2）
calibration := insufficient | failed | calibrated | evaluated | self_assessed   // 方法级：scope='all' 最新校准行，且 calibration_valid（validity_revision 相等且 valid_until 未过）；无效 → 按 insufficient 显示（score 型 evaluated；私有 self_assessed）；方法 publishable=false 时 RLS 层就不返回任何行
```

显示规则由二者共同决定；"已结算"不是"已校准"的更高等级：一条判断知道了答案，不说明方法的概率可信。

### 9.2 `JudgmentCard`

```ts
interface JudgmentCard {
  judgment_id: string; subject: Subject; judgment_type: JudgmentType; kind: Kind;
  lifecycle: Lifecycle; calibration: CalibrationState; retrospective: boolean;
  as_of: string; registered_at: string;
  methodology: { id; version; title: {zh,en}; href };
  display: {
    headline: {zh,en};
    percent: number | null;                      // 仅 probability × calibration='calibrated'
    value: number | string | [number, number] | null;
    scale?: {min,max}; dims?: Array<{id; label; value: number|null; coverage: boolean}>;
    band?: 'low'|'mid'|'high';                   // probability 未校准：p 的三分位 [0,1/3) [1/3,2/3) [2/3,1]
    nominal_coverage?: number;
  };
  condition: { text: {zh,en}; horizon; target; label_policy; settle_after; settle_by } | null;   // 弃权为 null
  settlement: { kind; outcome; realized; settled_at; evidence_summary } | null;
  calibration_summary: { n_independent; n_total; threshold_n; brier; brier_skill; ece_raw_holdout; valid_until; hit_rate: {rate, low, high} | null; accuracy?; coverage?; spearman?; href } | null;
  inputs: Array<{ kind; ref; available_at; origin; href: string | null }>;   // 抽屉
  abstain_reason?: string; missing?: string[];
}
```

### 9.3 kind × 状态渲染规则

| kind | `calibration ∈ {insufficient, failed, self_assessed}` | `calibration='calibrated'` | `lifecycle='settled'`（叠加） |
|---|---|---|---|
| probability | `percent=null`；`band` + 文案"研究员信心 / 模型信心：高（未校准：有效样本 n/N）"或"（校准未通过：ECE x）"；登记的 `p` 只在抽屉以小数显示并标"登记值（未校准）" | `percent = round(p×100)` + "该方法历史命中 x%（区间）" + 可靠性图链接 | 追加"结果：命中 / 未命中 · 实现值" |
| categorical | `selected` + "未校准"徽章；`distribution` 只在抽屉显示为"得分"，不带 % | `selected` + "历史准确率 x%（n）" | `selected` vs 实现类别 |
| score | 分值 + 刻度 + 维度条（缺维度画缺口并写原因）+ "评估：Spearman x（n）/ 样本不足" | — | 分值 + 实现指标 |
| interval | 区间 + 名义覆盖 + "未校准" | 区间 + "历史覆盖 x%（名义 y%）" | 区间 vs 实现值 |

共同：卡底一行"方法 `id@version` · 截至 `as_of` · 条件：… · 目标：… · 结算：…"；`void / withdrawn / abstained` 显示原因；`retrospective` 显示"补登记"；所有图（可靠性、维度雷达）有表格等价视图。

### 9.4 派生判断（赔率、凯利、星级）

读取时由底层判断计算，不登记、不结算。前提（任一不满足 → 显示"不计算"并给出原因；审计 G23）：
1. 底层 `thesis_win_rate` 与 `return_range` **两者**都 `lifecycle='open'`，且两者方法都 `calibration='calibrated'`；
2. `return_range.scenarios` 存在（`[{label:'up', p, value}, {label:'down', p, value}]`，`Σp = 1`，`value_up > 0 > value_down`，均有限），且**事件绑定**成立：`return_range.claim.scenario_event_hash = digest(thesis_win_rate.condition)`——情景必须声明自己是"对同一个 `condition`（resolver + params + predicate）的条件分布"，`up` 情景 ⇔ 该 predicate 为真；只比较 `params` 不够（`return > 10%` 的事件与"涨 / 跌"的情景不是同一事件；审计 G23）。公司规格的 `return_range` 方法在登记时必须写入这个哈希；
3. 两者 `as_of` 相同、同主体、同 `target`、同 `unit`；`scenarios` 里 `p_up` 与 `thesis_win_rate.p` 之差 ≤ 0.01（否则两个判断自相矛盾，显示"输入不一致"）。
赔率 `b = value_up / |value_down|`；分数凯利 `f = k · (p·b − (1 − p)) / b`（`b > 0` 由前提 2 保证），`k` 是公司规格参数（总纲 §2.2 给出 ¼–½ 的区间）；星级映射由公司规格定义。

### 9.5 UI 流程

- 入口：宏观 / 行业 / 公司页面嵌 `JudgmentCard`（`src/components/judgments/JudgmentCard.tsx`）；方法名 → `/intel/methods/[id]/[version]`（公式文档、参数、版本历史、校准报告：可靠性图 + 分箱表、混淆矩阵、时间顺序验证、最近结算列表）；"输入" → `InputsDrawer`（输入列表 → 各自来源抽屉：事实行 → 规格二 `citation`，宏观观测 → 宏观 `SourceDrawer`）；"结算" → `SettlementTimeline`（登记 → 目标 → 结算 / 作废 / 重开 → 证据摘要）。
- `/intel/methods`：注册表页。
- `/admin/judgments`：队列（到期、退避、租约）、隔离项（链接 `/admin/dq`）、"作废结算"（`withdrawn`，`reason` 必填）、"重开"（`reopened`）、"立即结算一条"；均 `requireAdminUser()` + `research_audit_log`。
- 空 / 缺失：主体无判断 → 卡不渲染，页面位置显示 `abstain_reason`（"方法 X 需要输入 Y，缺 Z"）或"方法未对该主体运行"；校准不足 → 永远可见的徽章。
- zh / en：`messages/{zh,en}/judgments.json` 注册到 `src/i18n/request.ts::MESSAGE_DOMAINS`；`display.headline` 两语由服务端生成；`src/i18n/messages-parity.test.ts` 自动覆盖。
- `DESIGN.md`：黄铜强调色只用于 `calibrated` 徽章与选中态；未校准用中性灰；`hit/miss` 用 `--up/--down`；数字 Geist Mono；无渐变 / 紫色。

### 9.6 Claude Design 画布待设计清单

1. `JudgmentCard`：4 kind × lifecycle 5 态 × calibration 5 态中实际可达的组合（`display.ts` 导出枚举，画布按它画）。
2. `InputsDrawer`（输入列表、哈希校验态、`origin`、来源跳转）。
3. `SettlementTimeline`。
4. `/intel/methods` 与 `/intel/methods/[id]/[version]`（公式文档、可靠性图 + 等价表、混淆矩阵表、时间顺序验证表、版本历史）。
5. `/admin/judgments`。
6. `/analyst` 页"信心"列未校准带状显示 + 自评区块（§11.2）。
7. 移动端折叠态。

---

## 10. 读取接口

共同约定：公共只读（anon 客户端 + RPC）；`force-dynamic`；参数重复 → 400 `invalid_parameter:<name>`；错误与空结果 `no-store`；成功 `Cache-Control: public, max-age=300, s-maxage=600`；响应顶层含 `codeVersion`。两种读取语义：`view=latest`（默认：最新判断 + 最新结算 + 最新有效校准 + 方法当前状态）与 `view=as_known&asOf=`（系统事件时间截止 `cutoff = asOf 日终`：判断 `registered_at ≤ cutoff`（**不是** `as_of`，补登记的历史判断只有登记后才"已知"；审计 G22）、结算 `settled_at ≤ cutoff`、校准 `computed_at ≤ cutoff` 且其 `validity_revision` 等于**当前** revision（撤回后的报告在历史视图里也不再算有效——历史页面不应复活已知错误的标签）、方法状态 = `judgment_methodology_events` 中 `occurred_at ≤ cutoff` 的最后一条（`synced_at` 不参与；审计 N3）；**发布准入永远按当前 `publishable`**（RLS 施加）；合并发行人关系按当前读取，卡上标注）。同日多条按 `registered_at desc, judgment_id` 定序。

| 路径 | 参数 | 返回 |
|---|---|---|
| `GET /api/judgments` | `subject_type`、`subject_key`（必填）、`types`、`asOf`、`view`、`include_abstained=1` | `{ subject, asOf, view, cards: JudgmentCard[] }`，每 `(judgment_type, methodology)` 一张；发行人主体包含被合并进它的旧发行人的判断（§12.4） |
| `GET /api/judgments/[id]` | `view`、`asOf` | `{ card, judgment, settlements, calibration }` |
| `GET /api/judgments/[id]/history` | `limit`（默认 50，最大 500）、`before` | 同主体同类型同方法按 `as_of` 倒序 |
| `GET /api/methodologies` | `status` | 注册表行 + 最新 `scope='all'` 校准摘要 |
| `GET /api/methodologies/[id]/[version]` | — | `{ row, doc_markdown, calibrations: [{scope, …最新}], recent_settlements }` |
| `GET /api/methodologies/[id]/[version]/calibration` | `scope_type`、`scope_key`、`sample=1`（服务端从桶读样本清单） | 最新校准行（含 `reliability`、`temporal_split`、样本） |
| `POST /api/admin/judgments/[id]/withdraw` / `reopen` / `settle` | `{ reason }` | `requireAdminUser()`；审计 |
| `GET\|POST /api/cron/judgments-settle`、`/judgments-calibrate` | `preview=1` | 批次回执 |

分析师：`GET /api/analyst/book` 增 `self_assessment`（§8.6）；`GET /api/analyst/recommendations` 每行增 `judgment_card`（§11.2）。

---

## 11. 首批生产者

### 11.1 `macro_regime@v1`（公共，`producer_kind='rule'`）

- **触发**：宏观 WP-M3 `publishSnapshot()` 置 active 后调用 `produce(macro_regime_v1, [{ subject: {type:'macro_region', key: region}, asOf: snapshot.as_of, binding: { snapshot_id } }])`；失败不阻塞宏观发布；§7.1 步骤 0 的补偿扫描兜底（幂等：同快照同输入 → 同 id；不同快照即使同区域同日也是不同判断，§6.4）。
- **上游绑定**：`upstream.macro_methodology_version = 'v1.0'`（宏观规格 §5.2）；快照的 `methodology_version` 不同 → abstain `upstream_version_mismatch`，并要求登记新的 F4 方法版本。
- **`gather`**：`binding.snapshot_id` 指定的 `macro_snapshot` 输入（投影含 `scores / coverage / margin / growth_axis / inflation_axis / catalog_version`，`available_at` = 其观测 `available_at` 的最大值）+ 该快照 `observation_ids` 每条 `macro_observation` 输入（冻结 `value / vintage_id / available_at`）+ `table_rows{ table:'macro_series', natural_key: region }`（冻结目录权重与 `definition_version`，回放与证据不依赖目录表的后续改动）。
- **`compute`**：`selected = primary_state`，`classes = [recovery, overheat, stagflation, recession]`，`distribution = norm`，`scores_are_not_probabilities = true`，`margin_pp = (norm[primary] − norm[secondary]) × 100`（§8.1）。`deps` 含宏观 `regime.ts`、规则表与目录快照模块（`catalog_version` 冻结进 `claim`），改动即升版本。
- **判断的内容与可检验标签（审计 G02 / G05 / G29）**：判断是**当前期 nowcast**——"参考期 `reference_period = as_of 所在月`，用截至 `as_of` 可见的数据判定处于象限 X"。客观标签 = **同一分类函数**（宏观 `regime.ts` 同版本规则表、同目录权重、同 argmax）对**同一参考期**在**截止 vintage** 下重算得到的 `primary_state`：`resolver='macro_regime_replay'`，`params = { region, reference_period, macro_methodology_version: 'v1.0', catalog_version }`，`horizon = { calendar_months, 3 }`，`target = { period: reference_period + 3 }`（给迟到发布与修订留 3 个月，取宏观规格 §5.2 Δ(3M) 的同一时间尺度），`label_policy='cutoff_vintage'`，`settle_by = target 月末 + 30 天`（§3.4）。混频序列（CN GDP 季度）、未匹配规则、缺失观测的处理**完全沿用宏观 `regime.ts`**（缺失不贡献、计入 `uncovered_weight`；`coverage < 0.6` → 不判定）——F4 不另写轴规则，所以不存在第二套分类函数；重算时 `coverage < 0.6` → `Unavailable(coverage)` → 到期 `void`。这检验的是"nowcast 在数据补全与修订后是否仍成立"（时效 + 修订风险）；它不检验资产表现，也不检验 3 个月后的状态。
- **资产含义的检验**（美林时钟的配置含义：recovery → 股票优于债券……）是另一种判断类型 `macro_regime_asset_pair`，需要：配对 resolver（`r_long − r_short`，同币种、同回报口径、同日对齐）、宏观目录里标明"回报序列 vs 收益率序列"的资产序列（现金 / 短期国债、债券总回报等目前目录没有）、以及按 `margin_pp` 分档的 `p` 表的样本外来源。**v1 不实现**（§3.3、§18.1）；是否立项是 owner 决策 O3。
- **展示**：宏观状态卡保留 §3.2 的"主判定 / 次判定 / margin / coverage"，增加 `JudgmentCard` 的 lifecycle / calibration 徽章与"历史准确率（n）"；`distribution` 不再被称为"概率 / 置信度"。

### 11.2 `recommendation_call@v1`（私有只读适配器，`producer_kind='human'`）

- 不写 `judgments`。`src/lib/judgments/adapters/recommendation.ts::toJudgmentCard(rec, score)` 产出 `PrivateJudgmentCard`——与 `JudgmentCard` 同形的判别联合，多一个 `source: 'recommendation'` 与 `lifecycle='pending_fill'` 态（审计 G24）。`judgment_id = uuidV8(sha256('recommendation:' + rec.id))`：这是**域分离的内容 id**（哈希输入域与公共表不同），不是数学上不相交的保证，也不承担任何授权语义——私有卡片只经用户会话读取（审计 G31）。`subject` 优先 `issuer`（`issuer_securities ⋈ stocks_universe(market)` 按 `(ticker, market)` 在 `recommended_at` 当日反查），查不到用 `{type:'security', key:'<market>:<ticker>'}`；`kind='probability'`；`claim.p = confidence/100`，`event = "第 5 个后续交易日收盘价相对基准日收盘沿建议方向变动"`；`condition = { resolver:'recommendation_hit', … }`；`horizon = {trading_sessions, 5}`。
- 按状态的形状：
  - **未评分**（`fill_price` 为空）：`lifecycle='pending_fill'`，`inputs=[]`，`target=null`，`condition` 仍给出（文案），显示"待定价"。
  - **已评分**：`target = {session_index, base_date: fill_date, n: 5}`；`inputs = [legacy_fill{ ref:{recommendation_id}, snapshot:{recommendation_id, fill_price, fill_date, market, ticker}, available_at: fill_date 的交易所收盘时刻, origin: origins 表 `legacy_fill × eastmoney` }]`（分析师评分层冻结过的唯一价格证据只有 `close`，所以用 `legacy_fill` 而不是 `price_bar`）；`label_policy='first_observed'`。
  - `hit is not null` → `settled`；`withdrawn_at` 非空 → **`withdrawn` 优先于一切**（即使已有 `hit`）；`confidence` 为 null 或 `action='hold'` → `abstained(no_confidence | no_direction)`（优先级低于 `withdrawn`）。
- 回放：`scripts/judgments/replay.ts --recommendation <id>` 走私有入口（用户会话），只做 `inputs_only`。
- 校准：§8.6 自评；`calibration` 固定 `self_assessed` → `percent=null`。
- `/analyst` 页改动（owner 决策 O5）：建议表"信心"列显示 `band`（高 / 中 / 低）+ "未校准"，登记值在行展开里；统计摘要保留"命中率（n）"（它是结算统计），增加"自评：Brier、n（不可审计）"。表与 API 形状不变。

---

## 12. 依赖接口（待对齐）

### 12.1 宏观工作台（WP-M3）

`publishSnapshot()` 后调用 `produce(...)`；`MacroReadApi { observation(series_id, period_end, asOf): {value, unit, vintage_id, available_at} | null; snapshot(snapshot_id): {region, as_of, methodology_version, catalog_version, observation_ids, regime: RegimeResult, created_at, status} | null; snapshotsSince(createdAfter, limit): SnapshotRow[]; classifyAsOf(region, referencePeriod, cutoff, macroMethodologyVersion): { regime: RegimeResult | null /* coverage<0.6 时 null */, observation_refs, catalog: {version, weights, rules_version} } }`（`classifyAsOf` 必须调用与发布快照**同一个** `regime.ts` 函数，只是输入换成"`period_end ≤ referencePeriod` 且 `available_at ≤ cutoff` 的最新 vintage"）；`macro_regime_results.margin` 的单位须在宏观规格里写明为百分点（§8.1）。anon 可读路径：`macro_observations(status='ok')`、`macro_snapshots`、`macro_regime_results` 都是 public read（宏观规格 §4.3），所以 F4 的输入构造器（§3.5）可以用 anon 客户端实现。宏观 `GET /api/macro/overview` 响应增 `judgment: JudgmentCard`。`macro_regime_asset_pair`（未实现）将来还需要 `assetSeriesFor(region)` 与"回报序列 / 收益率序列"标记。

### 12.2 披露事实（规格二第 8 稿）

已满足：`readFacts(issuer, market, {concepts, asOf}) → {stateRev, rows, truncated}`（截止读取；F4 消费完整信封，`truncated=true` 时拒绝使用）、`factsByIds(ids)`（回放）、`metricsOfIssuer(issuer, market, formulaVersion)`（仅 `gather` 读当前缓存时用，投影里带全部底层事实投影 `input_facts` 与 `based_on_rev`）、`filingsOfIssuer`（财期序列）。需要：`deriveMetricsAsOf(issuer, market, asOf, formulaVersion)` 库函数（规格二 §9 读接口的 `asOf` 实时 derive 路径已有此能力，需作为库函数暴露；结算与回放只用它，不读缓存）；`financial_metrics` 没有 `status` 列，"该期可见"的判定以底层事实在 `cutoff` 可见为准。anon 可读：`financial_facts(status='ok')` 与 `filings` 为 public read（规格二 §4.7），`fact_sync_scope` 不是——F4 不读它。

### 12.3 文档管道（F3）与外资研报

需要：文档稳定 id、`version_hash`、页码 / 跨度、`available_at`、每文档可见范围判定函数。`sellside_*` 登记要等 `judgments` 加 `owner_user_id/visibility`（id 加租户命名空间）与 F3 的可见范围；在此之前外资研报页展示抽取字段时必须标"第三方判断（未结算）"并遵守文档权限。

### 12.4 计划三（标识符与对账）

合并发行人：`latest_judgment_cards(issuer X)` 包含 `subject_key ∈ {X} ∪ {Y : Y.merged_into 链到 X}` 的判断，卡上标"登记于合并前主体 Y"；`issuerPrimarySecurity(issuer_id, on)` 用 `issuer_securities` 的历史持有窗口；证券在期限内退市 → `Unavailable(delisted)` → `void`。

### 12.5 评测（F6）

`producer_kind='model'` 的方法从 `draft` 升 `active` 的条件由 F6 定义；本规格只保证 `draft` 不能登记正式判断。

---

## 13. 错误处理

| 情形 | 行为 | 码 | 批次 |
|---|---|---|---|
| 方法不存在 / `draft` / `retired` 登记 | 拒绝该主体 | `methodology_unavailable` | partial |
| 主体不存在 / 非活跃 / 类型不在公共集 | 拒绝 | `subject_missing` / `subject_inactive` / `subject_type_not_public` | partial |
| 输入 kind 不在白名单 / 构造器重跑不一致 / 构造器取不到（不公开、被隔离）/ `origin` 键不在冻结表 | 拒绝 | `input_not_allowed` / `input_snapshot_mismatch` / `input_not_public` / `input_origin_unknown` | partial |
| 事实读取 `truncated=true` | 不用不完整数据；结算退避 | `unavailable_summary(truncated)` | — |
| 隔离项到 `settle_by` 仍未处理 | `void(unresolved_inconsistency)` | `voided_summary` | — |
| 租约 token 不匹配 | 该条放弃，不写 | `lease_lost`（信息） | — |
| 校准期间发生撤回 / 重开 | 丢弃本次报告，下次重算 | `stale_revision`（信息） | — |
| 同 `request_key` 不同 judgment / 载荷 | 不写，上报 | `request_key_conflict` | partial |
| `set_job_state` 乐观锁失败（并发 cron） | 本次放弃该单元 | `job_state_conflict`（信息） | — |
| 方法同步 `formula_hash` 漂移 | 拒绝同步，脚本退出码 2 | `formula_hash_drift` | — |
| 输入可得时刻晚于 `as_of` 日终 | 拒绝 | `lookahead` | partial |
| 同 id 不同语义字段 | 隔离 + 拒绝 | `idempotency_conflict` | partial |
| `claim / condition` 校验失败 | 拒绝 | `invalid_claim` / `invalid_condition` | partial |
| `target` 不可解析 | 转弃权 | `abstained_summary`（信息） | — |
| `code_version` 缺失 | 整批拒绝 | `code_version_missing` | rejected |
| resolver 超时 / 限频 / 空 | 退避重试 | `unavailable_summary`（信息） | — |
| 未到期 | 退避 | `pending_summary`（信息） | — |
| 超过 `settle_by` | `void(no_data)` | `voided_summary`（信息） | — |
| 复权不支持 / 退市 | 立即 `void` | 同上 | — |
| 基准不一致 / 事实多候选 / 基准 bar 缺 | 隔离，不结算 | `settlement_*` | partial |
| 截止 | 不再领取 | `deadline_hit`（信息） | — |
| 无到期 | 空转，心跳 ok | `detail.idle=true` | success |
| 校准指纹重复 | 不写 | `duplicates` 计数 | success |
| 回放哈希不符 | 脚本退出码 2 | `input_hash_mismatch` | — |
| 读接口 | 400 `invalid_parameter:<name>` / 404 `unknown_judgment` / `unknown_methodology` | | |
| 管理员非法转移 | 409 `settlement_sequence` | | |

---

## 14. 测试策略

### 14.1 单元（vitest，`memoryJudgmentsDb`）

- `contract.test.ts`：主体格式；`claim` 按 kind；`Active | Abstained` 判别；`resolveTarget`（`session_index`、`date`、`period`、`fiscal_period` 多季外推与冻结日历）；`settle_after/settle_by` 算术（闰年、月末）；`retrospective` 三条规则（含 `labelAvailableAt`）。
- `inputs.test.ts`：每种输入构造器对夹具稳定、与字段顺序无关；`financial_fact` 夹具取规格二 `fixtures/edgar/CIK0000320193.trimmed.json` 派生行；被隔离 / 非 `ok` 行 → `input_not_public`；`price_bar` close-only 分支字段为 null；`origins` 表键校验；`inputs_hash` 与数组顺序无关；白名单拒绝 `document_span / legacy_fill`。
- `register.test.ts`：同输入同 id；`claim` 不进 id；`duplicate` / `idempotency_conflict`（比较完整规范化载荷，含 `producer_ref / kind / target / horizon / label_policy`）；构造器重跑不一致 → `input_snapshot_mismatch`；`lookahead`（含宏观快照 `available_at` 取观测最大值）；弃权空输入可登记；nonce：`human` 重试同 id，`model` 新 `run_id` 新 id；23505 重读。
- 属性测试（种子随机 200 次）：注册表中每个 `rule` 方法 `compute/condition` 两次调用字节一致；打乱输入顺序 id 不变。
- `settle.test.ts`：状态机表（§7.2 每行一个用例，含 `label_available_at > settle_by → void(late)`、`unresolved_inconsistency`）；队列顺序、退避、租约 token 不匹配；`price_return` 用录制夹具（复权能力验证夹具：每个 `(source, market)` 一只含已知除权 / 拆股事件的证券，`qfq/hfq/none` 三份；验证程序的 `verified / unsupported` 判定）：`session_index` 到期与向后分页、`date` 终点、`benchmark` 同日对齐与 `benchmark_gap`、`base_bar_missing`、`basis_mismatch` 两侧、close-only 证据；能力表非 `verified` → `void`；`fact_metric` 用规格二 `memoryFactsDb` + `deriveMetricsAsOf`：完整键、多候选、`yoy`、`truncated`；`cutoff_vintage` 在 `settle_by` 前不结算、到期以 `cutoff` 重取；`deadline` 与 `signal` 传递、小批领取；批次计数（`deferred` 计数器；全 deferred 为 `success`）与信息码；`override.resolution` 两种裁决。
- `calibration.test.ts`：完美预报 Brier 0；恒 0.5 → 0.25；`brier_skill`；分箱与 Wilson；`ece_raw` 与 `ece_raw_holdout`；留出段边界重叠剔除；非重叠抽样（宏观日度 91 天窗口 → 每 91 天 1 条；同股票连续建议去重；`embargo_days`）；三态判定（含 G01 的反例：原始 ECE 0.12 / 映射后 ≈ 0 → `failed`）；categorical `majority_rate` 基准、`margin_pp` 分箱；interval `width_ratio`；score `evaluated`；期望值由实施者之外的人用 Python（`sklearn.calibration.calibration_curve` + 手写 Brier）算出并抄入。
- `display.test.ts`：lifecycle × calibration 组合；probability 未校准 `percent===null` 且 `band` 正确；`self_assessed` 永不出 `percent`；校准行过期 / invalidated → `insufficient`；`publishable=false` 不出卡；派生判断门控（两者 open、情景一致、`p` 差 ≤ 0.01）；zh / en headline 非空。
- `macro-regime.v1.test.ts`：宏观规格 §14 验收样例 9 的夹具 → 登记（`margin_pp` 单位、`catalog_version` 冻结）；`macro_regime_replay` 用夹具 `classifyAsOf`：同 vintage → `hit`，修订后 argmax 变化 → `miss`，`coverage < 0.6` → `Unavailable`；上游版本不匹配 abstain。
- `recommendation.adapter.test.ts`：`hold` / 无信心 → abstain；无 fill → `pending_fill`（空输入、空目标可序列化）；撤回优先于 `hit`；`hit` → settled；ticker 反查失败 → `security` 主体；id 域分离。
- `batches.test.ts`（计划一文件）：`deferred` 计数器与向后兼容。
- 路由测试：参数、缓存头、`view=as_known`、admin 鉴权、cron Bearer、`preview`。

### 14.2 数据库（`test:db`）

`src/lib/judgments/judgments.integration.test.ts`（含 `S4_TEST_STATE`，进 `criticalSuites`）：迁移可重放；八表触发器（只追加、方法表限列且 `created_at` 不可变、事件表只追加、`settlement_sequence` 每条转移与序号示例）；`register_judgment` 同事务插队列、拒绝与方法行不一致的 `kind`、拒绝与 `target` 重算不符的 `settle_after/by`；`claim_due_judgments` 的 `skip locked` 与租约 token；`append_settlement` 并发（两个连接同一判断：先到者 `applied`，后到者 `already_final`，不是 23505；过期 token → `lease_lost`）；`request_key` 重放 → `already_applied`（持久化在 `judgment_settlements.request_key`；响应丢失、租约已清空后的重试仍 `already_applied`；同键不同 judgment / 载荷 → `request_key_conflict`；R06）；校准续跑：上传后 CAS 前崩溃 → 孤儿对象不被消费、重试同页；两个 worker 并发 → 只有 CAS 胜者的页进 manifest（R02）；`calibration_cohort` 对游标两侧的并发登记都按 `registered_at ≤ cutoff` 判定（R03）；`publishable=false` 的方法 `calibration_cohort` 为空而 `calibration_cohort_internal` 完整（R04）；窗口外撤回后指纹变化、`duplicate` 后单元状态被清空、清空失败后重试（R05）；`withdrawn` 使 `validity.revision + 1`；`insert_calibration` 的 `stale_revision`；`sync_methodology` 三种事件与 `formula_hash_drift`；**RLS 真实角色**（anon：`publishable=true` 方法的判断 / 结算 / 校准可读，`publishable=false` 的四表都读不到（直接 `select` 与公共 RPC 都为空），队列 / job_state 读不到，写被拒；service_role 读八表、对 `judgments / judgment_settlements / 队列 / 事件 / validity / job_state` 直接 insert / update 被拒、经 RPC 成功；anon 能执行公共读 RPC、不能执行写 RPC）；`latest_judgment_cards` 的 `as_known`（`registered_at` 截止、方法事件史：重同步后历史查询仍返回当时存在的方法）与合并发行人反查；`calibration_cohort` 带 `cutoff` 分页；`set_job_state` 乐观锁；`repair_stale_batches`；注册表 ↔ 表 `formula_hash` 一致；GIN 查询。

### 14.3 离线集成

`src/lib/judgments/settle.integration.test.ts`（critical）：夹具 K 线 + `pgJudgmentsDb`，cron 核心两遍：第一遍 `inserted > 0`，第二遍领取为空（终态行不再入队）、`success`；`void(1)` 后 admin `reopened(2)` → 补数据 → `settled(3)`；`settled(1) → withdrawn(2) → reopened(3) → settled(4)`。

### 14.4 回放夹具（黄金）

`fixtures/judgments/replay/*.json`：至少 3 条（`macro_regime@v1`、合成 `fact_metric` 判断、`recommendation_call@v1` 私有一条），每条含登记行与全部冻结投影；`replay.test.ts` 断言 `exact` / `inputs_only`，篡改投影后 `input_hash_mismatch`。夹具由实施者之外的人核对。

### 14.5 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`；`messages-parity`、`typecheck`、`lint`、`build`、`test:migrations` 全绿才算完成。

---

## 15. 分期（供计划四拆任务）

| 工作包 | 交付 | 退出条件 | 估算（人日，经验值） |
|---|---|---|---|
| F4-0 契约与迁移 | `contract.ts`、`types.ts`、迁移（八表、触发器、§5.6 全部 RPC、按 `publishable` 的 RLS 策略）、锁文件、`database.types.ts`、`JudgmentsDb` 三实现、`uuid-v8.ts` 抽取、集成测试 §14.2 | `test:db`、`test:migrations` 绿；`ledger.test.ts` 原样通过 | 4 |
| F4-1 注册表、登记、回放 | `registry.ts`、方法接口（含 `deps`、`resolveTarget`）、`sync-methodologies.ts`（`formula_hash_drift`、`deps` lint）、`docs/methodologies/README.md`、`inputs.ts` 构造器（anon 路径）、`origins.ts`、`register.ts`、`produce.ts`、`replay.ts` + 脚本、回放夹具 | 单测 + 回放夹具绿 | 3 |
| F4-2 结算 | `settle.ts`、队列逻辑、`resolvers/{price,facts,macro}.ts`、`price-capabilities.ts` + 验证程序与夹具、K 线适配器 `endDate` / 分页、隔离钩子与裁决、cron 路由、`batches.ts` 的 `deferred` 计数器与 `INFO_CODES`、`repair_stale_batches`、`vercel.json`、脚本 | `settle.test.ts` + 离线集成绿；`preview=1` 对真实库空转回执；能力表至少一个 `verified` 条目或如实全 `unsupported` | 4 |
| F4-3 校准与显示 | `calibration.ts`（非重叠抽样、留出段、按 kind 门控）、校准 cron（工作单元续跑）、桶、失效规则、`display.ts` | 校准数学单测（外部算出的期望值）绿 | 3 |
| F4-4 读接口与 UI | 读路由、admin 路由、`JudgmentCard` / `InputsDrawer` / `SettlementTimeline`（按画布稿）、`/intel/methods*`、`/admin/judgments`、i18n | 路由测试、parity 绿；DESIGN.md 审查 | 3 |
| F4-5a 宏观生产者 | `macro_regime@v1` + 文档、`classifyAsOf` 接口对接、补偿扫描与 marker | WP-M3 合并后端到端登记一条；WP-M3 未合并则用夹具完成并在 §19 记录 | 1.5 |
| F4-5b 分析师适配器 | `adapters/recommendation.ts`（`PrivateJudgmentCard`）、`/api/analyst/book.self_assessment`、`/analyst` 页信心列 | 页面显示未校准态；无百分比 | 1 |
| F4-6 文档与收尾 | runbook、接口对齐记录、§19 | 全量门禁绿；Codex 复审无 P1 | 1 |

合计约 20.5 人日（估算，非证据）。

验收样例：
1. 同一 `RegimeResult` 两次 `produce` → 第二次 `duplicates=1`，行数不变。
2. 篡改回放夹具里一个 `macro_observation` 的冻结 `value` → `replay.ts` 退出码 2 并指出 `series_id`。
3. `session_index n=5` 的合成判断，夹具只有 4 根后续 bar → 队列 `deferred(pending)`，退避；补第 5 根 → `settled`，`evidence.bars` 含 base 前 5 根到 end（≥ 11 根）。
4. 独立样本 99 → `insufficient`；第 100 条后校准 cron → 留出段原始 ECE ≤ 0.10 且 skill > 0 → `calibrated`，`percent` 非空；构造"原始 ECE 0.12、isotonic 映射后 ≈ 0"的样本 → `failed`，`percent` 仍为空。
5. 管理员 `withdrawn(2)` → 卡 `lifecycle='withdrawn'`，该方法校准行立即视为失效（`insufficient`），下次校准不计入；`reopened(3)` 后重结算 `settled(4)`。
6. 断网跑结算 cron：全 `deferred(unavailable)` → 批次 `success` + 信息码，无结算写入；resolver 抛错的运行 → `failed`，连续两次后 `dq_freshness` `error`；进程被杀后下次 cron 的 `repair_stale_batches` 把残留 `running` 标 `failed`。
7. service_role 直接 `insert into judgments` → 权限拒绝；经 `register_judgment` 成功且队列行同时出现。
8. 方法 `publishable=false` 时，anon 对 `judgments / judgment_settlements / judgment_calibrations` 的直接 `select` 与公共 RPC 都返回空；置 `true` 后立即可读；再置 `false` 立即消失。
9. 重同步一个已存在的方法（`synced_at` 更新）后，`view=as_known&asOf=<同步前某日>` 仍返回该方法当时的判断与当时的状态事件。
10. 校准任务运行中管理员撤回一条结算 → `insert_calibration` 返回 `stale_revision`，无新报告；页面上该方法的旧报告已因 `revision` 变化显示为 `insufficient`。

---

## 16. 独立验证

- Codex（gpt-6-astra，medium）：规格两轮与处置；每个工作包提交再审。
- 校准数学：外部 Python 计算期望值（§14.1）。
- 回放夹具由实施者之外的人核对。
- 方法文档（`macro_regime@v1` 的"同函数截止 vintage 重算"标签；行业 / 公司方法）请一位买方分析师读并记录"条件是否真的可证伪、标签是否客观"到 `docs/audits/2026-11-04-judgment-framework/expert-notes.md`。
- 上线后 6 个月：第一份真实校准报告（总纲 §2.6"结算即验证"）。

---

## 17. owner 事项

| 事项 | 谁 | 何时 |
|---|---|---|
| **决策 O1**：首批 = `macro_regime@v1`（公共）+ `recommendation_call@v1`（私有适配器）；是否把组合 `decisions` 也接适配器（§18.2） | owner | 计划编写前 |
| **决策 O2**：`threshold_n = 100`、`ece_max = 0.10`、`window_years = 3`（§8.4）；备选 50 / 200 | owner | 计划编写前 |
| **决策 O3**：`macro_regime@v1` 的标签 = 同一分类函数在截止 vintage 下对同一参考期重算（默认，§11.1）；`macro_regime_asset_pair`（资产含义检验）是否作为后续工作包立项 | owner + 宏观规格作者 | F4-5a 前 |
| **决策 O7**：历史补登记能否凭不可变发布证据恢复前瞻资格（§3.4）；v1 默认不能 | owner | 计划编写前 |
| 发布准入：逐方法确认全部输入 `origin.license_status='confirmed'` 后置 `publishable=true`；未确认前公共页不显示该方法的卡片 | owner | 每个方法上线前 |
| **决策 O4**：`trading_sessions` 用 K 线序号（默认）还是引入 A / HK 交易日历 | owner | F4-2 前 |
| **决策 O5**：`/analyst` 页信心列改为带状 + 自评（§11.2）；第二阶段是否建 service-role 写的只追加私有结算证据表以解锁分析师百分比 | owner | F4-5b 前 |
| **决策 O6**：港美股复权来源：若 DataGateway / 东方财富对 HK / US 的复权都验证无效，HK / US 价格判断在 v1 一律 `void(adjustment_unsupported)`，还是等新来源 | owner | F4-2 验证后 |
| 数据源展示许可：东方财富 / DataGateway 日线用于公开页面的结算证据是否在许可范围内 | owner | F4-2 前 |
| 画布：§9.6 七项 | owner（Claude Design） | F4-4 前 |
| 生产：执行迁移、`sync-methodologies`、桶 `judgments-calibration`、cron 生效（含 `maxDuration=300` 套餐确认） | owner | 合并后 |
| 买方分析师阅读方法文档 | owner 安排 | F4-6 前 |

---

## 18. 开放问题（实施前核对）

1. `macro_regime_asset_pair`（未实现）需要的配对 resolver、回报序列标记、现金 / 债券总回报序列与 `p` 表来源——立项前先回答。
2. `decisions` 适配器：`decisions` 无只追加触发器，登记前是否先补。
3. 复权能力验证（§7.4）的结果：哪些 `(source, market, adjustment)` 能 `verified`；全部 `unsupported` 时价格类方法在 v1 没有可用市场（决定 O6）。
4. 规格二 `deriveMetricsAsOf` 库函数的暴露（§12.2）。
5. 校准桶 cohort 清单在样本上万时的体积（每条约 200 B，1 万条 ≈ 2 MB，可接受；更大时分片）。
6. `window_years` 对 `fiscal_quarters` 方法是否够（行业规格给出期限后复核）。
7. 托管 PostgREST 的 `max_rows`、Vercel 套餐的 `maxDuration=300`、Supabase 对 `security definer` 函数 owner 的处理（`20261018120000_anchor_runner.sql` 的注释记录了非超级用户执行迁移的坑）——F4-0 在预览环境核对。
8. 宏观规格需补：`margin` 单位（百分点）、`macro_snapshots.catalog_version`、`classifyAsOf` 与 `snapshotsSince`（§12.1）。

---

## 19. 实施记录与偏差

（实施后补记。）

---

## Claude Design 画布

画布：[判断层 Judgment Framework](https://claude.ai/artifact/AaoLaRVJfowkr4T5dmfzJG)（2026-11-04；10 个画板：桌面 8、移动 2）。画布为私有，owner 从页面 Share 菜单共享后其他人才能打开。画板名前的数字即 §9.6 清单编号。

| §9.6 待设计项 | 画板 |
|---|---|
| 1 `JudgmentCard` 可达组合 | 1 JudgmentCard · probability / categorical；1 JudgmentCard · score / interval / 终态 / 派生 |
| 2 `InputsDrawer` | 2 InputsDrawer |
| 3 `SettlementTimeline` | 3 SettlementTimeline |
| 4 `/intel/methods` 与 `/intel/methods/[id]/[version]` | 4a 注册表；4b 方法详情 |
| 5 `/admin/judgments` | 5 /admin/judgments |
| 6 `/analyst` 信心列与自评 | 6 /analyst 信心列与自评 |
| 7 移动端折叠态 | 7 移动 · 折叠态；7 移动 · 输入与结算 |

组合按 §9.1 / §9.3 推出；`display.ts` 导出枚举后以枚举为准增删。约定：百分比只在 probability × calibrated 时出现，其余用三分位档位；黄铜只用于 calibrated 徽章与选中态，未校准用中性灰，命中/未命中用 `--up` / `--down`；可靠性图与维度都有表格视图；方法 id、主体与数值均为版式示意。偏差待 owner 确认：三级文字用 `#8b8b94` 代替 `#52525b`（对比度）。
