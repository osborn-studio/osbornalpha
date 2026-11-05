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
