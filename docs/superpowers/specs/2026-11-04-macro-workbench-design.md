# 宏观工作台（Macro Workbench）设计规格 · P1 + P2

日期：2026-11-04（第 1 稿）；2026-11-06 第 2 稿（对齐已落地的计划一/二与总纲，处置 Codex 增量审计 M1–M26，见 §0）
状态：第 6 稿（2026-11-06，计划三轮审计 `10-codex-plan-round3.md` P1-1…P2-4 回写，见 §0.2 末"第 6 稿"表，优先于第 5 稿表；第 5 稿：计划二轮审计 `08-codex-plan-round2.md` P1-1…P2-3，优先于第 4 稿表；第 4 稿：计划审计 `06-codex-plan-round1.md` P1-1…P2-4；第 3 稿：Codex 确认轮 `04-codex-spec-confirm.md` 的 partial 与 N1–N3），进入计划
前置研究：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`、同目录 `REPORT.md`、`SOURCE_MAP.csv`
总纲（硬约束）：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5
已定决策（owner 2026-11-04）：范围 P1 纵向闭环 + P2 关联与事件；中国宏观走 AKShare 采集脚本（只作适配器，记录上游）；美国走 FRED；面向所有登录用户开放。
上游契约：计划一 DQ 层（`src/lib/dq/*`、迁移 `20261105090000_dq_foundation.sql`）；计划二事实库的证据与无损数值模式（`src/lib/facts/snapshot-store.ts`、`json-numbers.ts`、`publish_sync_run`）；F4 判断层的 `MacroReadApi` / `RegimeResult` / `MacroSnapshotRow`（F4 规格 §11.1、§12.1，计划 `2026-11-06-judgment-framework.md` 共享契约）。

---

## 0. 第 2 稿处置（Codex 增量审计 `docs/audits/2026-11-06-macro-workbench/02-codex-spec-round.md`）

| id | 处置 | 落点 |
|---|---|---|
| M1 | 接受。AKShare 只允许"已核实直连官方主机"的函数；每条观测记录实际请求 URL / 主机、原发布机构、适配器函数与版本、证据哈希 | §4.2、§4.3、§4.4 |
| M2 | 接受。社融存量同比、MLF 从可执行目录移除，标 `missing`（理由写入目录） | §4.2 |
| M3 | 接受。人民币汇率只取一个口径：国家外汇管理局公布的人民币汇率中间价（USD/CNY，每 100 美元折人民币，原单位保留） | §4.2 |
| M4 | 接受。yfinance 移除；资产只收官方来源且权利已确认的序列，其余 `enabled:false` 待 owner 确认 | §4.2、§14 |
| M5 | 接受。FRED 观测的发布方记为"原机构 via FRED"；每个 FRED 序列标 `rights`；第三方版权序列默认不采集；ISM 保持缺失 | §4.2 |
| M6 | 接受。FRED 走公开 CSV（无 key）；`available_at` = 本系统首次取得该值的时间，`availability_basis='first_seen'`；不声称历史时点回放 | §4.1、§4.4 |
| M7 | 接受。原始字节按 SHA-256 路径不可变存证；观测带行/JSON 指针定位；证据上传失败阻断发布 | §4.3、§4.4 |
| M8 | 接受。全链路十进制字符串（`value_text`），复用 `canonicalDecimal` | §4.3、§4.4 |
| M9 | 接受。`ingest_batches.dataset` 用 `macro.*`；共用 `startBatch/finishBatch`、六个计数器、`quarantine()`、`recordAttempt` | §4.4、§11 |
| M10 | 接受。版本身份先定义（本地版本 = 同期新值的首次出现）；可修订序列出新版本；不可修订序列或同一证据内矛盾 → 共用隔离，旧值继续服务 | §4.4 |
| M11 | 接受。采集新鲜度用共用 `dq_freshness`；发布及时性按序列单独计算，不混用 | §4.5 |
| M12 | 接受。事实快照与判定解耦；判定卡只在 `MACRO_JUDGMENTS_ENABLED`（默认关）下按 F4 契约渲染 | §3、§5 |
| M13 | 接受。输出逐字采用 F4 的 `RegimeResult`（`margin_pp`、数值轴、`norm`、`catalog_version`、可空） | §5.3 |
| M14 | 接受。实现 F4 `MacroReadApi` 全部方法 | §5.4 |
| M15 | 接受。原生频率与派生月度分离 ID；每序列定义期间、调整、单位与月度取值规则 | §4.2 |
| M16 | 接受。发布走 service-only RPC（区域锁 + 修订号 + 清单校验，一个事务） | §4.3、§4.4 |
| M17 | 接受。美国政策事件从官方目标区间序列（DFEDTARU/DFEDTARL）的变化派生，标 `derived` 与生效日；FOMC 日程单独存 | §6.1 |
| M18 | 接受。分析运行冻结全部输入（观测 id、十进制值哈希、截止时点、参数、代码版本），只追加 | §7 |
| M19 | 接受。默认变化/收益口径；水平口径标"探索性"、不给强度词；定义滞后方向 | §7 |
| M20 | 接受。三种模式各自样本门槛；周期分段规则确定化 | §6.2、§7 |
| M21 | 接受。Today 卡去掉全部 mock 行，只显示宏观事实与缺失 | §3.5 |
| M22 | 接受。不扩展 `usage_events` 的 feature 枚举；用宏观自有的原子计数 RPC | §2、§8 |
| M23 | 接受。每个 API 路由自行鉴权；表层 anon 只读公开事实（供 F4） | §2、§8 |
| M24 | 接受。去掉种子 run 与异步重算；"热门分析"改为预填表单；cron 登记进 `vercel.json`；`preview=1` 零写入 | §3.4、§4.4 |
| M25 | 接受。迁移 `20261114090000_macro_workbench.sql`；锁文件；`criticalSuites`；桶只经 `storage.buckets` | §4.3、§12 |
| M26 | 接受。`region=all` 返回分区域信封；验收改为"已核实或明确缺失" | §8、§14 |

数据底座规格 §5.1 第 278 行的 `dataset='macro'` 同步改为 `macro.*`。

### 0.2 第 3 稿处置（Codex 确认轮 `docs/audits/2026-11-06-macro-workbench/04-codex-spec-confirm.md`）

| id | 处置（正文已同步） |
|---|---|
| M6 | 派生观测 `available_at` = 其**全部**输入版本 `available_at` 的最大值；派生在输入写入的同一批次内完成（§4.4） |
| M7 | 快照清单包含判定与"本期变化"用到的全部观测：每个指标的最新期、上一可比期、3 个月前期（§5.3）；派生行 `transform` 记 `<kind>@<version>` 与参数 |
| M8 | 同比 = `(cur/prev − 1) × 100`，十进制运算，四舍五入（half-even）到 4 位小数后 canonical；`value` 由 RPC 从 `value_text` 计算，不接受调用方传 `value`；规则检查在 `quality.ts` 内把 `value_text` 转有限数（三个转换点之一，另两个是 `regime.ts` 输入与 `correlation.ts`：相关分析本质上是浮点运算，变化量先按十进制精确算出，每个值只转换一次；计划集成轮补记） |
| M9 | P1 不写 `dq_reconciliations`（没有第二来源；AKShare 交叉核对走隔离 `adapter_mismatch`）；`recordAttempt({ok: status !== 'failed'})`；每个 dataset 只有一个写者（`macro.fred` 只由 cron 写，`macro.akshare` 只由 ingest finish 写），ingest `start` 在已有未结束且 < 2 小时的 `macro.akshare` 批次时拒绝（409） |
| M10 | 隔离裁决经 RPC `macro_resolve_conflict(quarantine_id, decision, resolved_by)` 原子完成：接受 → 被隔离行转 `ok`（版本号更高者即最新）、`dq_quarantine` 置 `resolved_accept`、写 `research_audit_log`、`input_revision+1`；拒绝 → 只置 `resolved_reject` + 审计。已发布快照不改，下次发布反映。**迟到交付**：新行的 `available_at` 早于当前最新版本的 `available_at` 且值不同 → 不分配新的最新版本，隔离 `stale_delivery` |
| M11 | 及时性按"下一期"判断：下一期 = 最新期 + 1 个周期；截止 = 下一期期末 + `releaseLagDays` + 3 天；今天 > 截止 → `late`；`event` 频率或无 `releaseLagDays` → `n/a` |
| M14 | 判定权重属于方法：`regime.ts` 的 `WEIGHTS_V1`（id → 权重）在 `v1.0` 内冻结，覆盖率分母固定；目录的 `weight` 字段必须与之相等（测试）。目录每个版本追加进 `macro_catalog_versions`（只追加），快照引用其 `catalog_version` |
| M15 | 每个目录项写明 `adjustment`；日频原生 ID 权重 0、不进判定；CN GDP 取"当季"国内生产总值指数（非累计），夹具核实 |
| M16 | `macro_publish_state` 加 `input_revision`：`macro_write_observations` 与 `macro_resolve_conflict` 在改动某区域序列时 `+1`（行锁）；发布同时校验 `p_expected_revision` 与 `p_expected_input_revision`，不符 → `stale_publisher` |
| M22 | 分析请求带客户端生成的 `request_id`（uuid）；`unique(user_id, request_id)`；重试返回已有运行，不重复计额 |
| M24 | ingest 三段协议：`start`（返回 `batch_id`）→ `chunk`（`batch_id, seq, total`，按 `(batch_id, seq)` 幂等，记入 `macro_ingest_chunks`）→ `finish`（校验 0..total−1 全到，汇总计数，`finishBatch`，派生，发布 CN）。cron 只发布 US；CN 只在 `finish` 后发布 |
| N1 | `create_macro_analysis_run` 只授 service_role；路由用已验证 session 的 user id 作 `p_user_id`，服务端计算结果后写入 |
| N2 | 证据拆为 `macro_evidence_objects`（按 SHA 去重的字节对象）与 `macro_retrievals`（每次取得一条回执：URL、主机、状态、`fetched_at`、批次、工具版本）；观测引用 `retrieval_id`，`available_at` = 该回执 `fetched_at` |
| N3 | CN 派生在 ingest `finish` 内、发布前执行；发布清单只含已完成批次的输入与其派生 |

#### 第 4 稿（计划审计回写，`docs/audits/2026-11-06-macro-workbench/06-codex-plan-round1.md`）

规格是 SQL 语义的唯一来源；下表覆盖正文与上表中与之冲突的旧表述，计划 `2026-11-06-macro-workbench.md` 的共享契约逐条落实。

| id | 处置（SQL 语义） |
|---|---|
| P1-1 | 计划测试类型错误修正（不改语义）；严格 typecheck 门禁保留 |
| P1-2 | 测试种子只写原生输入，派生经真实派生路径（`deriveAndWrite`）产生；派生行的出处 = 其祖先原生观测的 retrieval |
| P1-3 | 发布及时性与数据有无是两个字段：概览行 `presence: present|missing`；无 `releaseLagDays` 的序列无数据时及时性仍为 `n/a` |
| P1-4 | 新表 `macro_quarantine_members(quarantine_id, observation_id)`（主键二者，只追加）；写入 RPC 的 conflict 带被隔离行的 `observation_id`，`quarantine()` 之后立即经 `macro_link_quarantine(p_quarantine_id, p_observation_ids)` 绑定（条目须 open、成员须为该 natural_key 的 quarantined/rejected 行）。观测状态加 `rejected`（只允许 `quarantined → ok | rejected`）。`macro_resolve_conflict(p_quarantine_id, p_decision, p_resolved_by, p_observation_id default null)`：accept 必须指定一个当前 `quarantined` 的成员 → `ok`、`input_revision+1`，该条目其余成员 → `rejected`；reject → 全部成员 `rejected`；`adapter_mismatch`、`rule_failed:%` 只能拒绝（SQL 抛 `reject_only`）；rejected 永不复活、永不合格，同值再交付不再插入 |
| P1-5 | **发布资格** = 观测 `ok` + 批次 `ingest_batches.status in ('success','partial')` + 派生行全部祖先递归合格（`macro_ineligible_ids`）。`publish_macro_snapshot` 在事务内校验清单与历史；发布路径只读 `macro_latest_eligible_observations` / `macro_eligible_history`（service-only）；批次内写入与派生可用本批次行（`p_include_batch`）；写入规则的 `cur` 只取合格或本批次的行，派生输入须合格或同批次（否则 `missing_input`） |
| P1-6 | 新表 `macro_ingest_runs(batch_id pk, dataset, state open|finishing|finished, finish_progress, …)`，部分唯一索引 `(dataset) where state <> 'finished'` = 单写者租约；`macro_claim_ingest(p_batch_id, p_dataset, p_max_age)`（先弃置超时 run，被占 → busy，调用方把自己的批次记 `rejected` 并回 409）；`macro_ingest_chunks` 加 `state/errors/claim_keys/located_keys`，`macro_claim_chunk` 认领（重复返回存储行，不再处理）、`macro_complete_chunk` 完成；取代 `macro_record_chunk` |
| P1-7 | 派生每次按输入的完整合格历史重算（分页读取），旧期修订传到该期与同比的 +12 期 |
| P1-8 / P2-3 | `macro_snapshots.history_ids uuid[]`：每指标截至最新期的最后 24 个合格观测（迷你图），发布时与清单同样校验；概览一次读取 `observation_ids ∪ history_ids`（加上一快照清单），祖先逐级批量解析，无逐指标历史查询；p95 < 300 ms 在验收中实测 |
| P1-9 | 概览 / 详情行带 `observation_id`，证据抽屉按它选中确切版本 |
| P1-10 | 分析路由无可验证代码版本 → 503 `code_version_unavailable`，不计算不落库 |
| P1-11 | 回滚 = service-only `republish_macro_snapshot(p_snapshot_id, p_expected_revision, p_expected_input_revision)`：重校验资格后插入复制旧快照的**新** active 快照（新修订号），历史行不改 |
| P2-1 | 块错误与 claim/定位键持久化；finish 按整批去重的 `⋃claim_keys − ⋃located_keys` 写一条 `skipped_summary/unlocated_claims`，连同全部块错误交 `finishBatch` |
| P2-2 | finish 带 `series_outcomes:[{series_id, ok, code?}]`；失败序列计 `failed` 并写错误 `{code, key: series_id}`，进入 `recordAttempt` 的 detail（`failed_series`） |
| P2-4 | finish 可续：`finish_progress` 记录 `derived`、`batch_finished`、`freshness_recorded`、`published`、`receipt`；重试跳过已完成步骤，已结束返回存储回执；批次已结束但 run 仍在 finishing 时接受 finish |

#### 第 5 稿（计划二轮回写，`docs/audits/2026-11-06-macro-workbench/08-codex-plan-round2.md`）

一个统一机制处置并发与重试类缺陷：**每个 ingest 变更都由 run 的所有者令牌栅栏保护，接管在同一事务里作废旧所有者；finish 由所有者独占，按 `(batch_id, step)` 检查点幂等。** 下表覆盖第 4 稿表与正文中与之冲突的表述；计划 `2026-11-06-macro-workbench.md` 共享契约"ingest 租约、所有者令牌、分块与独占可续完成"逐条落实。

| id | 处置（SQL 语义） |
|---|---|
| P1-1 | `eligibleHistory` 分页循环 `const part:ObservationRow[]` 显式注解（`after` 由 `part` 赋值，推断会循环，TS7022）；同一助手内其余变量均已显式注解 |
| P1-2 | **拒绝值终局**：写入 RPC 与内存实现在选择任何动作之前，若同 `(series_id, period_end)` 已有 `value` 相等的 `rejected` 行 → 不插入，计 `duplicates`，conflict `previously_rejected`（新增 `WriteConflictReason`；`observation_id` = 该 rejected 行；信息性，不建隔离条目、不计错误）。"4.1 ok → 4.2 被拒 → 更新的 4.2 再交付"保持被拒 |
| P1-3 | `macro_ingest_runs` 加 `owner_token uuid not null`、`processing_timeout interval not null default '10 minutes'`、`finish_token uuid`，状态加 `aborted`（终态）；部分唯一索引改为 `state in ('open','finishing')`。`macro_claim_ingest(p_batch_id, p_dataset, p_max_age, p_processing_timeout, p_takeover)` 返回新令牌；在 dataset 锁下的同一事务里把超过 `p_max_age`（2 h）的 live run，以及 `p_takeover` 时有一块 `processing` 超过该 run 自身 `processing_timeout` 的 live run 置 `aborted`（progress `{aborted:{by, reason}}`），再判 busy / 插入；返回该 dataset 所有批次仍 running 的 aborted run，调用方以 `failed` 结束它们（只忽略 `batch_not_running`，下次 start 再列出，自愈）。`macro_assert_owner(p_batch_id, p_owner_token, p_states)` 在 run 行 `for update` 下校验：无 run 行时令牌必须为空（FRED cron：单写者由 Vercel cron 保证），有 run 行时令牌相符且状态允许，否则 `fenced`。所有 AKShare 路径变更 RPC 带 `p_owner_token`：`macro_put_retrieval`、`macro_write_observations`、`macro_link_quarantine`（另带 `p_batch_id`）、`macro_claim_chunk`、`macro_complete_chunk`、`macro_begin_finish`、`macro_record_finish_step`、`publish_macro_snapshot`（finish 调用时，另带 `p_batch_id`）。锁序恒为 run 行 → 区域 / 隔离行 |
| P1-4 | **独占 finish**：`macro_begin_finish(p_batch_id, p_total, p_owner_token)` 只对令牌所有者开放（其他令牌 → `fenced`）；`open → finishing` 与同一所有者的重试（续做）都生成新 `finish_token`，`macro_record_finish_step(…, p_owner_token, p_finish_token)` 只接受当前令牌，所以并发的较早 finish 在下一步被 `fenced`。步骤幂等：派生本质幂等；`finishBatch` 遇 `batch_not_running` 读回状态；新鲜度先记 `freshness_started` 再 `recordAttempt` 再记 `freshness_recorded`，重试只见 `freshness_started` → 跳过（`recordAttempt` 读后 upsert 不幂等，宁可丢一次记录不重复计错误）；`publish_macro_snapshot` 加 `p_publish_key`（ingest `'ingest:'||batch_id`，cron `'cron:'||batch_id`），`macro_snapshots.publish_key` 部分唯一，已发布的键在区域锁下、修订号检查之前直接返回原快照（`replayed:true`），崩溃于发布之后、检查点之前的重试安全 |
| P1-5 | `published` 检查点只在发布成功（含回放）或有意的终局跳过（批次 `failed`、`no_native_outcomes`）之后写；可重试的失败（再试一次后仍 `stale_publisher`、瞬时 rpc 错误等非 published 回执）→ `publish_attempt` 追加诊断到 `finish_progress.attempts`（≤ 20），run 保持 `finishing`，路由回 503 `publish_pending`，采集器以同一令牌重试 finish |
| P1-6 | 写入时同值隔离行只在其批次合格（success/partial）或为本次批次时复用；失败 / 被拒 / 其他运行中批次留下的同值隔离行不复用，插入属于本次 retrieval 与批次的新隔离版本并链接它。`macro_resolve_conflict` 接受时，成员批次为 `failed`/`rejected` → `member_ineligible`（永不合格的行不得接受） |
| P2-1 | 崩溃块的恢复路径：`chunk_in_progress` 重试用尽或任一 `fenced` → 采集器整次重来：`start {takeover:true}`（旧 run 停滞未满 10 分钟时 409，轮询），新批次新令牌重送全部结果，从不补发旧批次的部分块；旧批次 `failed`，其行永不合格；新批次的同值重交付不是旧行的 duplicate。函数 `maxDuration`（300 s）< `processing_timeout`（600 s） |
| P2-2 | 块计数只含原生结果，派生计数在 `finish_progress.derived`，回执分列 `native_counts` / `derived_counts`。本次采集没有任何原生 inserted/versioned/duplicates → 跳过派生与发布，追加非 INFO 错误 `no_native_outcomes`（于是批次 `failed`；只有隔离行落地时共用 DQ 规则给 `partial`——`src/lib/dq/batches.ts` 不改），`recordAttempt({ok:false})`。cron（FRED）同一规则 |
| P2-3 | `macro_link_quarantine` 对 `dq_quarantine` 行 `for update`（与裁决同一把锁），非 open → `quarantine_closed`（契约码）；Task 6 再 `quarantine()` 一次（旧条目已关闭，于是新建 open 条目）并重试链接一次；仍失败、或有存储行的冲突无法建条目 → 整块失败（不 `completeChunk`，cron 批次 `failed`），绝不留下未绑定的被隔离行 |

#### 第 6 稿（计划三轮回写，`docs/audits/2026-11-06-macro-workbench/10-codex-plan-round3.md`）

原则：**栅栏挡的是副作用本身，不只是它的检查点。** finish 的两个不可重放副作用（批次结束、新鲜度）改由宏观自有 RPC 在 run 行锁下、与令牌校验同事务完成；`src/lib/dq/*` 不改，只被调用。下表覆盖第 5 稿表与正文中与之冲突的表述；计划 `2026-11-06-macro-workbench.md` 共享契约逐条落实。

| id | 处置（SQL 语义） |
|---|---|
| P1-1（含二轮 P1-3 partial） | `macro_record_freshness(p_batch_id, p_owner_token, p_finish_token, p_dataset, p_ok, p_cadence, p_now, p_detail)`：run 行 `for update`，**先**比所有者与 finish 令牌（不符或 `aborted` 一律 `fenced`，先于任何终态错误），再判 `finishing` 与 `p_dataset = run.dataset`；已有 `freshness_recorded` → 原样返回；否则在 `dq_freshness:<dataset>` advisory 锁下按 `recordAttempt` / `computeFreshness` 同一语义 upsert（`consecutive_errors`、`last_ok_at`、daily 1+2 天等窗口与宽限、`event`），并在同一事务写 `freshness_recorded {ok, status}`。集成测试逐例比对 SQL 状态与 `computeFreshness`。第 5 稿的 `freshness_started` 跳过逻辑删除，`macro_record_finish_step` 不再接受两个新鲜度步骤，且同样先比令牌（持旧令牌在 run 结束后仍得 `fenced`）。`macro_finalize_batch(p_batch_id, p_owner_token, p_finish_token, p_status, p_counts, p_errors, p_finished_at)`：run 行锁下校验令牌（cron 无 run 行，令牌必须为空），只在 `ingest_batches.status='running'` 时写 status/counts/errors/finished_at（≥ started_at，列语义同 `finishBatch`），否则返回存储状态 `finalized:false`；状态由 TS `batchStatusFromCounts` 算出传入，错误在 TS 按 `finishBatch` 同样上限截断。AKShare finish 与 cron 都用它代替 `finishBatch`。屏障测试：A 暂停、B 接手 finish 并完成、下一次采集写入新鲜度后，A 的 finalize / 新鲜度 / 步骤调用全部 `fenced`，`ingest_batches` 与 `dq_freshness` 不变。`quarantine()` 仍是共用助手：被栅栏挡下的 worker 可能留下无成员的 open 条目，无害（链接被栅栏挡住） |
| P1-2 | `macro_regime_results` 只授 service_role（anon/authenticated 无 SELECT；权限测试）。`MacroDb.regimeOf` 走 admin；`MacroReadApi`（`macroReadApi(db, {judgments})`，默认 `MACRO_JUDGMENTS_ENABLED === '1'`）关闭时 `regime` 恒为 null 且不读该表；路由只在服务端、开关打开时返回判定。**F4 接口说明**：F4 为宏观快照构建输入的 anon 路径必须改用服务端 `MacroReadApi`，不得 anon 直读宏观表 |
| P2-1 | 块与批次另记 `native_usable` = 原生行的 inserted + versioned + duplicates，**不含** `previously_rejected`（RPC 把被拒重交付计在 duplicates 里），与六个 DQ 计数分开（`macro_ingest_chunks.native_usable`，`macro_complete_chunk` 校验 `0 ≤ native_usable ≤ inserted+versioned+duplicates`）。派生、发布与新鲜度 `ok` 按 `Σ native_usable > 0` 判定（ingest 与 cron）；只有被拒值重交付的一次采集：不派生、不发布、`no_native_outcomes`、新鲜度 `ok:false` |
| P2-2 | 发布键回放时 `publishRegion` 读回返回的快照与存储的判定行（admin），回执的 `observation_count`、`regime`、`uncovered_weight` 取自持久化字段，而非本次重建的输入 |
| P2-3 | `macro_link_quarantine` 遇到已关闭条目时在同一把行锁下检查确切成员：给定的行都已是本条目成员且现为 `ok` / `rejected`（本条目的裁决已处置它）→ 链接完成，返回 0；仍是 `quarantined` → `quarantine_closed`，Task 6 新建条目重绑。覆盖并发接受与并发拒绝 |
| P2-4 | cron 的致命中止（派生期 `quarantine_link_failed` 等）经 `macro_finalize_batch` 以显式 `failed` 与实际计数结束批次（不再因已写原生行变成 `partial`）；测试：原生写入后派生链接失败 → 批次 `failed`，其行不进入合格读取 |

---

## 1. 目标与非目标

### 1.1 目标

把 ChaosAI 宏观策略页最有价值的阅读路径——**驱动指标 → 指标周期与事件 → 指标与资产的统计关系**，以及（判断层启用后）**状态判定 → 判定依据**——在 OsbornAlpha 的设计语言和已落地的数据底座上独立实现，修正对方的四类缺陷：规则类型错配、文案与数值脱节、新鲜度名不副实、来源不可复现。

成功标准：

1. `/intel/macro` 展示美国、中国两套指标目录；每个目录项要么是**已核实**的官方来源观测（带数据期、可得时间及其依据、发布机构、实际取数主机、证据哈希与定位、新鲜度），要么明确显示**缺失**及理由。
2. 每个展示的数字可从存证原始字节离线重放得到（`replay` 测试）。
3. 指标详情页有历史序列、周期分段、派生事件标记、周期内（权利已确认的）资产区间变化，全部有表格视图。
4. 关联工作台对"指标 × 资产"做变化 / 水平（探索性）/ 滚动 / 事件窗口四种分析，结果冻结输入、只追加、可复算。
5. Today 页 `MacroGlance` 不再读 mock。
6. 采集失败时页面显示最后一次已发布快照并标出采集状态，永不显示 0 或合成数据。
7. 判定（`macro_regime`）作为 F4 判断：宏观侧计算并发布 `RegimeResult`、实现 `MacroReadApi`；页面判定卡在 `MACRO_JUDGMENTS_ENABLED`（默认关）下按 F4 卡片契约渲染。

### 1.2 本规格之外

- **P3**（传导链情景图、剧本热力图、FOMC 周期资产表）与 **P4**（LLM 解读、偏差案例库、月度复盘）另立规格。
- F4 判断表、登记、结算、校准由 F4 实现；本规格只交付宏观侧接口与卡片挂载点。
- 不做：把象限配置模板接到用户组合或交易；把归一化得分称为"概率"或"置信度"；导入对方站点的数据或事件标签。

---

## 2. 用户与权限

- 页面：所有登录用户（任何 plan）可读；`/intel/macro/*` 在 `(app)` 布局内，受现有 session 门禁。
- API：`src/middleware.ts` 不拦 `/api/*`，所以每个 `/api/macro/*` 路由自行鉴权：读路由要求登录 session（`createServerClient` 取 user，无则 401）；分析路由同样要求 session 并只读写本人行；`POST /api/macro/ingest` 只认 `MACRO_INGEST_SECRET`（Bearer，常量时间比较，缺省即拒）；`/api/cron/macro-sync` 用 `authorizedCronRequest`（`src/lib/observability/cron-auth.ts`）。
- 数据库层：`macro_series`、`macro_observations`（`status='ok'`）、`macro_snapshots` 是公开参考数据，anon + authenticated 只读；`macro_regime_results` 只授 service_role（第 6 稿 P1-2，覆盖第 1 稿"公开参考数据"与"F4 输入构造器走 anon 客户端"：F4 为宏观快照构建输入时改用服务端 `MacroReadApi`，见 §0.2 第 6 稿表）；`macro_evidence_objects` 与 `macro_retrievals` 元数据 anon 只读（不含字节；字节在私有桶，服务端代取）；隔离行、批次、隔离队列只 service / admin。
- 分析配额：`create_macro_analysis_run` RPC（security definer，只授 service_role，路由传已验证的 user id）内按用户加事务级咨询锁、数过去 24 小时本人运行数，超过 plan 限额（free 10 / pro 100 / admin 不限，从 `profiles` 读 plan 与 role）则拒绝；计算失败的运行不计数（行写为 `failed` 不占额度由 RPC 规则决定：只数 `status='ok'`）。不改 `usage_events` 及其 RPC。

---

## 3. 信息架构与 UI

### 3.1 路由

| 路由 | 说明 |
|---|---|
| `/intel` | 新增"宏观"摘要卡（US/CN 各 3 个关键指标 + 采集状态）与"进入工作台"链接 |
| `/intel/macro` | 工作台：地区切换（US / CN），页内 tab：概览 · 指标 · 关联 · 方法与来源 |
| `/intel/macro/[seriesId]` | 指标详情页 |
| `/intel/macro/analyses/[runId]` | 本人保存的关联分析结果页 |

`TabBar` 的 `intel` navKey 对 `/intel/macro/*` 高亮（实施时核对 `startsWith`）。

### 3.2 概览（默认：判断层关闭）

```
┌ 宏观工作台                 US ◉ CN ○     快照 2026-11-03 · 采集 03:12 · ● 正常 ┐
├ 概览 | 指标 | 关联 | 方法与来源                                                  ┤
│ ┌ 本期变化 ─────────────────────────┐ ┌ 目录覆盖 ─────────────────────────┐    │
│ │ 新发布 3 · 修订 1 · 迟发 1 · 缺失 2 │ │ 已核实 6 / 目录 8（缺失：ISM、VIX）│    │
│ │ CPI 同比 2.9（+0.3pp）2026-09      │ │ 采集：FRED ● 正常                  │    │
│ └───────────────────────────────────┘ └───────────────────────────────────┘    │
│ ┌ 指标表: 名称 | 值 | 变化(类型化) | 数据期 | 可得时间 | 状态 | 迷你走势 ───────┐ │
│ │  行选中 → IndicatorDetail 预览（历史 + 周期色带 + 事件）                      │ │
│ └ 来源条: BLS via FRED · Fed via FRED · 国家统计局 · 中债 · 外汇局 ▸ 证据抽屉 ─┘ │
│ ┌ 判定（MACRO_JUDGMENTS_ENABLED 时才出现，F4 卡片契约）────────────────────────┐ │
```

- 判断层关闭时，页面上**不出现**象限、得分、margin、"覆盖率"等判定字样；"目录覆盖"是事实（几个目录项已核实），用计数不用百分比。
- 判断层开启时，在指标表上方挂 `MacroJudgmentSlot`：读 `GET /api/judgments?subject_type=macro_region&subject_key=<region>`（F4），按 F4 `JudgmentCard` 渲染：主判定类别、生命周期与校准状态、方法版本、输入快照入口；没有 `percent` 字段就不显示任何百分比；F4 接口不可用 → 卡片显示"判断层暂不可用"，不回退到宏观自算数字。贡献明细表（逐指标规则命中）作为卡片的"依据"展开，数据来自 `macro_regime_results.contributions`。
- `DESIGN.md` 约束：无紫色、无渐变文字、无发光、圆角 ≤ 6px、数字 Geist Mono、密度层 `[data-density="data"]`；宏观指标"上升"不着红绿，只用中性箭头 + 文字；资产区间变化才用 `data-color-scheme` 涨跌色。
- 证据抽屉（SourceDrawer）：发布机构、"via"转发方、实际取数 URL 与主机、取得时间、证据 SHA-256、行号 / JSON 指针、变换与方法版本、适配器（AKShare 函数 + 版本 / FRED CSV）、权利标注。

### 3.3 指标详情页

顺序：**当前值 → 与上一可比期的变化（类型化口径）→ 数据期 → 可得时间及依据 → 走势（周期色带 + 事件标记）→ 周期内资产区间变化 → 计算口径 → 来源、证据与修订历史**。

- 走势图：`lightweight-charts` LineSeries；周期背景区间色（上行/加息 = `--warn` 低透明，下行/降息 = `--accent-wash`），派生事件用 marker（形状区分 `derived` 与 `calendar`）。
- 窗口：3Y / 5Y / 10Y / 全部；变换：原值 / 同比（仅序列声明了 `yoy` 派生时）/ 环比差。
- 每张图有"表格视图"开关；表格列含 `period_end`、`value_text`、`available_at`、`version`。

### 3.4 关联工作台

表单：指标（`role=indicator`，已核实）× 资产（`role=asset`，`enabled` 且权利已确认）× 模式（变化〔默认〕/ 水平〔探索性〕/ 滚动 / 事件窗口）× 窗口 × 滞后 k（−12…+12 月，定义见 §7）。提交创建只追加的 `macro_analysis_runs` 行。

- 变化 / 水平：双轴折线 + 散点拟合（内联 SVG）+ `r, R², n, 样本区间, 变换, 滞后, 方法版本` + 规则生成的一句统计事实；水平口径标"探索性：趋势序列的水平相关不代表关系"，不输出强度词。
- 滚动：36 个月滚动 r 折线 + 每窗口有效对数。
- 事件窗口：以派生政策事件为锚，事件前后 ±N 月资产变化分布（中位数、四分位、独立完整事件数、逐事件表）。
- "热门分析"是 8 组**预填表单**（不预存运行，不自动重算）。

### 3.5 Today 页

`MacroGlance` 改为读 `GET /api/macro/overview?region=all&compact=1`：US / CN 各 2–3 个关键指标（值、变化、数据期、状态点），缺失显示"缺失"；底部"进入工作台"。原 SSE / HSI / Nasdaq / DXY / US10Y 的 mock 行全部删除（US10Y 由宏观目录 `US_DGS10` 提供；其余三项无已确认权利的官方来源，不显示）。判定行只在判断层开启时出现。

### 3.6 移动端

本期变化 → 指标表（"名称 + 值 + 变化"三列，点进详情页）→ 来源条；关联表单纵向堆叠；< 640px 散点图改表格。

### 3.7 设计稿

Claude Design 画布（§16）是视觉依据；第 2 稿把判定卡移到默认关闭的槽位、增加"目录覆盖"与证据抽屉字段，实施前在同一画布补"判断层关闭"概览与证据抽屉画板。冲突时以 `DESIGN.md` 为准。

---

## 4. 数据架构

### 4.1 时间、版本与可得性

每条观测：`period_end`（数据期，按序列定义，§4.2）、`available_at`（可得时间）、`availability_basis`、`ingested_at`、`version`（同一 `(series_id, period_end)` 内从 1 递增）。

- `availability_basis='first_seen'`：本系统首次在官方来源响应中见到这个值的时间（= 该证据的 `fetched_at`）。FRED 公开 CSV 与 AKShare 都没有历史发布时点，所以**首次回填的全部历史**的 `available_at` 都是回填当天。这意味着：回放（`available_at ≤ asOf`）只对系统开始采集之后的日期有意义；页面在"方法与来源"写明。不回填到数据期，不声称历史时点。
- 将来有 ALFRED（需 `FRED_API_KEY`）时可加 `availability_basis='alfred_realtime_start'`，属后续工作。
- 版本：同一 `(series_id, period_end)` 首次出现 → `version=1`；以后某次取数在官方响应中出现不同的值（十进制比较）→ 按序列 `revisionPolicy` 处理（§4.4）。版本号是本地身份，不称为 FRED vintage。

### 4.2 序列目录（代码即配置）

`src/lib/macro/catalog.ts` 导出 `MACRO_CATALOG: readonly MacroSeriesDef[]` 与 `CATALOG_VERSION`（目录内容的规范化 JSON 的 SHA-256 前 12 位，带前缀 `macro-catalog/`）；迁移不写目录内容，`macro-sync` 每次运行先 `upsert` 目录到 `macro_series`（只读镜像，带 `catalog_version`）。

```ts
type SeriesType = 'policy_rate' | 'bond_yield' | 'fx' | 'inflation_yoy' | 'pmi' | 'labor_rate'
  | 'growth_yoy' | 'liquidity_yoy' | 'risk_index' | 'asset_price';
interface MacroSeriesDef {
  id: string;                         // 'US_CPI_YOY'、'CN_PMI_MFG'、'US_WTI_M'
  region: 'US' | 'CN';
  role: 'indicator' | 'asset';
  type: SeriesType;
  name: { zh: string; en: string };
  unit: string;                       // 原单位：'pct'、'index'、'index_prev_year_100'、'cny_per_100usd'、'usd_per_bbl'
  nativeFrequency: 'daily' | 'monthly' | 'quarterly' | 'event';
  period: 'day' | 'month' | 'quarter';            // period_end = 当日 / 当月最后一天 / 当季最后一天
  adjustment: 'sa' | 'nsa' | 'na';
  status: 'active' | 'missing' | 'restricted';     // missing/restricted 有 reason
  reason?: { zh: string; en: string };
  source: {
    adapter: 'fred_csv' | 'akshare';
    fetchHost: string;                // 实际请求主机：'fred.stlouisfed.org'、'data.stats.gov.cn'、'yield.chinabond.com.cn'、'www.safe.gov.cn'
    publisher: { zh: string; en: string };        // 原发布机构：BLS、国家统计局、中央国债登记结算公司、国家外汇管理局…
    via?: { zh: string; en: string };             // 转发方：'FRED（圣路易斯联储）'；NBS 转载 PBoC/海关数据时 publisher=原机构、via=国家统计局
    seriesKey: string;                // FRED code / AKShare 函数 + 参数（如 macro_china_nbs_nation|月度数据|采购经理指数 > 制造业采购经理指数|制造业采购经理指数(%)）
    rights: 'public_domain' | 'official_open' | 'third_party';    // third_party 默认 restricted
    attribution: { zh: string; en: string };
  };
  derive?: { kind: 'yoy_from_index'; from: string } | { kind: 'index_minus_100'; from: string } | { kind: 'month_end'; from: string };
  revisionPolicy: 'revisable' | 'immutable';
  weight: number;                     // 判定权重（仅 judgment 用）；asset 为 0
  changeKind: 'bp' | 'pp' | 'pct' | 'points';
  releaseLagDays?: number;            // 发布及时性（§4.5）：期末后预期发布天数
  definitionVersion: number;
}
```

规则：
- 原生频率与派生月度是不同 ID：日频 `US_DGS10_D`（原值，存证）→ 派生 `US_DGS10`（月末最后一个有效交易日的值，`derive.month_end`）。派生观测记录输入观测 id，不单独存证（证据是输入的证据）。
- `index_minus_100`：国家统计局"上年同月=100"指数减 100 得同比（pp），是精确的十进制变换，原值与派生值都保存。
- 当月未结束不产生月末派生值；季度序列不前向填充到月度。

首期目录（`status` 列：A = active，M = missing，R = restricted；A 项在实施时以录制夹具核实，核实失败改 M 并写理由）：

| id | type | 适配器 / 主机 / seriesKey | 发布机构（via） | 频率 | weight | 状态 |
|---|---|---|---|---|---|---|
| US_FEDFUNDS_EFF_D → US_DFF | policy_rate | fred_csv / DFF | Fed（via FRED） | daily→月末 | 25 | A |
| US_FED_TARGET_UPPER_D / _LOWER_D | （事件源，weight 0） | fred_csv / DFEDTARU、DFEDTARL | Fed（via FRED） | daily | 0 | A |
| US_DGS10_D → US_DGS10 | bond_yield | fred_csv / DGS10 | U.S. Treasury（via FRED） | daily→月末 | 15 | A |
| US_DTWEXBGS_D → US_DTWEXBGS | fx | fred_csv / DTWEXBGS | Fed（via FRED） | daily→月末 | 10 | A |
| US_CPI_INDEX → US_CPI_YOY | inflation_yoy | fred_csv / CPIAUCSL（`yoy_from_index`） | BLS（via FRED） | monthly | 15 | A |
| US_UNRATE | labor_rate | fred_csv / UNRATE | BLS（via FRED） | monthly | 10 | A |
| US_PPI_FD_INDEX → US_PPI_FD_YOY | inflation_yoy | fred_csv / PPIFIS（`yoy_from_index`） | BLS（via FRED） | monthly | 5 | A |
| US_ISM_PMI | pmi | — | ISM | monthly | 15 | M（FRED 已于 2016 移除 ISM；无可采的原始来源与权利） |
| US_VIX | risk_index | fred_csv / VIXCLS | Cboe（via FRED） | daily→月末 | 5 | R（第三方版权，待 owner 确认权利） |
| CN_CPI_INDEX → CN_CPI_YOY | inflation_yoy | akshare / data.stats.gov.cn / `macro_china_nbs_nation` 月度 价格指数 > 居民消费价格分类指数（上年同月=100）> 居民消费价格指数 | 国家统计局 | monthly | 10 | A |
| CN_PPI_INDEX → CN_PPI_YOY | inflation_yoy | 同上 · 工业生产者出厂价格分类指数（上年同月=100） | 国家统计局 | monthly | 15 | A |
| CN_PMI_MFG | pmi | 同上 · 采购经理指数 > 制造业采购经理指数 > 制造业采购经理指数(%) | 国家统计局 | monthly | 15 | A |
| CN_GDP_INDEX → CN_GDP_YOY | growth_yoy | 同上 季度 · 国民经济核算 > 国内生产总值指数（上年同期=100） | 国家统计局 | quarterly | 5 | A |
| CN_M2_YOY | liquidity_yoy | 同上 月度 · 金融 > 货币供应量 > M2 同比增长 | 中国人民银行（via 国家统计局） | monthly | 10 | A |
| CN_EXPORT_YOY | growth_yoy | 同上 月度 · 对外经济 > 货物进出口总额 > 出口额同比（美元计） | 海关总署（via 国家统计局） | monthly | 10 | A |
| CN_CGB_10Y_D → CN_CGB_10Y | bond_yield | akshare / yield.chinabond.com.cn / `bond_china_yield` 中债国债收益率曲线 10 年 | 中央国债登记结算公司 | daily→月末 | 15 | A |
| CN_USDCNY_CP_D → CN_USDCNY_CP | fx | akshare / www.safe.gov.cn / `currency_boc_safe` 人民币汇率中间价 美元 | 国家外汇管理局 | daily→月末 | 5 | A（原单位"人民币/100 美元"，不换算） |
| CN_LPR_1Y | policy_rate | — | 全国银行间同业拆借中心 | monthly | 10 | M（AKShare 仅有东方财富转载） |
| CN_MLF_1Y | policy_rate | — | 中国人民银行 | event | 10 | M（无已核实官方接口） |
| CN_AFRE_STOCK_YOY | liquidity_yoy | — | 中国人民银行 | monthly | 20 | M（AKShare 只有商务部转载的增量口径，口径不同不得替代） |
| US_WTI_D → US_WTI | asset_price | fred_csv / DCOILWTICO | EIA（via FRED） | daily→月末 | 0 | A |
| US_UST10Y（= US_DGS10，资产视角，bp） | asset_price | 复用 US_DGS10 | — | 月 | 0 | A |
| CN_CGB10Y（= CN_CGB_10Y，资产视角，bp） | asset_price | 复用 CN_CGB_10Y | — | 月 | 0 | A |
| US_SP500 / US_NASDAQCOM / US_DJIA | asset_price | fred_csv / SP500、NASDAQCOM、DJIA | S&P DJI、Nasdaq（via FRED） | daily→月末 | 0 | R（第三方版权） |
| CN_CSI300 | asset_price | akshare / www.csindex.com.cn / `stock_zh_index_hist_csindex` 000300 | 中证指数公司 | daily→月末 | 0 | R（再分发权利未确认） |

- 资产"视角复用"不复制数据：资产条目指向同一观测，`changeKind='bp'`。
- `restricted` 序列不采集、不入库（不是"采了不显示"）；owner 确认权利后把状态改 A 并发新的目录版本。
- AKShare 函数与参数以录制夹具时的 `akshare.__version__` 为准，写入 `scripts/macro/requirements.txt`（锁版本）与每个批次的 `tool_versions`。

### 4.3 存储（迁移 `supabase/migrations/20261114090000_macro_workbench.sql`）

| 表 | 主要列 | 约束 / RLS |
|---|---|---|
| `macro_series` | `id` PK, region, role, type, unit, native_frequency, period, status, source jsonb, weight numeric, change_kind, definition_version, catalog_version, updated_at | anon/authenticated select；写仅经 service |
| `macro_evidence_objects` | `sha256` PK（hex64）, `object_path`（`macro-raw` 桶内，`<adapter>/<sha256>.<ext>`）, adapter, content_type, byte_length, created_at | anon select（无字节）；写仅经 RPC |
| `macro_retrievals` | `retrieval_id` uuid PK, sha256 FK, fetch_url, fetch_host, http_status, fetched_at, batch_id FK `ingest_batches`, tool_versions jsonb | anon select；写仅经 RPC |
| `macro_catalog_versions` | `catalog_version` PK, catalog jsonb, rules_version, created_at | anon select；只追加 |
| `macro_ingest_chunks` | (batch_id, seq) PK, total, counts jsonb, received_at | service only |
| `macro_observations` | `observation_id` uuid PK, series_id FK, period_end date, `value numeric`（无精度限制）, `value_text`（canonical 十进制）, version int ≥ 1, available_at timestamptz, availability_basis, ingested_at, status ('ok'/'quarantined'/'superseded_conflict'), retrieval_id FK `macro_retrievals`（原生观测必填）, locator jsonb（`{kind:'csv_row',line,column}` / `{kind:'json_pointer',pointer}`）, derived_from uuid[]（派生观测必填）, transform text, code_version, batch_id FK | UNIQUE(series_id, period_end, version)；anon/authenticated select **where status='ok'**；写仅经 RPC |
| `macro_snapshots` | `snapshot_id` uuid PK, region, as_of date, `revision` bigint, methodology_version, catalog_version, observation_ids uuid[], catalog_counts jsonb `{verified, missing, restricted}`, status ('active'/'superseded'/'failed'), failure_reason, created_at | anon/authenticated select；每 region 仅一条 active（partial unique index）；写仅经 RPC |
| `macro_regime_results` | snapshot_id PK/FK, region, `regime jsonb`（F4 `RegimeResult` 或 null）, contributions jsonb, rules_version, uncovered_weight numeric | 只 service_role select（第 6 稿 P1-2）；写仅经 RPC |
| `macro_publish_state` | region PK, revision bigint, input_revision bigint, updated_at | service only |
| `macro_analysis_runs` | run_id uuid PK, user_id, request_id uuid（unique with user_id）, kind ('change'/'level'/'rolling'/'event_window'), spec jsonb, inputs jsonb（冻结清单，§7）, inputs_hash, results jsonb, code_version, method_version, status ('ok'/'failed'), error, created_at | RLS own-rows select；insert 只经 `create_macro_analysis_run`；无 update/delete |

- 桶：`insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('macro-raw','macro-raw',false,…,array['text/csv','application/json','text/html','text/plain']) on conflict …`（同计划二，迁移不引用 `storage.objects`）。
- RPC（全部 `security definer`、`set search_path=public`、只授 service_role，除注明外）：
  - `macro_write_observations(p_batch uuid, p_rows jsonb)`：逐行按 §4.4 规则插入新版本 / 跳过重复 / 标冲突，返回计数；在 RPC 内校验证据存在、派生行的输入存在且 `ok`。
  - `publish_macro_snapshot(p_region text, p_expected_revision bigint, p_as_of date, p_methodology_version text, p_catalog_version text, p_observation_ids uuid[], p_catalog_counts jsonb, p_regime jsonb, p_contributions jsonb, p_rules_version text, p_uncovered_weight numeric)`：`select … for update` 区域状态行，修订号不符 → `stale_publisher`；校验所有观测存在且 `status='ok'`、属于该区域目录；插入快照与判定结果；旧 active → `superseded`；新行 active；`revision+1`；一个事务。
  - `record_failed_macro_snapshot(...)`：只记失败快照，不动 active。
  - `create_macro_analysis_run(p_user_id, p_request_id, p_kind, p_spec, p_inputs, p_inputs_hash, p_results, p_code_version, p_method_version, p_status, p_error)`：只授 service_role（路由传已验证 session 的 user id）；同 `(user_id, request_id)` 已存在 → 返回已有 run_id；咨询锁 + 24h 计数配额（§2）；返回 run_id 或 `quota_exceeded`。
  - `macro_resolve_conflict(p_quarantine_id, p_decision, p_resolved_by)`：§0.2 M10。
- 隔离：观测冲突不仅标 `status`，同时调共用 `quarantine()` 写 `dq_quarantine`（dataset `macro.<adapter>`，table `macro_observations`，natural_key `series_id|period_end`），使 `/admin/dq` 可见；裁决后的落地动作（接受新值 → 新版本 ok，拒绝 → 保持）由 `scripts/macro/resolve-quarantine.ts` 调 RPC 完成并写 `research_audit_log`。

### 4.4 采集链路

```
Vercel cron 05:30 UTC → GET /api/cron/macro-sync          (CRON_SECRET; ?preview=1 零写入；只发布 US)
   1. upsert 目录 → macro_series
   2. FRED CSV 适配器（TS）：startBatch(producer 'ts-fred', dataset 'macro.fred')
      每个 A 状态 FRED 序列：GET https://fred.stlouisfed.org/graph/fredgraph.csv?id=<code>&cosd=2000-01-01
      → 原始字节存证（macro-raw/fred_csv/<sha256>.csv + macro_evidence_objects + macro_retrievals）→ 无损解析 → 规则校验 → macro_write_observations
      → finishBatch；recordAttempt('macro.fred', cadence 'daily')
   3. 派生（月末、同比、减 100）→ macro_write_observations（code_version、transform、derived_from）
   4. publish('US')（CN 只在 ingest finish 后发布，§0.2 M24/N3）（读各序列最新 ok 版本 → 判定 → publish_macro_snapshot）
   5. 判断层钩子：flag 开启且 F4 生产者可用时调用 F4 produce（失败不影响发布；F4 补偿扫描兜底）

Mac（Studio）launchd 05:00 UTC → scripts/macro/collect.py（uv 虚拟环境，requirements 锁版本）
   AKShare 调用期间安装响应录制钩子：每个 HTTP 响应的 URL、状态、Content-Type、原始字节 → 证据
   → POST /api/macro/ingest（Bearer MACRO_INGEST_SECRET，≤ 4 MB / 请求，按序列分块）
      body: { batch: {producer:'py-akshare', dataset:'macro.akshare', tool_versions}, evidence:[{sha256, url, status, content_type, fetched_at, bytes_b64}], claims:[{series_id, period_label, value_text}] }
   服务端：校验 sha256 = 字节 → 存证 → 用 TS 端的定位解析器从原始字节提取值（不信任 Python 的数值）→ 与 AKShare 的 claim 十进制比较（不一致 → 隔离 `adapter_mismatch`）→ 规则 → 写入 → 回执
   → 最后一块带 complete:true 时 finishBatch、recordAttempt('macro.akshare','daily')、publish('CN')
```

- **数值只认 TS 解析器从存证字节里取出的十进制字符串**；AKShare 的 DataFrame 值只作交叉核对。离线 `replay` 测试：给定证据字节 + 解析器版本 → 得到完全相同的 `value_text` 与定位。
- FRED CSV 解析：逐行，`observation_date,<CODE>`；值 `.` 表示缺失（不入库）；`value_text` 取原文（`canonicalDecimal`）；定位 `{kind:'csv_row', line, column:1}`。
- 写入规则（`macro_write_observations`，与 M10 一致）：
  - 同 `(series_id, period_end)` 当前最新版本值相同（十进制相等）→ `duplicates+1`，不写；
  - 不存在 → `version=1`，`inserted+1`；
  - 存在且值不同：`revisionPolicy='revisable'` → `version+1`、`versioned+1`，旧版本仍保留（`ok`，查询取最新版本）；`'immutable'` → 新行 `quarantined` + `quarantine(reason 'unexpected_revision')`，`quarantined+1`，旧值继续服务；
  - 同一证据内同期出现两个不同值 → 两者都不写，`quarantine(reason 'conflicting_rows')`。
- 规则校验（共用 `src/lib/dq/rules.ts` 的 `rangeRule` / `jumpRule` / `unitRule`，宏观专用阈值在 `src/lib/macro/quality.ts`，版本 `macro-rules/1`）：PMI ∈ [0,100]、利率 ∈ [−5,30]、"上年同月=100"指数 ∈ [50,200]；失败 → 隔离 `rule_failed:<ruleId>`。
- 失败策略：单序列失败计 `failed` 并写 `errors`，其余继续；证据上传失败 → 该序列不写观测；新快照失败不覆盖旧快照；所有批次经 `finishBatch` 得到 `success/partial/failed`。
- `preview=1`：执行抓取与解析，返回将要写入的计数与样本，零数据库写入、零存证上传（测试断言）。

### 4.5 新鲜度（两个概念，分开显示）

- **采集状态**：共用 `dq_freshness`，dataset `macro.fred`、`macro.akshare`，cadence `daily`；读时用 `freshnessOf` 重算（连续 2 次失败才是 `error`）。界面文案"采集：正常 / 过期 / 失败 / 无记录"。
- **发布及时性**（逐序列，`freshness.ts` 纯函数）：最新数据期 + `releaseLagDays` + 3 天宽限 < 今天且没有更新的数据期 → `late`；目录 A 状态但无观测 → `missing`；否则 `current`。重复抓到同一旧值不会让及时性变绿。

---

## 5. 判定（judgment 侧）

判定是 F4 意义上的判断，宏观侧只负责：同一个分类函数、发布时冻结的结果、`MacroReadApi`。页面默认不展示（§3.2）。

### 5.1 规则类型化

```ts
type Rule = { id: string; when: (v: number, delta3m: number | null, delta1: number | null) => boolean;
              support: Partial<Record<Regime, number>>; label: { zh: string; en: string } };
const RULES: Record<SeriesType, Rule[]>;    // 版本 RULES_VERSION = 'macro-regime-rules/1.0'
```

一个序列只匹配自己 `type` 的规则（单测："7.12 的汇率永远不命中 policy_rate 规则"）；无匹配或无观测 → 不贡献，计入 `uncovered_weight`。规则输入是有限数（由 `value_text` 转 `Number`，转换在此边界发生并在方法文档写明）。

### 5.2 v1.0 规则表

（同第 1 稿表格，略有改动：`fx` 规则对 `CN_USDCNY_CP` 用 3M 变化率；`risk_index` 在 VIX 为 restricted 期间无输入。）

| type | 条件 | 复苏 | 过热 | 滞胀 | 衰退 |
|---|---|---|---|---|---|
| policy_rate | v < 2.5 | 0.2 | — | — | 0.7 |
| policy_rate | 2.5 ≤ v < 4.5 | 0.3 | 0.2 | 0.1 | 0.1 |
| policy_rate | v ≥ 4.5 且 Δ ≥ 0 | — | 0.6 | 0.3 | — |
| policy_rate | v ≥ 4.5 且 Δ < 0 | — | 0.2 | 0.2 | 0.4 |
| bond_yield | Δ(3M) ≥ +25bp | — | 0.5 | 0.3 | — |
| bond_yield | Δ(3M) ≤ −25bp | 0.2 | — | — | 0.5 |
| bond_yield | 其他 | 0.2 | 0.2 | 0.2 | 0.2 |
| fx | 3M 变化 ≥ +2% | — | 0.4 | 0.3 | — |
| fx | 3M 变化 ≤ −2% | 0.5 | — | — | 0.2 |
| inflation_yoy | v < 1 | 0.1 | — | — | 0.7 |
| inflation_yoy | 1 ≤ v < 2 | 0.5 | — | — | 0.3 |
| inflation_yoy | 2 ≤ v ≤ 3 | 0.4 | 0.3 | 0.1 | 0.1 |
| inflation_yoy | 3 < v ≤ 4 | — | 0.6 | 0.3 | — |
| inflation_yoy | v > 4 | — | 0.4 | 0.6 | — |
| pmi | v ≥ 55 | 0.3 | 0.6 | — | — |
| pmi | 50 ≤ v < 55 | 0.5 | 0.3 | — | — |
| pmi | 47 ≤ v < 50 | 0.1 | — | 0.4 | 0.4 |
| pmi | v < 47 | — | — | 0.3 | 0.7 |
| labor_rate | Δ(3M) ≥ +0.3pp | — | — | 0.4 | 0.5 |
| labor_rate | Δ(3M) ≤ −0.1pp | 0.5 | 0.4 | — | — |
| growth_yoy | Δ ≥ 0 且 v ≥ 5 | 0.5 | 0.3 | — | — |
| growth_yoy | v < 4.5 | — | — | 0.3 | 0.6 |
| liquidity_yoy | v ≥ 8 且 Δ ≥ 0 | 0.5 | 0.3 | — | — |
| liquidity_yoy | v ≥ 8 且 Δ < 0 | 0.2 | 0.4 | 0.2 | — |
| liquidity_yoy | v < 8 | — | — | 0.3 | 0.5 |
| risk_index | v < 15 | 0.4 | 0.4 | — | — |
| risk_index | 15 ≤ v < 25 | 0.3 | 0.3 | 0.2 | 0.2 |
| risk_index | v ≥ 25 | — | — | 0.5 | 0.5 |

Δ 与上一可比期（同序列前一个 `period_end`）比较；Δ(3M) 与 3 个月前的 `period_end` 比较（季度序列用前一季度）；所需比较期缺失 → 该规则不命中。区间外的组合（例如 growth_yoy 4.5 ≤ v < 5 或 Δ < 0 且 v ≥ 5）无匹配 → 不贡献。

### 5.3 输出（逐字采用 F4 `RegimeResult`）

```
score[s]     = Σ_i weight_i × support_i[s]                    s ∈ recovery, overheat, stagflation, recession
coverage     = Σ(matched weight) / Σ(目录中该区域 role=indicator 的全部 weight，含 missing/restricted)
regime       = null 当 coverage < 0.6 或 Σscore = 0
norm[s]      = score[s] / Σ score
primary      = argmax norm（并列时按 recovery < overheat < stagflation < recession 的固定顺序取先者）
secondary    = 次高（同样的并列规则；只有一个非零则 null）
margin_pp    = 100 × (norm[primary] − norm[secondary ?? primary 之外的最大值])
growth_axis  = Σ_{pmi,labor_rate,growth_yoy} weight × (support[recovery]+support[overheat]−support[stagflation]−support[recession]) / Σ 这些类型的命中 weight；无命中 → null；范围 [−1,1]
inflation_axis = 同式，只取 inflation_yoy，用 (support[overheat]+support[stagflation]−support[recovery]−support[recession])
```

`RegimeResult = {primary_state, secondary_state, scores, norm, coverage, margin_pp, growth_axis, inflation_axis}`；结果存 `macro_regime_results.regime`（可为 null）与逐指标 `contributions`（series_id、observation_id、rule_id、weight、support、contribution）。`methodology_version='v1.0'`（F4 上游绑定），`rules_version='macro-regime-rules/1.0'`，`catalog_version` 冻结在快照上。

快照与判定解耦：快照是"这一刻各目录项的最新 ok 观测清单"，**不论 coverage 都发布**；`regime=null` 只表示这一快照不产生判定。

### 5.4 `MacroReadApi` 实现（`src/lib/macro/read-api.ts`）

按 F4 计划共享契约逐字实现（宏观侧镜像类型 `src/lib/macro/judgment-contract.ts`，F4 合并后改为从 `src/lib/judgments` 导入并由类型测试锁定一致）：

- `observation(observationId)` → `{series_id, period_end, vintage_id: String(version), value: Number(value_text), unit, available_at}`，只返回 `status='ok'`。
- `snapshot(snapshotId)` → `MacroSnapshotRow`（`observation_ids` 为 uuid 字符串，`regime` 可空）。
- `snapshotsSince(marker, limit)`：`status in ('active','superseded')`，按 `(created_at, snapshot_id)` 严格大于 marker 升序，`limit ≤ 200`。
- `seriesCatalog(region)` → 目录行（含权重、`definition_version`、`catalog_version`）。
- `classifyAsOf(region, referencePeriod, cutoff, macroMethodologyVersion)`：版本不等于 `v1.0` → 抛 `methodology_mismatch`；每个指标取 `period_end ≤ referencePeriod 月末` 且 `available_at ≤ cutoff` 的最新期、该期内 `available_at ≤ cutoff` 的最高版本；用**同一个** `classifyRegime()`；返回 `{regime, observation_refs, catalog:{version, weights, rules_version}}`。
- 所有读取走 anon 可读路径（不读隔离行），分页读完或显式报 `truncated` 错误。

---

## 6. 事件与周期（P2）

### 6.1 事件（读时派生，不建事件表）

- **美国政策事件（derived）**：`US_FED_TARGET_UPPER_D` / `_LOWER_D` 日频序列中相邻两个有效日的值变化 → 事件 `{kind:'policy_target_change', region:'US', effective_date, upper_from, upper_to, lower_from, lower_to, change_bp, source:'derived', evidence: 两个输入观测 id}`。界面标"由联储目标区间序列变化推导（生效日）"，不称为"公告"。
- **FOMC 会议日程（calendar）**：`src/lib/macro/data/fomc-meetings.json`，每年一项 `{year, meetings:[{start,end}], source_url: federalreserve.gov 日程页, retrieved_at, sha256}`，原页面字节存证进 `macro-raw`（`scripts/macro/record-fomc.ts`）；与决策事件分开显示。
- **中国**：LPR / MLF 缺失期间无官方自动事件；不导入编辑型事件标签（第 1 稿开放问题 4 取"只保留官方"）。
- 事件派生函数 `events.ts` 版本 `macro-events/1`，纯函数，输入观测清单 → 输出事件；同输入同输出。

### 6.2 周期分段（`cycles.ts`，版本 `macro-cycles/1`，读时计算）

- 政策周期：按派生政策事件方向，同方向连续合并；方向翻转开新周期；最后一次变化后 ≥ 12 个月无变化 → 记"平台期"段。
- 其他月度序列：只用**截至当期的尾随** 12 个月中位数（需 ≥ 12 个有效月，否则该月无方向）；方向 = 中位数相对上月的符号（相等 = 无变化，延续前方向）；连续同向 ≥ 6 个月成段，短于 6 个月的段并入前一段（首段过短则标 `insufficient` 不显示）；缺失月中断计数。段的确认时间 = 满 6 个月的那个月（界面标注确认滞后）。
- 周期内资产区间变化：资产月度序列在段起止月末之间的变化（价格类用 pct，收益率类用 bp）；端点缺失 → 显示缺失；只用 `enabled` 资产。

---

## 7. 关联分析（`correlation.ts`，P2，版本 `macro-correlation/1`）

- 对齐：月度 `period_end` 内连接；先把资产序列按滞后 k 平移日历月再连接：**k > 0 表示指标领先**，计算 `corr(indicator[t], asset[t+k])`；缺失不插值。
- 变换：
  - `change`（默认）：指标 Δ（`changeKind` 口径）与资产变化（价格类对数收益，收益率类 bp 差）；
  - `level`（探索性）：原值；结果不输出强度词，固定附说明；
  - `rolling`：36 个月窗口的 `change` 口径 r 序列，每窗口有效对 < 30 的点不输出；
  - `event_window`：锚 = 派生政策事件生效日所在月；窗口 ±N（N ∈ {3,6,12}）月资产变化；只用前后窗口完整的事件；相邻事件窗口重叠时只保留较早事件；独立完整事件 < 5 → 只给逐事件表，不给分布统计。
- 样本门槛：`change`/`level` 有效对 n ≥ 36（月度 3 年）否则拒绝并说明；零方差或对数收益遇非正价格 → 拒绝（错误码）。
- 输出 `results: {r, r2, slope, intercept, n, from, to, lag, transform, method_version, code_version}`（滚动 / 事件模式各有自己的结构）；`explain.ts` 规则文案只在 `change` 口径下给强度词（|r| < 0.3 弱 / < 0.6 中等 / 否则强），符号与数字绑定，不写机制解释。
- 冻结输入：`inputs = {indicator:{series_id, observations:[{observation_id, period_end, value_text}]}, asset:{…}, events?: [...], cutoff: 运行时刻, catalog_version}`，`inputs_hash` = 规范化 JSON 的 SHA-256；运行只追加；复算 = 用冻结输入重跑同版本函数并比较结果（测试）。读取输入时分页读完，读不完 → 报错不计算。

---

## 8. API 契约

| 方法 路径 | 返回 | 约束 |
|---|---|---|
| `GET /api/macro/overview?region=US\|CN\|all&compact=1` | `{regions: {US?: Envelope, CN?: Envelope}}`；`Envelope = {snapshotId, asOf, catalogVersion, methodologyVersion, collection: {dataset, status, lastOkAt}[], indicators: IndicatorRow[], changes[], catalogCounts}` | 登录；读 active 快照；`Cache-Control: private, max-age=60`；判定不在此响应里（由 F4 `/api/judgments` 提供） |
| `GET /api/macro/series/[id]?from&to&transform&asOf` | `{def, observations[{observation_id, period_end, value_text, version, available_at, availability_basis, retrieval_id, evidence_sha256, locator}], cycles[], events[], assetsByCycle[], provenance}` | 登录；目录白名单 id；最多 600 点；`asOf` → `available_at ≤ asOf` |
| `GET /api/macro/evidence/[sha256]` | 证据元数据 + 短期签名下载链接 | 登录 |
| `GET /api/macro/snapshots/[id]` | 快照全文（观测清单、目录计数；判定结果仅在判断层开启时返回） | 登录 |
| `POST /api/macro/analyses` | `{runId}` 或 `{error:{code:'quota_exceeded'\|'insufficient_sample'\|…}}` | 登录；ajv 校验 spec；服务端读输入、计算、调 RPC |
| `GET /api/macro/analyses/[runId]` | run（本人） | 登录；`private, no-store` |
| `POST /api/macro/ingest` | 回执 | `MACRO_INGEST_SECRET`；单请求 ≤ 4 MB |
| `GET /api/cron/macro-sync?preview=1` | 同步 + 发布回执 | `CRON_SECRET`（`authorizedCronRequest`）；登记进 `vercel.json` |

错误统一 `{error:{code,message}}`；所有读响应带 `catalogVersion`。

---

## 9. 代码结构

```
src/lib/macro/
  catalog.ts            MACRO_CATALOG、CATALOG_VERSION、类型
  judgment-contract.ts  F4 契约镜像类型（Regime、RegimeResult、MacroSnapshotRow、MacroObservationRef、MacroReadApi）
  decimal.ts            复用 facts/json-numbers 的 canonicalDecimal；十进制减法/比较的最小实现
  evidence.ts           证据存储接口（Supabase 桶 + 内存实现，同 snapshot-store 模式）
  parsers/fred-csv.ts  parsers/nbs.ts  parsers/chinabond.ts  parsers/safe.ts   原始字节 → {period_end, value_text, locator}[]
  providers/fred.ts     FRED CSV 抓取
  derive.ts             月末、同比、减 100（十进制）
  quality.ts            宏观规则阈值（调用 dq/rules）
  ingest.ts             写入编排（批次、证据、规则、RPC、隔离）——cron 与 ingest 路由共用
  freshness.ts          发布及时性
  regime.ts             规则表 + classifyRegime（纯函数）
  snapshots.ts          publish(region)
  read-api.ts           MacroReadApi 实现
  events.ts  cycles.ts  correlation.ts  explain.ts
  db.ts                 MacroDb 契约 + Supabase / 内存实现
  *.test.ts
src/app/api/macro/{overview,series/[id],evidence/[sha256],snapshots/[id],analyses,analyses/[runId],ingest}/route.ts
src/app/api/cron/macro-sync/route.ts
src/app/(app)/intel/macro/{page.tsx,[seriesId]/page.tsx,analyses/[runId]/page.tsx}
src/components/macro/
  IndicatorTable.tsx  ChangesCard.tsx  CatalogCoverage.tsx  IndicatorDetail.tsx  SourceFooter.tsx  SourceDrawer.tsx
  CorrelationWorkbench.tsx  MacroJudgmentSlot.tsx  macro-format.ts
  charts/{MacroLineChart.tsx, Sparkline.tsx, ScatterFit.tsx, DataTableToggle.tsx}
scripts/macro/collect.py  recorder.py  requirements.txt  test_collect.py  launchd.plist.template
scripts/macro/record-fred-fixtures.ts  record-fomc.ts  resolve-quarantine.ts
messages/{zh,en}/macro.json（注册到 MESSAGE_DOMAINS，`// MACRO` 块）
supabase/migrations/20261114090000_macro_workbench.sql
docs/runbooks/macro-sync.md
```

共享文件改动都包在 `// MACRO` 注释块里：`src/i18n/request.ts`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`（`criticalSuites`）、`vercel.json`、`supabase/migrations.lock.json`、`src/components/today/MacroGlance.tsx`、`/intel` 页。

---

## 10. i18n

新域 `macro`；目录名称与理由在 catalog 里双写；表头、状态、证据抽屉、方法说明、错误文案进 `messages/*/macro.json`；`messages-parity` 测试校验双语对等。

---

## 11. 错误处理与数据质量

| 情形 | 行为 |
|---|---|
| provider 超时 / 5xx | 退避重试 3 次；序列计 `failed`，`errors` 带 `{code, key: series_id}`；其他序列继续 |
| 证据上传失败 | 该序列不写观测，计 `failed` |
| TS 解析值 ≠ AKShare claim | 隔离 `adapter_mismatch`，不写观测 |
| 不可修订序列出现新值 / 同证据内矛盾 | 隔离，旧值继续服务；`/admin/dq` 可见 |
| 规则失败（范围 / 单位 / 跳变） | 隔离 `rule_failed:<id>` |
| 目录 A 项无观测 | 及时性 `missing`，判定不贡献，不补中性分 |
| coverage < 0.6 | 快照照常发布；`regime=null` |
| 并发发布 | `stale_publisher`，后到者放弃；旧 active 不受影响 |
| 用户分析参数非法 / 样本不足 | 400 + 字段级错误码 |

---

## 12. 测试策略

- 纯函数（vitest）：`catalog`（版本稳定、A/M/R 不变量、无 yfinance、AKShare 主机白名单）、`parsers/*`（录制夹具 → 精确 `value_text` 与定位）、`derive`（十进制同比与减 100、跨年、缺月）、`regime`（类型隔离、coverage、`margin_pp`、并列、null）、`read-api`（`classifyAsOf` 的 `available_at ≤ cutoff` 与版本选择）、`events`、`cycles`（确定性夹具）、`correlation`（与预算值对比、滞后方向、门槛）、`freshness`、`macro-format`。
- `replay.test.ts`：从夹具证据字节重放得到页面所用的全部观测（US + CN 各一条完整链）。
- 数据库集成（`test:db`，`S4_TEST_STATE`，加入 `criticalSuites`）：`macro_write_observations` 的重复 / 新版本 / 隔离；`publish_macro_snapshot` 的事务与 `stale_publisher`；anon 只读 ok 行、读不到隔离行与分析运行；`create_macro_analysis_run` 的配额与 own-rows；grants/revokes。
- 迁移：`npm run test:migrations`；锁文件追加。
- API：ingest 的哈希校验、TS 解析交叉核对、schema 拒收；`macro-sync?preview=1` 零写入；读路由 401。
- Python：`scripts/macro/test_collect.py`（录制钩子、分块、请求体 schema；离线，不打网络）。
- 端到端：现有 verify 流程对 `/intel/macro`（判断层关闭）可见指标表、证据抽屉、详情页表格视图、创建一个 change 分析；Today 卡无 mock 文案。

---

## 13. 性能与运维

- 概览 p95 < 300 ms；详情 < 500 ms；首屏 payload < 60 KB（不含图表库）。
- 采集：FRED ~10 个 CSV / 日；Python ~8 次 AKShare 调用 / 日。
- 环境变量：`MACRO_INGEST_SECRET`（Vercel + Mac）、`MACRO_INGEST_URL`（Mac）、`MACRO_JUDGMENTS_ENABLED`（默认未设 = 关）；不需要 `FRED_API_KEY`。
- 运行手册 `docs/runbooks/macro-sync.md`：uv 虚拟环境与 launchd 安装、手动触发、隔离裁决、回滚 active 快照、权利确认后启用 restricted 序列的步骤。

---

## 14. 分期与验收

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| WP-M1 目录、迁移、证据、FRED | catalog、迁移 + 锁、MacroDb、证据存储、FRED CSV 解析与适配器、写入 RPC、cron（含 preview） | US A 项夹具重放一致；`preview=1` 零写入；test:db 通过 |
| WP-M2 Python 采集与 ingest | collect.py + 录制钩子、requirements、NBS/中债/外汇局 TS 解析器、ingest 路由、launchd 模板 | CN A 项夹具（真实录制）重放一致；不一致即隔离的测试；核实失败的项改 M 并写理由 |
| WP-M3 判定、快照、读接口 | regime、snapshots、publish RPC、freshness、overview/series/snapshots/evidence API、MacroReadApi | 规则夹具；并发发布测试；`classifyAsOf` 测试 |
| WP-M4 工作台 UI | 概览（判断层关闭）、指标表、详情、证据抽屉、Today 替换、`/intel` 摘要卡、判定槽位（flag）、i18n | verify 流程通过；DESIGN.md 审查；表格视图齐全 |
| WP-M5 事件与周期 | events、FOMC 日程存证、cycles、详情页色带与资产区间变化 | 分段确定性单测；marker 可见 |
| WP-M6 关联工作台 | correlation、analyses API + RPC、UI、预填表单 | 四种模式；冻结输入复算测试；配额测试 |

验收样例：
1. 每个目录项要么已核实（夹具重放一致），要么显示缺失 / 受限及理由；页面无 yfinance、东方财富、金十来源。
2. 对方站点 2026-09-11 快照的规则错配回归：汇率 / GDP 类观测不命中利率或 PMI 规则（用我们自己的夹具值，不导入对方数据）。
3. 断网运行 `macro-sync`：概览仍返回旧快照，采集状态最终为 `error`（连续两次失败），无 0 值。
4. 判断层关闭时页面与 API 不出现象限 / 得分 / margin；开启且 F4 不可用时显示"暂不可用"。

---

## 15. 开放问题与 owner 事项

1. **权利确认**（owner）：VIXCLS、SP500 / NASDAQCOM / DJIA（via FRED）、中证 300 的展示与再分发权利；确认前保持 restricted（不采集）。
2. `FRED_API_KEY`（可选）：提供后可做 ALFRED 实时起点，替代 `first_seen`（后续工作）。
3. Python 采集部署在 Mac Studio launchd（默认）；`MACRO_INGEST_SECRET` 需在 Vercel 与 Mac 两边配置。
4. 国家统计局转载 PBoC M2 / 海关出口：`publisher` 记原机构、`via` 记国家统计局；若 owner 要求直连人民银行 / 海关官网，另立采集项。

---

## 16. 附件

- 对方站点拆解与克隆蓝图：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`
- GUI / UI 流程设计稿（Claude Design 画布，私有链接，6 块画板：UI 流程与数据链路、概览页、指标详情页、关联工作台、手机概览、Today 卡片）：https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH ——第 2 稿需补"判断层关闭"概览与证据抽屉画板（§3.7）。
- Codex 增量审计：`docs/audits/2026-11-06-macro-workbench/02-codex-spec-round.md`
