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
| T16 resumable calibration / cohort store / cron | 本提交（`feat(judgments): resumable calibration job and weekly cron`） | 待复审 | Codex gpt-6-astra 实施 | 0 | 首次红测 4 suites missing imports；追加回归 6 failed / 25 passed → 39/39；影响面 441 passed / 82 DB skipped；typecheck、lint、critical inventory PASS；PostgreSQL harness 被 sandbox EPERM 阻止，待指挥 db-one |
| T12 r3 / T14 r1 review fixes | 待指挥提交（sandbox 禁止 git index.lock） | 待复审 | Codex gpt-6-astra 实施 | T12: 3 / T14: 1 | 红测 15 + 6 失败；影响面 216 passed / 76 DB skipped；PostgreSQL sandbox EPERM，待指挥 db-one |
| T18 public reads / admin routes | 待指挥提交（audit log staging 被 sandbox/approval policy 阻止） | 待复审 | Codex gpt-6-astra 实施 | 0 | 红测 11 suites missing imports；历史 cutoff 回归 1 failed / 54 passed；边界回归 4 failed / 11 passed；Task 18 61 passed；影响面 488 passed / 83 DB skipped；typecheck、lint PASS；db-one sandbox EPERM |

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

## Task 9 review fixes (Codex M-01..M-05)
- M-01：`formula-hash.ts` 对闭包内任一文件的非字面量 `import(expr)` / `require(expr)` 抛 `nonliteral_import:<file>`（TS AST 扫描）。M-02：`.d.ts` 排在解析顺序最后，不遮蔽 `.js/.mjs/.ts/.tsx`；`.js` 说明符也可解析到 `.tsx`；可执行文件的同名 `.d.ts` 一并入闭包。
- M-03：`validateMethodology` 以规范化绝对路径比较，`licenses.json` 出现在闭包或 deps → `licenses_in_closure`（deps 另保留 `licenses_in_deps`）。M-04：结果行将为 publishable 时即核对许可；已发布方法的许可不再全部 confirmed → 计划置 `publishable=false`，原因 `license_withdrawn`，不静默保留。
- M-05：`invalid_horizon`（单位须为四种之一，n 为有限整数且 ≥1；`calendar_months` 允许 0，因 `defaultResolveTarget` 以 n=0 表示 as_of 当月）。

## Task 10 review fixes (Codex R-01..R-05)
- 契约偏差（指挥官决定）：`types.ts` 的 `WorkItem` 新增必填 `observedAt`（DB 服务器时间，由 `produce()` 每项从 `db.serverTime()` 设置并覆盖调用方的值）；方法 `gather` 必须把 `item.observedAt` 作为第 4 参数传给 `buildOrAbstain` / `buildInput`（Task 13、19 的 gather 同）。`produce` 的工作项类型为 `ProduceWork = Omit<WorkItem,'observedAt'>`。`target.test.ts` 的 WorkItem 字面量补了 `observedAt`（仅测试）。
- R-01：`registerJudgment` 在登记时用方法的 `resolveTarget` 重算目标，与提交的目标深度相等，否则 `invalid_condition`；重算弃权 → 以 `target_unresolvable` 弃权登记（保留输入）。`RegisterInput.binding?` 透传。
- R-02：`bindingInputs` 只有 `buildOrAbstain` 的弃权结果得到 `inputs=[]`，其余错误（含 serverTime 失败）冒泡为该项失败。
- R-03：登记前对 outcome / condition / row 做 `jsonClean`，`margin_pp:undefined` 等同省略，比较永不抛。
- R-04：dry-run 不计 inserted / duplicates，项状态 `planned_insert` / `planned_abstain`，`ProduceResult.planned`；`abstained_summary` 只计已落库的弃权。
- R-05：`IdempotencyConflict`（带 `quarantined` 标志）；仅真正写了隔离行才计 `quarantined`，上游 gather 抛出的 `idempotency_conflict` 计 failed。`RegisterResult.quarantined` 恒为 false（冲突走抛出）。
- 备注：`db.test.ts`「calibrationCohortInternal paging…」偶发失败（Task 4 内存 db，与本任务无关，重跑通过）。
- 测试修复：契约 R03 用例的两个校准行显式给严格递增的 `computed_at`（原为同毫秒时 `latestCalibration` 按随机 `calibration_id` 打破平局，约 1/6 概率取到旧行）；其余用例不会对同一 scope 成功插入多行。
- Task 13：fixtures/judgments/replay/synthetic-fact-metric.json 已生成（judgment_id 69ae3937-54c2-8bc6-becb-2dc9850e0873），待核对：fixtures/judgments/replay/synthetic-fact-metric.json（需实施者之外的人，规格 §16）。

## Task 11 resolvers (price_return / fact_metric / macro_regime_replay) 与复审修复
- 偏差：计划的合成 K 线夹具放在 `fixtures/judgments/kline/` 会被 Task 7 的 `price-capabilities.test.ts`（遍历该目录的每个 json 作复权夹具）误读；改放 `fixtures/judgments/kline-synthetic/`，`loadKlineFixture` 与证据路径同步，Task 7 测试不改。
- 其余计划代码原样落地（`inputs.ts` 的 `derivationRowsFor / factRowOfDerivation` 可直接引用；`readKlineRange` 的分页重叠不影响夹具型测试；价格测试用注入的 `verifiedCapability`）。
- S-01：`price_return.fromOverride` 不再信任存储的 `result`：`digest(evidence)` 与 override / 隔离事件的 `evidence_hash` 三者一致；证据的 ticker / market / source / adjustment / base_date 与条件一致；能力表 verified（含基准）；登记基准 bar 的快照摘要一致；bars 日期唯一升序且 `bars_sha256` 匹配；基准 bar 存在且之前 ≥5 根；末根即终点 bar（session_index 为 base+n，date 为首根 ≥ target.date）；基准 bars 与主 bars 同日期对齐且摘要匹配；两个市场终点收盘时刻 ≤ `override.cutoff`；由冻结 bars 重算 r / r_b / value / label，与存储结果不等 → `override_mismatch`，结算值取重算值。
- S-02：`fact_metric.fromOverride` 要求每个算子（含 yoy 两侧）`derivation.as_of === factsAsOfDate(override.cutoff)`，且每行 `endOfUtcDay(available_date) ≤ override.cutoff`。
- S-03：`registeredBase` 要求唯一的、与条件 ticker / market / date / source / adjustment 全部一致的登记 price_bar；缺失或冲突 → `Unavailable(base_input_missing)`，不回退。
- S-04：分页后基准前仍不足 5 根：基准日在 `now` 前 30 天内 → `Pending(insufficient_history)`，否则 `Unavailable(insufficient_history)`（30 天是本任务选定的"近期"阈值）。原"分页"用例改用含 2025-12 前置 bar 的扩展夹具。
- S-05：任何注入的 kline 实现返回重复或非升序日期 → `Unavailable(invalid_data)`（主序列与基准序列）。
- S-06：退市判定改为冻结 ticker：基准日该 ticker 是发行人主证券，且终点日主证券是别的票或无 → `delisted`；冻结 ticker 本来就不是主证券（双重上市）不据此判退市。仅用现有 `issuerPrimarySecurity(issuer, on)`，未改 `inputs-db.ts` / `types.ts`；限制：看不到非主证券持仓窗口。
- S-07：`schemas.ts` 的三个 `validate*Params` 内含 `isIsoDate`（year ≥ 1000）检查：`base_date`、`period_start/end`、`reference_period`（`0000-xx` 被拒）。
- 次要：`prior_zero` 仅当所有候选上年值为零；零上年与非零上年并存时，零值候选不进入 `ambiguous_fact` 候选列表。
- 红测：先写测试，`npm test -- src/lib/judgments/resolvers` 9 failed / 39 passed；实现后 48 passed。typecheck 的 resolvers 范围内无错误，lint 干净。
- Task 13 修订（Codex P-01/P-02）：回放先出冻结判定再做 reconcile（时钟与 reconcile 错误一律记为 unavailable，不改结论/退出码）；合成夹具固定内存时钟，--check 改为字节比较；夹具 judgment_id 不变，仅 registered_at/created_at 固定为 2026-11-06T00:00:00.000Z。synthetic_fact_metric@v1 注明仅用于回放。

## Task 11 复审第 2 轮（Codex S2-01..S2-04）
- S2-01：价格向后翻页返回 `{failure:'empty'}` 视为零根新增前置 bar，走 insufficient_history 的 30 天 Pending / Unavailable 规则（向前翻页的 `empty` 同样当作无新 bar）。
- S2-02：无终点 bar 时的退市判定改为：冻结 ticker 在基准日是主证券，且在扫描窗口末端 `to`（读取实际用的日期上界，含向前翻页后的值；无交易日历，O4）主证券已换或消失 → `delisted`，否则 Pending。不再用 base + n 个日历日。
- S2-03：`registeredBase` 还要求快照的 ticker / market / date / source / adjustment 与 ref 及条件一致且 close 有限 > 0；否则正常路径 `base_input_missing`，override 路径 `override_mismatch`。
- S2-04：`operandAvailable(op, cutoff)`（as_of = factsAsOfDate(cutoff)，每行 endOfUtcDay(available_date) ≤ cutoff）由 override 路径与正常路径共用；正常路径的已结算算子与 ambiguous 候选（含 counterpart）违反 → `Unavailable(data_after_cutoff)`。
- 红测：`npm test -- src/lib/judgments/resolvers` 4 failed / 48 passed；实现后 52 passed，typecheck（resolvers 范围）与 lint 干净。

## Task 12 复审（Opus + Codex，T-01..T-08）
- T-01：新增 RPC `claim_judgment(uuid,int)`（service 专用，锁队列行；开放且无存活租约才发租约，否则 leased / closed）与 `JudgmentsDb.claimOne`（supabase / memory / pg 三实现、rpc-inventory、权限测试、契约竞态测试）。`settleNow` 先 claimOne，决定（append / defer / quarantine）都带该令牌写入，结算行 actor 仍为 `admin:<uuid>`；租约丢失 → `leased`；`settlement_sequence` 在队列已关闭时 → `duplicate`。新增 outcome `quarantined`（`quarantine_pending` 保留在联合类型里）。
- T-02：每行完成即计数，行内异常 → `failed`（`settle_row_failed`，租约归还）；`finishBatch` 只在所有 worker 结束后调用。
- T-03：写入前检查 signal 与租约剩余 ≥ 30 s，否则原样归还、计 `deferred` + 信息码 `deadline_hit`；resolver 与补偿扫描的取数 / produce 与 AbortSignal 竞速（新文件 `abort.ts`，有界等待）。
- T-04：`setJobState` 返回 `{ok, updated_at}`（迁移里 `set_job_state` 改为返回 jsonb，先 drop 再 create）；补偿扫描持有自己写入的版本，且拒绝不严格递增的 marker（`marker_regression`，非信息码）。
- T-05：`PRICE_MAX_FETCH_MS` = 4 × 15 s = 60 s（基准窗口、向后页、向前页、基准序列）；结算准入改为严格 `waves × maxFetchMs < 剩余 − 30 s`，并按可容纳的波数缩小领取量（60 s 的默认值下一批 16 行，而不是 20——否则永远不会领取）。
- T-06：新事件的 `quarantined_at` 在 `quarantine_settlement` 内由数据库时钟盖章（SQL `clock_timestamp()`，内存 `now()`），重复隔离保留首次。
- T-07（指挥决策）：同一快照连续 3 次补偿运行 produce 失败 → 记入作业状态 `skipped[]`、marker 越过、扫描继续，并报告非信息码 `compensation_skipped`（`failing` 计数器同在作业状态）。
- T-08：补 discarded-override 与 cutoff_vintage 迟到作废测试。
- 红测：compensate 6 failed / 6 passed；settle + resolvers/index 10 failed / 39 passed；实现后全部通过。
- 备注：`freeze: only registrations at or before frozen_at …` 在本地偶发失败（与本次改动无关的时序用例，重跑通过）。

## 暂停记录（2026-11-06，owner 指示：预算紧，优先数据底座 PR 与宏观工作台）

分支 `claude/judgment-framework-50f9e1`，暂停时 HEAD 见 `git log`。暂停时状态：typecheck、lint、`src/lib/judgments` + `src/lib/dq` + admin dq / cron 单测全绿；db-one 跑 `judgments.integration`、`judgments-db.integration`、`settle.integration` 75/75 通过；关键套件清单一致。迁移 `20261109150000_judgments.sql` **未锁**（Task 22 锁）。

- **已完成（实施 + Opus 复审 + codex review + Codex 对抗挑战，修复闭环）**：T1、T2、T3、T4、T5、T6、T7、T8、T9、T10、T11、T13、T15、T17。
- **已实施、复审未闭环**：T12（两轮挑战修复已提交；第二轮修复 `473ea9a9` 未再经 Codex 复核；T2-02 作为文档化风险接受）；T14（`58b4d8a4`，实施者中断前未出报告，指挥已验证门禁；**未做** Opus 复审与 Codex 审计）。
- **未开始**：T16 校准任务与 cron、T18 读接口与 admin 路由、T19 `macro_regime@v1`、T20 私有适配器与 `/analyst`、T21 UI（按画布）、T22 运行手册 / 规格 §19 / 锁迁移 / 全量门禁。
- **恢复时**：先对 T12 第二轮与 T14 做 Opus 复审 + Codex 挑战；再按计划执行顺序 16 → 18 → 19 → 20 → 21 → 22。计划 `docs/superpowers/plans/2026-11-06-judgment-framework.md`（Codex 计划审计第四轮 ready）；实施期对计划的偏差均记在本日志各任务节（含 `WorkItem.observedAt` 契约变更、`claim_judgment` RPC、`setJobState` 返回 `{ok, updated_at}`、`claim_due_judgments` 返回 jsonb 数组、隔离复核期 incident 子对象、补偿 3 次失败跳过规则）。
- **复权能力（东方财富）**：verified 仅 A qfq、HK qfq、US hfq；DataGateway 本机未配置，全部 unverified。


## Task 16 — 校准作业、存储与周 cron（Codex gpt-6-astra）

- 已实施：`calibrate.ts` 的冻结代际、不可变 attempt 分页、manifest CAS、续跑 / stale 重算、round outcomes、公有 preview；`cohort-store.ts` 的 memory / Supabase 实现；生产装配、cron GET/POST、默认 preview CLI、周一 04:00 UTC cron；7 个 PostgreSQL 集成用例已登记在现有 F4 `criticalSuites.push` 内。claimDue 均在 `withClaimLock` 内。
- 与计划 / 旧契约的适配：所有 `setJobState` 判断读取 `.ok`；测试 fake / failed-clear proxy 返回 `{ok, updated_at}`。每一步仍重读已提交 state / updated_at，不把返回对象当 boolean。
- 生产客户端复用 Task 14 `deps.ts::adminJudgmentsDb(admin)`，cron / CLI 复用 `resolveCodeVersion`；auth、no-store headers、错误消息隐藏沿用 committed settle route。
- 直接消费 committed `entryOf / optionsOf / evaluateCohort`（后者内部调用 `selectIndependent`），完整保留 `n_invalid_endpoint`、`n_unusable_value` 与 unavailable scenarios 等 metrics；不重写数学 / display / produce 契约。
- SQL 未修改：本工作树实际 committed 迁移为 `20261116090000_judgments.sql`，不是任务提示的 `20261115090000` 或旧计划的 `20261109150000`。沿用 freeze 的毫秒精度、`cohort:<generation>` claim marker 与既有 freeze / members / clear RPC。
- 共享文件适配：criticalSuites 在现有 F4 `push` 追加，不改成计划旧 `.concat`；vercel.json 仅末尾追加 `0 4 * * 1`。
- 超出计划示例的修正（均先红后绿）：manifest 无效 JSON、job 不匹配、重复 / 非升序 / 超 cursor 条目 → `cohort_object_invalid` 并清空代际；同时校验 partial 路径属于当前 unit / generation / start cursor、scope、非负 count。存储 transport error 仍保留代际以便重试。
- 超出计划示例的修正（先红后绿）：planRound 等 run-level 异常先记录非信息错误再 finally finishBatch / freshness，避免未完成运行被记成 success；`windowOf` 仅在目标年非闰年时把 2 月 29 日夹到 28 日。
- 保留 Task 16 明列的规格偏差：最终对象内容寻址 `cohorts/<sha256>.json`；query_bounds 入 cohort（跨代际比 entries）；state 带 done / manifest count；stale 同次最多重算一次；目的专用 fake DB；store 不提供 listing / 自动孤儿回收；freshness 保持计划的 event cadence；真实结算走 claim lock + cron lease，撤回走 admin；MVCC 物化冻结，CAS 前崩溃的孤儿代际不读；round completed / failed / in_progress 防饥饿；already_frozen → generation_reused，绝不清别人代际。

验证：
- 首次 `npm test -- src/lib/judgments/cohort-store.test.ts src/lib/judgments/calibrate.test.ts src/lib/judgments/calibrate.integration.test.ts src/app/api/cron/judgments-calibrate/route.test.ts`：4 suites failed（missing modules，0 test bodies）。实现后 33 passed / 7 DB skipped。
- 新增边界回归 `npm test -- src/lib/judgments/calibrate.test.ts`：6 failed / 25 passed；修正后 calibrate + store + cron 为 39 passed。
- `npm test -- src/lib/judgments src/lib/dq/batches.test.ts src/app/api/cron/judgments-calibrate/route.test.ts src/app/api/cron/judgments-settle/route.test.ts`：441 passed / 82 DB skipped，38 passed suites / 4 skipped。
- `npm run typecheck && npm run lint`：PASS（lint --max-warnings=0）。`verifyCriticalSuiteInventory()`：PASS，F4 4 个 critical suites。cron schedule 检查：PASS。
- CLI 非法参数 smoke：输出 usage（预期 exit 2）；未访问生产数据库。
- `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/judgments/calibrate.integration.test.ts` 与 `LC_ALL=C npm run test:db`：sandbox 在 tsx IPC socket listen 处 EPERM；改 `node --import tsx` 后仍在 127.0.0.1 listen EPERM。未启动 PostgreSQL / 未运行 SQL 测试；指挥需运行 db-one 的 7 个新用例及全量 test:db。

关注：数据库验证尚未完成。按计划，未引用的 partial 对象 / CAS 前崩溃的 frozen generations 由 Task 22 运行手册清理；本任务不增加存储 listing 或孤儿回收作业。


## T12 r3 / T14 r1 — 已审问题修复

- T12：批次建立后重查取消；produce 返回 fetched=0 + deadline_hit 视为 STOP，保留 failing.attempts、skipped 与 marker。produce 的 serverTime 与只读 evaluate（gather / binding buildOrAbstain / resolveTarget）竞争组合 signal；晚返回不会进入登记。register 的普通冲突和 23505 重读冲突共用写前取消检查。
- T12：runSettle 开头为 REGISTRY 每个 method id 的 judgments.produce.<id> 修复 stale batches。所有领取后初始化位于租约清理边界，未处理行逐一计 failed + settle_setup_failed；基础设施错误不增加 attempts。settleNow 使用数据库时间，数据库时钟不可得时仅释放租约，不使用空时间或本地时钟替代。
- T14：新增 service-only resolve_closed_judgment_quarantine RPC，锁 queue → item，校验 queue closed、item open 与 payload evidence_hash/cutoff，翻转与审计同事务；同步 types、memory / pg / Supabase、RPC inventory 与权限覆盖。内存 audit 失败回滚；共享契约覆盖 stale、applied、item_not_open 和审计只写一次。
- T14：reject batch 统一 finally 完成一次；stale / item_not_open 为 fetched=0、duplicates=0 的信息结果。choose_fact 缺 payload.evidence_hash → invalid_resolution；非 judgment_settlements 项原本已绕过结算，保留普通 accept/reject 和路由审计，新增 accept 携 resolution → resolution_not_applicable。cron 传 request.signal，沿用 core 的组合 deadline，并导入 DEADLINE_MS。
- 迁移改名记录：计划 20261109150000_judgments.sql → 20261115090000_judgments.sql → 当前已提交的 20261116090000_judgments.sql。本轮只原地修改最后一个未锁迁移，未新建旧名文件、未改锁文件。
- 契约适配：沿用 ProduceWork（observedAt 由 produce 的 db.serverTime 填充）、setJobState 的 {ok, updated_at}、claimDue 的已归一数组、claimOne 手动租约与 settled/quarantined 等现有返回值；保留 last_detail.incident。新信息码仅加 JUDGMENT_INFO_CODES，INFO_CODES 不变。共享文件仅改现有 F4 围栏。未改 Task 16 或并行 Task 18 文件。
- 实现取舍：produce 将整个只读 evaluate 竞争 signal，涵盖 gather、binding builder 与 resolveTarget，登记写操作不竞争取消；已发出的只读请求可能晚完成，但其结果不再触发写入。结算数据库写等待仍沿用已接受的 T2-02 限制；数据库不可用时释放是尽力执行，租约到期仍是兜底。
- TDD：T12/cron 首轮 15 failed / 90 passed → 105 passed；T14 首轮 6 failed / 53 passed → 111 affected passed（含 batch 与 admin route）。汇总命令：`npm test -- src/lib/judgments/produce.test.ts src/lib/judgments/compensate.test.ts src/lib/judgments/register.test.ts src/lib/judgments/settle.test.ts src/lib/judgments/db.test.ts src/lib/judgments/judgments-db.integration.test.ts src/lib/judgments/judgments.integration.test.ts src/lib/judgments/settle.integration.test.ts src/lib/dq/judgments-resolver.test.ts src/lib/dq/batches.test.ts 'src/app/api/admin/dq/quarantine/[id]/route.test.ts' src/app/api/cron/judgments-settle/route.test.ts` → 216 passed / 76 DB skipped。
- `verifyCriticalSuiteInventory()`：PASS。新增 DB 契约位于已有 judgments-db.integration suite，领取在 exclusiveClaims → withClaimLock / F4_CLAIM_LOCK 内；权限测试位于已有 judgments.integration suite；两者均在现有 F4 criticalSuites.push 中。
- PostgreSQL：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/judgments/judgments-db.integration.test.ts` → IPC listen EPERM；同命令换 `node --import tsx` → 127.0.0.1 listen EPERM。SQL/权限/真实事务未执行，指挥需用 db-one 运行 judgments-db.integration、judgments.integration 与 settle.integration。
- 最终 `npm run typecheck && npm run lint`：PASS（lint --max-warnings=0）；`git diff --check`：PASS。期间 typecheck 曾遇并行 Task 18 尚未落地模块与参数类型错误，未改他人文件，其落地后重跑已通过。
- 提交阻塞：已按明确路径执行 `git add`，但主仓库 `.git/worktrees/judgment-framework-50f9e1/index.lock` 不在可写范围，返回 Operation not permitted；随后单独执行指定消息的 `git commit` 返回 no changes added to commit。未绕过 hooks、未提权、未暂存并行工作。无本轮 commit SHA；需指挥暂存本轮 26 个文件后提交。


## Task 18 — public reads / admin routes

- 实现 route-utils、public-reads、admin-actions，六个公共 GET、withdraw/reopen/settle POST 与 admin queue GET；公共读用 anon（包括 db 的 admin 槽），admin 先鉴权、同源与 JSON 校验；成功含 codeVersion，错误/空结果/admin no-store。D2 的统一 serializer 递归删除 display.percent=null，保留数值（含 0）；list/detail/history 均测试键缺席。
- 相对计划的适配：cardsOf 的 now 必填；latest/history 传服务端当前时间，as_known 传 cutoff（不再传 undefined）；detail 用已提交 envelopeById，结算 seq keyset 读至空页。settleNow 已通过 claimOne 领租约，路由不自行领租约；九种 outcome 用穷尽 Record 映射：settled/void/duplicate/deferred/quarantined/quarantine_pending/closed → 200，leased/conflict → 409；抛出的 request_key_conflict 也映射 409。未改结算核心。
- next.config 已有 outputFileTracingIncludes，故在既有对象内加 F4 围栏，不另建重复属性；使用 /api/methodologies/*/* glob（本地 Next picomatch 验证匹配动态路由），保留所有已有 tracing 条目。
- 边界增强（红测先行）：JSON 媒体类型精确匹配 application/json（允许 charset），拒绝数组 body；哈希匹配但 JSON 无效/null/非 entries 对象的 cohort 返回 integrity_failed，避免解析异常泄漏为 500；serializer 避免未使用解构变量以通过零警告 lint。额外 route-utils.test.ts 覆盖共享响应路径。
- 已提交迁移实际为 20261116090000_judgments.sql（不同于计划和任务提示旧名）；本任务不改 SQL、三种 DB 实现、types、INFO_CODES 或并行任务文件。沿用最新校准 metrics 对象，不投影或删减新字段。未新增含 S4_TEST_STATE 的测试，无需修改 criticalSuites。
- TDD：先仅写计划 11 个测试文件 → 11 suites failed（缺少实现，0 tests collected）；加入 cutoff/outcome 回归后 baseline 实现 → 1 failed / 54 passed；额外 JSON/cohort 边界 → 4 failed / 11 passed；实现后 `npm test -- src/lib/judgments/route-utils.test.ts src/lib/judgments/public-reads.test.ts src/app/api/judgments src/app/api/methodologies src/app/api/admin/judgments` → 12 suites / 61 tests passed。
- `npm test -- src/lib/judgments src/app/api/judgments src/app/api/methodologies src/app/api/admin/judgments src/app/api/cron/judgments-calibrate` → 48 suites passed / 4 skipped；488 tests passed / 83 DB skipped。
- `npm run typecheck && npm run lint` → PASS（eslint --max-warnings=0）；`git diff --check` → PASS；导入 next.config 与 picomatch 匹配检查 → PASS。
- `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/judgments/judgments-db.integration.test.ts` → sandbox IPC listen EPERM；未启动 PostgreSQL。需指挥运行 db-one 验证真实 DB/RLS。队列 counts 沿计划为最多 500 条的摘要；非精确总量。

- 提交阻塞：Task 18 的 26 个代码/测试/config 文件已通过 `git add` 暂存；仅暂存本任务日志补丁的 `git apply --cached` 被 index.lock EPERM 阻止，`git add -p` 的交互输入又被自动审批以 approval required / AskForApproval=Never 拒绝。未绕过 hook，未运行不含必需日志的 commit。日志同时含并行 T12/T14 未提交内容，需指挥选择性暂存本任务段落后提交。
