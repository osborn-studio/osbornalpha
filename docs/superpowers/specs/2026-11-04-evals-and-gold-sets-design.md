# 数据底座 · F6 评测与黄金集 设计规格

日期：2026-11-06（第 6 稿：第 5 稿 + Codex 五轮（增量，针对已落地的计划一/二与在途的计划三）R5-1…R5-12 全部接受，见 §0；审计轨迹 `docs/audits/2026-11-04-evals-gold-sets/`：01 一轮（28）、02 二轮（N1–N22）、03 处置表、04 三轮、05 四轮、06 五轮、`index.json`）
状态：第 6 稿，实施中；owner 决策按 §16 默认值执行（§16 D1–D8）
上游：`docs/superpowers/specs/2026-11-04-data-foundation-design.md`（规格一；§5 DQ 设施已落地，§9 黄金集与 §11 独立验证的条款由本规格接管）、`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（规格二；**第 6 稿起依赖基线是 `main` 上已落地的 `src/lib/facts/**` 代码与规格二 §16 偏差记录**，第 8 稿 `15b17e6` 只作历史参照；§4.2–4.3 表、§4.5 函数含 `fact_state_rev`、§4.6 `read_facts`、§4.8 `FactsDb`、§9 读接口、§11.4 黄金断言）、`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（§4.3 快照、§12 测试）。
总纲：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 要求每个板块交付"独立验证证据：官方对账结果、双来源一致性、黄金集评测分数、历史回放一致性、第三方模型审计报告、领域专家抽样记录"。本规格把这六类证据做成**一个**评测框架和**一份**板块发布证据清单。

总纲硬约束对照：

| 总纲 §5 约束 | 本规格如何满足 |
|---|---|
| 只用一手来源；对方站点数据一律不导入 | 黄金值只能人从一手文件抄录，运行器不生成、不修正黄金值（§4.7）；ChaosAI 样本只被 `reference_regression` 读取，该 kind 没有写能力、结果经专用校验类型、报告只含白名单计数，并以哨兵值测试泄漏（§5.4） |
| 每个数字可回放 | 官方对账在数值之外单独判定**来源链可解析**（§5.1.4）；回放分冻结与在线两种，差异必须绑定前后投影哈希、代码对与状态版本才算解释（§5.3） |
| 事实与判断分层 | 事实用数值对账；判断的校准只定义输入契约（§11.3），无合格结算样本就 `incomplete`，不显示百分比 |
| 缺失保持缺失 | 系统没有的值记 `missing`；必需案例缺失直接 `incomplete`；`fail=0` 但覆盖不足不能作为证据（§3.2） |
| 外资研报原文私有 | 工件分公开/受限两类，类别决定输出路径（§4.5）；受限 kind 在许可决策前不启用（§16 D8） |

---

## 0. 第 6 稿修订（Codex 五轮，权威，覆盖下文任何冲突表述）

| # | 决定 | 落在 |
|---|---|---|
| R5-1 | **采用而不复制**规格二的黄金文件 `src/lib/facts/fixtures/gold/plan2.json`：只读"旧格式适配器"`src/lib/evals/gold/legacy-plan2.ts` 把它映射成本规格案例（保留 `version/ready/required`、条目身份、`<pending>` 状态；集哈希 = 文件字节 sha256；`binding='current'`，`asOf = as_of ?? today`，`duration` 缺省 `12M`；不推断 document 绑定、印刷值、哈希或审核人）。新摘要块 `summary.gold = {format:'f6'|'legacy_plan2', ready, pending, provenance_gaps}`；§3.2 规则 1 增：`ready=false`、`pending>0` 或 `provenance_gaps>0`（旧格式缺 `source.sha256/locator/reviewed_by` 即算缺口）→ `incomplete`。今天的 `plan2.json` 因此恒为 `incomplete`；pass / 值错 fail / 缺案例 incomplete 三条路径用**显式合成**集 `src/lib/evals/fixtures/gold/facts/synthetic-us.json`（`provenance_kind='synthetic'`，只在 `ci`）。不改 `sync-us.integration.test.ts`（其告警式黄金门保留）；owner 抄录时把 `plan2.json` 迁移为本规格格式属规格二模块的后续变更 | §1.1、§3.2、§4.1、§4.6、§11.2、§13.3 |
| R5-2 | 本规格新建的一切路径都在 `src/lib/evals/**`、`scripts/evals/**`、`docs/evals/**`：`src/lib/evals/fixtures/{gold,replay,reference,issuers}/…`；`src/lib/facts/fixtures/**` 只读引用。frozen 回放的建库由 F6 自有的确定性辅助 `src/lib/evals/replay/setup.ts` 完成（按外键序 `stocks_universe → issuers → issuer_securities` 装载种子、`reconcileScope`、内存快照库、固定时钟 `now`、只经已导出的 `runFactsSync` 同步），不要求规格二导出私有测试代码 | §4.1、§5.3.1 |
| R5-3 | **不写、不改 `dq_reconciliations`**。逐案失败写 F6 自有表 `dq_eval_case_results`（§6.2），`(eval_run_id, case_id)` 唯一，比较两边可空、以文本保存十进制串；`/admin/dq` 的"对账失败"不承载评测失败，评测失败只在评测区块显示 | §6.1–6.3、§12 |
| R5-4 | 迁移 `20261110090000_dq_eval_runs.sql` 的 SQL 与计划三互不依赖；**落地顺序**：计划三先合并（其 `20261107…` 先入锁），F6 后合并并追加锁。若 F6 先合并，计划三须在合并前把**未入锁**的迁移改为晚于 `20261110090000` 的时间戳；不重命名已入锁或已应用的迁移 | §6.2 |
| R5-5 | 来源链解析器不把 `raw_hash` 当对象名：列 `disclosure-raw/{source}/{issuer_id}/` 下对象 → 下载并校验 `sha256(bytes) = 对象名` → 用落地解析器（`parseCompanyFacts` / Tushare 解析）重算候选，找 `rawHash`（`rawHashOf(snapshotSha256, locator)`）等于行 `raw_hash` 的候选 → 校验 `concept/period/unit/filing source_ref` 与无损值（含 Tushare 求和）一致 → 记录 `{object_path, locator}`。任一步不成立 → `provenance_incomplete(reason)` | §5.1.4 |
| R5-6 | `factsByIds` 的可见性取决于调用角色（特权运行可见非 `ok` 行）：适配器显式校验 `status='ok'`、issuer、market、filing 与 `mapping_gen = filings.mapping_gen`，不合格的输入事实 → `provenance_incomplete(input_not_eligible)` | §5.1.4、§5.6 |
| R5-7 | metrics 读取：`readFacts(issuer, market, {concepts: DERIVE_CONCEPTS[market], asOf, history: true})` → `truncated` 拒绝 → `deriveMetrics(rows, {market, asOf, basedOnRev: stateRev})` → 取目标；`target.formula_version ≠ FORMULA_VERSION`（`'facts-derive/1.0'`）→ `read_error(formula_version_mismatch)`；评测器永不调用会写库的 `materialize`。回放投影的 `inputs[].period_end/source_ref` 经 `factsByIds` + filings 补齐，缺联接 → `read_error(projection_join_missing)` | §4.2、§5.3.1、§5.6 |
| R5-8 | 概念集合用落地 `CONCEPT_IDS`（35 个，含 `monetary_funds`；CN `cash` 无映射，不把 `monetary_funds` 当 `cash`）。`cninfo_announcement` 先取**全部**匹配 filing，再按目标期间与 `form_type` 消歧；仍 > 1 → `read_error(filing_ambiguous)`；restatement 挂接到次年定期报告属规格二偏差，报告记录实际所在文件 | §4.2 |
| R5-9 | `x-code-version` 未上线：`--http` 冒烟记 `responder_code_version:'unavailable'`，永不作为发布证据；本规格不改规格二路由 | §5.3.2、§11.2 |
| R5-10 | F6 比较原语命名 `compareWithinTolerance`（不与计划三 `decimal.ts::compareDecimal` 同名），删除"计划三复用本函数"的反向依赖；双源经注入的只读 `PairSource` 适配器读计划三的对与结果：非比较结果（`left_missing`、`incomplete_gold` 等）映射为 `missing`/`read_error`，永不成为 pass；`independence/upstream` 由 F6 的 `pairs` 登记显式给出；计划三 `relDiff` 四舍五入与 F6 截断的差异以一致性向量固定 | §5.2、§5.5、§11.2 |
| R5-11 | 管理集成：查询与白名单逻辑在 `src/lib/evals/admin.ts`；新路由文件 `src/app/api/admin/evals/route.ts`、`[run_id]/route.ts`（新文件，不与他人冲突）。UI 区块等 Claude Design 画布（owner 规则）与计划三 Task 19 的 `/admin/dq` 重构落地后再接入，接入时只在共享文件里加 `// F6` 标记块；本期不改 `AdminDqClient.tsx` | §12、§15 |
| R5-12 | 本期"可构建子集"与"生产证据就绪"分开（§15.1）。双源（前置：计划三合并）、对照（前置：宏观迁移）、`extraction_gold`（前置：F3 + D8）、`judgment_calibration`（前置：F4）、CN 黄金（前置：真实 Tushare 夹具与 CN 回放）只交付纯逻辑 + 注入接口 + 单测；对应的真实库集成测试**不创建**（critical 套件不允许 skip），在 PR 中列出前置条件。跳过的测试与告警式黄金门都不构成发布证据 | §1.1、§13、§15 |

§17 由落地代码回答：1（`filingsOfIssuer` 只有 `from/to/limit/unlinkedOnly`，内存过滤）、2（`history=true` 返回该期在 `asOf`、激活代与调用者可见性下的披露历史；仍可能 `truncated`）、8（交付语料无 IFRS 申报人）；5 部分回答（缓存头已实现、`x-code-version` 无）。

---

## 1. 目标与非目标

### 1.1 目标

1. **一个黄金集文件契约**（§4）：印刷值与规范值分列、单位进 `target`、一手文件标识与哈希、录入者与审核者、版本（含集级字段）与锁、对基线修订的差异校验。
2. **一个运行器、六种评测**（§5）：`official_reconciliation`、`dual_source`、`replay_consistency`（frozen / live）、`reference_regression`、`extraction_gold`（F3 接口）、`judgment_calibration`（F4 接口），各自的案例结果经**同一张归约表**（§3.3）得到三维结论。
3. **三维结论与门槛**（§3.2）：正确性、覆盖率、执行完整性；`gate ∈ {pass, fail, incomplete}`；`incomplete` 永远不能作为证据。
4. **板块发布证据清单**（§10）：校验器按证据种类分别认证（生产运行对 `dq_eval_runs`，CI 冻结回放对提交副本与 CI 运行），重算 gate，拒绝合成/脏树/非发布提交的运行；不可豁免项与可豁免项分列。
5. **人工记录可校验**（§8、§9）。
6. **管理员只读区块**（§12）。

成功标准（F6 退出条件）：
- `npm run test:db` 含 `src/lib/evals/evals-store.integration.test.ts` 与 `src/lib/evals/evals-facts.integration.test.ts`（均 critical）；后者在 F6 确定性建库（§5.3.1）同步规格二美股夹具后：合成集 `src/lib/evals/fixtures/gold/facts/synthetic-us.json` → `gate='pass'`；经数据库读路径外包一层"篡改一个值"的装饰器 → `correctness.fail=1`、`gate='fail'`、退出码 1；装饰器去掉一个必需案例的返回 → `coverage.missing_required=1`、`gate='incomplete'`、退出码 3；规格二的 `plan2.json`（经旧格式适配器）→ `gate='incomplete'`（`summary.gold.ready=false`）。四条路径都走同一个 `runGoldSet()` 入口。
- 规格二 §11.4 的黄金断言**保留**在 `sync-us.integration.test.ts`（告警式），F6 只读地对同一文件给出 `incomplete/pass/fail` 结论（§0 R5-1）。
- 特权 `report` 运行对生产库跑完后（owner 事项，需真实黄金值）：`docs/evals/<date>/facts-official_reconciliation-<run8>.{json,md}` 存在且 `report_sha256` 与 `dq_eval_runs` 行一致；失败案例在 `dq_eval_case_results` 并经 `GET /api/admin/evals/[run_id]` 可见。
- `replay live` 对每个案例给出 `identical | data_drift | explained_diff | unexplained_diff`；未入账本的差异 → 退出码 1。
- `reference_regression`（宏观迁移落地后）运行前后六张表内容哈希不变；哨兵值不出现在 `/api/admin/evals` 响应、服务端日志与公开报告 `.md` 中；本期只交付纯逻辑与单测（§15.1）。
- `validate.ts --manifest` 对一份把 `mode='ci'` 运行用作 `official_reconciliation` 的清单退出码 1；对 `replay_frozen` 引用 `ci` 运行且副本哈希相符的清单接受该项。

### 1.2 本规格之外

- 黄金值录入（规格二 6 家、计划三 30 家、F3 30 篇）。
- 计划三的对账生产者（采集路径隔离）；本规格提供比较原语（§5.2）。
- F4 结算引擎；LLM 备忘录评测（`research_eval_cases/runs`）；面向公众页面；性能基准；cron（F6-后续，§15）。

---

## 2. 现状（2026-11-04 仓库勘察事实）

| 领域 | 现状 | 本规格如何使用 |
|---|---|---|
| 质量设施 | `ingest_batches`、`dq_quarantine`、`dq_reconciliations`、`dq_freshness` 已落地（`20261105090000_dq_foundation.sql`），仅 service_role；`dq_reconciliations(…, left_value numeric, right_value numeric, abs_diff, rel_diff, tolerance, passed, batch_id on delete set null)`，列注释定义相对容差 `|l−r| <= tolerance * max(|l|,|r|,1)`；无写入者；`AdminDqClient` 把 `tolerance` 当百分比渲染 | 只读参照其容差语义；F6 不写该表（§0 R5-3）；只允许相对容差（§4.3） |
| `/admin/dq` | `page.tsx` + `AdminDqClient.tsx`；`GET /api/admin/dq` 经 `requireAdminUser()`、`getAdminSupabase()`、`loadDqDashboard()`；"对账失败（累计）"瓦片与最近 50 条列表；i18n `admin.dq.*` + `src/i18n/messages-parity.test.ts` | 增加"评测运行"区块与 `GET /api/admin/evals`（§12） |
| `TableClient` | `insert` 单行、`update`（返回命中数）、`select`（≤ 1000）、`upsert`、`count`、`selectAll`；无事务、无 delete；`supabaseTableClient` 经 PostgREST JSON，`pgTableClient`（仅测试）经 node-postgres | 存储按 §6.3 的顺序与幂等键；数值经文本列读取（§5.2） |
| CI 门禁 | `criticalSuites` 与含 `S4_TEST_STATE` 的文件集合必须完全相等；`research-db.ts` 用隔离 PostgreSQL 17；`ci.yml` 用 `actions/checkout@v4`（默认 `fetch-depth: 1`），只上传两个固定 `reports/*.json` | 两个评测集成测试进列表；`ci.yml` 增 `fetch-depth: 0`、`--gold-diff` 步骤、`reports/evals/**` 工件（§7.3） |
| 迁移锁 | `migrations.lock.json` + `migrationInventory()`：锁内 sha 不变、新文件时间戳晚于锁内最大值 | 黄金集锁同模式（§4.4）；本规格迁移时间戳在实施日取当时锁内最大值之后 |
| 规格二第 8 稿（`15b17e6`） | `readFacts(issuer, market, {concepts, asOf, from?, to?, history?, limit?, includeNonOk?}) → {stateRev, rows, truncated}`（`read_facts` 只返回 `mapping_gen = filings.mapping_gen` 的行；`status='ok'`，`includeNonOk` 对匿名无效；`state_rev` 经 `fact_state_rev()` 对 anon 可用）；`filingsOfIssuer`；`factsByIds`（不限代、只限 `ok`）；`metricsOfIssuer(issuer, market, formulaVersion)`（缓存）；读路由有 `asOf` 时实时 `derive`；`market ∈ {US, CN}`；`filings.source_ref`（EDGAR accession / Tushare 合成键）、`filings.document_ref`（巨潮 announcementId）；`fact_sync_runs(run_id, batch_id, mapping_gen)` 与 `ingest_batches.code_version` 仅 service_role；`disclosure-raw` 桶路径 `{source}/{issuer_id}/{sha256}.json` | facts 适配器按这些签名实现（§5.6）；文件标识映射（§4.2）；来源链解析在特权运行做（§5.1.4） |
| 规格二单位 | `USD`、`CNY`、`shares`、`<货币>/share`、`pure`；单位是事实键的一部分 | 黄金 `target.unit`（§4.3） |
| 已有评测代码 | `src/lib/research/evals.ts`：LLM 备忘录 judge，表 `research_eval_cases/runs` | 不复用；本规格表前缀 `dq_` |
| 已有方法声明 | `earnings-quality-vendor/METHOD.md`："Golden facts/answers are independently checked, not generated by the evaluator" | §4.7 硬规则 |
| 对方站点证据 | `EVIDENCE.json` 只有页面 sha256 与抓取时间，无页面字节；`MACRO_STRATEGY_DEEP_DIVE.md` §3.2 表格里可逐格定位的数值：美国 8 条指标 × (最新值/前值) = 16 格，中国 10 条（MLF、10Y 国债、USD/CNY、CPI、PPI、GDP、M2、社融、PMI、出口）× 2 = 20 格；`CN_LPR_1Y / CN_LPR_5Y` 合并行"3.00 / 3.50"无法判定是 1Y/5Y 还是最新/前值，不可用；资产价格只列代码无数值 | 对照样本 = 36 格（§5.4）；其余 `unavailable` |
| 代码版本 | `VERCEL_GIT_COMMIT_SHA`；规格二 `code_version = VERCEL_GIT_COMMIT_SHA ?? git rev-parse HEAD（脏加 -dirty）` | §6.4 |
| 审计记录 | `docs/audits/2026-11-04-data-foundation-2/` 文件 `01…08` + README；Codex 文件首行 `**Verdict: …**` | §9 |
| 仓库审批 | 无 `CODEOWNERS`；分支保护无法从仓库核实 | §16 D2 |
| 目录 | `fixtures/`、`scripts/evals/`、`docs/evals/`、`src/lib/evals/`、`src/lib/facts/` 均不存在 | §15 分两段 |

---

## 3. 术语、结果与门槛

### 3.1 评测种类

| `kind` | 问题 | 右值地位 |
|---|---|---|
| `official_reconciliation` | 我们对**这份**文件的当前解释等于文件上印的数吗 | 真值 |
| `dual_source` | 两个独立来源对同一观测一致吗 | 都不是真值 |
| `replay_consistency` | 同一问题今天的答案和当初一样吗 | 差异必须被解释 |
| `reference_regression` | 我们的数和对方页面差多少、为什么 | **不是**真值 |
| `extraction_gold` | 抽取器字段级 precision/recall | 真值 |
| `judgment_calibration` | 登记过的概率校准如何 | 真值 |

一次运行 = `kind × module × 集版本 × evaluator_code_version × mode`。`module ∈ {facts, metrics, macro, industry, company, foreign_research}`。

### 3.2 三维结论与门槛

```jsonc
"summary": {
  "population": 72,                                   // 集内非撤回案例数（必需 + 可选）
  "required": 72,
  "correctness": {"pass": 68, "fail": 0, "unit_mismatch": 0, "provenance_incomplete": 0, "unexplained_diff": 0},
  "coverage":    {"evaluated": 68, "missing_required": 0, "missing_optional": 4, "not_visible": 0, "skipped": 0},
  "execution":   {"read_error": 0, "truncated": 0, "subset": false},
  "thresholds":  {"max_fail": 0, "min_coverage_optional": "0.95"},
  "gate": "pass",
  "evidence_class": "truth"                            // truth | comparison | adapter_check
}
```

`gate`：
1. `population = 0`、`execution.read_error > 0`、`execution.subset = true`、`coverage.missing_required > 0`、`coverage.not_visible > 0`，或 `summary.gold.ready = false`、`gold.pending > 0`、`gold.provenance_gaps > 0`（§0 R5-1）→ `incomplete`。
2. `correctness.fail + unit_mismatch + provenance_incomplete + unexplained_diff > max_fail` → `fail`。
3. 可选案例存在且 `evaluated_optional / optional < min_coverage_optional` → `incomplete`。
4. 否则 `pass`。

案例缺省 `required: true`；`optional` 只用于集文件头显式声明的案例（例如 IFRS 申报人"若存在"）。`evaluated_optional` = 可选案例中结果归入 correctness 任一计数器（含 `expected_absent`）的数量；`evaluated` 同理计全部案例。各 kind 内部结果对象（如 §5.4 的 `ReferenceResult`、§11.1 的字段指标）只是中间产物，写入 `dq_eval_runs.summary` 与报告的永远是本节形状，经 §3.3 归约。退出码：`pass` 0、`fail` 1、`incomplete` 3、运行前拒绝 2。

### 3.3 案例结果归约表（所有 kind 共用一张）

| kind | 案例结果 | 归入 |
|---|---|---|
| official / dual_source | `pass` | correctness.pass |
| | `fail(reason ∈ {value, ambiguous, unexpected_value})` | correctness.fail |
| | `unit_mismatch` | correctness.unit_mismatch |
| | `provenance_incomplete` | correctness.provenance_incomplete |
| | `expected_absent`（案例期望缺失且系统确无） | correctness.pass |
| | `missing` | coverage.missing_required / missing_optional |
| | `not_visible(reason ∈ {quarantined, superseded_generation})` | coverage.not_visible |
| | `skipped(retracted | subset)` | coverage.skipped |
| | `read_error(reason)` | execution.read_error（`truncated` 另计） |
| replay | `identical` | correctness.pass |
| | `explained_diff` | correctness.pass（`detail.ledger_ids`） |
| | `data_drift`（已入账本） | correctness.pass |
| | `data_drift`（未入账本）、`unexplained_diff` | correctness.unexplained_diff |
| reference | `within` | correctness.pass |
| | `beyond_explained` | correctness.pass |
| | `beyond_unexplained`（无条目或 `unknown`） | correctness.unexplained_diff |
| | `unavailable`（样本无值） | coverage.skipped |
| extraction | 案例 = 字段（跨文档集合）：`pass`（`P_f ≥ 0.95 且 R_f ≥ 0.95`）/ `fail` | correctness.pass / correctness.fail（`detail` 含 TP/FP/FP_citation/FN/P/R） |
| | 字段支持数 0 → `skipped(zero_support)`；文档不可解析 → 该文档所涉字段 `read_error` | coverage.skipped / execution.read_error |
| calibration | 样本 `eligible` / `ineligible` | population / coverage.skipped |

空总体、全撤回、全缺失都落在规则 1 → `incomplete`。

---

## 4. 黄金集文件契约

### 4.1 路径

```
src/lib/evals/fixtures/
  gold/
    lock.json                       # {files:[{path, sha256, version, format:'f6'|'legacy_plan2'}]}；含只读引用的 src/lib/facts/fixtures/gold/plan2.json
    recorders.json                  # {version, recorders:[{id, role, modules:[…], added_at, approved_by}]}
    facts/synthetic-us.json         # 合成（ci 专用）：pass/fail/incomplete 三条路径
    facts/plan3-30.json             # 计划三（后续）
    macro/<set>.json                # 后续
  issuers/plan2-seed.json           # frozen 建库种子（stocks_universe/issuers/issuer_securities）
  replay/<module>.frozen.json       # §5.3.1
  replay/<module>.live.json         # §5.3.2
  replay/explanations.json          # §5.3.3
  reference/chaosai/macro-strategy.json   # 后续（C2）
  reference/chaosai/explanations.json
src/lib/facts/fixtures/gold/plan2.json    # 规格二所有，F6 经旧格式适配器只读采用（§0 R5-1）
```

文件头：

```jsonc
{"schema_version": 1, "set_id": "facts/plan2-us", "version": 3, "module": "facts",
 "artifact_class": "public",                               // public | restricted（§4.5）
 "module_implementers": ["claude-code", "codex"],
 "tolerance": {"rel": "0"},
 "thresholds": {"max_fail": 0, "min_coverage_optional": "0.95"},
 "optional_cases": ["…"],
 "history": [{"version": 2, "changed_at": "…", "changed_by": "<id>", "reason": "…", "fields": ["cases[…].canonical", "thresholds"]}],
 "cases": [ … ]}
```

### 4.2 案例

```jsonc
{"case_id": "AAPL/revenue/2022-10-01..2023-09-30/consolidated/USD",
 "subject": {"market": "US", "cik": "320193"},
 "target": {"concept": "revenue", "period_start": "2022-10-01", "period_end": "2023-09-30", "consolidation": "consolidated",
            "unit": {"kind": "currency", "currency": "USD"}},                 // 期望单位；present 与 missing 都必填
 "expect": "present",                                                         // present | missing
 "printed":   {"text": "383,285", "unit_label": "In millions", "scale": "1000000"},
 "canonical": {"value": "383285000000"},                                      // = parse(printed.text) × scale；单位即 target.unit
 "binding": "document",                                                       // document | current
 "source": {"document_type": "10-K",
            "document_id": {"kind": "edgar_accession", "value": "0000320193-23-000106"},   // kind ∈ edgar_accession | cninfo_announcement | file_sha256 | official_release
            "url": "https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm",
            "sha256": "<文件字节 sha256，必填>",
            "available_date": "2023-11-03",
            "locator": {"page": 28, "table": "CONSOLIDATED STATEMENTS OF OPERATIONS", "row": "Total net sales", "column": "2023"}},
 "provenance_kind": "transcribed",
 "recorded_by": "<id>", "recorded_at": "…", "reviewed_by": "<id>", "reviewed_at": "…",
 "retracted": null, "notes": ""}
```

文件标识到规格二 filing 的映射（`src/lib/evals/adapters/facts.ts`）：

| `document_id.kind` | 匹配 | 说明 |
|---|---|---|
| `edgar_accession` | `filings.source='edgar' and source_ref = value` | 规格二 `source_ref` 即 accession |
| `cninfo_announcement` | `filings.source='tushare' and document_ref = value` | 规格二巨潮挂接写 `document_ref`；未挂接（`citation='pending'`）→ `read_error(filing_not_linked)` |
| `file_sha256` | 受限集（F3）文档 | 不走 facts |
| `official_release` | 宏观：`macro_observations.raw_hash` 所指原文 | `binding='current'` |

metrics 案例的 `target` 为 `{metric, period_start, period_end, basis, input_unit, formula_version}`，`binding='current'` 且 `asOf = source.available_date`，系统值经规格二的实时 `derive`（与读路由 `asOf` 行为一致），不读缓存表。market 映射：`A` → `CN`。

### 4.3 单位与容差

| `unit.kind` | 必填 | 规格二 `unit` |
|---|---|---|
| `currency` | `currency` | `USD`、`CNY` … |
| `shares` | — | `shares` |
| `per_share` | `currency` | `<货币>/share` |
| `ratio` | — | `pure`（`printed.text` "12.5%" → `0.125`） |
| `index` / `count` / `percent_points` | — | 宏观规格 §4.2 |

- `canonical.value` = 解析 `printed.text`（去千分位；`(1,234)` 与 `-1,234` 为负；`%` 对 `ratio` 为 ÷100）× `scale`；验证器重算。`scale ∈ {"1","1000","1000000","1000000000"}`。
- 容差只有 `{"rel": "<十进制字符串>"}`，`0 ≤ rel < 1`，语义同 `dq_reconciliations.tolerance`。
- 系统行单位映射后与 `target.unit` 不同 → `unit_mismatch`；不做币种换算。

### 4.4 版本、锁与差异校验

- 下列任一变化 → `version + 1` 并写 `history.fields`：任何案例的 `target/expect/printed/canonical/binding/source/tolerance/retracted/required`；集级 `tolerance/thresholds/optional_cases/module/artifact_class/module_implementers`；`recorders.json` 本身有独立 `version`。
- `lock.json` 不匹配 → `gold_lock_mismatch`。
- `validate.ts --gold-diff <base>`：`base` 由 `ci.yml` 决定——PR：`git merge-base origin/<base_ref> HEAD`（`fetch-depth: 0`）；push 到 main：`${{ github.event.before }}`（覆盖多提交推送；为全零 sha 时跳过并在 job summary 说明）；`workflow_dispatch`：`git merge-base origin/main HEAD`，若等于 `HEAD`（在 main 上触发）则跳过并说明。校验：案例不消失、`case_id` 不改名、语义或集级变化必有 `version+1`、`recorders.json` 与 `module_implementers` 的变化单列到 job summary。
- **独立批准**：`src/lib/evals/fixtures/gold/**`、`recorders.json`、`src/lib/evals/fixtures/replay/**` 的 PR 需要另一人审核才能合并。仓库目前没有 CODEOWNERS 与分支保护；开启后 `gold_approval='enforced'`，否则 `'process'`。发布清单默认只接受 `enforced`（§10；§16 D2 可豁免但须写入清单）。

### 4.5 公开与受限工件

`artifact_class` 由集文件头声明，并**决定序列化前的输出目的地**：

| 类别 | 集 | 报告 | 数据库 |
|---|---|---|---|
| `public` | 仓库 `src/lib/evals/fixtures/gold/` | `docs/evals/<date>/…`（`report`）或 `reports/evals/`（`ci`） | `dq_eval_runs` + `dq_eval_case_results.detail`（经 `--redact`） |
| `restricted`（F3 抽取集） | 私有桶 `eval-restricted/gold/<set>.json`（`public=false`，仅 service_role；owner 单租户，不对普通用户开放） | 私有桶 `eval-restricted/reports/<run_id>.json`；公开侧只写 `summary` 到 `dq_eval_runs` | 不写 `dq_eval_case_results` |

`run.ts` 在读取集头后先决定目的地，再运行；受限集在 `ci` 模式不运行（CI 无桶）。`--redact` 对 `src/lib/evals/fixtures/**`、`docs/evals/**`、`docs/audits/**` 全跑：拒绝查询串令牌（`token=`、`key=`、`sig=`、`X-Amz-Signature`）、`postgres://`/`postgresql://`、`eyJ` 开头的三段 JWT、`sk_`/`sb_`/`ghp_` 前缀、邮箱、`private://` 之外的桶内路径、任何 `text/note/notes` 字段超过 200 字符。受限 kind（`extraction_gold`）在 F3 许可决策前不启用（§16 D8）。

### 4.6 硬规则

- 运行器任何路径都不生成、不推断、不修正黄金值。
- `recorded_by`、`reviewed_by` ∈ `recorders.json` 且 `∉ module_implementers`；30 家集 `reviewed_by` 必填。
- subject 不含 `issuer_id`；`resolveIssuer(client, {cik} | {ticker: ts_code}, {today})` 失败 → `read_error(subject_unresolved)`。
- `expect='missing'`：无 `printed/canonical`，有 `target.unit` 与 `source`；系统有同键行 → `fail(unexpected_value)`；无 → `expected_absent`。
- `source.sha256` 必填（EDGAR 文件与巨潮 PDF 都可下载）；录入脚本 `scripts/evals/hash-source.ts <url>` 只算哈希不存文件。
- **旧格式例外**（§0 R5-1）：`legacy_plan2` 集不满足本节的录入字段时不报 `gold_invalid`，而是逐条计入 `summary.gold.provenance_gaps`/`pending`，经 §3.2 规则 1 恒为 `incomplete`；它永远不能作为发布证据，直到迁移为 `f6` 格式。

---

## 5. 评测种类

公共：`src/lib/evals/types.ts`；`kinds/<kind>.ts` 的 `run(deps, config)`。`ReadDeps`（读适配器、时钟、版本）与 `PrivilegedDeps extends ReadDeps`（提示读取器、来源链解析器、存储写入器）。`reference_regression` 只接受 `ReadDeps`，且构造时不加载 service-role 密钥。

### 5.1 `official_reconciliation`

#### 5.1.1 评的是什么

评的是**系统对该文件的当前解释**：激活映射代（`mapping_gen = filings.mapping_gen`）下 `status='ok'` 的行。本规格不声称"固定历史抽取"——映射升级或隔离会改变这个解释，这正是要被看见的：

- 文件找到、键找到、行为 `ok` → 比较。
- 文件找到、特权运行用 `includeNonOk` 发现同键行存在但 `quarantined` → `not_visible(quarantined)`；`factsByIds` 可查到旧代行而当前代无 → `not_visible(superseded_generation)`。非特权运行无法区分，记 `missing`。
- 文件未在该 issuer 名下 → `read_error(filing_not_found)`；`truncated` → `read_error(truncated)`。

#### 5.1.2 读取

`binding='document'`：`filingsOfIssuer(issuer, market, {})` 在内存里按 §4.2 映射选 filing；`readFacts(issuer, market, {concepts:[concept], asOf: today, from: period_end, to: period_end, history: true})`；在返回行里选 `filing_id` 相等且 `period_start/period_end/consolidation` 相等的行（**不**按单位过滤）；0 行 → `missing`；1 行 → 单位检查（不同 → `unit_mismatch`）→ 比较；> 1 行且单位各异 → 取与 `target.unit` 相同的一行，若仍 > 1 → `fail(ambiguous)`。
`binding='current'`：`asOf = source.available_date`；metrics 经实时 `derive`；macro 取 `available_at <= asOf` 的最新 `ok` vintage。

#### 5.1.3 数值

`value_text` 与 `canonical.value` 经 §5.2 比较。

#### 5.1.4 来源链可解析（特权运行）

`pass` 还要求来源链**可解析**，否则 `provenance_incomplete`：

| 模块 | 必需字段 | 特权运行解析 |
|---|---|---|
| facts | `fact_id, filing_id, source_ref, available_date, mapping_gen, mapping_version, raw_hash, run_id` | `--verify-artifacts`：按 §0 R5-5 列 `disclosure-raw/{source}/{issuer_id}/` 下对象、校验字节 sha256 = 对象名、用落地解析器重算候选并找 `rawHashOf(sha, locator) = raw_hash` 的候选、校验键与无损值（含求和）与 `value_text` 相等，记录 `{object_path, locator}`；`fact_sync_runs.run_id → batch_id → ingest_batches.code_version` 非空 → `producer_code_version`；`--verify-sources`：按黄金 `source.url` 取官方文件并比对 `source.sha256`（报告记 `source_verified: true|false|skipped`，`false` → `provenance_incomplete`） |
| metrics | `metric, formula_version, basis, input_unit, inputs[].fact_id, based_on_rev` | 每个 `inputs[].fact_id` 经 `factsByIds` 存在且通过 §0 R5-6 的资格校验，并对每个输入事实执行上一行的全部解析（快照下载与定位、生产者版本）；输入事实各自的 `source_ref/raw_hash/producer_code_version` 记入报告 |
| macro | `observation_id, vintage_id, raw_hash, available_at, batch_id` | `macro-raw/<batch_id>/<series_id>.json` 存在；`ingest_batches.code_version` |

非特权运行只检查字段存在，`producer_code_version='unavailable:anon'`；发布清单要求带 `--verify-artifacts --verify-sources` 的特权运行（§10）。官方文件本身不由我们保留（SEC/巨潮公开存档是一手来源），`source.sha256` 让任何人能确认看的是同一份字节。

### 5.2 比较原语 `src/lib/evals/compare.ts`

```ts
export function compareWithinTolerance(left: string, right: string, rel: string): {passed: boolean; absDiff: string; relDiff: string}
```
- 十进制字符串对齐小数位后 `BigInt`，无浮点；`passed ⇔ |l−r| ≤ rel × max(|l|,|r|,1)`（整数运算）；`relDiff` 10 位截断，仅展示。
- 计划三有自己的 `decimal.ts`（不同签名与舍入）；两者不互相调用（§0 R5-10）。
- **数值在生产路径的保真**：`dq_eval_case_results` 的 `left_text/right_text/abs_diff/rel_diff/tolerance` 都是 `text`（十进制串，`check` 正则），不经 `numeric` 往返。测试：(a) `pgTableClient` 往返逐字相等（20 位整数、18 位小数）；(b) 管理 API 只输出这些文本列；(c) runbook 要求首次部署后对生产 `GET /api/admin/evals/[run_id]` 人工核对一条 20 位值。

### 5.3 `replay_consistency`

#### 5.3.1 frozen（CI）

`fixtures/replay/<module>.frozen.json` 案例：

```jsonc
{"case_id": "…", "request": {"issuer": {"market":"US","cik":"320193"}, "concepts": ["revenue"], "asOf": "2024-06-30", "durations": ["12M"]},
 "setup": {"initial_state": "empty_after_migrations",
           "issuer_seed": {"path": "fixtures/issuers/plan2-seed.json", "sha256": "…"},         // issuers / issuer_securities 的种子（规格一 load-sec 夹具）
           "fixture_manifest": [{"path": "fixtures/edgar/CIK0000320193.trimmed.json", "sha256": "…"}],
           "sync_order": ["CIK0000320193.trimmed.json"], "today": "2026-11-20", "mapping_gen": 3, "formula_version": "v1",
           "quarantine_resolutions": [], "config_sha256": "<src/lib/facts/concepts.ts + units.ts + rules.ts 的联合 sha256>",
           "setup_sha256": "<以上全部字段规范 JSON 的 sha256>"},
 "recorded": {"code_version": "<40 hex>", "at": "…"},
 "expected": {"projection_hash": "…", "projection": {…}}}
```
- 执行：F6 的 `src/lib/evals/replay/setup.ts`（§0 R5-2）在 `evals-facts.integration.test.ts` 里按 `setup` 重建（迁移后的库、装载 `issuer_seed`、校验 `src/lib/facts/fixtures/**` 夹具 sha256 后注入 `fetchUs`、固定 `now/today`、按序 `runFactsSync`、应用列出的隔离处置），再以库路径算投影。共享库里其他套件也会写入同一发行人（`filings.source_ref` 全局唯一），所以种子用确定性 CIK 且投影只取种子发行人。示例中 `formula_version` 应为 `facts-derive/1.0`，`mapping_gen` 取当时 `MAPPING_GEN`。`setup` 任一项与实际不符（含 `setup_sha256` 重算不等）→ `read_error(setup_mismatch)`。
- 投影（`src/lib/evals/projections/<module>.ts`）：facts 行 → `{concept, period_start, period_end, duration, consolidation, unit, value_text, available_date, source_ref, disclosure_seq, is_current, is_revision}`，按 `(concept, period_start, period_end, consolidation, unit, available_date, source_ref)` 排序；metrics → `{metric, period_start, period_end, duration, basis, formula_version, value, unit, inputs:[{concept, period_end, source_ref}]}`；macro → `{snapshot:{region, as_of, methodology_version, primary_state, secondary_state, margin, coverage}, scores, contributions(按 series_id)}`。
- 结果：`identical`；否则查账本 → `explained_diff` / `unexplained_diff`。frozen 没有 `data_drift`。
- 录制 `record-replay.ts --mode frozen --case <id>`：**只能新增**案例；已有案例的 `expected` 改变必须 `--supersede` 并引用一条已批准的账本条目，否则拒绝（`replay_rerecord_refused`）。测试：对一个当前 `unexplained_diff` 的案例执行重录 → 拒绝。

#### 5.3.2 live（report）

`fixtures/replay/<module>.live.json` 案例：`{case_id, request, recorded:{code_version, at, state_rev}, expected:{projection_hash, projection}}`。
- 对生产库以 anon 客户端走库路径（`read_facts` RPC，`fact_state_rev` 对 anon 可用），不经 HTTP；记 `evaluator_code_version` 与当前 `state_rev`。
- 分类：相同 → `identical`；不同且特权提示读取器发现 `financial_facts.created_at > recorded.at`（同 issuer/concept）、`dq_quarantine.resolved_at > recorded.at`（同键前缀）或 `filings.mapping_gen` 升高 → `data_drift`（`detail.hints`）；不同且账本命中 → `explained_diff`；其余 → `unexplained_diff`。非特权运行的差异 → `unexplained_diff(no_hints)`。
- `--http` 冒烟（后续）：对公开读接口发同一请求，记录 `x-vercel-cache`、`age`，`responder_code_version:'unavailable'`（该头未上线，§0 R5-9），永不作为证据；`HIT` 只记录；库路径与路由的等价由规格二路由单测 + 本规格一条"投影(库) == 投影(路由响应)"的 CI 单测（内存 DB 上起路由 handler）保证。
- 录制 `--mode live`：同样只增不改；`--supersede` 同上。

#### 5.3.3 账本 `fixtures/replay/explanations.json`

```jsonc
{"ledger_id": "…", "case_id": "…", "mode": "frozen|live",
 "changed_fields": ["facts[revenue/…].value_text", "facts[revenue/…].disclosure_seq"],   // 必须覆盖该案例的全部变化字段
 "before_hash": "…", "after_hash": "…",
 "from_code": "…", "to_code": "…",                     // frozen：录制与当前 evaluator_code_version；live：录制与当前 evaluator_code_version
 "from_state_rev": 12, "to_state_rev": 15,             // live 必填
 "from_setup_sha256": "…", "to_setup_sha256": "…",     // frozen 必填（§5.3.1 setup_sha256）
 "reason_code": "quarantine_resolved",                 // late_filing | quarantine_resolved | mapping_gen_upgrade | formula_version_change | ticker_reassignment | bug_fixed
 "evidence": {"quarantine_id": "…"},                   // bug_fixed: {"pr": 123, "regression_test": "<file>::<name>"}
 "added_by": "<id>", "added_at": "…", "approved_by": "<id>", "approval_ref": "<PR review URL>", "approved_at": "…"}
```
命中条件：`case_id, mode, before_hash, after_hash, from_code, to_code` 加 mode 专属对（live：`from_state_rev, to_state_rev`；frozen：`from_setup_sha256, to_setup_sha256`）全等，且 `changed_fields` 等于实际变化字段集合。部分覆盖 → `unexplained_diff(partial_ledger)`。`approved_by ≠ added_by`，`approval_ref` 必填。

### 5.4 `reference_regression`

- 样本：`fixtures/reference/chaosai/macro-strategy.json` 36 格（§2），每条 `{sample_id, doc, doc_sha256, line, page_url, page_sha256, captured_at, as_displayed, parsed_value, parsed_unit, their_declared_source, our_target:{series_id, period_end, which: 'latest'|'previous'}, canary: false}`；LPR 行与资产价格记 `unavailable`。行业/公司页需 owner 决定是否补抓并**保留页面字节**（§16 D5）。
- 结果类型 `ReferenceResult = {total, within, beyond_explained, beyond_unexplained, unavailable}`，运行时用 schema 校验：键集合**严格相等**，值为非负整数；其他对象一律拒绝（结构类型的"多余属性"在运行时被拒）。写入只经 `writeReferenceSummary(run_id, result)`。
- 隔离测试：(a) 运行前后 `financial_facts`、`financial_metrics`、`filings`、`macro_observations`、`macro_snapshots`、`macro_regime_results` 的 `md5(string_agg(t::text, '|' order by <pk>))` 相等；(b) 用 `ReadDeps` 对象尝试调用任何写方法（反射遍历属性，断言没有 `insert/update/upsert/store`）；(c) **哨兵**：样本文件含一条 `canary: true`、`parsed_value='918273645.5'`、`our_target.series_id='__canary__'` 的记录；测试用的读适配器对 `__canary__` 返回固定值 `1`，于是哨兵走完整的 `beyond_unexplained` 比较路径；运行后断言该字符串不出现在 `/api/admin/evals*` 响应体、公开 `.md`、`dq_eval_runs.summary`、捕获的服务端日志中（只允许出现在报告 `cases[]`）。生产没有 `__canary__` 序列，哨兵 → `unavailable`；哨兵不计入 `population`。(d) **拒写**：集成测试用 `reference_regression` 实际持有的 anon 客户端尝试 `insert dq_eval_runs` 与 `update macro_observations`，断言被 RLS/权限拒绝（真实的拒写，不只是反射）。
- 比较 `rel 0.01`；超差必须有账本条目 `{sample_id, their_value, our_value, our_run_id, reason_code ∈ {membership_pointintime, aggregation_method, restatement, unit_or_basis, their_placeholder, their_proxy, their_stale_snapshot, unknown}, evidence:{type:'computation'|'document', ref}, added_by, approved_by, approval_ref}`，`their_value/our_value` 必须等于本次比较的两值。
- 门槛：`ci` 不跑；`report` 下 `beyond_unexplained = 0` → `pass`，`evidence_class='comparison'`。

### 5.5 `dual_source`

`pairs.ts`：`{pair_id, module, left:{source, upstream}, right:{source, upstream}, independence: 'independent_publication'|'same_upstream_independent_extraction'|'same_feed', key:{concepts, period_end_from, period_end_to, consolidation}, tolerance:{rel:'0.005'}}`。
- 观测键 = `(issuer, concept, period_start, period_end, duration, consolidation, unit)`；每边取**各自**对该期的披露中 `available_date <= asOf` 的当前值，`asOf = max(两边该键首次披露的 available_date)`（两边都已可见）；报告记两边的 `fact_id, source_ref, raw_hash, available_date`（特权运行按 §5.1.4 解析两边快照）。
- "已处置"的判定：对应的 `dq_quarantine` 项 `natural_key` 必须等于本观测键的规范串，`status ∈ {resolved_accept, resolved_reject}`，且项的 `detail.chosen_fact_ids`（若有）包含本次比较所用的 `fact_id` 之一；否则该 fail 仍计入。
- `independence='same_feed'` → `evidence_class='adapter_check'`，发布清单不接受为双源证据。
- 门槛：`max_fail=0`，其中"每个 `fail` 都有对应的 `dq_quarantine` 项（计划三生产者写）且该项已处置"视为已处理（`detail.disposition`），已处理的 fail 不计入；趋势指标 `pass/(pass+fail)` 只在报告里展示（规格一 §9 的 95% 作为告警线，不是门槛）。

### 5.6 读适配器

```ts
export interface ModuleReader {
  module: Module;
  resolveSubject(subject, today): Promise<{issuerId, market} | {seriesId} | null>;
  readDocumentBound(id, target, documentId): Promise<ReadResult>;   // rows[] + truncated + provenance
  readCurrent(id, target, asOf): Promise<ReadResult>;
  project(request): Promise<Projection>;
}
export interface PrivilegedReader extends ModuleReader {
  readNonVisible(id, target, documentId): Promise<'quarantined'|'superseded_generation'|null>;
  resolveProvenance(p): Promise<{ok: boolean; producer_code_version?: string; missing: string[]}>;
  hints(request, since): Promise<Hint[]>;
}
```
`facts`：包规格二 `FactsDb` 只读子集（`readFacts/filingsOfIssuer/factsByIds/metricsOfIssuer`，类型上排除写方法）+ `deriveMetrics`（§0 R5-7）；`factsByIds` 结果按 §0 R5-6 校验资格；`macro`：包宏观表（后续）。模块上线前必须有适配器、黄金集、发布清单。

### 5.7 `extraction_gold`、`judgment_calibration`

见 §11.1、§11.3。

---

## 6. 存储

### 6.1 决定

| 内容 | 放哪 | 理由 |
|---|---|---|
| 黄金集、回放、对照、账本 | 仓库 `fixtures/`（受限集见 §4.5） | 版本化、可审 |
| 完整报告 | `ci`：`reports/evals/<run_id>.json`；`report`：`docs/evals/<date>/<module>-<kind>-<run8>.json` + `.md`；受限：私有桶 | run_id 命名，不覆盖 |
| 运行摘要 | `dq_eval_runs` | 管理页 |
| 逐案非 pass（official / dual_source，public 集） | F6 自有 `dq_eval_case_results`（§0 R5-3） | 不与计划三共享 `dq_reconciliations` 的约束与语义 |
| 回放/对照逐案 | 报告文件 | 账本在文件 |

表中每运行最多 100 条失败行（展示上限，`summary.reconciliations_truncated`），文件保存全量。

### 6.2 迁移 `supabase/migrations/<ts>_dq_eval_runs.sql`

```sql
create table if not exists public.dq_eval_runs (
  run_id                  uuid primary key,
  kind                    text not null check (kind in ('official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration')),
  module                  text not null check (length(module) between 1 and 32),
  mode                    text not null check (mode in ('ci','report')),
  privileged              boolean not null default false,
  artifact_class          text not null check (artifact_class in ('public','restricted')),
  set_id                  text not null,
  set_version             integer not null check (set_version >= 1),
  set_sha256              text not null check (set_sha256 ~ '^[0-9a-f]{64}$'),
  evaluator_code_version  text not null check (evaluator_code_version ~ '^[0-9a-f]{40}$'),
  started_at              timestamptz not null,
  finished_at             timestamptz,
  status                  text not null check (status in ('running','passed','failed','incomplete','error')),
  summary                 jsonb not null default '{}',
  report_ref              text not null,
  report_sha256           text not null check (report_sha256 ~ '^[0-9a-f]{64}$'),
  triggered_by            text not null check (triggered_by in ('manual','script','ci')),
  constraint dq_eval_runs_summary_object check (jsonb_typeof(summary) = 'object'),
  constraint dq_eval_runs_finished_after_started check (finished_at is null or finished_at >= started_at),
  constraint dq_eval_runs_running_iff_unfinished check ((status = 'running') = (finished_at is null))
);
create index if not exists dq_eval_runs_module_kind_idx on public.dq_eval_runs(module, kind, started_at desc);

create table if not exists public.dq_eval_case_results (
  eval_run_id  uuid not null references public.dq_eval_runs(run_id) on delete restrict,
  case_id      text not null check (length(case_id) between 1 and 512),
  result       text not null check (result in ('fail','unit_mismatch','provenance_incomplete','missing','not_visible','read_error','unexplained_diff')),
  reason       text check (reason is null or length(reason) between 1 and 64),
  left_text    text check (left_text  is null or left_text  ~ '^-?[0-9]+(\.[0-9]+)?$'),
  right_text   text check (right_text is null or right_text ~ '^-?[0-9]+(\.[0-9]+)?$'),
  abs_diff     text check (abs_diff   is null or abs_diff   ~ '^[0-9]+(\.[0-9]+)?$'),
  rel_diff     text check (rel_diff   is null or rel_diff   ~ '^[0-9]+(\.[0-9]+)?$'),
  tolerance    text not null check (tolerance ~ '^[0-9]+(\.[0-9]+)?$'),
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  primary key (eval_run_id, case_id),
  constraint dq_eval_case_results_detail_object check (jsonb_typeof(detail) = 'object')
);

do $$ declare t text; begin
  foreach t in array array['dq_eval_runs','dq_eval_case_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
```

- 文件 `20261110090000_dq_eval_runs.sql`；落地顺序见 §0 R5-4。本迁移不触碰 `dq_reconciliations`，在有无计划三迁移的库上都可重放（集成测试在当前 `main` 的库上跑；计划三合并后由 `test:migrations` 覆盖新顺序）。
- `database.types.ts` 手工补齐。

### 6.3 持久化顺序与幂等（无事务）

1. 内存完成评测 → 写报告文件 → `report_sha256`。
2. `insert dq_eval_runs {status:'running', report_ref, report_sha256}`；失败 → `store_write_failed`，退出码 1。
3. 逐行 `insert dq_eval_case_results`；23505 时 `select` 该 `(eval_run_id, case_id)` 行并逐字段比对，相同 → 继续，不同 → `store_conflict`，退出码 1。
4. `update dq_eval_runs where run_id and status='running'` → 终态；命中数必须为 1，为 0 时读回该行：已是相同终态 → 视为成功，否则 `store_conflict`。
5. `--resume <run_id>`：先读行，重算本地报告文件 sha256 并与 `report_sha256` 相等才继续 3–4；`running` 超过 24 小时由 runbook SQL 标 `error`。集成测试：步骤 3 中断后 resume；两个 resume 并发（pg）。

### 6.4 代码版本

`evaluator_code_version` = `VERCEL_GIT_COMMIT_SHA` 或 `git rev-parse HEAD`；脏树：`ci` 允许并记 `dirty:true`，`report` 拒绝；`producer_code_version` 见 §5.1.4。

---

## 7. 运行器与触发

### 7.1 CLI `scripts/evals/run.ts`

```
run.ts --kind <kind> --module <module> [--set <path>] [--pair <id>] --mode ci|report [--write-db] [--out <dir>] [--limit N] [--case <id>] [--resume <run_id>] [--http]
```

| | `ci` | `report` | `report --write-db` |
|---|---|---|---|
| 读 | 本地 DB（`S4_TEST_STATE`）/ 内存 | 生产 anon | 生产 service_role（`PrivilegedReader`） |
| 写表 | 否 | 否 | 是 |
| 报告 | `reports/evals/` | `docs/evals/<date>/` 或私有桶 | 同左 |
| `synthetic` 集 | 允许 | 拒绝 | 拒绝 |
| 受限集 | 不运行 | 需桶凭据 | 同左 |
| `reference_regression` | 不运行 | 运行（anon，无 service 密钥） | 只写摘要 |
| `--limit/--case` | `subset=true` → `incomplete` | 同左 | 同左，不写表 |
| 退出码 | 0 / 1 / 3 / 2 | 同左 | 同左 |

### 7.2 报告

JSON：`run_id, kind, module, mode, privileged, artifact_class, set{id,version,sha256}, evaluator_code_version, started_at, finished_at, environment{db_host, app_origin, db_state_rev}, thresholds, summary（§3.2）, cases[]（§3.3 的结果 + left/right + provenance + detail）`。`.md` 由 `report.ts` 确定性渲染（两次字节一致）；受限报告公开侧只有摘要。

### 7.3 触发

| 触发 | 什么 |
|---|---|
| CI（每 PR） | `validate.ts --gold --lock --gold-diff --redact`；`official_reconciliation` 与 `replay frozen` 经模块离线集成测试（§13.3）；`reports/evals/**` 以 `if: always()` 上传；`checkout` 改 `fetch-depth: 0` |
| 脚本 | `report --write-db` 全部 kind；板块上线前、之后每季度（§16 D3） |
| cron | F6-后续 |

---

## 8. 专家抽样记录

`docs/evals/<date>/expert-sampling-<module>-<n>.json` + `.md`：

```jsonc
{"schema_version":1,"module":"facts","sampled_at":"…",
 "expert":{"alias":"E1","background":"…","independence":"…","contact_held_by":"owner"},
 "population":{"set_id":"facts/plan3-30","set_version":1,"set_sha256":"…","case_count":720,
               "evaluated_run_id":"<该集最近一次特权 report 运行>","db_state_rev":"…"},
 "selection":{"method":"seeded_sha256","seed":"…","companies":5,"cases_per_company":6,"selected_case_ids":["…"]},
 "checks":[{"case_id":"…","our_value":"…","document_value":"…","document":{…},"verdict":"agree|disagree|cannot_verify","note":"…"}],
 "basis_review":[{"topic":"…","verdict":"agree|disagree","note":"…"}],
 "summary":{"agree":28,"disagree":1,"cannot_verify":1},
 "follow_ups":[{"ref":"<case_id 或 basis topic>","action":"…","owner":"…","due":"…","closed_at":null,"closure_ref":null}]}
```

验证器：`selected_case_ids` 由 `sha256(seed || case_id)` 升序取前 N 家、每家前 M 条重算；`checks` 覆盖全部选中；`summary` 重算；`agree + disagree ≥ 0.8 × selected`（`cannot_verify` 过多不算完成）；每条 `disagree`（含 `basis_review`）有 follow-up；发布清单要求 follow-up 全部 `closed_at` 非空且 `closure_ref` 指向隔离项、PR 或黄金集 `history`；`evaluated_run_id` 必须是 `gate='pass'` 的特权运行。专家用别名；不附研报 PDF。

---

## 9. 第三方模型审计记录约定

目录 `docs/audits/<YYYY-MM-DD>-<topic>/`：`00-prompt-round<N>.md`、`<NN>-codex-round<N>.md`（首行 `**Verdict: …**`）、可选 `<NN>-<reviewer>-review-round<N>.md`、`<NN>-disposition.md`、`index.json`：

```jsonc
{"topic":"…","target":{"path":"docs/superpowers/specs/…md"},
 "rounds":[{"n":1,"target_sha256":"…","target_git_ref":"<commit 或 'uncommitted'>","prompt_file":"…","report_file":"…","model":"gpt-6-astra","effort":"medium","verdict":"…","findings":{"p1":13,"p2":14,"p3":1}}],
 "dispositions":[{"file":"03-disposition.md","covers_rounds":[1,2]}],
 "open":{"owner":["…"],"verify":["…"]},"final_verdict":"…"}
```
`validate.ts --audit`：文件存在；每轮每个编号在某份处置表出现；处置表里 `ACCEPT` 条目有 `implemented_in`（提交或"本稿 §x"）；`open` 与处置表一致；`target_git_ref='uncommitted'` 的轮次标 `unverified_target: true`（历史目录允许）。新规则：运行 Codex 的脚本 `scripts/evals/codex-audit.ts` 先要求被审文件已提交（否则拒绝），把 `target_sha256` 与提交写入 `index.json`，审计字节因此可由 git 取回；发布清单要求最后一轮 `target_git_ref` 是提交，且不存在 P1/P2 发现处于 `OPEN-verify` 或缺 `implemented_in` 的 `ACCEPT`。既有 `2026-11-04-data-foundation-2` 目录只补 `index.json`。

---

## 10. 板块发布证据清单

`docs/evals/<date>/<module>-release-manifest.json`，`validate.ts --manifest` 校验：

```jsonc
{"schema_version":1,"module":"facts","release_commit":"<40 hex>","prepared_by":"…","prepared_at":"…",
 "scope":{"markets":["US"],"universes":["sp500"],"data_state_rev_min":"…"},
 "gold_approval":"enforced",
 "evidence":{
   "official_reconciliation":{"run_id":"…","report":"docs/evals/…json"},
   "replay_frozen":{"ci_run_url":"<GitHub Actions run>","report":"docs/evals/…/facts-replay_frozen-<run8>.json","report_sha256":"…","ci_check":"manual"},
   "replay_live":{"run_id":"…","report":"…"},
   "dual_source":{"run_id":"…"} | {"not_applicable":{"reason":"…","approved_by":"owner","at":"…"}},
   "reference_regression":{"run_id":"…"} | {"not_applicable":{…}},
   "expert_sampling":{"file":"…"},
   "model_audit":{"dir":"…"}},
 "waivers":[{"item":"gold_approval","reason":"…","approved_by":"owner","at":"…"}]}
```

校验器对每项**打开文件重算**，按证据种类分别认证：

| 证据 | 认证 | 必须满足 |
|---|---|---|
| `official_reconciliation`、`replay_live`、`dual_source` | `mode='report'`、`privileged=true`，报告 sha256 = `dq_eval_runs.report_sha256`（service-role 查；无库访问 → 清单不通过） | `evaluator_code_version == release_commit`；official 的报告 `provenance.verified={artifacts:true, sources:true}`；`evidence_class='truth'` |
| `replay_frozen` | `mode='ci'`；仓库副本 `docs/evals/<date>/facts-replay_frozen-<run8>.json` 的 sha256 等于清单 `report_sha256`；`ci_run_url` 指向该提交的成功 CI 运行（校验器记录 URL，运行与副本的一致性由 CI 在 job summary 打印的 sha256 人工比对，清单记 `ci_check:'manual'`） | `evaluator_code_version == release_commit`、`dirty=false` |
| `reference_regression` | `mode='report'`、**`privileged=false`**（运行只持 anon 读取器，不加载 service 密钥，§5.4）；报告 sha256 由**校验器自己的** service-role 连接对 `dq_eval_runs.report_sha256` 核对（不继承生产者的特权要求） | `evidence_class='comparison'`（接受）；`gate='pass'` |
| `expert_sampling`、`model_audit` | §8、§9 校验 | `population.evaluated_run_id == official_reconciliation.run_id`；审计最后一轮 `target_git_ref` 为提交且无未实施/未核实的 P1/P2 |

共同规则：由 `cases[]` 重算 `summary` 与 `gate`，必须 `pass`；`provenance_kind≠synthetic`；`set.sha256` 等于 `lock.json`；`scope.markets` 等于集内 subject 市场的集合（不多不少），`scope.data_state_rev_min` ≤ official 报告的 `environment.db_state_rev`；`freshness`：校验器读 `dq_freshness`，模块数据集在 `prepared_at` 时为 `fresh`（无库访问 → 不通过）。**没有**按提交时间的宽限：任何证据的 `evaluator_code_version` 都必须等于 `release_commit`（在线回放走库路径，重跑成本低）。
不可豁免：`official_reconciliation`、`replay_frozen`、`model_audit`、`expert_sampling`（首次发布）。可豁免（写 `not_applicable`）：`dual_source`（无第二来源）、`reference_regression`（无样本）、`replay_live`（首次发布前无生产数据）。`gold_approval='process'` 需要 `waivers` 条目。清单不替代 owner 上线决定。

---

## 11. 依赖接口（待对齐）

### 11.1 F3 → `extraction_gold`

标注（受限集）：`{documents:[{document_sha256, page_count, bbox_space:'pdf_points_top_left'}], labels:[{label_id, document_sha256, field, occurrence, value_type:'text'|'decimal'|'date'|'enum', value, locator:{page, bbox:[x0,y0,x1,y1]}, recorded_by, reviewed_by}]}`；预测：`{document_sha256, fields:[{field, value, page, bbox}]}`。
匹配：按 `(document_sha256, field)` 分组，组内一对一匹配，分两步且顺序确定。第一步只考虑**同页、IoU ≥ 0.5、值相等**的（标注, 预测）对（`decimal` 用 `compareWithinTolerance rel 0`；`text` 规范化空白/全半角；`date` ISO），在这些合格对中求**最大匹配数**（二分图最大匹配；多解时按 IoU 降序、再按 bbox 字典序确定性打破平手），匹配到的即 TP；第二步对剩余标注与预测，按值相等优先、再按 IoU 降序配对，用于分类错误。第二步配对的：值相等但定位不符 → `FP_citation`（计入 FP）+ FN；值不等 → FP + FN；未配对预测 → FP；未配对标注 → FN。字段级 `P_f = TP/(TP+FP)`（预测数为 0 且支持数 > 0 时 `P_f = 0`）、`R_f = TP/(TP+FN)`；支持数 0 的字段 `skipped(zero_support)`；案例 = 字段（§3.3），门槛 `P_f ≥ 0.95 且 R_f ≥ 0.95`（总纲 §3.5）；附一份手算的对抗夹具（含同值多出现、错页、零预测），一条"同值跨页、坐标交叉"的两页夹具（两页各有一个同值标注与一个同页预测，跨页 IoU 高于同页 IoU，正确结果必须是两个 TP），以及一条"全部文档成功解析但 TP=0"的夹具必须 `gate='fail'`。

### 11.2 规格二与计划三

规格二已合并，本规格不向它提要求（§0 R5-1、R5-2、R5-9）：黄金文件经旧格式适配器只读采用；建库辅助由 F6 自建；`x-code-version` 记为不可用。建议（非依赖）：owner 抄录时把 `plan2.json` 迁移为本契约格式（IFRS 申报人列为 `optional_cases`）。
计划三（在途）：F6 只读消费其对与结果（`PairSource` 适配器，§0 R5-10）；`plan3-30.json` 由计划三或 owner 以本契约格式提供；两边比较原语各自独立。

### 11.3 F4 → `judgment_calibration`

`settledForecasts({module, from, to}) => [{forecast_id, forecast_sha256, methodology_version, claim, p, registered_at, input_snapshot_sha256, horizon_end, revision_of, settlement:{outcome: 0|1, settled_at, evidence_ref, evidence_available_date}}]`。资格：`0 ≤ p ≤ 1`（Brier 允许端点；log score 不在本规格）；`registered_at + 1 天 ≤ evidence_available_date`；`settled_at ≥ horizon_end`；每 `forecast_id` 一次结算；修订链取最后一次满足前述条件的登记。输出 Brier、10 桶可靠性（端点归末桶）、样本数、不合格清单；门槛由 F4 定；无合格样本 → `incomplete`。

### 11.4 宏观 → 回放

按 `snapshot_id` 读 `macro_regime_results`/`macro_snapshots`；`superseded` 保留。

---

## 12. 管理界面：扩展 `/admin/dq`

- 瓦片："评测门槛未过（30 天）"（`status in ('failed','incomplete','error')` 计数）。
- 表：最近 20 次运行：时间、`module`、`kind`、`mode`、`privileged`、`artifact_class`、集与版本、`evaluator_code_version` 前 7 位、三维数字、`gate`、`report_ref` 文本；`running` 超 1 小时标"异常"。
- 抽屉：`summary`；official / dual_source 时列 `dq_eval_case_results where eval_run_id = run_id`（≤ 100）：`case_id, result, reason, left_text, right_text, abs_diff, rel_diff, tolerance, detail.locator, detail.document_id`。
- 本期（§0 R5-11）：只交付 `src/lib/evals/admin.ts` 与两个新路由文件；UI 区块与抽屉在画布与计划三 Task 19 之后接入。
- 接口：`GET /api/admin/evals?limit=&module=&kind=`、`GET /api/admin/evals/[run_id]`（`requireAdminUser()`、`force-dynamic`、`getAdminSupabase()`）。响应键白名单 = 运行行列 + §3.2 的 `summary` 键 + 上述对账列；测试断言键集合与哨兵缺席。
- i18n `admin.dq.evals.*`；状态：加载中 / 失败 / 空；无图表。

Claude Design 画布待设计清单：1. `/admin/dq` 评测运行区块；2. 运行详情抽屉。

---

## 13. 测试策略

### 13.1 单元（`src/lib/evals/*.test.ts`）

- `compare.test.ts`：整数、20 位整数、18 位小数、负数、`rel 0`、分母 1、`relDiff` 截断；属性测试 200 次：自反 pass、容差单调。
- `gold.test.ts`：§4 每条规则一条反例（含 `target.unit` 缺失、`scale` 非法、`sha256` 缺失、集级字段变化无 version bump）；`--gold-diff` 用两份内存树（案例消失、改名、阈值变化、`recorders.json` 变化、整集删除），再用临时 git 仓库（`git init` + 三个提交，模拟多提交推送与 `event.before`）跑真实的 `git diff` 路径；对 `fixtures/gold/**` 通过。
- `kinds/official.test.ts`（内存适配器）：§3.3 每种结果各一；变异：改返回值 → `fail`；去 `raw_hash` → `provenance_incomplete`；去必需案例 → `incomplete`；去可选案例至比例以下 → `incomplete`；`population=0` → `incomplete`。
- `kinds/replay.test.ts`：投影稳定；frozen/live 各态；账本命中六元组、`changed_fields` 不全 → `partial_ledger`、`approved_by == added_by` 拒绝、`after_hash` 变后旧条目失效；重录拒绝；`setup_mismatch`。
- `kinds/reference.test.ts`：`ReadDeps` 无写方法；`ReferenceResult` 多键/缺键/负数拒绝；哨兵不出现在摘要与 `.md`；`unknown`/无条目/值不等的条目 → `beyond_unexplained`。
- `kinds/dual-source.test.ts`：键含 `period_start/duration`；`asOf` 取两边最大；`same_feed` → `adapter_check`；已处置 fail 不计入。
- `kinds/extraction.test.ts`：手算对抗夹具；同值跨页坐标交叉两页夹具 → 两个 TP；TP=0 全解析语料 → `fail`；零预测正支持 → `P_f=0`。
- `report.test.ts`：两次渲染一致；受限报告公开侧只摘要；`environment` 无凭据。
- `store.test.ts`：顺序、23505 内容比对、终态更新命中 0 的两种情况、resume 的 sha 校验。
- `validate.test.ts`：专家（重算、80% 阈、follow-up 关闭）、审计（编号覆盖、`implemented_in`、未提交目标）、清单（按证据种类认证：frozen 的 `ci` 模式与副本哈希接受、official 的 `ci` 拒绝、reference 的 `comparison` 接受且 `privileged=true` 的 reference 运行拒绝、`adapter_check` 拒绝、合成/脏/非发布提交拒绝、`scope.markets` 不等于集市场拒绝、新鲜度不 fresh 拒绝、official 未 `verified` 拒绝、豁免规则）、`--redact` 各模式。
- `route-equivalence.test.ts`：内存 DB 上投影(库) == 投影(路由响应)。

### 13.2 数据库 `evals-store.integration.test.ts`（critical，不依赖规格二表）

迁移可重放；约束；`restrict`；文本投影列；RLS；`numeric` 往返；评测写入形状；中断 resume、并发 resume。

### 13.3 数据库 `evals-facts.integration.test.ts`（critical，规格二 F2-3/F2-6 之后创建）

- 规格二夹具同步后：`runGoldSet(plan2-us)` → `pass`；用装饰器包 `pgFactsDb` 读结果改一个值 → `fail`；装饰器去掉一个必需案例 → `incomplete`；三条经同一入口并断言退出码。
- 重述：经 `beginRun → stageFilings → stageFacts → publishRun` 发布更晚的合成 10-K/A 改同键值；`binding='document'` 案例仍 `pass`；同案例 `binding='current'` 副本、`asOf` = 合成文件可得日 → `fail`；特权 `readNonVisible` 对被隔离行返回 `quarantined` → `not_visible` → `incomplete`。
- `replayFrozen` 全 `identical`；篡改一个夹具字节 → `setup_mismatch`。
- `reference_regression` 前后 `financial_facts/financial_metrics/filings` 三表哈希相同；哨兵缺席；拒写测试（§5.4 (d)）。
A 股部分随真实 CN 夹具与 CN 回放进入（§15.1）。宏观三表（`macro_observations/macro_snapshots/macro_regime_results`）的同类断言在 `evals-reference.integration.test.ts`（critical）里，随 F6-C2 在宏观工作台迁移落地后创建；宏观迁移是 F6-C2 的前置。

### 13.4 清单规则

含 `S4_TEST_STATE` 的文件都进 `criticalSuites`，且列表不含其他文件。

---

## 14. 错误处理

| 情形 | 行为 | 码 | 结果 |
|---|---|---|---|
| 黄金文件/锁/差异校验失败 | 不运行 | `gold_invalid` / `gold_lock_mismatch` / `gold_diff_violation` | 2 |
| `code_version` 缺失；`report` 脏树 | 不运行 | `code_version_missing` / `dirty_tree` | 2 |
| `synthetic` 集在 `report`；受限集在 `ci` | 不运行 | `synthetic_in_report` / `restricted_in_ci` | 2 |
| subject 解析失败 / `truncated` / 重试 3 次仍失败 / `setup_mismatch` / 文件未挂接 | 案例 `read_error` | — | `incomplete` |
| 同键多行 | `fail(ambiguous)` | — | 正确性 |
| 单位不可映射 | `unit_mismatch` | — | 正确性 |
| 报告写失败 / 运行行插入失败 | 不写表 / 报告保留 | `report_write_failed` / `store_write_failed` | 1 |
| 对账行内容冲突 / 终态冲突 | 停止 | `store_conflict` | 1 |
| 收尾未完成 | `running` 留存，`--resume` | `store_partial` | 1 |
| 对照结果多键/写尝试 | 抛错 | `reference_result_schema` / `reference_write_attempt` | 进程退出 |
| 账本自批 / 部分覆盖 | 条目无效 | `ledger_self_approved` / `partial_ledger` | `unexplained_diff` |
| 重录已有案例 | 拒绝 | `replay_rerecord_refused` | 2 |

---

## 15. 分期

依赖：F6-A 不依赖规格二（迁移只动 `dq_*`，集成测试只测存储）；F6-B 依赖规格二 F2-3、F2-6 落地；F6-C 之后。

| 工作包 | 交付 | 退出条件 | 人日 |
|---|---|---|---|
| F6-A1 契约与校验 | `fixtures/gold/{lock,recorders}.json`、`src/lib/evals/{types,gold,compare,report}.ts`、`validate.ts`（gold、lock、gold-diff、redact、expert、audit、manifest）、`hash-source.ts`、单测、`ci.yml`（`fetch-depth: 0`、`--gold-diff`、`reports/evals/**`）、既有审计目录 `index.json` | §13.1 的 compare/gold/report/validate 绿 | 3.5 |
| F6-A2 存储 | 迁移、types、`store.ts`、`evals-store.integration.test.ts` | `test:db`、`test:migrations` 绿 | 1.5 |
| F6-B1 官方对账与接入 | `adapters/facts.ts`（含特权读、`--verify-artifacts/--verify-sources`）、`kinds/official.ts`、`runGoldSet`、`run.ts`、`codex-audit.ts`、`evals-facts.integration.test.ts`、规格二断言替换 | §1.1 三条路径；对生产一次特权 `report` 并提交 | 3 |
| F6-B2 回放 | `projections/facts.ts`、`kinds/replay.ts`、`record-replay.ts`、`facts.frozen.json`（≥ 10）、`facts.live.json`、账本、`route-equivalence.test.ts` | frozen 全 identical；live 一次 | 2.5 |
| F6-B3 发布清单与专家记录 | 首份 `facts-release-manifest.json`、专家记录模板与首次记录 | `--manifest` 通过 | 1 |
| F6-C1 管理区块 | `/api/admin/evals`、区块与抽屉、i18n | parity、白名单、哨兵测试 | 1.5 |
| F6-C2 双源与对照（前置：宏观工作台迁移已落地） | `pairs.ts`、`kinds/dual-source.ts`、`kinds/reference.ts`、`macro-strategy.json`（36 格 + 哨兵）、`evals-reference.integration.test.ts` | 隔离与拒写测试；一次对照 | 2 |
| F6-后续 | cron、`extraction_gold`、`judgment_calibration` | 各自规格 | — |

合计约 15 人日（A 5、B 6.5、C 3.5），不含录入、专家与规格二。

### 15.1 本期可构建子集（第 6 稿，§0 R5-12）

| 交付 | 本期 | 前置 / 说明 |
|---|---|---|
| A1 契约与校验（gold、lock、gold-diff、redact、expert、audit、manifest）、`hash-source.ts`、`codex-audit.ts`、`ci.yml` `// F6` 块 | 是 | — |
| A2 存储（迁移、types、`store.ts`、`evals-store.integration.test.ts`） | 是 | 落地顺序 §0 R5-4 |
| B1 facts 适配器（US，含特权解析）、`official`、旧格式适配器、`runGoldSet`、`run.ts`、`evals-facts.integration.test.ts` | 是 | 生产 `report` 运行 = owner 事项（需真实黄金值与 service 密钥） |
| B2 投影、`replay`（frozen 真实库；live 纯逻辑 + 单测）、`record-replay.ts`、`facts.frozen.json`（≥ 10）、账本 | 是 | live 首次运行 = owner 事项 |
| B3 清单与专家记录的校验器与模板 | 是 | 首份清单需生产证据 |
| C1 `admin.ts` + 两个 API 路由 | 是 | UI：画布 + 计划三 Task 19 |
| `dual_source`（纯逻辑 + `PairSource` 接口 + 单测） | 是（无真实库测试） | 计划三合并 |
| `reference_regression`（纯逻辑 + `ReferenceResult` 校验 + 哨兵单测） | 是（无真实库测试） | 宏观迁移 |
| `extraction_gold`（匹配算法 + 对抗夹具单测；`run.ts` 拒绝启用） | 是（不启用） | F3 + D8 |
| `judgment_calibration`（资格与 Brier/可靠性纯函数 + 单测） | 是（无真实数据） | F4 |
| CN 黄金与回放 | 否 | 真实 Tushare 夹具与 CN 回放套件 |


验收样例：
1. 改 `canonical.value` 不改 `printed` → `gold_invalid`；只改集级 `thresholds` 不 bump version → `gold_diff_violation`。
2. §1.1 三条路径的退出码 0 / 1 / 3。
3. 录制 live 案例后接受一条隔离项：特权运行 `data_drift` 带提示；账本（另一人批准、`approval_ref`）→ `pass`；再变 → 旧条目不命中 → `fail`。
4. `reference_regression`：六表哈希不变；哨兵缺席。
5. 清单引用 `ci` 运行或 `adapter_check` 双源 → 退出码 1。

---

## 16. 独立验证与 owner 事项

独立验证：Codex 两轮 + 处置（`docs/audits/2026-11-04-evals-gold-sets/`），每个工作包提交再审；"能两种方式失败"证明（§1.1）；第一次特权 `report` 由实现者之外的人触发并提交。

| 事项 | 决策 | 谁 | 何时 |
|---|---|---|---|
| **D1 阈值** | 事实官方对账 `rel 0`；派生/聚合/宏观 `rel 0.01`（总纲 §1.3）；双源 `rel 0.005`（规格一 §5.2）、95% 为告警线；对照 `rel 0.01`；`min_coverage_optional 0.95` | owner | F6-A1 前 |
| **D2 录入者与审批** | `recorders.json` 初始名单；owner 本人可录（不得同时是实现者）；30 家双人；开启 CODEOWNERS + 分支保护（`src/lib/evals/fixtures/gold/**`、`recorders.json`、`src/lib/evals/fixtures/replay/**` 必经另一人审核）→ `enforced`；不开启则每份发布清单需 `waivers` | owner | F6-A1 前 |
| **D3 节奏** | 上线前一次全量特权 `report`；之后每季度 | owner | F6-B1 前 |
| **D4 报告保留** | `docs/evals/` 全量 JSON 入库，或只入 `.md` + 摘要而 JSON 入私有桶（第 6 稿实施默认：public 集全量 JSON + `.md` 入库） | owner | F6-B1 前 |
| **D5 对照范围** | 只用 36 格；是否补抓行业/公司页并保留页面字节 | owner | F6-C2 前 |
| **D6 账本批准人** | 默认 owner；不得与 `added_by` 相同 | owner | F6-B2 前 |
| **D7 发布阻断** | 清单校验失败是否硬阻断部署（默认：上线检查项，由 owner 执行） | owner | F6-B3 前 |
| **D8 受限工件许可** | F3 抽取集与报告的许可与保留期；决策前 `extraction_gold` 不启用、`eval-restricted` 桶不建 | owner | F3 前 |
| 环境 | `report --write-db` 需 `SUPABASE_SERVICE_ROLE_KEY`（仓库外）；特权解析需对 `storage.objects` 的查询权限（service_role 已有） | owner | F6-B1 前 |

---

## 17. 开放问题（实施前核对）

1. 规格二 `filingsOfIssuer` 的 `opts` 是否可按 `source_ref/document_ref` 过滤；否则内存过滤。
2. `read_facts` 的 `history=true` 在 `from=to=period_end` 时是否返回该期全部披露行；本规格据此选 filing 行。
3. 宏观 `macro_regime_results` 按 `snapshot_id` 保留历史。
4. （第 6 稿起不适用：F6 不写 `dq_reconciliations`。）
5. 公开读接口的 CDN 行为未验证；在线回放走库路径，`--http` 只冒烟。
6. 部署的 PostgREST 版本与 `numeric` 序列化行为未核实；§5.2 的 (b)(c) 测试覆盖。
7. GitHub Actions 工件保留期（默认 90 天）；清单要求 frozen 报告有仓库副本。
8. `plan2-us.json` 的 IFRS 申报人是否存在（规格二 §11.1）。

---

## 18. 实施记录与偏差

（F6 落地后补记，格式同规格一 §14。实施记录：`docs/audits/2026-11-06-evals-gold-sets/`。）

### 18.1 第 6 稿实施（计划 `docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`，2026-11）

交付（§15.1 可构建子集）：契约与校验（Task 1–4、12）、存储（Task 5–6）、facts 适配器与官方对账（Task 7–9）、回放（Task 10–11，含 `run.ts --kind replay_consistency`）、管理只读 API（Task 13）、`dual_source`/`reference_regression`/`extraction_gold`/`judgment_calibration` 纯逻辑并在 `kinds/registry.ts` 登记为未启用（Task 14–15）。

偏差（均由集成决定，实施时以此为准）：
1. `--redact` 只扫 F6 自有路径（`src/lib/evals/fixtures/**`、`docs/evals/**`、`docs/audits/2026-11-06-evals-gold-sets/**`），不扫整个 `docs/audits/**`（§4.5、§7.3）：其他模块的审计文件原样引用 Codex 输出（邮箱、查询串），F6 不得改它们。
2. 发布清单的 `lock.json` 校验只对黄金集类证据（official、dual_source）；回放与对照报告按其夹具文件的提交字节认证（`manifest_fixture`），因为锁只收 `GoldFormat` 黄金集（§10 "共同规则"）。
3. `validate.ts` 退出码：0 通过、1 检查失败、2 用法错误（与 §3.2 一致：2 只表示运行前拒绝）。
4. `Summary.coverage` 增 `evaluated_optional`（§3.2 规则 3 需要它，gate 才能只凭摘要重算）。
5. `ProvenanceCheck` 增可选 `inputs`；facts 适配器把每个输入事实的来源链放在 `FactProvenance.input_chains`，官方对账写入 `CaseReport.detail.inputs`（§5.1.4）。
6. frozen 建库（`replay/setup.ts`）不写 `dq_freshness`：`runFactsSync` 总会记录 `facts.us`，固定时钟会给共享库留下陈旧行，所以同步依赖的 `tables` 丢弃对 `dq_freshness` 的写（`withoutFreshness`）。
7. `--http` 冒烟本期不建（`run.ts` 以 `kind_not_enabled` 拒绝），§5.3.2 的路由等价由 `route-equivalence.test.ts` 保证。
8. 回放 frozen 经 `run.ts` 运行需要 `S4_TEST_STATE`（内存世界的投影不保证与录制库字节一致）。
9. §3.2 规则 1 增：`coverage.evaluated = 0` → `incomplete`（全部 skipped 的总体不能 pass）；`reference_regression` 系统侧无值 → `missing`（覆盖率），只有样本侧无值才 `skipped(unavailable)`，`ReferenceResult` 因此多一个 `missing` 键（§5.4 键集合的偏差）。calibration 的总体只含 eligible 预测（Codex 计划第 1 轮 P1-1、P2-5）。
10. 黄金集头部新增必填 `review_required`；`facts/plan3*`（30 家）必须为 true，且每案 `reviewed_by ≠ recorded_by`（§4.6，P2-3）。
11. 发布清单新增 `evidence_commit`（= 或晚于 `release_commit`），证据用 `git show <evidence_commit>:<path>` 读、发布输入在 `release_commit` 读；CI 运行须属 origin 仓库，`--online` 再查 conclusion=success 与 head_sha，不带 `--online` 是阻断发现 `manifest_ci_unverified`（第 2 轮 R2-1）；新鲜度在 `prepared_at` 用 `computeFreshness` 重算；总体、阈值与 gold 块从已认证夹具经 `reduce.ts::reduceForKind` 重算（P1-2、P1-3、P1-4、P2-2）。
12. `evaluator_code_version`：检出内只信 `git rev-parse HEAD` 与 `git status --porcelain --untracked-files=normal`，忽略 `VERCEL_GIT_COMMIT_SHA`；`record-replay.ts` 拒绝脏树（P1-7）。官方对账的 `verified.{artifacts,sources}` 由实际完成的检查推出，缺失期望也校验来源字节（P1-8）。
13. frozen 建库在每次新建并迁移的隔离库里进行（`create database f6_frozen_…` + 迁移，建完即删；第 2 轮 R2-2 取代第 1 轮的 CIK 登记与同 setup 跳过检查）、每个案例的 setup 先重算再分组（P2-1、P1-6）；`--supersede` 必须是同一 `ObservedDiff` 的账本命中（P1-5）；审计处置按（轮次, 编号）匹配（P1-9）；CI 的 critical frozen 测试写出真实报告并在 job summary 公布 sha256（P1-10）。

复审轮次带来的追加偏差（实施期 Opus 复审与 Codex review/挑战，逐条见 `docs/audits/2026-11-06-evals-gold-sets/tasks/`）：
14. 回放账本 `parseLedger(raw, policy)`：`approved_by` 必须是覆盖该模块、且不在 `module_implementers` 里的 recorder（去空白、忽略大小写比较），`approval_ref` 必须是 GitHub PR（review）URL，`approved_at ≥ added_at`；编码代理永远不能批准账本（§5.3.3、D6 的强化）。
15. 非特权 live 回放命中账本 → `explained_diff`（§5.3.2 字面为 `unexplained_diff(no_hints)`）：命中仍要求含 anon 可读 `state_rev` 的完整元组；live 的 `state_rev` 取自投影本身的 `read_facts` 信封（`projectWithRev`），多读不一致重试一次后 `read_error`。
16. 双源的对登记归 F6 所有（`kinds/pairs.ts`，本期为空），`PairSource` 只供观测；证据类别只由 F6 登记的 `independence` 推出，绝不取自报告或上游（§5.5、R5-10 的强化）。
17. `reference_regression`：单位不一致直接 `beyond_unexplained(unit_mismatch)`；账本须 `our_run_id` 等于本次观测的非空 run_id；阈值固定 `REFERENCE_THRESHOLDS`；`ReferenceResult` 再增 `read_error` 键（逐案读取/解析失败保留为 read_error）。
18. `judgment_calibration` 在 F4 提供阈值前恒 `incomplete`（`thresholds_pending_f4`）；时间戳必须带时区。`extraction_gold`：任一声明文档缺失或不可解析（含无标注文档）→ 全部字段 `read_error`。
19. facts 适配器：公共读取器只经 filings 判定市场（`fact_sync_scope` 仅 service_role），特权读取器另用 scope；`cninfo_announcement` 挂接多份且无一匹配目标期间时报 `filing_ambiguous`；来源链按 `(rawHash, concept)` 选候选并自检 `rawHashOf(sha, locator)`。
20. 官方对账：特权运行在接受 `expected_absent` 前先查非可见行（隔离/旧代 → `not_visible`）；比较原语接受 ≤ 512 字符的十进制（与 `canonicalDecimal` 一致）。
21. `run.ts`：`--case/--limit` 子集运行即使带 `--write-db` 也不入库；基线 setup 不匹配产出全 `read_error(setup_mismatch)` 的报告（退出 3），不抛异常；`--resume` 也受 kind 注册表拦截。
22. 发布清单：`prepared_at` 须不早于所引用运行的 `finished_at`、不晚于校验时钟，且 `dq_freshness.last_ok_at` 晚于 `prepared_at` 时判为无法认证；回放槽位按夹具 `mode` 与 `module` 认证；审计报告里未被解析的 P1/P2 与空白处置一律阻断（fail closed）；专家核对缺数值或文件身份即计 `cannot_verify`。
23. 提交归属：Task 15 的首版文件因并行暂存被 Task 13 的修复提交 `b46e014` 一并提交，后续修复在 `142b2a8`；内容按计划原样。

未完成（owner 事项，§16）：生产特权 `report` 与其 `dq_eval_runs` 行、`facts.live.json` 录制与首次 live 运行、首份发布清单与专家记录、CODEOWNERS（D2）。

后续事项（不在本计划）：重建 `docs/audits/2026-11-04-data-foundation-2/index.json`（属计划二目录，Codex 计划第 1 轮 P2-4 延后）。
