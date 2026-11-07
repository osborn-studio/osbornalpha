# F4 实施记录

| 任务 | 提交 | Opus 复审 | Codex | 修复轮次 | 备注 |
|---|---|---|---|---|---|
| T5 batches deferred | 6cbfdb7c | 指挥直审 diff：符合 §7.5 | codex review：No actionable defects | 0 | 早于计划定稿执行（任务独立、稳定） |
| T1 core pure modules | cfc07e82 + 16dfa3b2 | Opus: SPEC PASS (code), QUALITY PASS (minors fixed) | Codex review: 1 P2 (jsonClean __proto__) fixed | 1 | executed on plan draft 3 |
| T2 migration I | 本提交（`feat(judgments): F4 Task 2`） | 待复审 | 待审 | 0 | judgments.integration 7/7；test:migrations PASS；executed on plan draft 3 |
| T3 migration II | 本提交（`feat(judgments): F4 Task 3`） | 待复审 | 待审 | 0 | judgments.integration 31/31（连跑 3 次稳定）；test:migrations PASS；typecheck、lint 干净；executed on plan draft 4；复审修复提交 `fix(judgments): F4 Task 3 review round 1`（39/39） |
| T6 origins / facts-derive / macro-api / inputs-db | 本提交（`feat(judgments): origin table, deriveMetricsAsOf`） | 待复审 | 待审 | 0 | 4 测试文件 17/17；typecheck、lint 干净；executed on plan draft 4；复审修复提交 见 T6 fix 行 |
| T6 fix | 本提交（`fix(judgments): Task 6 review`） | 待复审 | 待审 | 1 | filings 过滤未发布(mapping_gen<=0)先于 limit；tableRows / issuer_securities 用 selectAll 分页（max_rows 上限桩）；asOf 真实日期 + JudgmentError(invalid_parameter)；注释补充；先红 3 失败后绿 |
| T4 JudgmentsDb | b7e421e7 | 待复审 | 待审 | 1 | db.test 28/28；pg 契约+并发与 judgments.integration 同跑 65/65 |
| T4 fix | 本提交（`fix(judgments): F4 Task 4 review round 1`） | 复审意见已处理 | Codex E-01..E-07 已处理 | 1 | db.test 34/34；两个集成文件同跑 70/70 连跑 5 次，0 死锁；test:migrations PASS；typecheck、lint 干净 |

## 偏差 · Task 1

- `uuidV8` 放在 `src/lib/judgments/uuid-v8.ts`，而非规格 §2.4 的 `pa-v1/uuid-v8.ts`（计划审计 P2-03）。
- 格式错误的主体键用 `subject_missing`（消息 `invalid_subject_key:<type>`），规格 §13 无专门码。
- claim 校验拒绝未知成员。
- `score.dims` 覆盖与值一致（缺维度即 null）、`interval.scenarios` 概率和为 1（容差 1e-9）。
- `jobKey` 的 `scope_type='all'` ⇔ `scope_key=''`。
- 错误码表在规格 §13 之外新增若干码（`methodology_mismatch`、`settle_window_mismatch`、`duplicate_key`、`item_not_open`、`unknown`、`input_unavailable`、`snapshot_unclassified`、`binding_not_referenced`、`override_mismatch` 等）。
- 新增 `jobKey('calibrate_round')`（校准 cron 轮次游标，计划审计 P2-02）。
- `period` 目标的 `settle_after` = 下月 1 日 00:00Z（计划契约补充），规格写的是"该月末"。
- 共享契约按计划审计第一、二轮修订：`QuarantineOverride.cutoff`、`quarantineSettlement`、`rejectQuarantinedSettlement`、`envelopeById`、校准冻结 / 成员 / 清理（`freezeCalibrationCohort`、`cohortMembers`、`clearCalibrationGeneration`）。
- 审查修复：`jsonClean` 保留自有 `__proto__`；`parseJobKey` 严格（与 `jobKey` 往返一致）；`isRetrospective` 校验输入；摘要测试补 `kind` 单变量用例。
- 注：计划第三轮修复可能在队列 `last_detail` 增加 `incident` 子对象约定，不涉及 `types.ts`。

## 偏差 · Task 2

- 无偏离计划文本：迁移、集成测试、`database.types.ts` 三处 `// F4` 围栏、`criticalSuites` 围栏均按计划原样落地（计划已列的规格偏差——命名表约束 `judgment_calibrations_state_by_kind`、`judgments_active_has_inputs` 的 `case` 写法、`service read` 策略、`before truncate` 触发器、第九表无只追加触发器、触发器函数撤销 EXECUTE——照计划实现）。
- 先移走迁移确认测试 7/7 失败，再放回确认 7/7 通过；`test:migrations`（`LC_ALL=C`）PASS；`verifyCriticalSuiteInventory` 打印 `inventory ok`；`typecheck`、`lint` 干净。

## 偏差 · Task 3

- 无偏离计划文本：`rpc-inventory.ts`、迁移函数段（`judgment_envelope` 类型、6 个内部函数、7 个公共读 RPC、15 个服务写 RPC、授权块）与 24 个集成用例均按计划原样落地，迁移与测试在 PostgreSQL 17 上首次即通过，未做任何 SQL 修补。
- 计划 Step 2 预计 Task 3 先失败 21 个用例，实际为 24 个（计划 Step 4 的 24 个 = 全部新用例）；先失败（24 failed / 7 passed）、追加 SQL 后 31 passed。
- 未改 `migrations.lock.json`（Task 22 锁）；无其他文件改动。

## 偏差 · Task 6

- 无偏离计划文本：`origins.ts`、`facts-derive.ts`、`macro-api.ts`、`inputs-db.ts`、`testing/facts-fixture.ts` 与四个测试文件均逐字取自计划代码块，未做任何修补；4 文件 17 个用例首次通过（计划预估约 19，实际 17），`typecheck`、`lint` 干净。
- 过程偏差：测试与实现同批落地，未单独执行计划 Step 3 的"先失败"运行。
- 核实记录（计划已给出，未重做）：`read_facts` 对 anon 可执行、`financial_facts` anon 仅见 `status='ok'`、`macro_series` 表不存在（规格偏差 1）。
- 未触碰 `supabase/migrations`、`judgments.integration.test.ts`；不依赖 `memoryJudgmentsDb`。

- 复审修复（T6 fix）：issuer_industry_memberships 按 `code`、issuer_securities 按 `ticker` 排序分页（TableClient 仅支持单列 orderBy，二者无单列唯一键，同键内顺序依赖数据库；该残余已由下一条修复消除）。

### Task 3 复审第 1 轮修复（迁移原地改，未锁）

每项先加失败测试（红：7 个失败 / 32 通过；第 8 项的 authenticated 用例本就通过），再修复；之后 `judgments.integration` 39/39（连跑 2 次）、`test:migrations` PASS、typecheck、lint 干净。
1. `judgment_append_settlement_internal` 的 `reopened` 分支同时置 `override = null`。
2. C-01：`release_lease`、`append_settlement`（令牌路径）、`quarantine_settlement` 在队列锁下要求令牌相符且 `leased_until > clock_timestamp()`，否则 `lease_lost`；管理员空令牌路径与 request_key 重放路径不变。
3. C-02（**偏离协调者首选**）：未撤销 `judgment_envelope_of` 的 EXECUTE——`latest_judgment_cards / judgment_history / judgment_envelope_by_id` 是 security invoker，以调用者角色调它，撤销会令 anon 全部读失败。改为同一谓词方案：函数内按调用者 RLS 复查该行存在，`as_known` 要求 `registered_at <= cutoff` 且有 `<= cutoff` 的方法事件，否则返回 NULL；`rpc-inventory.ts` 不变。
4. C-03：`latest` 视图的 `calibration_valid` 用 `now()`，忽略传入 cutoff。
5. C-04：`freeze_calibration_cohort` 与 `clear_calibration_generation` 先取同一把 `pg_advisory_xact_lock(hashtextextended('cohort:<generation>', 0))`；两种顺序的并发测试用 `waitBlocked`。
6. `apply_quarantine_override / reject_quarantined_settlement`：项 `table_name` 必须是 `judgment_settlements`，且队列 `incident.quarantine_id = p_quarantine_id`，否则 `stale`。
7. freeze：`frozen_at`（语句时间戳）同时约束成员的 `registered_at <= frozen_at` 与冻结结算的 `settled_at <= frozen_at`（测试用同一把代际锁让冻结等待，期间登记的行不进成员）。
8. 竞态测试的 `pause(200)` 全换成 `waitBlocked(pid)`；`max()` 全限定为 `pg_catalog.max`（含 `sync_methodology`）；RLS 用例加 `authenticated` 角色调用。

### Task 3 复审第 2 轮修复（Codex D-01）

`judgment_envelope_of` 只信任 `p_j.judgment_id`：改为 plpgsql，先校验视图（`latest`/`as_known`，`as_known` 要求 cutoff），再在调用者 RLS 下按 id 读取已存行，所有返回字段、join 与 as_known 谓词都用该已存行；伪造 `registered_at` 或替换 `methodology_id/version` 的复合值无效，不可读或不存在 → NULL。新增用例（anon 与 authenticated，三种伪造）先红（旧函数返回伪造行）后绿；`judgments.integration` 40/40（2 次），`test:migrations` PASS，lint 干净。

## Task 7 — 复权能力验证（spec §7.4）

- 运行：`node --import tsx scripts/judgments/verify-adjustment.ts`（无 `.env.local`，DataGateway 未配置），2026-11-07（UTC 录制日期）。
- 事件核对（逐一对照一手文件，均一致，未改 `ADJUST_EVENTS`）：600519.SH 2024-06-19 每股 30.876 元——巨潮下载的上交所披露公告 PDF（static.cninfo.com.cn/finalpage/2024-06-12/1220324741.PDF）列"A 股每股现金红利 30.876 元（含税）"，除权（息）日 2024/6/19；00700.HK 2024-05-17 每股 3.4 港元——披露易公告 PDF（hkexnews.hk/listedco/listconews/sehk/2024/0320/2024032000532_c.pdf）列"除淨日 2024年5月17日"；NVDA 2024-06-10 十拆一——nvidianews.nvidia.com 2024-05-22 新闻稿含 ten-for-one forward stock split 与 June 10, 2024 起按拆股后价格交易。
- 判定器修订（复审 c16f409d）：模型只有在**事件两侧各自为常数**（比率模型：因子 adj/none 的侧内相对极差 ≤ 2e-4；差值模型：adj−none 的侧内极差 ≤ 0.02，即两位小数报价的两次舍入）**且**带符号的跳变与公告相符（比率相对误差 ≤ 2e-4；差值与每股红利之差 ≤ 0.02，反向 −D 不通过）时才被接受；两模型都评估，取偏差/容差最小者。原先 0.002 的容差只能区分噪声，东方财富 hfq（"乘数 × 原价 + 跳变偏移"）被误判为通过。夹具内 `verdicts` 用新判定器重判（未重新联网录制）。
- 结果（新判定器的实际输出）：
  - eastmoney A qfq: verified(difference, 30.88 / 30.876)；hfq: inconclusive（侧内比率极差 3.5e-3 / 2.6e-3）
  - eastmoney HK qfq: verified(difference, 3.4 / 3.4)（先前误标 ratio）；hfq: inconclusive（侧内极差 5.0e-3 / 2.6e-3，跳变误差 1.6e-3）
  - eastmoney US qfq: inconclusive（侧内比率极差 3.1e-4 / 4.4e-4 > 2e-4；拆股后侧为差值型偏移 −0.57，即"乘数 × 原价 + 偏移"）；hfq: verified(ratio, 9.99992 / 10，侧内极差 8.1e-5 / 1.1e-4)
  - datagateway A/HK/US: not_configured（本机无 DataGateway 配置；未录制，未改表，保持 unverified）
- NVDA 另有一笔每股 0.01 美元季度股息（除息日 2024-06-11），落在事件后窗口内；其对 hfq 比率（≈ 0.01/121 ≈ 8e-5）的影响低于 2e-4 容差，未影响 hfq 判定；qfq 的侧内偏移（−0.57 常数）正是这类累积股息调整的表现，该行因此保持 unverified。
- 夹具：fixtures/judgments/kline/eastmoney-A-600519_SH-2024-06-19.json、eastmoney-HK-00700_HK-2024-05-17.json、eastmoney-US-NVDA-2024-06-10.json。
- 能力表：eastmoney A qfq、HK qfq、US hfq 三行 verified；其余九行 unverified。O6 待 owner：A / HK hfq、US qfq 与全部 datagateway 行未验证（datagateway 需在有配置的环境补录）；使用这些组合的价格判断在 v1 一律 void(adjustment_unsupported)。

## Task 15 review fixes（校准数学，G-01..G-05）
- G-01：已结算 price_return 的 `realized.to` 缺失 / 不可解析 → 不再退回 ceil(n×1.52) 估计，样本排除并计入 `metrics.n_invalid_endpoint`；G-02：分箱改为边界比较（Python 预言机同步，既有 20 个用例输出不变）；G-03：混淆矩阵两层用无原型对象；G-04：interval `scenarios` 保留并在 `metrics.scenarios` 做逐情景 probability 评估（up ⇔ condition.predicate 成立，无数值谓词时 realized ≥ 0；不进 interval 状态）；条目 6：`metrics.n_unusable_value`。
- 预言机：每个用例的 metrics 增加常量 `n_invalid_endpoint=0`、`n_unusable_value=0`（编码里没有此类行）；新增 7 个门控用例（技能≤0、技能 null、重叠剔除后留出不足、留出 20/19、ECE=ece_max、interval 宽度比>1）。变异检验：删除 `hsk>0`、`he===null`、`ratio<=1`、`≤`→`<` 各使至少 1 个测试失败。
- 规格偏差（Task 15 校准，interval 情景，取代此前 realized_nonnegative 代理）：情景概率预测的是绑定的 thesis_win_rate condition（仅以 scenario_event_hash 识别），interval 行无法求值，按收益符号打分会报出错误数字；v1 的 `metrics.scenarios` 只给 `{status:'unavailable', reason:'bound_event_not_evaluable', labels}`，无 Brier / ECE，且不进任何门控。规格 §8.1 的逐情景评估推迟到绑定条件可由冻结证据求值时（公司研究规格）。
- Task 15 再复审：已结算 price 终点必须是真实日历日期（往返校验，拒绝 2025-02-30）且不早于 as_of 与 base_date，否则排除并计入 `n_invalid_endpoint`；新增预言机用例 gate_skill_negative（留出 ECE 合格、留出 brier_skill < 0 → failed）。

## Task 8 review fixes（输入构造器，H-01..H-04）
- H-01：price_bar 先校验 ticker↔market（eastmoney 用 `tickerToSecid`，datagateway 用 `datagatewaySymbol`），不符 → `input_not_public`（message `market_mismatch`），再查能力与收盘时刻。
- H-02：`buildInput/buildOrAbstain/rebuildAndCompare` 新增必填位置参数 `observedAt`（第 4 位，opts 后移）；收盘时刻 > observedAt → `input_unavailable`（`bar_not_closed`），`buildOrAbstain` 对 price_bar 的该情形弃权。Task 10 须传 `db.serverTime()` 并走 `buildOrAbstain`。
- H-03：table_rows 每行 max(created_at, updated_at)；updated_at < created_at → `input_unavailable`。
- H-04：`canonicalize/digest/jsonClean` 拒绝稀疏数组与带额外属性的数组（`invalid_parameter`）；`rebuildAndCompare` 要求快照 JSON 往返后摘要不变。
- 次要：financial_metric 标签含 issuer_id 与 market；`asOf` 校验真实日期（`invalid_parameter`，原为 RangeError）。
- H2-01（Codex 复核）：table_rows 区分缺失（null/undefined）与畸形（存在但不可解析）的 created_at/updated_at；任一畸形 → `input_unavailable`，再套用 max 与 updated<created 规则。

## Task 17（显示契约 display.ts + i18n）
- 提交 c51555f7：`band.ts`、`display.ts`、`display.test.ts`、`messages/{zh,en}/judgments.json`、`messages.test.ts`、`src/i18n/request.ts`（`// F4` 围栏加 `'judgments'`）。计划代码原样落地，红测：缺 `./display` 导入失败。
- 规格偏差（计划已列，记入实施记录）：
  1. §1.1 percent 字段：内存契约里 `display.percent` 必有（`null`），HTTP 层由 Task 18 `serializeBody` 删去值为 `null` 的 `percent` 键（决策 D2）；卡片任何字段都不含登记的 `p`。
  2. `toCard` 需要方法标题，由调用方传 `title`；`cardsOf` 在 RLS 之外再按方法行 `publishable` 过滤一次。
  3. 维度标签 v1 两语都用维度 `id`；`evidence_summary` 是通用的 `resolver@version · 原因`。
  4. §9.5 的 `messages-parity.test.ts` 不覆盖本域：F4 用自己的 `messages.test.ts` 做键与占位符对称检查。
  5. §9.4 "同 `unit`" 解释为 `horizon.unit` 相同；`k` 由调用方传入，要求 `0 < k ≤ 1`。

## Task 17 review fixes（K-01..K-03）
- K-01：参考时间必填。`toCard / cardsOf / derivedOdds / calibrationStateOf / validCalibration` 的 `now` 改为必填 `string`（as_known 视图传 cutoff）；过期（`valid_until ≤ now`）或不可解析一律 `insufficient`，percent 为 `null`。反例测试：`valid_until 2026-01-01`、`now 2026-11-06` → 无 percent、标题无 `%`、无校准摘要。
- K-02：`derivedOdds` 仅当 `b` 有限且 `> 0`、`f` 有限时才 `computed`，否则 `not_computed`，原因 `odds_not_finite`（zh/en 文案已加）。两个溢出反例（1e308/−1e-308、1e-308/−1e308）有测试。
- K-03：概率（卡片的 `claim.p`、赔率的 thesis `p`）必须有限且在 [0,1]：卡片 `percent=null`、无 `band`、标题标"判断值无效 / invalid claim"、`missing=['invalid_claim']`；赔率 → `not_computed` 原因 `invalid_probability`（zh/en 文案已加，先于一致性检查，NaN 不再绕过 `inputs_inconsistent`）。情景 `p` 原本已校验有限且在 [0,1]。
- 次要：可达组合测试改为对每个公开组合构造真实信封，断言 `toCard` 的 percent/band 有无、lifecycle、calibration、outcome 与 `REACHABLE_COMBINATIONS` 一致（不再重算公式）。
- 红测：先改测试，`npm test -- src/lib/judgments/display.test.ts` 3 failed / 23 passed（K-02 溢出、K-03 卡片、K-03 赔率）；实现后 display+messages+i18n 31 passed，typecheck、lint 干净。

## Task 4 复审第 1 轮修复（迁移原地改，未锁）
- 红测：改测试后 `db.test.ts` 5 failed / 29 passed（calibration_id 唯一、supabase 路由计数、latestCards 排空、toJudgmentError detail、内存原子性）；集成两文件同跑 17 failed / 53 passed（`claim_due_judgments` 改为 jsonb 数组后的辅助、新增 E-03 / E-01 用例）。
- E-06：去掉 `pgJudgmentsDb.run` 的 40P01 重试。`F4_SCHEMA_LOCK=20261110`（db-contract.ts 导出）：`replayMigration` 在事务开头取 `pg_advisory_xact_lock`，`run()` 在 `begin` 后取 `pg_advisory_xact_lock_shared`。两文件同跑 5 次：0 死锁、0 失败。
- E-01：`freeze_calibration_cohort` 的 `frozen_at = date_trunc('milliseconds', statement_timestamp())`，成员按截断值过滤。后果：与冻结同一毫秒登记的判断可能落在 `frozen_at` 之后——依赖"登记后立即冻结"的测试在冻结前 `pause(5)`（C-04、并发冻结、minor-7、契约用例）。
- E-03：`claim_due_judgments` 返回单个 jsonb 数组（`drop function` 后重建，签名不变；授权块重授）；pg 实现 / Task 3 测试辅助改为 `jsonb_populate_recordset`。
- E-02：`supabaseJudgmentsDb.latestCards` 用 `.range()` 分页直至空页（`NarrowClient.rpc` 返回可 `range` 的 Query）。
- E-04：内存实现的 `quarantineSettlement / applyQuarantineOverride / rejectQuarantinedSettlement` 经 `atomic()`：快照内存表，失败时还原并撤销已写的 `dq_quarantine` 更新；审计插入放在最后。故障注入用例在 `db.test.ts`（pg 无法注入）。
- E-05：内存 `insertCalibration` 对 `calibration_id` 重复抛 `duplicate_key`。E-07：`toJudgmentError` 的 `detail = {sqlstate, details, hint}`。
- 契约新增：latest 视图 calibration_valid 以 now 判（cutoff < valid_until ≤ now → false）；apply / reject 对错误 quarantine_id / table_name 均 stale；`calibration_id` 唯一；过期租约用例改为一次领取一次等待。
