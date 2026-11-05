# 行业研究规格 · Codex 审计处置表

日期：2026-11-04
对象：`docs/superpowers/specs/2026-11-04-industry-research-design.md`（第 3 稿）
轮次：`01-codex-round1.md`（第 1 稿，13 项）、`02-codex-round2.md`（第 2 稿；R1–R13 复核 + N1–N6 新项）。两轮上限已用完。
Codex 二轮判定原文："**Verdict:** **Not ready for implementation planning.** Round 2 materially improves the design, especially SIC scope, plan-2 draft-8 alignment, transactional membership writes, and per-industry reconciliation. However, historical membership still relies on unverified knowledge dates and today's identity resolution; the new issuer loader cannot use the landed identifier API as specified; incremental reuse and manifest retention can produce stale or unreplayable results; and replay can bypass valuation publication gates."

决策含义：ACCEPT = 第 3 稿已按建议修改；DECLINE = 不改，附理由；OWNER = 转为 owner 决策/核对项；OPEN-verify = 实施前核对项（已登记在规格 §16/§17）。

## 第 1 轮（01）→ 第 2 轮复核（02 R 列）→ 第 3 稿处置

| # | 一轮发现（摘要） | 二轮复核 | 第 3 稿处置 | 规格落点 |
|---|---|---|---|---|
| 1 / R1 | 只存摘要不能回放；成分、排除、标记未冻结；排序有并列 | PARTIAL：清单缺定位/filing/角色；`original` 只返回存值 | **ACCEPT**：清单 schema v2 冻结成分定位与关闭可知日、事实的 filing/source_ref/raw_hash/citation、标记观测版本、每发行人每指标角色；`replayFromManifest()` 纯函数仅凭清单重算，写入前自检，CI 删库回放；全序定义 | §5.3、§13.3 |
| 2 / R2 | 历史成分非时点安全：`available_date=in_date` 假设、按今天解析、查询忽略可得日期 | PARTIAL：关闭谓词自相矛盾；假设仍是假设；无纠正路径 | **ACCEPT + OWNER**：定义时间估计对象与 `effective_valid_to(knownBy)` 表达式；run 级 `history_class`（`point_in_time` 需核对项 3 通过 + `as_of` 解析 + owner 接受假设）否则 `reconstruction` 带徽标；纠正路径 = 旧行 `quarantined` + 新行；决策 G 决定重建期显示或抑制 | §4.4、§4.6、§16 决策 G |
| 3 / R3 | SIC 仅当前值，不能产出历史聚合 | RESOLVED | 保持：SIC 只做导航/成分/芯片，不聚合、不估值 | §1.2、§4.1 |
| 4 / R4 | 无公开的行业级事实采集范围；会暴露私有队列 | PARTIAL：缺回填契约、退市处理、就绪门、决策 C 衔接 | **ACCEPT + OWNER**：定义"行业事实宇宙"（历史成分 ∪ 活跃 A 股）经 `reconcile_fact_sync_scope` 写入（`facts-scope` job）；就绪门 ≥ 95% 成功同步；规格二决策 C 为"严格"则不启用；退市可得性列 §17.1 | §4.10、§16 决策 E |
| 5 / R5 | 授权只在 UI/API 层，数据库仍公开 | PARTIAL：策略示例直查 service-only 表；`security_marks` 以"底层公开"为由公开；函数权限契约不全 | **ACCEPT**：策略只调 `security definer` 辅助函数；函数 `search_path=pg_catalog, public`、对象限定、`revoke execute from public` 后窄授权；数据集级授权表（四个键），标记与官方值各自受控 | §4.3、§4.8 |
| 6 / R6 | run 模型不支持重算与增量发布 | PARTIAL：无过期发布者拒绝；完整性与缺失格矛盾 | **ACCEPT**：每格一行（`ok|missing+reason`），`expected_grid` 持久化，完整性 = 期望格全有行；`generation` 单调 + advisory lock + `obsolete_run` 拒绝 | §4.3、§5.4、§6.4 |
| 7 / R7 | 依赖了规格二第 3 稿不存在的派生 | RESOLVED；截断处理前后矛盾 | **ACCEPT**：统一为"发行人排除（`read_truncated`）、格照常产出" | §5.1、§5.3 |
| 8 / R8 | 估值估计对象不清（发行人 vs ticker、股本口径、分母选取） | PARTIAL：标记无版本/可得日期；主 ticker 唯一性；PS 契约缺 | **ACCEPT**：`security_marks` 观测版本化（`observed_date`、`superseded`、隔离 `mark_revised`），清单冻结观测版本；主 A 股 0/多个 → `ambiguous_primary` 排除；PS 从 v1 移除；`total_share` 口径为核对项 2 | §6.1、§6.3、§1.2 |
| 9 / R9 | 全局 95% 门可掩盖单行业全错；缺对缺失处理 | PARTIAL：合格序列仍发布失败/无对照日期；`pair_availability` 定义；静态 PE 混淆 | **ACCEPT**：两级门控——序列资格（对照对可得率 ≥ 0.9、一致率 ≥ 0.95、n ≥ 24）+ 逐日 `pair_status` 六态，`published` 由列级 CHECK 绑定 `within`；`pe_static` 独立指标独立门控；`official` 不可得 → 不发布 | §6.4 |
| 10 / R10 | 三行归属写入无事务契约 | RESOLVED | 保持 `apply_industry_memberships`（先关闭后插入）、`IndustryDb`、并发测试 | §4.5、§4.9、§13.2 |
| 11 / R11 | 迁移不可重放、清单不全 | PARTIAL：第 2 稿删掉了 run/metrics 表定义；未解析表未列 | **ACCEPT**：§4.3 恢复完整 DDL（十张新表、函数、策略、索引、桶），含 `industry_source_memberships`、`industry_manifests` | §4.3 |
| 12 / R12 | 11 年分位样本混频 | PARTIAL：`n ≥ 96` 使 5 年窗口不可用；缺口与补采规则 | **ACCEPT**：月末期望日由交易日历生成；`marks` 补齐全部缺失期望日期；分位资格改为"覆盖 ≥ 80% 期望月末、最长缺口 ≤ 3 月、n ≥ 36" | §6.1、§6.5 |
| 13 / R13 | 新鲜度无 `weekly`；公共新鲜度；篡改事实的测试 | PARTIAL：`dq_freshness` 有 CHECK，"表无改动"为假 | **ACCEPT**：迁移改 CHECK 加 `weekly` + 集成测试写入；`industry_freshness()` 三列投影；漂移测试改用更晚 filing 夹具 | §2、§4.3、§13.2–13.3 |

## 第 2 轮新项（02 N 列）→ 第 3 稿处置

| # | 二轮发现（摘要） | 处置 | 规格落点 |
|---|---|---|---|
| N1 | orgId 装载无法调用已落地 API（`matchIssuer` 要求 LEI/CIK/USCI；`attachSecurity` 不回填窗口） | **ACCEPT**：专用路径 `load-a-share.ts`（匹配顺序 orgId → 当前 ticker 持有人 → 新建；`issuers_cninfo_org_id_uidx` 保证并发唯一；不一致 → claim）；证券窗口回填明确交规格三 F3-2，本规格只留 `list_date` 于 provenance | §4.3、§4.7 |
| N2 | 增量复用谓词不健全（忽略 `facts_as_of`、方法/配置版本、无事实成员；`state_rev` 每次发布递增） | **ACCEPT**：复用键 = `facts_as_of`、`knowledge_date`、`history_class`、`method_version`、`config_hash`、`formula_version`、成分集合逐条、`member_state_revs`（含无事实成员）；明确接受复用率低，首版按每周全量预算 | §5.4 |
| N3 | 清单按 run 目录寻址，清理可删活跃证据；体量未估 | **ACCEPT**：内容寻址（`sha256/<hash>`）+ `industry_manifests` 索引 + 引用计数 GC（含 F4 判断引用）；体量估算（成员数按 150 估，实测后更新）与保留策略；估值承接 `recompute_from` 之前日期以限制周增量；存储配额列 owner 决策 C | §4.3、§5.3、§6.4 |
| N4 | F4 适配不符合其当前 `InputRef`（缺 `snapshot`/`origin`；`rows_sha256` 不存在） | **ACCEPT**：按 F4 §3.5 当前契约定义 `table_rows` 的 `snapshot={table, natural_key, rows}`、`hash=digest(snapshot)`、`origin`、`available_at=facts_as_of 日终`；请求 F4 白名单加两张表（依赖接口） | §7.1 |
| N5 | 未解析表是批次日志却被当成成分证据 | **ACCEPT**：改为 `industry_source_memberships`（不可变来源记录，稳定键、`current/superseded`、解析结果列）；`n_unresolved` = 当前记录中未解析的去重 ts_code；归属行引用来源记录 id | §4.3、§4.4、§5.2 |
| N6 | `replay` 的 service_role 路径绕过发布门 | **ACCEPT**：授权顺序 数据集公开 → run 活跃 → 格存在且（估值）`published`，否则 404；清单按格过滤（只含该指标的角色与输入）；`failed`/未发布只经 admin 路由；官方对照值受其数据集授权 | §9 |

## 未采纳或转交

| 项 | 决定 | 理由 |
|---|---|---|
| 一轮建议"把 F4 消费、判断占位与对方 31×10 回归样本推迟到证据/发布契约可用之后" | **DECLINE（部分）** | F4 适配只交付输入形状与方法入口（无 `compute`），成本低且 F4 规格已要求各模块定义行集合；回归样本是总纲 §1.6 明确要求的独立验证，保留在 §15，但不进接口 |
| 二轮 unsure 列表（`index_member_all` 两遍覆盖与 `out_date`、`index_classify` `parent_code` 命名空间、`sw_daily` 口径、`daily_basic.total_share`、`topSearch` 稳定性、许可） | **OPEN-verify / OWNER** | 全部登记为 §16 核对项 1–3 与决策 A/C；核对项 1、2 是 I-3 的前置，未完成不进计划 |
| 二轮提到 CSRC 对照"不能证明申万 9 月 30 日的知识状态" | **ACCEPT（说明）** | §13.4 把证监会对照明确为概念对照与成分存在性断言，不作为时点证据 |

## 结论

第 3 稿处置了两轮全部 P1/P2（13 + 6 项）；因两轮 Codex 上限已用完，规格 §15 增加一轮独立 Claude 复审（`04-claude-review.md`）作为进入计划前的最后一道审查。进入计划的硬前置：owner 决策 A、E、G 与核对项 1–3。
