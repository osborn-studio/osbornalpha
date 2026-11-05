# 外资研报规格 · Codex 审计处置表

日期：2026-11-04。规格：`docs/superpowers/specs/2026-11-04-foreign-research-design.md`（第 3 稿）。
审计：`01-codex-round1.md`（gpt-6-astra, medium；对第 1 稿）、`02-codex-round2.md`（对第 2 稿）。owner 规则限定两轮；第 3 稿是对第二轮的处置结果，**未**再经 Codex 复审，下一次复审在计划（plan）编写时或第一个工作包提交时进行。

两轮 verdict 原文：
- 第一轮："Verdict: **Not ready for implementation planning.** The design has publication paths that bypass licensing and quality controls, an incomplete extraction/review state machine, and insufficient provenance for several displayed numbers and settlements."
- 第二轮："Verdict: **Not ready for implementation planning**; the rewrite improves coverage, but publication, disclosure, evidence lineage, and state-transition contracts still contain blocking contradictions."

决策含义：ACCEPT = 已在第 3 稿修改；DECLINE = 不改，附理由；OWNER = 需 owner 决定（已登记 §15.2）；OPEN = 需实施期验证（已登记 §16）。

## 第一轮（FR-01 … FR-28）

| ID | 严重度 | 决策 | 第 3 稿落点 / 理由 |
|---|---|---|---|
| FR-01 引用视图泄漏受限值 | P1 | ACCEPT | §4.11：引用视图排除 `target_*` 字段（目标价不可公开时）与非公开分析师的 `analyst` 行（按 `field_id` 绑定）；片段 / 摘要 / 标题走内容级披露检查（`disclosure/1`）；§12.2 值级断言 |
| FR-02 许可变更不失效 | P1 | ACCEPT | §4.1：`version` + `confirmed_version`；实质性修改清确认并把片段 / 摘要回 `draft`；新增 `allows_public_summary`、`allows_llm_processing`；处理授权 = 当前已确认 ∧ 允许处理；视图按当前 N 过滤 |
| FR-03 发布门禁不完整 | P1 | ACCEPT | §4.4：16 条阻断（含隔离、规则回执 + 输入哈希、评测回执、内容披露、漂移）；只经 `broker_report_publish()` 在行锁下对已提交状态求值；直接置 published 被触发器拒绝；已发布不可变 |
| FR-04 黄金集闸门弱 | P1 | ACCEPT | §4.4 第 13 条 + §4.10：按五元组取**最新**回执，须 `passed ∧ corpus_kind='gold' ∧ n_docs ≥ 30` 且覆盖报告出现的字段；`eval-gold.ts` 与回执写库提前到 FR-2；FR-6 对外前须有 `gold` 回执。`code_version` 不进匹配元组（每次部署都重跑黄金集不现实；抽取行为由五元组决定），记为有意决定 |
| FR-05 状态不可表示 | P1 | ACCEPT | §4.4 草稿列可空、§4.5 `basis=candidate/effective`、§4.6 状态相关约束（跨度可空）、§4.2 完整状态机与围栏 |
| FR-06 复核模型 | P1 | ACCEPT | §4.6 `occurrence`、`absent` 状态、类型化 `corrected_*`；§6.3 `broker_field_review` RPC 同事务物化；生效值选择器统一 |
| FR-07 多标的未定义 | P1 | ACCEPT | §5.2 `targets[]` 每标的证据（含独立币种证据）；§4.5 按 `target_key`（证券）而非发行人；`single_issuer` = 一个发行人、≥1 证券 |
| FR-08 回放证据被覆盖 | P1 | ACCEPT | §4.3 运行表只插入、产物按 `run_id` 命名、原始请求 / 响应入桶；§4.6 候选不删只标 `superseded_by_run_id`；§4.8 发布快照不可变 |
| FR-09 最新价无出处 | P1 | ACCEPT | §1.2 本期不显示 |
| FR-10 mock 可选 | P1 | ACCEPT | §1.2、§9.4：FR-3 同一变更删除 mock 块、consensus mock 分支改 `none` |
| FR-11 视图授权 | P1 | ACCEPT | §4、§4.11、§4.13：显式 revoke、`security_barrier`、视图不调函数（见 FR2-01）、函数对两角色 revoke execute |
| FR-12 缓存与撤回 | P1 | ACCEPT | §8.1 全部 `no-store`；撤回保证如实表述 |
| FR-13 结算错证券 / 日期 / 方向 | P1 | ACCEPT | §10.3：按 `security_ticker` + 币种；`ForwardCall` 映射显式；`direction=0` → null；基准规则命名；截断 → `unsettleable` |
| FR-14 结算快照 | P1 | ACCEPT | §10.3 两序列留存、路径 + 哈希、方法版本、只追加；`retrospective` 用交易所日期；§10.2 幂等键含 `publication_id` |
| FR-15 上传意向无绑定 | P2 | ACCEPT | §4.2、§6.1：意向持久化、CAS 状态机、按意向暂存路径、`move`、重试返回已提交 |
| FR-16 撤回 / 清除不完整 | P1 | ACCEPT | §6.5 清除步骤表与范围；★ 路由统一 410；§4.10 说明对象 GET 不可观测（O10） |
| FR-17 IP 伪匿名 | P2 | ACCEPT | §4.10 不记 IP |
| FR-18 F3 产物与预算 | P2 | ACCEPT | §4.12 MIME 加 png；§6.2 解析 / 抽取分两个请求；§11.1 偏移为 UTF-16 码元、路径按运行 |
| FR-19 `mapping_gen` 不存在 | P2 | ACCEPT | 删除；§5.4 `parseBrokerTicker`、`resolution` 快照（所用 `issuer_securities` 行与 `today`） |
| FR-20 历史视图 | P2 | ACCEPT | §4.11 `partition by (institution, security_ticker, currency) order by (published_date, report_id)`；排除被引用的前任；两端 provenance 列 |
| FR-21 并发与重试 | P2 | ACCEPT | §4.2 租约围栏；§6.2 `ensureReport`；§7.3 钩子只写覆盖表、失败回滚自己的写；§8.3 核验 cron 明确写隔离（非只读） |
| FR-22 测试环境 | P2 | ACCEPT | §12.2 SQL 套件 critical；§12.3 `test:storage` 覆盖 anon 与 authenticated；生产等价性仍为 OPEN（§16 1） |
| FR-23 夹具 / 黄金集 | P2 | ACCEPT | §11.3 匹配按 `(target_key, field, occurrence)` + 页码 + 跨度，`absence` 单独统计，分母定义；§12.4 F3 契约套件 |
| FR-24 评级映射 | P2 | ACCEPT | §4.9 有效期选择、只允许关闭 `valid_to`、表达式索引；已发布报告的 `scale_id` 随快照固定，新映射不回溯（管理员总览列出） |
| FR-25 摘要数字 | P2 | ACCEPT | §6.4 数值落地 = 数值相等 ∧ 句含字段关键词（`grounding/1`） |
| FR-26 范围倒置 | P2 | ACCEPT | 删除镜像与 `report_rc` 对账；§1.2 显式记录总纲 §3.3 偏差与恢复条件；预览只对管理员 |
| FR-27 参数无出处 | P2 | ACCEPT | §15.3 参数登记（来源 / 提案 / 决策人） |
| FR-28 计数不一致 | P3 | ACCEPT | 表 / 视图 / 接口 / 阶段计数已对齐 |

## 第二轮（FR2-01 … FR2-22）

| ID | 严重度 | 决策 | 第 3 稿落点 / 理由 |
|---|---|---|---|
| FR2-01 视图调函数需调用者 EXECUTE | P1 | ACCEPT | §4、§4.11：许可谓词内联 SQL；视图不调函数；`rpc` 对两角色全拒 |
| FR2-02 BEFORE 触发器看旧状态 | P1 | ACCEPT | §4.4：发布只经函数（行锁 + `set_config('broker.publishing')`），触发器拒绝直接置 published、发布迁移只允许改三列 |
| FR2-03 规则结果不绑输入 | P1 | ACCEPT | §4.8 `rule_receipts(input_hash)`；阻断 11（`materialize_stale`）与 12（`rules_stale` 按 `effective_hash`）；`evidence_ok` 漂移即隐藏 |
| FR2-04 开关不护直连视图 | P1 | ACCEPT | §4.1 `broker_research_settings.public_enabled` 进可见性 CTE；§12.2 开关关闭 0 行 |
| FR2-05 首次物化矛盾 | P1 | ACCEPT | §4.5 `basis`、§4.4 草稿可空、阻断 8/9 在发布时检查 |
| FR2-06 人工证据无产物绑定 | P1 | ACCEPT | §4.6 `parse_run_id` 对所有带跨度行必填；`absent` 由形状约束而非 R1 校验 |
| FR2-07 类型化值 | P1 | ACCEPT | §4.6 五个类型化列 + `corrected_*`；§5.2 币种独立证据；§5.3 转换表；生效值选择器 SQL/TS 同规则 |
| FR2-08 范围与基数 | P2 | ACCEPT | §4.5：`single_issuer` = 一发行人 ≥1 证券；无法解析 → `stated:<逐字>` 稳定键 |
| FR2-09 复核死锁 | P1 | ACCEPT | §4.4 复核就绪谓词 = 阻断集减 `review_not_approved` |
| FR2-10 未确认处理权可用 | P1 | ACCEPT | §4.1 处理授权谓词；§4.3 运行记 `licence_version` |
| FR2-11 文本面无披露策略 | P1 | ACCEPT | §4.11 内容级检查（受限值 / 受限名）用于片段、摘要、标题（`title_public` 改写）；许可版本变化回草稿 |
| FR2-12 共享上传路径竞态 | P1 | ACCEPT | §6.1 按意向暂存路径，校验后 `move`，只删自己的暂存对象 |
| FR2-13 重解析 / 超时恢复 | P2 | ACCEPT | §4.2 完整迁移、围栏收尾、失败回退到先前成功解析；§6.2 `lease_expired` |
| FR2-14 修订号不保留修订 | P1 | ACCEPT | §4.8 `broker_report_publications` 不可变快照；claims 绑定 `publication_id` |
| FR2-15 物化跨边界 | P1 | ACCEPT | §6.3 物化函数纯 SQL；规则在 TS 写回执；F4 经 outbox；钩子只写覆盖表 |
| FR2-16 F4 生命周期 | P1 | ACCEPT | §10.2 `claim.retract/licence.changed` 事件；§11.2 F4 读取只计 `active` 且 `visibility_ref` 可见 |
| FR2-17 历史 / 映射不一致 | P2 | ACCEPT | §4.11 排除被引用前任；§4.9 映射只允许关闭 `valid_to` |
| FR2-18 复权分类无依据 | P2 | ACCEPT | §10.3 改称"复权不连续"，两序列留存，阈值登记 |
| FR2-19 阶段顺序不可执行 | P2 | ACCEPT | §14 评测回执写库提前到 FR-2；测试库 `synthetic` 回执；生产只认 `gold` |
| FR2-20 批次结果与代码不符 | P2 | ACCEPT | §2.6 记录 `batchStatusFromCounts` 语义；§6.2 逐情形给出六计数器与错误 |
| FR2-21 运维参数无主 | P2 | ACCEPT（部分 OWNER） | §6.2 分块参数（D5）；§8.3 核验游标与预算、outbox 重试；O12 `minN` 截止 FR-7 前；§16 9 记录 `recordAttempt` 单生产者假定与接受理由 |
| FR2-22 机械不一致 | P3 | ACCEPT | 核验 cron 统一归 FR-5；规则清单 R1–R10 |

## 第三轮前仍开放的项（记录，非本轮处置）

- Supabase Storage / Vercel / Postgres 视图与触发器语义的实机验证（§16 1、8；FR-1 `storage-check.ts` 与 FR-0 迁移测试给出答案）。
- 许可（D1）、黄金集回执、`test:storage` 回执三项对外门禁尚无证据；对外发布停在 FR-6。
- 第 3 稿未经 Codex 复审；计划编写前再跑一轮。

## 第三轮（`04-codex-round3.md`，对第 3 稿）→ 第 4 稿处置

第三轮 verdict 原文："Verdict: Not ready for an implementation plan: blocking gaps remain in publication/input validity, disclosure and claim eligibility, evidence preservation, atomic quarantine resolution, upload recovery, evaluation identity, numeric grounding and availability classification, plus FR3-01–03."

| ID | 严重度 | 决策 | 第 4 稿落点 / 理由 |
|---|---|---|---|
| FR3-01 摘要输入哈希两种定义 | P1 | ACCEPT | §4.4 新列 `summary_input_digest`（物化输出）；§4.7、§6.3 第 4 步、§6.4、§4.4 第 14 条四处只与该列比较 |
| FR3-02 分块合并丢弃证据 | P1 | ACCEPT | §6.2"分块合并"：身份 `(target_key, field, occurrence)`；`analyst/ticker` 按规范化值分配 occurrence；同身份不同值全部保留为 `conflict_group`，无自动选择；§4.4 第 17 条 `conflict_unresolved` 阻断；§6.3 `confirm` 一条则同组其余 `rejected` |
| FR3-03 register/retract 同一幂等键 | P1 | ACCEPT | §10.2：`event_id`（去重）与 `claim_key + claim_seq`（排序）分离；retract 先到写墓碑；outbox 唯一 `(claim_key, claim_seq)`；§11.2 消费契约 |
| FR2-03 规则输入哈希 / 父锁 | PARTIAL→ACCEPT | §4.4 `rules_input_hash`（全部规则输入）；§4.8 回执绑定它；§6.3 复核 / 新增 / 覆盖 / 绑定都先锁父行 |
| FR2-04 机构 / 映射视图未受开关 | PARTIAL→ACCEPT | §4.11 两视图加 `public_enabled` 且仅限有可见报告的机构 |
| FR2-07 显式清空 | PARTIAL→ACCEPT | §4.6 `corrected jsonb`：键存在且 null = 清空、键不存在 = 继承；选择器同规则 |
| FR2-11 标题 / 译名逃逸、分析师披露变更 | PARTIAL→ACCEPT | §4.4 第 15 条覆盖 `title_public/zh/en` 与片段摘要；`title_restricted` 排除引用；§4.9 分析师触发器与 §4.11 `disclosure_ok` + 重跑检查 |
| FR2-13 围栏只查 token | PARTIAL→ACCEPT | §6.2 `broker_extract_commit` 校验 token 且未过期，候选插入与物化同事务 |
| FR2-14 快照只存 id | PARTIAL→ACCEPT | §4.8 快照含片段 / 摘要全文与出处、覆盖行、披露输入 |
| FR2-15 钩子破坏性补偿 | PARTIAL→ACCEPT | §7.3 `broker_quarantine_resolve` 单事务：锁隔离行 → 锁报告 → 写覆盖 → 物化 → 翻转；无补偿删除 |
| FR2-16 目标视图存在≠目标价可公开 | PARTIAL→ACCEPT | §4.11 targets 视图暴露 `publication_id`、`target_price_public`；§11.2 资格 = 同 publication 且 `target_price is not null` |
| FR2-18 对齐 / 缺失 / 零除 / 舍入 | PARTIAL→ACCEPT | §10.3 内连接对齐、`series_missing/series_misaligned/bad_bar`、6 位舍入（§15.3） |
| FR2-20 仅隔离的批次为 success | PARTIAL→ACCEPT | §6.2 六计数器显式 + 非信息错误 `rules_failed_summary` |
| FR2-21 核验饿死 / 新鲜度并发 / 签字 | PARTIAL→ACCEPT | §8.3 失败也推进游标；手动运行不调 `recordAttempt`，仅核验 cron 调；O13 F3/F4 签字 |
| FR-04 评测身份 | DECLINED-NOT-ACCEPTABLE→ACCEPT | §4.3 `behavior_digest`（影响抽取结果的组件清单，与部署 sha 无关）；§4.10 回执按它匹配；§4.1 `approved_gold_corpus_hash` 由 owner 批准（O14），回执 `corpus_hash` 必须相等 |
| FR-14 同日晚于收盘 | PARTIAL→ACCEPT | §10.3 `retrospective = available_at > base_close_at`（`EXCHANGE_CLOSE` 表） |
| FR-15 意向卡在 validating | PARTIAL→ACCEPT | §4.2、§6.1 状态机 `open→validating→validated→promoting→committed`，每步持久检查点、重试续作、`promotion_pending` 文档列、`promotion_lost` 处置 |
| FR-25 数字 + 关键词不够 | PARTIAL→ACCEPT | §6.4 断言模式：每个含数字的句子须恰好匹配 `(<target>)? <字段关键词> <数值><单位>`，多标的须带代码，单位须一致，同句每个数字各自落地 |
| 其余 RESOLVED 项 | — | — | 不动 |

第 4 稿由 Codex 第四轮复审（`05-codex-round4.md`，范围限定为"第 4 稿新引入的缺陷 + 最终 verdict"）。

## 第四轮（`05-codex-round4.md`，对第 4 稿，范围限定为新引入缺陷 + 最终 verdict）

第四轮 verdict 原文："Verdict: READY WITH P2 FIXES for implementation planning."
FR3-01 / FR3-02 / FR3-03：Codex 判定 RESOLVED。

| ID | 严重度 | 决策 | 落点 |
|---|---|---|---|
| FR4-01 `promotion_lost` 后重上传被判重复 | P2 | ACCEPT — 按 Codex 处方逐字实施，未再审计 | §6.1 "`promotion_lost` 的恢复"：绑定既有 `document_id` 的替换意向，续作提升，成功前保持 `withdrawn` |
| FR4-02 披露重跑要求原标题也通过 | P2 | ACCEPT — 按 Codex 处方逐字实施，未再审计 | §4.11 "重跑规则"：沿用发布时标题策略；只检查 `approved` 面；改 `title_restricted` 需 unpublish/republish |
| FR4-03 标识符数字被当作数值 | P2 | ACCEPT — 按 Codex 处方逐字实施，未再审计 | §6.4 "标识符处理"：先切分标识符 token；每句恰好一条断言；其余数字 token 必须属于断言值或单位 |

Codex 第四轮标注 Unsure：Storage 提升语义与 F3/F4 执行行为未实机验证（已在 §16 1 与 O13 登记）。本轮之后停止，不再追加审计。
