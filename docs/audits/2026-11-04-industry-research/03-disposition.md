# 行业研究规格 · Codex 审计处置表

日期：2026-11-04
对象：`docs/superpowers/specs/2026-11-04-industry-research-design.md`
轮次：`01-codex-round1.md`（第 1 稿，13 项）、`02-codex-round2.md`（第 2 稿；R1–R13 + N1–N6）、`05-codex-round3.md`（第 3 稿；T1–T6 + 复核）、`06-codex-round4.md`（第 4 稿；只审新引入缺陷 + 终审）。

决策含义：ACCEPT = 已按建议修改；DECLINE = 不改，附理由；OWNER = 转为 owner 决策/核对项；OPEN-verify = 实施前核对项（登记在规格 §16/§17）。

## 第 1 轮 → 第 2 轮复核 → 第 3 稿处置

| # | 一轮发现（摘要） | 二轮复核 | 第 3 稿处置 | 规格落点 |
|---|---|---|---|---|
| 1 / R1 | 只存摘要不能回放 | PARTIAL | **ACCEPT**：清单 v2 冻结成分定位/关闭可知日、事实 filing/raw_hash/citation、标记观测版本、逐发行人逐指标角色；`replayFromManifest()` 仅凭清单重算，写前自检，CI 删库回放 | §5.3、§13.3 |
| 2 / R2 | 历史成分非时点安全 | PARTIAL | 第 3 稿：估计对象、`effective_valid_to(knownBy)`、`history_class`、纠正路径。三轮仍 PARTIAL → 见下表 R2 | §4.4、§4.6 |
| 3 / R3 | SIC 无历史 | RESOLVED | 保持：SIC 只导航/成分/芯片 | §1.2 |
| 4 / R4 | 无公开行业级事实范围 | PARTIAL | **ACCEPT**：行业事实宇宙、`facts-scope`、就绪门、规格二决策 C 衔接 | §4.10 |
| 5 / R5 | 授权只在 UI 层 | PARTIAL | 第 3 稿：数据集授权表 + 辅助函数策略。三轮仍 PARTIAL（T1）→ 见下表 | §4.3、§4.8 |
| 6 / R6 | run 模型 | PARTIAL | 第 3 稿：每格一行、`expected_grid`、`generation`。三轮仍 PARTIAL（T2）→ 见下表 | §5.4、§6.4 |
| 7 / R7 | 规格二派生依赖 | RESOLVED | 保持；截断处理统一 | §5.1 |
| 8 / R8 | 估值估计对象 | PARTIAL | 第 3 稿：观测版本、主 ticker 唯一、PS 移除。三轮仍 PARTIAL → 见下表 | §6 |
| 9 / R9 | 对账门 | PARTIAL | **ACCEPT**：两级门控、`pe_static` 独立 | §6.4 |
| 10 / R10 | 归属事务 | RESOLVED | 保持 | §4.5 |
| 11 / R11 | 迁移清单 | PARTIAL | 第 3 稿恢复 DDL。三轮仍 PARTIAL（T4、缺字段）→ 见下表 | §4.3 |
| 12 / R12 | 分位采样 | PARTIAL | **ACCEPT**：交易日历期望日、补采、窗口资格 | §6.1、§6.5 |
| 13 / R13 | 新鲜度 `weekly` | PARTIAL | **ACCEPT**：迁移改 CHECK；公共投影；漂移测试改法 | §4.3、§13 |

## 第 2 轮新项 → 第 3 稿处置

| # | 发现 | 处置 | 落点 |
|---|---|---|---|
| N1 | orgId 装载与已落地 API 不符 | **ACCEPT**：专用路径、唯一索引、窗口回填交规格三 | §4.7 |
| N2 | 复用谓词不健全 | **ACCEPT**：复用键含截止、方法/配置/公式、逐成员 `state_rev`（含无事实成员） | §5.4 |
| N3 | 清单按 run 目录寻址 | **ACCEPT**：内容寻址 + 引用计数 GC + 体量估算 | §5.3 |
| N4 | F4 `InputRef` 形状 | 第 3 稿改形状。三轮仍 PARTIAL（时间规则）→ 见下表 | §7.1 |
| N5 | 未解析表是日志 | 第 3 稿改来源记录表。三轮仍 PARTIAL（T3）→ 见下表 | §4.4 |
| N6 | replay 绕过发布门 | **ACCEPT**：授权顺序 + 按格过滤 | §9 |

## 第 3 轮（05）→ 第 4 稿处置

| # | 三轮发现（摘要） | 决定 | 第 4 稿处置 | 落点 |
|---|---|---|---|---|
| T1 | `industry_valuations.official_value` 公开表泄露 `official` 数据集 | **ACCEPT** | 公共表删除 `official_value/rel_diff/pair_status`；对照结果移入 service_role 表 `industry_valuation_pairs`；`published` 只能由 `publish_industry_valuations` 置 true（触发器 `publish_guard`）；抽屉/replay 的官方值只在 `official` 数据集 `public` 时由路由经 service_role 附带；真实角色测试"scheme public + official internal → 取不到官方值" | §4.3、§6.4、§8.5、§9、§13.2 |
| T2 | 移动的 `recompute_from` 使常规激活失败；估值缺 `inputs_watermark` | **ACCEPT** | 过期判定改为 `generation` + `fingerprint_at`（读状态指纹的数据库时刻）+ `industry_run_dependencies` 逐发行人非回退（`dependency_regression`）；`recompute_from` 只作覆盖元数据；两类 run 表都加 `fingerprint_at`，删 `inputs_watermark`；测试"连续两次周运行都能激活" | §4.3、§5.4、§6.4、§13.2 |
| T3 | 解析与归属应用不原子；`out_date` 更正无转换 | **ACCEPT** | `apply_industry_memberships` 接收来源记录 id 与解析结果，归属写入与来源记录 `issuer_id` 同事务；失败回滚并写 `resolution_error`（重试不跳过、仍计未解析）；归属表改 `membership_id` 主键 + `superseded` 状态 + `superseded_by`，函数内"取代转换"（旧记录的 `ok` 行 → `superseded`，新行插入），排他约束只对 `ok` 行 | §4.3、§4.4、§4.5、§5.2 |
| T4 | `industry_metrics` 策略引用不存在的 `scheme/version` | **ACCEPT** | 新函数 `industry_metric_run_visible(run)` / `industry_valuation_run_visible(run)` 经 run 取 `scheme/version` 并校验授权与活跃；行表策略只调它们；删 `industry_run_is_active` | §4.3 |
| T5 | 同日观测版本冲突 | **ACCEPT** | `security_marks` / `industry_official_valuations` 改 `observation_id` 主键 + `observed_at timestamptz` + 幂等键 `(…, raw_hash)` + 当前观测唯一部分索引 + `supersedes` 链；清单冻结 `observation_id/observed_at` | §4.3、§6.1、§6.2、§5.3 |
| T6 | 估值承接忽略方法兼容性 | **ACCEPT** | 承接条件 = 方法/配置/公式/对照口径与上一活跃 run 全同，否则自动全量重算（`full_recompute_forced`）；承接日期在本 run 重新对照；序列资格与 `published` 每 run 重算不承接 | §6.4、§11 |
| R2（三轮 PARTIAL） | owner 接受假设不能建立历史知识；`point_in_time` 与总纲冲突 | **ACCEPT** | `history_class` 由证据决定：`point_in_time` 当且仅当成分可得日期有记录来源（`availability='evidenced'`）且解析按 `as_of`；v1 申万没有公告日来源 → 全部 `reconstruction`；owner 决策 G 只决定显示或抑制，不再包含"接受假设" | §4.6、§16 决策 G |
| R5（三轮 PARTIAL） | 新公共估值行泄露官方值 | **ACCEPT** | 同 T1 | — |
| R6（三轮 PARTIAL） | 激活拒绝常规周运行；`max(state_rev)` 不证明逐发行人非回退 | **ACCEPT** | 同 T2 | — |
| R8（三轮 PARTIAL） | 取"最新观测"却声称 `facts_as_of=D` 可得性 | **ACCEPT** | 明确"可得时刻规则"：单元格的可得时刻 = 计算它的 run 的 `created_at`（行 `updated_at`），从不回溯；`facts_as_of/trade_date` 只是描述的期间与事实可见性截止；后来观测到的修正只能产生 `updated_at` 更晚的新行 | §5.3、§5.4、§6.4、§8.5 |
| R11（三轮 PARTIAL） | 策略列缺失、估值 run 缺字段 | **ACCEPT** | 同 T2/T4；DDL 补齐 `fingerprint_at`、`updated_at`、`industry_valuation_pairs`、`industry_run_dependencies` | §4.3 |
| N4（三轮 PARTIAL） | `available_at=facts_as_of` 不是 F4 §3.7 的规则 | **ACCEPT** | 两张表加 `updated_at`（= run `created_at`）；按 F4 §3.7 原文"`table_rows` = 行的 `updated_at` 或 `valid_from` 日终"直接适用，不扩展；明确历史格子对更早 `as_of` 的判断是 `lookahead`（有意） | §4.3、§7.1 |
| N5（三轮 PARTIAL） | 来源取代/解析未与归属一致提交 | **ACCEPT** | 同 T3 | — |

## 第 4 轮（06）→ 第 5 稿：按 Codex 处方逐字实施，未再审

Codex 四轮判定原文（对第 4 稿）："**Verdict:** **not ready** for implementation planning. U1/U2 block ordinary replacement operations; U4 leaves dependency non-regression unprovable; U5 permits publication bypass; and U6 still permits lookahead. Apply those blocking fixes and the U3 reversion fix before proceeding."

复核：T1、T2、T4、T6、R2、R5、R11 RESOLVED；T3、T5、R6、R8、N4、N5 PARTIAL（原因全部落在 U1–U6）。协调者指示：按处方实施 U1–U6，不再开 Codex 轮次。每项状态 = **implemented per Codex's prescribed fix (round 4), not re-audited**。

| # | 严重度 | 四轮发现（摘要） | 第 5 稿实施（按 06 处方） | 状态 | 落点 |
|---|---|---|---|---|---|
| U1 | P1 | 取代转换无可执行语句顺序；迁移未显式删除已落地的 `issuer_industry_memberships_no_overlap` | 迁移显式 `drop constraint if exists issuer_industry_memberships_no_overlap`；保留新的 `status='ok'` 部分排他与部分自然键唯一；`superseded_by` 自引用 FK `deferrable initially deferred`；函数预分配替代行 `membership_id`，旧行 `status` 与 `superseded_by` 一条 `update` 同写，再以预分配 id 插入替代行，与解析落账同事务提交；不允许 null 后继；分类 FK（归属→分类）保留 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.3、§4.5、§13.2 |
| U2 | P1 | 观测替换先插新行撞当前观测唯一索引 | `apply_observations`：按自然键 `pg_advisory_xact_lock`（无当前行也锁）→ 先校验/去重 → 旧 `ok` 置 `superseded` → 插入新 `ok`（`supersedes=旧 id`），同事务，插入失败回滚取代；标记与官方值同序 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.3、§6.1、§6.2 |
| U3 | P2 | 永久 `raw_hash` 唯一丢弃 A→B→A 回归 | 新表 `industry_fetch_events`；唯一键改 `(自然键, fetch_event_id)`，重试复用同一事件；与**当前**观测比内容：相同=重复，等于被取代观测的内容=新观测；`raw_hash` 只作证据；A→B→A 三事件测试 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.3、§6.1、§13.2 |
| U4 | P1 | 每 (run, issuer) 一个 `state_rev` 无法表达混合版本 | `industry_run_dependencies` 主键 `(run_kind, run_id, cell_key, issuer_id)`；`state_rev` 取该格实际 `read_facts` 信封，复用/承接格从冻结清单复制；`stage_industry_run_dependencies` 校验每格依赖集合 = 候选成员集合（`dependencies_incomplete`）；激活逐格逐发行人与活跃 run 比较，任何下降 → `dependency_regression`；不用指纹或 MIN/MAX；`fingerprint_at` 只是编排元数据 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.3、§5.4、§6.4 |
| U5 | P1 | 会话设置守卫可伪造；INSERT 未覆盖；service_role 可直写 | `service_role` 对估值行、对照行（及聚合行、依赖行、观测表）显式 `revoke insert, update, delete`；函数由专用非登录角色 `industry_publisher` 拥有（`security definer`）；`stage_*` 只接受 `building` run 并强制 `published=false, series_qualified=false, updated_at=null`；`publish_industry_valuations` 锁 run、校验格与对照一一对应、算资格、置标志、run→`published`；发布后冻结触发器；激活复核发布不变量；删除会话设置机制；测试直接 insert/update/delete 被 `42501` 拒 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.3、§6.4、§13.2 |
| U6 | P1 | `updated_at = run.created_at` 回溯可得时刻 | 全部 `updated_at = run.created_at` 规则删除；`updated_at` 在 building 期间为 null（行对外不可见），由 `activate_*` 在全部读取、计算、对账之后用同一数据库时刻 `t` 写入行 `updated_at` 与 run `activated_at`，此后禁止变更；承接行取新 run 的激活时刻；F4 用其既有 `updated_at` 日终 UTC 规则；跨 UTC 午夜测试 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.3、§5.3、§5.4、§6.4、§7.1、§13.2 |

结论：第 5 稿把 U1–U6 全部按处方落入规格文本，但**未经 Codex 复审**；进入计划前仍需 owner 决策 A、E、G 与核对项 1–3。外部 API 不确定项（Tushare 历史完整性/分页、`sw_daily` 口径、`daily_basic` 股本口径、`trade_cal` 字段、巨潮历史身份稳定性）仍为 §16 核对门。

## 未采纳或转交

| 项 | 决定 | 理由 |
|---|---|---|
| 一轮建议"推迟 F4 消费、判断占位与对方回归样本" | **DECLINE（部分）** | F4 适配只交付输入形状与方法入口；回归样本是总纲 §1.6 的独立验证项，不进接口 |
| 各轮 unsure 列表（`index_member_all`、`index_classify` `parent_code`、`sw_daily` 口径、`daily_basic.total_share`、`topSearch` 稳定性、退市覆盖、许可） | **OPEN-verify / OWNER** | §16 核对项 1–3、决策 A/C；核对项 1、2 是 I-3 前置 |
| 三轮"owner 决策本身不能解决 R2/R8/N4" | **ACCEPT** | 第 4 稿把这三项改为规格内规则，不再依赖决策 |
