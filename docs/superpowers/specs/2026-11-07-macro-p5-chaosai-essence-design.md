# 宏观工作台 P5 · ChaosAI 精华吸收（美林时钟卡片 · 图表组织 · 数据缺口）设计规格

日期：2026-11-07。第 1 稿；第 2 稿（§0.1）；第 3 稿（§0.2）；第 4 稿（§0.3，完整规范文本）；第 5 稿（§0.4）；**第 6 稿**（处置第五轮 Codex N1/N2/N7/N8、mmx #88–#106，§0.5）
状态：第 6 稿，待第六轮审计（`docs/audits/2026-11-07-macro-p5/`）
前置：`docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（P1+P2 第 6 稿；其 §3.2 已含本规格 §2.4 的"第 7 稿修订"）、`docs/superpowers/specs/2026-11-07-macro-workbench-p3-p4-design.md`（P3+P4 第 3 稿）、F4 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md`
研究输入：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`、`docs/research/chaosai-macro-2026-11-07/handoff-chatgpt-2026-11-07.md`
总纲（硬约束）：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5。
基线：`origin/main` `1e9cfb87`。生产：`MACRO_STRATEGY_ENABLED=1`，`MACRO_JUDGMENTS_ENABLED` 未设。

---

## 0. 一页结论

1. **不写第二套评分引擎，客户端不评估任何规则。** 评分已在 `src/lib/macro/regime.ts`（`classifyRegime`），每次快照发布时冻结进 `macro_regime_results`。P5 只在服务端把冻结结果投影成"判定 → 四象限 → 前三驱动 → 分解 → 证据"，并在服务端对账（§3.4）；对账失败 → 不出数字。
2. **展示门槛 = 既有发布条件**：服务端开关 `MACRO_JUDGMENTS_ENABLED=1` **且** F4 对当前活动快照存在可发布（`publishable=true` 方法）、生命周期合格的 `macro_regime` 判断卡（P1 §3.2 第 7 稿修订、runbook §12、F4 §4.1）。规则得分占比作为该卡的依据显示；F4 categorical 卡 `display.percent` 保持 null。
3. **差距分三类：展示（WP-B、WP-C）、数据（WP-D）、方法（§9）。**
4. **ChaosAI 只借信息架构，不借数据与规则。**
5. **跨模块硬约束（§2.5）**：目录每变一版 → F4 新方法版本 + 生产三处版本常量切换；WP-B/WP-C 不碰 v1 `deps` 与闭包文件；权重/阈值/规则不改；开关只在服务端。

### 0.1 / 0.2 早稿处置

第 1→2 稿（Codex C1–C27、mmx M1–M48）与第 2→3 稿（Codex R-C1–R-C16、mmx R-M1–R-M45）的逐条处置见审计目录 `02…06` 与本规格 git 历史（提交 `e85679c3`、`b5ebd0c`…）；本稿不再重复，所有被接受的内容已写入正文。

### 0.3 第 4 稿处置（第三轮）

| 来源 | 处置 | 落点 |
|---|---|---|
| T-C1（margin 舍入使合法结果对账失败） | 接受：不变式 5 用存储 r6 贡献重建发布端运算顺序（未舍入 norm → margin），容差 1e-4 pp；不变式 7 的 F4 `margin_pp` 与"由存储 r6 norm 计算的 margin"比较，容差 1e-6；两份现有 fixture 作为端到端成功用例 | §3.4 |
| T-C2（贡献可引用比较观测） | 接受：不变式 1 要求 `contribution.observation_id === 该序列在 manifest 中的最新观测（period_end 最大、version 最大）`；同序列同期多版本 → `integrity_error` | §3.4 |
| T-C3 / T-M61（迁移约束查找歧义） | 接受：按 `pg_get_constraintdef` 的精确正则 `^CHECK \(\(adapter = ANY` / `native_frequency = ANY` 匹配，断言恰好一条，循环删除所有匹配；`macro_evidence_path` 不受影响；迁移测试插入 `official_http` 证据对象 | §5.8 |
| T-C4 / T-M55（v1 测试与注册表切换矛盾） | 接受：`macro-regime.v1.test.ts` 迁移为历史回归（隔离的历史注册表/目录/哈希 fixture）；生产注册表与 compensate 对 v2/v3 单独测试；历史 golden fixture 不再生成 | §5.7 |
| T-C5（大图卡历史与快照资格） | 接受：标题 = 快照值；图表 = "可得时间 ≤ 快照时刻的历史"，两者标注分开；最后一点 id 不等 → 提示；完整的"按快照资格"历史契约在 D1（可改 `views.ts`/`db.ts` 时）作为 `history_ids` 扩展处理 | §4.1 |
| T-C6（POST 行为变更） | 接受：POST 保持 `seriesHistory`（`history:'as_of'`）；预设用 `eligible_as_of`；删除"预设 = POST 同结果"的声称，改为"预设 = 共享服务同模式同结果" | §4.4 |
| T-C7（not_matched 与比较缺失折叠） | 接受：行带 `inputs_present:{prev:boolean;prev3m:boolean}` 作为事实，不声称因果；文案"规则未命中（上期：有；3M 前：缺）" | §3.3 |
| T-C8 / T-M32 / T-M36（完成见证状态） | 接受：D1 新增 `Timeliness` 值 `awaiting_witness`（`freshness.ts`/`views.ts` 在 D1 可改），月度派生行输入已有更新期但派生行未生成时显示；D1 之前不显示（限制写入 runbook §14） | §5.3、§5.5 |
| T-C9 / T-M58（详情生命周期为准） | 接受：详情 `card.lifecycle`、`judgment_id`、方法、快照输入与列表卡逐项核对，不一致 → `f4_unavailable`（`detail_mismatch`） | §3.3 |
| T-C10 / T-M28（规范完整性；firstPeriod） | 接受：本稿完整；`firstPeriod` 列标 **[D0a 回填]** 作为 D1 前置条件（不是实现缺口） | 全文、§5.2 |
| T-M1 / T-M2 / T-M4 / T-M25（方法清单不完整） | 接受：D1 的 `method_manifest` 扩为完整行清单（§5.2），含 latest/prev/prev3m 观测 id、四元 support（缺省 0）、贡献格、单位、changeKind、denominator 成员；P5-B 阶段的版本门槛论证保留 | §3.3、§5.2 |
| T-M3 / T-M8 / T-M9 / T-M11（优先级与对账顺序） | 接受：顺序改为 快照 → 版本 → 观测完整性 → 判定记录 → **存储对账（1,2,4,8；regime 非 null 再 3,5,6）** → F4 → 7；对账失败在 F4 之前记录并返回；`regime_status` 由存储值内部推导，只暴露枚举 | §3.3 |
| T-M5（pending_fill） | 接受：合格集 = `{open, settled}`；`pending_fill` → `f4_ineligible` | §2.4 |
| T-M6（单状态结果） | 接受：v1/v2 对 `secondary_state===null` 弃权（`invalid_snapshot`）→ `f4_ineligible`；不变式 7 永不遇到 null secondary | §3.6 |
| T-M7 / T-M42 / T-M57（多卡选择、acceptedVersions） | 接受：F4 列表对每个 (judgment_type, methodology) 至多一张卡；候选 = `methodology.version ∈ ACCEPTED_F4_VERSIONS`（部署常量 = 注册表版本）；多张候选取版本最高、再 `as_of` 最新、再 `judgment_id` 字典序 | §3.3 |
| T-M10（matched 权重未存） | 接受：`matched = Σ contributions[].weight`；不变式 4：`matched + uncovered_weight === denominator`（整数/r6 精确） | §3.4 |
| T-M12（axes 的 support 缺省） | 接受：只用 matched 行；support 缺省 0 | §3.4 |
| T-M13 / T-M14（行状态与角色算法） | 接受：精确规则表 | §3.3 |
| T-M15 / T-M38（版本门槛与 D1） | 接受：D1 后旧快照 `catalog_version ≠ A` → `version_unsupported`（明文） | §3.3 |
| T-M16（v2 闭包） | 接受：v2 `deps` 逐字 = v1 列表；闭包随目录变化而变是设计（每次目录变化 = 新版本） | §5.7 |
| T-M17（上线窗口） | 接受：顺序 迁移 → 以合并提交运行 sync（register v2）→ 部署；窗口内旧代码按 v1 产出被 DB `retired` 行拒绝 → `methodology_missing` 跳过（可接受，记 runbook） | §5.7 |
| T-M18（事件行列） | 接受：按 `judgment_methodology_events` 全部非空列写出语句 | §5.8 |
| T-M19 / T-M20 / T-M21 / T-M53（adapter 推导、MIME、host） | 接受：`macro_retrievals` 无 adapter 列（只 `macro_evidence_objects` 有，`:90`）；推导边界与 MIME→parser 映射；host 比较含端口（`url.host`）保持现状 | §5.3、§5.8 |
| T-M22（D1 可部署性） | 接受：D1 不含 `official_http` 目录行，枚举先行 | §5.8 |
| T-M23（eligibleHistoryAsOf 语义） | 接受：按 `db.ts:350-360`：候选按 period_end 分组、`selectEligibleHistoryAsOf(group, asOf, …)` 读取批次回执，只保留 asOf 前已完成批次的最高版本 | §4.4 |
| T-M24 / T-M27 / T-M50（POST 幂等、computed_at） | 接受：POST 幂等查找留在路由；`computed_at` = 首次计算 UTC 时刻（memo 命中返回原值） | §4.4 |
| T-M26 / T-M51（memo 键） | 接受：键加 `PRESETS_VERSION`（预设表版本常量） | §4.4 |
| T-M29 / T-M30 / T-M31（weekly 规则）| 接受：逐序列发布日、`releaseLagDays`、月度选择规则写明 | §5.2 |
| T-M33 / T-M34 / T-M35（LPR 键、事件、AFRE 修订） | 接受 | §5.3、§5.4 |
| T-M37（新目录字段入库） | 说明：`firstPeriod` 是代码字段，不进 `macro_series` 镜像（镜像列固定）；D1 不改镜像 RPC | §5.2 |
| T-M39（norm 重算输入） | 接受：从存储 r6 贡献重建（T-C1） | §3.4 |
| T-M40–T-M49、T-M52、T-M54、T-M56、T-M59、T-M60 | 接受，逐条写入 | 各节 |

### 0.4 第 5 稿处置（第四轮：Codex `11-spec-round4-codex.md` N1–N6；mmx `12-spec-round4-mmx.md` #62–#87）

| 来源 | 处置 | 落点 |
|---|---|---|
| N1 / #62 / #64（方法清单是未校验的第二表示） | 接受：D1 起 `method_manifest` 为**唯一**渲染来源，并加不变式 9（清单校验：版本、行集合 = `regionWeights` 键、denominator、角色与观测 id ∈ manifest、matched 行与 `rec.contributions` 逐格相等、未匹配行 `rule_id/support/contribution` 皆 null）；P5-B 阶段（无清单）按 §3.3 规则从 `rec.contributions` 投影；两条路径互斥，由 `method_manifest` 是否存在决定；清单只改一处的破坏用例 | §3.4、§5.2 |
| N2 / #70（retire SQL 不可执行） | 接受：给出可执行、幂等的 `DO $$` 块（锁行、从 `judgment_methodology_events` 取 `max(seq)`、已 retired 则跳过） | §5.7 |
| N3（`rules_version` 在 `RegimeRecord`） | 接受：门槛拆为快照版本（读快照后）与规则版本（读判定记录后，`record_missing` 优先） | §3.2、§3.3 |
| N4（`republish_macro_snapshot` 丢清单） | 接受：D1 迁移同时改 republish RPC 复制 `method_manifest` | §5.2、§5.8 |
| N5 / #87（事件身份） | 接受：派生事件身份 = `kind|region|series_id|effective_date` | §4.2 |
| N6（cutoff 使 `inputs_hash` 必变） | 接受：新增 `data_hash`（只哈希序列定义、观测 id/值、事件输入；`analysis-spec.ts::dataHash`）；"输入已更新"按 `data_hash` 比较 | §4.4 |
| #63（规则 label 来自当前代码） | 说明：label 是规则表版本 1.0 的一部分，与 `support` 同源同版本；清单冻结 `rule_id` + `rules_version`，label 查表受 `rules_version` 门槛保护；文本不是数字 —— 接受为已记录设计 | §3.3 |
| #65（不变式 5 重建） | 不接受：发布端 `scores` 是未舍入贡献之和再 r6，存储只有 r6 贡献；重建差异已由容差（2e-6 / 1e-4）覆盖并以两份真实 fixture 验证（T-C1 的处置） | §3.4 |
| #66（不变式 8 对未匹配行） | 接受（已限定"只对 `C` 中的行"） | §3.4 |
| #67（D1 后版本门槛） | 说明：目录哈希 A ≠ 旧值即足以拒绝旧快照；清单带 `version:'macro-method-manifest/1'` | §3.3 |
| #68 / T-M16（v2 闭包） | 接受为设计：闭包随 live 文件变化而变 = 需要新版本；这正是 C6 的强制；写入 v2.md | §5.7 |
| #69 / T-M17（上线窗口） | 接受：顺序改为 **sync（以合并提交注册 v2，v1 仍 active）→ 部署 → 迁移（retire v1）**；窗口内新旧方法同时 active，旧代码产 v1、新代码产 v2，均合法 | §5.7 |
| #71（retrievals adapter 列） | 说明：`macro_retrievals` 无 adapter 列（迁移 `:90` 的 CHECK 在 `macro_evidence_objects`）；迁移测试覆盖 | §5.8 |
| #72（adapter 与 parser 绑定） | 接受：`parserFor` 返回 `{parse, adapter}`，ingest 断言 `parser.adapter === 推导 adapter`，否则 `evidence_adapter_mismatch` | §5.3 |
| #73（协议/重定向） | 接受：只允许 `https:`，`redirect:'error'`，证据 host = `url.host` | §5.3 |
| #74（解析值绑定序列/期） | 说明：现有链路 `ParsedPoint{seriesId, periodEnd, valueText, locator}` 由 parser 产出，claims 只交叉校验（`ingest.ts:5-6`）；新 parser 同样产出 `ParsedPoint`，`periodEnd` = 报价日/操作日/统计期月末 | §5.3 |
| #75 / T-M37（`firstPeriod` 不入镜像） | 说明：`macro_series` 镜像列固定、`upsertCatalog` 只写既有列；`firstPeriod` 只用于 `fredCosdFor`；六行按既有列入镜像 | §5.2 |
| #76 / #77（memo 键与 `computed_at`） | 接受（已改：值 = 整个地区响应；`computed_at` 顶层） | §4.4 |
| #78（失败后 `regime_status`） | 接受（已改：对账失败 → `unknown`） | §3.3 |
| #79（非有限值） | 接受（已改：归 `not_matched`，原样显示） | §3.3 |
| #80（相邻定义） | 接受（已改：已存储报价相邻） | §5.3 |
| #81（F4 超时） | 接受：列表超时则不发详情；总预算 6 s | §3.2 |
| #82（状态计数） | 接受：改为"11 个卡级状态 + 2 个传输态" | §3.6 |
| #83（memo 头语义） | 接受（已改） | §4.4 |
| #84 / T-M29（weekly 下一期） | 接受：下一期 = 上一 period_end + 7 天；逾期判定 = 下一期 + lag + 3 天；非 7 天间隔的源周（节假日）由宽限吸收 | §5.2 |
| #85 / T-M56（v1 判断作废） | 说明：`unavailable` 结果由 `judgments-settle` cron 在 `settle_by` 后记 `void`（F4 规格 §7）；已结算判断不受影响 | §5.7 |
| #86（约束正则） | 接受：替换后 `assert` 新约束存在且旧约束计数为 0 | §5.8 |
| T-M6 / T-M14 / T-M28 / T-M30 / T-M31 / T-M35 / T-M36 / T-M54 | T-M6：单状态结果 = 上游方法弃权，时钟显示 `f4_ineligible`（已定）；T-M14：D1 后角色来自清单（已定）；T-M28/30：D0a 前置（已定）；T-M31：月行值 = 该周平均原值，不再聚合（已定）；T-M35/54：AFRE 表标识与冲突规则补全 | §5.4 |

### 0.5 第 6 稿处置（第五轮：Codex `15-spec-round5-codex.md`；mmx `16-spec-round5-mmx.md`）

| 来源 | 处置 | 落点 |
|---|---|---|
| N1 / #97（清单元数据未与目录核对） | 接受：不变式 9 增加 `name/type/unit/change_kind/status/reason` 与门槛内目录逐字段相等；元数据破坏用例（只改 `change_kind`） | §3.4 |
| N2（`occurred_at`/`reason` 不在语句里） | 接受：写入 INSERT | §5.7 |
| N7（部署顺序先于 schema） | 接受：拆两个迁移：`20261121090000_macro_p5_schema.sql`（向后兼容：新列、新 RPC、CHECK 放宽）先于 sync/部署；`20261121091000_macro_p5_retire_v1.sql` 在验证 A 快照与 v2 产出后 | §5.7、§5.8 |
| N8（`create or replace` 加默认参数 = 新重载） | 接受：新 RPC `macro_publish_snapshot_v2(…)`（显式签名），同事务 `revoke … from public, anon, authenticated; grant execute to service_role`；旧 RPC 保留（旧代码可用）直到 D5 清理 | §5.8 |
| #88（null regime 与 F4） | 说明：`rec.regime===null` 时 F4 必弃权 → 时钟 `f4_ineligible`（§3.3 顺序 6 在 7 之前）；不变式 7 的"regime 非 null"只是防御 | §3.3 |
| #89 / #92（清单 status 词表；事件源行字段） | 接受：清单 `state` 用 §3.3 行状态词表；事件源行完整字段写入 §5.3 | §5.2、§5.3 |
| #90（ingest 当前硬编码） | 说明：§5.3 已规定 D1 改 `ingest/route.ts` 推导 adapter 与 `DATASET_OF` 增项；审计引用的是现状代码 | §5.3 |
| #91（源请求契约） | 说明：精确 URL/参数/头由 D0b–D0d 核实记录给出，是 D2–D4 的前置输入，不在规格内伪造 | §5.3 |
| #93（事件版本进 memo 键） | 接受：memo 键加 `EVENTS_VERSION` | §4.4 |
| #94（确定性 `request_id`） | 说明：预设从不持久化、不经幂等 RPC；`request_id` 只为通过校验器；响应 `inputs_hash`/`data_hash` 才是身份 | §4.4 |
| #95（DB `period` 仍为 day） | 说明：weekly 原生行 `period:'day'`（period_end = 周三），与 DB 一致 | §5.2 |
| #96（清单从何构造） | 说明：`publishRegion` 拥有 `built.input`（含 prev/prev3m id）、`cls`（contributions、regime、uncovered）与 `regionWeights`；清单由这三者构造 | §5.2 |
| #98（传输状态码） | 接受：路由传输层 400/401/404/503 列表（非 `ClockStatus`） | §3.2 |
| #101（not_matched 证据） | 接受：任何 `latest` 非 null 的行都可打开证据 | §3.5 |
| #99、#100、#102–#106 | 接受为已记录限制或已有规则（F4 URL = `NEXT_PUBLIC_SITE_URL` 原样 + 路径；比较用 IEEE-754 `Number`，输入为 r6 值；评估路径 ext 不变；AFRE 发布日期取列表页同行日期文本；MLF 同日同利率取金额合计、证据链全部保留；完成见证 = `derive.ts` 现行规则） | 各节 |

---

## 1. WP-A · 基线：ChaosAI 各板块对照矩阵（2026-11-07 核实）

| # | ChaosAI 子板块 | 我方对应能力 | 状态 | 差距 | 归属 |
|---|---|---|---|---|---|
| 1a | 判定头 | `RegimeResult`（`macro_regime_results.regime`）；F4 `macro_regime@v1`（categorical） | merged（开关关、`publishable=false`） | 展示 + O1 | WP-B |
| 1b | 四象限 + 百分比 | `norm/scores/margin_pp/coverage`；F4 claim `distribution` | merged | 展示 + 命名 | WP-B |
| 1c | 定量分解 | `RegimeContribution[]`；Basis 技术表 | merged | 展示 + 服务端对账 | WP-B |
| 1d | 偏差案例 | `deviations.ts` | merged | — | 不动 |
| 1e | 方法论页 | `?tab=methodology`；`macro_regime/v1.md` | live | 规则表（随开关） | WP-B |
| 1f | 配置模板 | 无（有意） | not impl | 不做 | — |
| 2a | 指标表 | `IndicatorTable` | live | — | 不动 |
| 2b | 指标大卡 | `IndicatorDetail` + `MacroLineChart` | live | 组织 | WP-C |
| 2c | 关联 | `CorrelationWorkbench` | live | 首进无结果 | WP-C |
| 3a | 利率三合一 | `CN_LPR_1Y`/`CN_MLF_1Y` missing；无 5Y | not impl | 数据 | WP-D |
| 3b | 社融存量同比 | missing | not impl | 数据 | WP-D |
| 4a | 传导流 | `TransmissionFlow` | live | 可读性 | WP-C |
| 4b | 流动性节点 | `not_in_catalog` | not impl | 数据 | WP-D |
| 4c | 剧本 | `PlaybookGrid` | live | 文案 | WP-C |
| 5 | 联储→中国 | `PolicyResponseMatrix` | live | 权益列受限 | WP-C/D |
| 6 | 周期 × 资产 | `CycleReturnsTable` | live | 受限列 | WP-C |
| 7 | 来源 | `SourceFooter`/`SourceDrawer` | live | — | 不动 |

不触碰的在飞行文件：PR #125（`src/lib/judgments/{deps,inputs-db}.ts`、`src/app/api/judgments/[id]/route.ts`、`src/app/api/macro/{series,snapshots}/[id]/route.ts`）、#123/#124、`claude/macro-strategy-latency`（`db.ts`、`strategy/port.ts`）、foreign research（`20261119*`）。P5-B/P5-C 不改 `db.ts`；D1 改 `db.ts` 时先合并 latency 分支。

---

## 2. 时钟数据契约

### 2.1 计算（`regime.ts`，`METHODOLOGY_VERSION='v1.0'`，`RULES_VERSION='macro-regime-rules/1.0'`）

- 输入 `RegimeInput{region, series:Record<id,{latest, prev?, prev3m?}>}`。
- 参与条件：`WEIGHTS_V1` 中该地区序列，目录 `active`、`type` 非空、`weight>0`；`d1 = latest − prev`（百分点），`d3 = latest − prev3m`（fx 为百分比变化）；缺比较期 → null。
- `matchRule(type, v, d3, d1)`：只在本类型规则表找第一条。
- `contribution[i][q] = r6(weight_i × support[q])`；`scores[q] = r6(Σ 未舍入)`；`norm[q] = r6(scores_raw[q]/Σ scores_raw)`；`pickStates(norm_raw)`；`margin_pp = r6(100×(norm_raw[p] − (norm_raw[s] ?? 0)))`；`coverage = r6(matched/denominator)`；`uncoveredWeight = r6(denominator − matched)`；axes 如 §3.4 不变式 6。
- `coverage < 0.6` 或 `Σ ≤ 0` → `regime=null`（贡献、uncovered 仍存）。
- 权重 US 100 / CN 125；`RULES[type][].label:{zh,en}` 与 `support` 属规则表 1.0。

### 2.2 冻结与存储

- `buildRegimeInput`：`latestEligible`；`prev` = 24 个月窗口内最近更早期；`prev3m` = 恰好 −3 个月（季度：上一季度末，同一 `shiftMonthEnd(−3)`）；三者 id 去重进 `observation_ids`（prev 与 prev3m 可同一观测）；manifest 每序列 ≤ 3 条、每期一条。
- `publishRegion` 同事务写 `macro_snapshots` 与 `macro_regime_results`；后者 service_role only，经 `db.regimeOf`。
- `macro_series` 镜像只存当前目录。
- 快照不论 coverage 都发布。

### 2.3 读取

| 路由 | 返回 |
|---|---|
| `GET /api/macro/overview?region=` | `Envelope{snapshotId, asOf(日期), catalogVersion, methodologyVersion, collection, indicators[]{…, sparkline:string[]}, changes, catalogCounts}` |
| `GET /api/macro/snapshots/[id]` | `{catalogVersion, snapshot{…, created_at, status}, observations[]}`（+ 开关开：判定字段） |
| `GET /api/macro/series/[id]?from&to&asOf&transform` | `SeriesJson`（`asOf` ⇒ `available_at ≤ asOf`，经 `db.seriesHistory`，不按批次完成过滤） |
| `GET /api/judgments?subject_type=macro_region&subject_key=<R>&types=macro_regime&include_abstained=1` | `{cards[]}`：每 (judgment_type, methodology) 至多一张；`JudgmentCard{judgment_id, kind, lifecycle:Lifecycle, calibration, as_of, methodology{id,version,title,href}, display, inputs[]{kind,ref,available_at,origin,href}, abstain_reason?}`；`Lifecycle='abstained'\|'open'\|'settled'\|'void'\|'withdrawn'\|'pending_fill'`；只含 `publishable=true` 方法；弃权卡需 `include_abstained=1` |
| `GET /api/judgments/[id]` | `{card, judgment{judgment_id, methodology_id, methodology_version, abstained, abstain_reason, inputs, claim:{selected, classes, distribution, scores_are_not_probabilities:true, margin_pp, catalog_version}}, settlements, calibration}` |

### 2.4 决策 D1：时钟 = F4 判断卡 + 其依据

挂载条件（全部成立才出任何数字）：
1. `macroJudgmentsEnabled()`；
2. 快照 = 该地区活动快照，且 `catalog_version === CATALOG_VERSION`、`methodology_version === METHODOLOGY_VERSION`、`rules_version === RULES_VERSION`；
3. F4 列表中存在候选卡：`methodology.id==='macro_regime'`、`methodology.version ∈ ACCEPTED_F4_VERSIONS`（部署常量，P5-B 为 `['v1']`）、`inputs` 含 `{kind:'macro_snapshot', ref:{snapshot_id}}` = 本快照；多张候选取 version 最高 → `as_of` 最新 → `judgment_id` 字典序最小；详情 `card.lifecycle ∈ {open, settled}`（详情为准，且与列表卡的 `judgment_id`/方法/快照输入一致）；
4. 详情 `judgment.claim` 与冻结结果一致（§3.4 不变式 7）。

P1 §3.2 的第 7 稿修订已写入 P1 文件（内容同本节）。卡片内容：类别用本模块 i18n 渲染 `claim.selected`；生命周期、校准枚举 → i18n；方法链接 `id@version`；**不渲染** F4 自由文本。O1：`macro_regime` `publishable=false` → 生产显示 `f4_none`，直到 owner `sync-methodologies.ts --publishable`。

### 2.5 跨模块硬约束

| 约束 | 后果 |
|---|---|
| C1 目录即版本（`CATALOG_VERSION` 哈希；F4 方法固定它并对其他版本弃权） | 目录每变一版 → F4 新方法版本 + 切换 `compensate.ts::MACRO_METHOD`、`strategy/playbooks.ts`、`strategy/deviations.ts::METHOD`、`ACCEPTED_F4_VERSIONS` |
| C2 方法即版本 | P5 不改权重/阈值/规则；`CN_LPR_5Y` weight 0 |
| C3 开关只在服务端 | 组件以 prop 挂载 |
| C4 冻结清单不变 | WP-C 列切换纯展示 |
| C5 数值十进制 | 展示舍入不回写 |
| C6 v1 公式哈希（闭包 + `deps`：`read-api,flags,snapshots,freshness,db`、`dq/freshness`） | WP-B/WP-C 不改这些文件；D1 一次改完并注册 v2、retire v1 |

---

## 3. WP-B · 美林时钟

### 3.1 挂载

`MacroWorkbench` 概览 tab，`judgmentsEnabled` 真时在两张事实卡之下、指标表之上挂 `RegimeClockCard`（取代 `MacroJudgmentSlot`；旧槽位与 `judgment-view.ts` 在 WP-B 末任务删除）。默认展开；偏好 `localStorage` 键 `macro.clock.expanded.<region>.v1`（try/catch；SSR 默认展开）。

### 3.2 路由 `GET /api/macro/snapshots/[id]/clock`

`requireSessionUser` → `UUID_RE` → `macroJudgmentsEnabled()` 否 → 404 `judgments_disabled` → `snap = db.snapshot(id)` 无 → 404 `not_found` → `snap.region ∉ {US,CN}` → `integrity_error` → `active = db.activeSnapshot(snap.region)`；`active?.snapshot_id !== id || snap.status !== 'active'` → `snapshot_not_active` → **快照版本门槛**（`catalog_version`、`methodology_version`）→ `obs = db.observationsByIds(snap.observation_ids)`（长度不等或任一序列同期多版本 → `integrity_error`）→ `rec = db.regimeOf(id)` 无 → `record_missing` → **规则版本门槛**（`rec.rules_version === RULES_VERSION`，否则 `version_unsupported`）→ 存储对账（含不变式 9，若 `rec.method_manifest` 存在）→ F4（`clock-f4.ts`：列表 3 s；列表超时/失败则不发详情；详情 3 s；总 ≤ 6 s；`NEXT_PUBLIC_SITE_URL` 缺失 → unavailable）→ 不变式 7 → `okJson(view)`，`Cache-Control: private, no-store`。读取：1 快照 + 1 活动快照 + 1 观测批读 + 1 判定 + 2 F4 HTTP；路由 `maxDuration` 不改。传输层响应（非 `ClockStatus`）：400 `invalid_parameter:id`、401 `unauthenticated`、404 `judgments_disabled`/`not_found`、503 `read_failed`（DB 读取异常，`failureResponse`）；F4 失败不是传输错误（→ `f4_unavailable`，200）。F4 URL = `NEXT_PUBLIC_SITE_URL` 原样拼接 `/api/judgments…`（与 `f4-client.ts` 同法）。

### 3.3 `ClockView`（`src/lib/macro/clock-view.ts`，`macro-clock-view/1`，服务端纯函数）

```ts
export type ClockStatus='ok'|'snapshot_not_active'|'version_unsupported'|'integrity_error'|'record_missing'|'reconcile_failed'|'f4_unavailable'|'f4_none'|'f4_earlier'|'f4_ineligible'|'f4_mismatch';
export interface ClockMeta{version:'macro-clock-view/1';status:ClockStatus;
 snapshot:{id:string;region:Region;as_of:string;created_at:string;catalog_version:string;methodology_version:string;rules_version:string|null};
 regime_status:'classified'|'coverage_below_threshold'|'zero_score'|'unknown';
 f4:{judgment_id:string|null;lifecycle:Lifecycle|null;abstain_reason:string|null;earlier_snapshot_id:string|null;methodology_version:string|null};
 diagnostics:{code:string;ids:string[]}[]}          // 永不含数值；差值只进服务端日志
export type ClockView=ClockMeta&({status:'ok';card:ClockCard;summary:ClockSummary;quadrants:QuadrantView[];rows:ClockRow[];display_only_rows:DisplayRow[]}|{status:Exclude<ClockStatus,'ok'>});
export interface ClockCard{selected:Regime;lifecycle:'open'|'settled';calibration:string;methodology:{id:string;version:string;href:string};as_of:string}
export interface ClockSummary{primary:Regime;secondary:Regime|null;margin_pp:number;coverage:number;matched_weight:number;denominator:number;uncovered_weight:number;growth_axis:number|null;inflation_axis:number|null;scores:Record<Regime,number>;norm:Record<Regime,number>;tolerance:number}
export interface ClockRow{series_id:string;name:Bilingual;type:SeriesType;unit:string;change_kind:ChangeKind;weight:number;
 state:'matched'|'not_matched'|'no_data'|'missing'|'restricted';
 latest:{observation_id:string;period_end:string;value_text:string;version:number}|null;     // matched/not_matched 才非 null
 comparisons:{observation_id:string;period_end:string;value_text:string;roles:('prev'|'prev3m')[]}[];
 inputs_present:{prev:boolean;prev3m:boolean};                                             // 事实，不声称因果
 display_change:{kind:ChangeKind;value_text:string}|null;
 rule:{id:string;label:Bilingual;support:Record<Regime,number>}|null;contribution:Record<Regime,number>|null;reason:Bilingual|null}
export interface DisplayRow{series_id:string;name:Bilingual;unit:string;latest:ClockRow['latest']}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}
```

**优先级（唯一；编号 = 测试名 `clock.status.<n>`）**：
1 `snapshot_not_active`（路由）→ 2 `version_unsupported`（快照两版本）→ 3 `integrity_error` → 4 `record_missing`（`regimeOf` null）→ 2' `version_unsupported`（`rec.rules_version`）→ 5 存储对账：不变式 1、2、4、8，清单存在时再 9；`rec.regime` 非 null 再 3、5、6；任一失败 → `reconcile_failed`（在 F4 之前，总会执行并记录）→ 6 F4：`f4_unavailable` / `f4_none` / `f4_earlier` / `f4_ineligible`（lifecycle ∉ {open, settled}，含 abstained、pending_fill、void、withdrawn；`abstain_reason` 原样作代码）→ 7 不变式 7（含 F4 合格但 `rec.regime===null`）→ `f4_mismatch` → 8 `ok`。
`regime_status`：`rec` 无或存储对账失败 → `unknown`；`rec.regime` 非 null → `classified`；否则由存储 `uncovered_weight` 与 `denominator`（`Σ regionWeights`）内部计算 `(denominator−uncovered)/denominator < 0.6` → `coverage_below_threshold`，否则 `zero_score`；只暴露枚举。

**行规则**（`rows` = `regionWeights(region)` 的键，顺序同 `WEIGHTS_V1`）：
- 状态：目录 `missing` → `missing`；`restricted` → `restricted`（二者 `latest=null`、`comparisons=[]`、`inputs_present` 全 false）；在 `contributions` → `matched`；manifest 有该序列观测 → `not_matched`（含 `value_text` 非有限数的情形：引擎同样不命中；行文案不区分，`value_text` 原样显示）；否则 `no_data`。
- `latest`：matched = `contribution.observation_id` 的观测（不变式 1 保证它是该序列 manifest 最新）；not_matched = 该序列 manifest 中 period_end 最大者。
- `comparisons`：该序列 manifest 中其余观测，period_end 升序；`roles`：`period_end === shiftMonthEnd(latest.period_end, −3)` → 含 `'prev3m'`；`period_end` 为其余观测中最大者 → 含 `'prev'`；一条观测可同时两角色；若某观测两角色都不是 → `integrity_error`（manifest 每序列 ≤ 3 条的契约被破坏）。
- `inputs_present.prev/prev3m` = 对应角色是否存在。
- `display_change` = `changeOf(change_kind, latest.value_text, prev.value_text)`（无 prev → null）。
- `rule`：`RULES[type].find(r=>r.id===rule_id)` 的 `{id,label,support(四键，缺省 0)}`。
- `display_only_rows` = manifest 中 `series_id ∉ regionWeights` 的指标（D1 前为空）。
- `quadrants`：`score/norm` 原样；`rank` 由存储 `primary_state/secondary_state`；`drivers` = `contribution[q]>0` 行按 (`contribution` desc, `weight` desc, `series_id` asc) 取 3。

**为什么服务端可以 import `regime.ts`/`catalog.ts`**：版本门槛要求快照的三个版本等于当前常量；`WEIGHTS_V1`、`RULES`（含 label）、目录行在各自版本内冻结（C1/C2 强制）；因此门槛内读取当前常量 = 读取快照时的方法定义。D1 后旧快照（`catalog_version` = `30bcaa2a33c5` ≠ A）一律 `version_unsupported`；D1 起 `macro_regime_results.method_manifest`（§5.2）冻结每结果的完整行清单，时钟优先读它，仅规则 label 仍按 `rules_version` 查表。

### 3.4 对账（服务端；任一失败 → 无数字）

记 `C` = 存储 `contributions`，`n = |C|`，`W = regionWeights(region)`，`D = Σ W`。

| # | 不变式 | 失败状态 |
|---|---|---|
| 1 | `C[].series_id` 唯一且 ∈ keys(W) 且目录 `active`；`C[].observation_id` ∈ manifest，其观测的 `series_id` 相同，且等于该序列 manifest 中 **最新**观测（period_end 最大、version 最大）的 id | reconcile_failed |
| 2 | `C[].weight === W[series_id]`；每格 `contribution[q] === r6(weight × support[q])`（support 缺省 0；同 `regime.ts` 运算） | reconcile_failed |
| 3 | （regime 非 null）每象限 `|Σ_C contribution[q] − scores[q]| ≤ tol`，`tol = (n+1)×1e-6` | reconcile_failed |
| 4 | `matched = Σ_C weight`；`matched + uncovered_weight === D`（整数与 r6 值精确）；（regime 非 null）`coverage === r6(matched/D)` | reconcile_failed |
| 5 | （regime 非 null）重建发布端运算：`S'[q] = Σ_C contribution[q]`（r6 贡献之和），`N'[q] = S'[q]/Σ S'`（不舍入）；`|r6(N'[q]) − norm[q]| ≤ 2e-6`；`pickStates(N')` 的 primary/secondary === 存储；`|r6(100×(N'[p]−(N'[s]??0))) − margin_pp| ≤ 1e-4` | reconcile_failed |
| 6 | （regime 非 null）axes 用 `C` 的 `support`/`weight` 按 `regime.ts` 顺序重算（无命中 → null），r6 后精确相等 | reconcile_failed |
| 7 | F4 详情 `claim.selected === primary_state`；`|claim.distribution[q] − norm[q]| ≤ 1e-6`；`claim.catalog_version === snapshot.catalog_version`；`|claim.margin_pp − r6(100×(norm[p]−(norm[s]??0)))| ≤ 1e-6`（F4 的 `marginPp` 用存储 r6 norm）；`rec.regime` 非 null | f4_mismatch |
| 8 | （只对 `C` 中的行）`rule_id` ∈ `RULES[row.type]`；`support` 逐象限 === 规则表（缺省 0） | reconcile_failed |
| 9 | （`rec.method_manifest` 存在时）`manifest.version==='macro-method-manifest/1'`；`manifest.rules_version/catalog_version/weights_version` 与快照/记录一致；`manifest.rows[].series_id` 集合 === keys(W) 且唯一；`manifest.denominator === D`；每行 `weight === W[id]` 且 `name/type/unit/change_kind/status/reason` 与门槛内目录 `catalogById(id)` 逐字段相等（`state` 用 §3.3 行状态词表并与目录 `status`/观测存在性一致）；`latest/prev/prev3m_observation_id` ∈ manifest 观测且 `series_id` 相同，角色与 §3.3 日期规则一致；`matched` 行与 `C` 一一对应且 `rule_id/support/contribution` 逐格相等；非 matched 行三者皆 null | reconcile_failed |

执行顺序 1,2,4,8,（9）→（regime 非 null）3,5,6 → F4 → 7。清单存在时 `rows` **只**从清单渲染（观测值仍从 manifest 观测读取）；破坏用例：只改清单的一个贡献格 / 一个 `latest_observation_id` / 一行的 `change_kind`，`rec` 与 F4 不变 → `reconcile_failed`。数值比较用 IEEE-754 `Number`（输入均为 r6 值或整数）。失败：`diagnostics[]{code:'invariant_<n>', ids}`，差值 `console.error('[macro-clock] reconcile', {snapshot_id, invariant, delta, …})`。现有 F4 fixture（US `us-2026-09-11.json` 的 margin `11.023622`，CN `28.333333`）必须作为 `ok` 端到端用例通过。

### 3.5 UI（画布 §7；文案 `judgment.clock.*`）

- 象限卡等宽；主 `border-[var(--border-active)] bg-[var(--accent-wash)]`，次 `border-[var(--border-active)]`，其余 `border-border`；`rounded-md`；无十六进制；无四色。
- F4 行：`judgment.clock.regime.<selected>`、`judgment.clock.lifecycle.<lifecycle>`、`judgment.clock.calibration.<state>`（枚举值不在表 → 显示代码）、方法链接文本 `id@version`。
- 摘要行：主/次/`marginLabel`（"主次占比差（pp）" / "primary–secondary share gap (pp)"）/覆盖 `coverageLabel`（"命中权重 X / 评分权重 Y（含缺失、受限）"）/轴（"规则支持度合成，非实测"）+ `notProbability`（"规则得分占比，不是概率"；唯一含"概率"的键）。
- 驱动按钮 `aria-controls="clock-row-<series_id>"`：展开表、`scrollIntoView({block:'center'})`、focus、高亮 2 s。
- 分解表：matched 按 max_q contribution desc → not_matched/no_data → missing/restricted；非命中行 `text-text-dim` + "计入分母，不计入分子"；not_matched 文案 "规则未命中（上期：有/缺；3M 前：有/缺）"（事实）；比较列 `2026-08 · 2.6（上期）· 2026-06 · 2.7（3M 前）`，同一观测两角色 → "（上期 = 3M 前）"；显示变化列按 `change_kind`；脚注三条（上期定义；规则输入 = 精确十进制差值，利率类百分点、汇率类百分比变化；显示值舍入 2 位）。
- 证据：任何 `latest` 非 null 的行（matched 与 not_matched）当前值按钮 → `SourceDrawer`（冻结 `observation_id`）。
- 精度：占比 1 位 %；分数/贡献 2 位；margin 1 位；轴 2 位带符号；覆盖整数；负零 → 0；`−` 用 U+2212。
- 页头版本 → `?tab=methodology`；方法 tab `RulesTable`（`page.tsx` 服务端从 `RULES` 投影为 prop；关态 null）。
- 禁词：`judgment.clock.*` 不含 概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast（豁免 `notProbability`）；运行时字符串只有本模块 i18n、目录 `name`、规则 `label`、枚举代码；`catalog.test.ts` 与 `regime.rules-boundary.test.ts` 对 `name`/`label` 做同一禁词扫描。
- 窄屏：象限 2×2；分解表行卡。

### 3.6 状态矩阵（11 个卡级状态 + 2 个传输态 + 开关关；互斥）

| 编号 | 状态 | 触发 | UI | 测试 |
|---|---|---|---|---|
| 0 | judgments_disabled | prop false | 不挂载 | `pages.test` |
| 0a / 0b | loading / load_failed | 请求中 / 非 2xx | 骨架 / "读取失败 · 重试" | `clock-model.test` |
| 1 | snapshot_not_active | 非活动 | "概览快照已更新，请刷新" | `route.test.status.1` |
| 2 | version_unsupported | 三版本任一不等 | 显示两版本 | `clock.status.2` |
| 3 | integrity_error | 观测缺/重复/角色异常/region 非法 | "快照数据不完整，已记录" | `.3` |
| 4 | record_missing | 无判定记录 | "该快照无判定记录" | `.4` |
| 5 | reconcile_failed | 不变式 1–6、8 | "分解与分数不一致，已记录 · 重试" | `.5` |
| 6a–6d | f4_unavailable / f4_none / f4_earlier / f4_ineligible | §3.3 | 各自文案（ineligible 显示 lifecycle 与 `abstain_reason` 代码 + `regime_status` 文案） | `.6a`–`.6d` |
| 7 | f4_mismatch | 不变式 7 | "F4 判断与快照结果不一致，已记录" | `.7` |
| 8 | ok | 全过 | 全量 | `.8` |
| 行级 | matched / not_matched / no_data / missing / restricted | §3.3 | — | `clock.rows.*` |

### 3.7 不做

配置比例、行业超/低配；客户端评估规则/重选观测；显示 ChaosAI 数值；改 C6 文件。

### 3.8 测试

- `clock-view.test.ts`：手算 fixture（US：CPI `infl.2to3` w15、DFF `policy.2_5to4_5` w25、DGS10 `bond.d3m.ge25bp` w15、UNRATE `labor.d3m.le-0_1` w10；DTWEXBGS not_matched（prev 有、prev3m 缺）；PPI no_data；ISM missing；VIX restricted；scores 18.5/21/8.5/4；F4 claim 一致）→ `ok`；两份 F4 真实 fixture → `ok`；破坏用例（名 = `invariant.<n>.<case>`）：1 duplicate_series、1 foreign_observation、1 not_latest（换成 prev 的 id）、2 weight、2 cell(+0.01)、3 score_sum(+1)、4 uncovered(+1)、5 norm(+0.001)、5 primary(swap)、5 margin(+0.01)、6 axis(0.5)、7 selected、7 distribution(+0.001)、7 null_regime、8 rule_id、8 support；舍入边界（20 行累计）；优先级 `clock.status.1..8`；roles 双角色（季度 GDP）与三月缺口；非 ok 分支无数值键的结构断言。
- `clock-f4.test.ts`：真实形状、`include_abstained=1` 查询串、六种 lifecycle、多候选选择、详情与列表不一致 → unavailable、畸形/超时。
- `regime.rules-boundary.test.ts`：fx 值 7.12/102.4 不命中 policy_rate；growth_yoy 48 不进 pmi；label 非空互异；禁词。
- 路由测试：404/400/401/非活动/完整性/`Cache-Control`。
- 源码断言：`src/components/macro/clock/**` 不 import `regime.ts`/`catalog.ts`、不含 `MACRO_JUDGMENTS_ENABLED`。
- 文案：禁词；zh/en 对等；`marginLabel` 含 "pp"。
- 浏览器验收：本地 `seedClockSample` + 本地注册 v1 `--publishable`；1280 / 390 截图（视觉证据；算术由测试证明）。

---

## 4. WP-C · 图表组织

### 4.1 概览大图卡

`KeyIndicatorCards`（US `US_DFF`、`US_DGS10`、`US_CPI_YOY`、`US_UNRATE`；CN `CN_PMI_MFG`、`CN_CPI_YOY`、`CN_CGB_10Y`、`CN_M2_YOY`）。标题行 = envelope 行（快照值、期、变化，标注"快照值"）；折叠态 `Sparkline(IndicatorRow.sparkline)`；展开态 `IndicatorDetail compact asOf={createdAt}`（`createdAt` 经 `GET /api/macro/snapshots/{snapshotId}` 的 `snapshot.created_at`，组件级缓存），图表区标注"历史（可得时间 ≤ 快照时刻 …）"；图最后一点 `observation_id` ≠ 快照行 → 提示"图表最新 X（期）≠ 快照值"。**限制**：`seriesHistory(asOf)` 不按批次完成过滤（与快照 `eligibleHistoryAsOf` 不同），内部点可能含快照后完成批次的数据——记入 runbook §14；D1 可在 `views.ts` 增 `history_ids` 投影后改为冻结历史。默认前 2 张展开。

### 4.2 标记层与事件列表

`MacroLineChart.layers?:{derived?:boolean;calendar?:boolean}`（默认 derived on、calendar off）；`markersOf(events, calendar, firstPeriod, layers)`：事件身份 = 派生 `kind|region|series_id|effective_date`（US 目标区间事件 `series_id` 固定；CN 报价事件按期限序列区分，同日 1Y 与 5Y 各一条）、日历 `start|end`；仅去身份相同者；同日派生 + 日历各一。两个 `aria-pressed` pill。"事件（最近 6 条）"：按 `effective_date` desc，同日 derived 先于 calendar，再按身份键；`|change_bp| ≥ 25` 才带文字。

### 4.3 资产条形

`barGeometry` 从 `strategy-view-model.ts` 移至 `charts/chart-geometry.ts`（删除旧实现，策略组件改 import）；`assetBarPanels(assetsByCycle, cycles)` → 每周期 `{pct:{domainMax,rows}, bp:{domainMax,rows}}`，`rows[{asset_id, name, value:number|null, text}]`，缺值不画条（显示"缺失"）；零轴居中；tooltip 单位与端点；表格切换保留；`--up/--down`。

### 4.4 默认关联结果卡（P1 §3.4 修订）

- **共享服务** `src/lib/macro/analysis-service.ts::prepareAnalysis(deps, spec, {cutoff, codeVersion, history:'as_of'|'eligible_as_of'})`：别名解析（`aliasOf`）、历史读取（`'as_of'` → `db.seriesHistory({asOf})`；`'eligible_as_of'` → `db.eligibleHistoryAsOf({to, asOf, maxRows})`：候选按 period_end 分组，只保留 asOf 前已完成批次的最高版本（`db.ts:350-360`））、行数上限同 POST、`event_window` 的 `US_FED_TARGET_UPPER_D`/`LOWER_D` 读取与 `derivePolicyEvents`、`freezeInputs`、`inputsHash`（只哈希 `FrozenInputs`）、`runAnalysis`、`explainResult`。POST 路由改调它（`history:'as_of'`，**行为不变**，幂等查找仍在路由内先于读取）。
- **配额执行点**：唯一 `create_macro_analysis_run` RPC（POST）；预设不调用；测试：memory db 无 run、无 RPC。
- **路由** `GET /api/macro/analyses/presets?region=`：`requireSessionUser` → region 校验 → `resolveCodeVersion({allowGit:false})` 失败 → 503 `code_version_unavailable` → `db.activeSnapshot(region)` 无 → `{cards:[], reason:'no_published_snapshot'}` → `cutoff = snapshot.created_at`；每预设 `request_id = uuidv5('6f0c3d0e-9a2b-4c8e-8d4f-1b2c3d4e5f60', preset_id)` → `prepareAnalysis(…,{history:'eligible_as_of'})`。
- **预设规范**（`correlation-presets.ts`，`PRESETS_VERSION='macro-presets/1'`）：p1 US change `US_DFF×US_UST10Y` 0 10y；p2 US change `US_CPI_YOY×US_UST10Y` 0 10y；p3 US change `US_CPI_YOY×US_WTI` −1 10y；p4 US change `US_DTWEXBGS×US_WTI` 0 10y；p5 US rolling `US_UNRATE×US_UST10Y` 0 all；p6 US event_window `US_DFF×US_UST10Y` ±6 all（额外两条事件源读取）；p7 CN change `CN_PMI_MFG×CN_CGB10Y` 0 10y；p8 CN level `CN_CPI_YOY×CN_CGB10Y` 0 10y。
- **响应**：`{region, snapshot_id, cutoff, computed_at(首次计算 UTC，memo 命中返回原值), code_version, method_version:CORRELATION_VERSION, presets_version, catalog_version, cards:PresetCard[]}`；`PresetCard={preset_id, run_id:null, request_id, kind, spec, inputs, inputs_hash, results|null, error|null, status:'ok'|'failed', method_version, code_version, created_at:computed_at}`（与 `RunJson` 同名字段；`CorrelationResult` `preset` 模式）。
- **memo**：LRU 32、单飞，键 `region|snapshot_id|CATALOG_VERSION|CORRELATION_VERSION|EVENTS_VERSION|PRESETS_VERSION|code_version` → 值 = 该地区**整个响应**（全部预设卡 + `computed_at`）；头 `X-Macro-Presets-Memo: hit|miss` 描述整个响应；`computed_at` 为响应顶层字段（首次计算的 UTC ISO 时刻；hit 返回原值）。限制：cutoff 后隔离裁决可改变 eligible 集合 → `inputs_hash` 揭示；不声称跨实例恒等；多实例冷启动成本 = 每实例一次（≤ 6 组 × ≤ 4 次读取）。
- `analysis-spec.ts` 新增 `dataHash(inputs)`：只哈希 `indicator/asset` 的 `series_id, source_series_id, change_kind, observations[]{observation_id, period_end, value_text}` 与 `events[]`（不含 `cutoff`、`catalog_version`）；`PresetCard` 与 `RunJson` 都带 `data_hash`。按钮"重新计算并保存" → POST（计配额、现时 cutoff、`as_of` 历史）；`data_hash` 不同 → 提示 `correlation.preset.inputsChanged`（"数据已更新"）；仅 `inputs_hash` 不同 → 不提示（cutoff 差异）。测试：相同观测不同 cutoff → `data_hash` 相等；一次修订 → 不等。
- 失败预设成卡。
- 基准 `scripts/macro/bench-presets.ts`：参数 `--base`、`--region`、`--runs 3`；冷 = 新进程 + 空 memo，热 = 同进程；固定样本 DB（`seed.ts`，记录其 snapshot_id 与 catalog 版本）；禁用 HTTP 缓存（`cache:'no-store'`）；输出全部样本与中位数；结果写 `pr-c2-acceptance.md`。
- 测试：预设路由结果 === 直接调用 `prepareAnalysis(spec, cutoff, 'eligible_as_of')`；无 run/无 RPC；memo 头与 `computed_at` 稳定；无快照；401；503；p6 事件读取；失败卡；POST 现有测试不变。

### 4.5 传导短标签

`NodeCard` 默认：徽章、短标签、值 + 单位、数据期；其余 `<details>`。边：`stages[].edge:{text:Bilingual;kind:'assumption'}|null`（契约已有）；流程内只画箭头；流程下方 `<details>`"机制假设（N 条）"= `stages.filter(s=>s.edge).map(s=>s.edge.text[locale])`；删除 `flow.edge` 文案键（`strategy-messages.test.ts` 断言不存在）；剧本声明一次。

### 4.6 列切换

`visibleColumns(view:CycleTableView, mode)`、`visibleDims(view:PolicyResponseView, mode)` → `VisibleColumn{id,label,hidden_reason:'restricted'|'not_in_catalog'|null}`；N 按表各算；`cycleScale` 不变；`localStorage` 键 `macro.strategy.columns.v1`；"补齐计划 → `/intel/macro?tab=methodology#data-gaps`"（方法 tab 新小节，内容 §5.6）。

### 4.7 测试

`view-model.test`（`KEY_INDICATORS`）；`detail-model.test`（asOf 透传、层过滤、身份去重、事件排序）；`chart-geometry.test`（`barGeometry` 搬家同用例、`assetBarPanels` 缺值）；`strategy-view-model.test`（`visibleColumns/visibleDims` 不改 `cycleScale`、`edgeNotes`）；`strategy-messages.test`（无 `flow.edge`）；`analysis-service.test`；预设路由测试；浏览器四组截图。

---

## 5. WP-D · 数据缺口

### 5.1 落点

| 字段 | 落点 |
|---|---|
| ID、定义、单位、频率、期、调整、修订、滞后、权重、changeKind、`firstPeriod`（代码字段，不入镜像） | `catalog.ts` `MacroSeriesDef` |
| 来源 | `SeriesSource`；missing 行 `source:null`（CHECK `macro_series_source_iff_not_missing`） |
| 证据 | `macro_evidence_objects`（`adapter` CHECK `:90`）+ `macro_retrievals`（无 adapter 列） |
| 解析器与定位 | `parsers/*` + `Locator{csv_row\|json_pointer\|html_cell}`（不新增） |
| 派生 | `month_end\|yoy_from_index\|index_minus_100`（不新增） |
| 可得时间 | `available_at`（first_seen） |
| 任务 | FRED cron；CN `collect.py` + `cn-series.json` |
| 新鲜度 | `releaseTimeliness` |
| 质量 | `quality.ts::KNOWN_UNITS/BY_UNIT`；`macro-format.ts::KNOWN_UNITS`；i18n `units.*` |
| fixture | `fixtures/fred/manifest.json`；`fixtures/cn/*` |

每序列 PR 附核实记录（URL、主机、状态、Content-Type、定位、解析器版本、首次取得时间、单位/频率/口径的官方元数据原文、限制）。

### 5.2 D1：D0 + 方法清单 + 美国流动性（目录版本 A，F4 v2）

**D0**：`catalogItemsOf = indicatorsOf(region)`；`buildRegimeInput` 冻结 `displayInputsOf`（active、月/季、weight ≥ 0）；`classifyRegime` 不变；`observation_ids` = 评分 ∪ 展示；F4 v2 `gather` 冻结全部。

**方法清单**（迁移加列 `macro_regime_results.method_manifest jsonb`；新 RPC `macro_publish_snapshot_v2` 与 `db.publishSnapshot` 增参；`publishRegion` 从 **同一次** `built.input`（含 prev/prev3m id）、`cls`（contributions/regime/uncovered）与 `regionWeights` 构造）：
```ts
{version:'macro-method-manifest/1', weights_version:'v1.0', rules_version, catalog_version, denominator,
 rows:[{series_id, type, unit, change_kind, name, weight, state:'matched'|'not_matched'|'no_data'|'missing'|'restricted', reason|null,
        latest_observation_id|null, prev_observation_id|null, prev3m_observation_id|null,
        matched:boolean, rule_id|null, support:Record<Regime,number>|null /* matched 时四键，缺省 0 */, contribution:Record<Regime,number>|null}]}
```
D1 后 `clock-view.ts` 优先读清单（行、权重、状态、角色、support、贡献），只有规则 label 按 `rules_version` 查 `RULES`。

**六行字段矩阵**（`firstPeriod` 与口径原文由 D0a 回填；回填前 D1 不开工）：

| id | FRED | role/type | unit | nativeFrequency/period | adjustment | changeKind | revisionPolicy | releaseLagDays | weight | derive | firstPeriod |
|---|---|---|---|---|---|---|---|---|---|---|---|
| US_WALCL_W | WALCL | indicator/null | usd_mn | weekly/day（周三） | na | pct | revisable | 1 | 0 | — | [D0a] |
| US_WALCL | — | indicator/null | usd_mn | monthly/month | na | pct | revisable | undefined | 0 | month_end from US_WALCL_W | — |
| US_RRPONTSYD_D | RRPONTSYD | indicator/null | usd_bn | daily/day | na | pct | immutable | undefined | 0 | — | [D0a] |
| US_RRPONTSYD | — | indicator/null | usd_bn | monthly/month | na | pct | immutable | undefined | 0 | month_end | — |
| US_WTREGEN_W | WTREGEN | indicator/null | usd_mn | weekly/day（周三） | na | pct | revisable | 1 | 0 | — | [D0a] |
| US_WTREGEN | — | indicator/null | usd_mn | monthly/month | na | pct | revisable | undefined | 0 | month_end | — |

- 迁移同时改 `republish_macro_snapshot`：复制 `method_manifest`（null 则 null）；测试 publish → supersede → republish 后清单相等。
- 名称：WALCL "联储总资产（周三水平）" / 月行 "联储总资产（月内最后一次周三观测）"；WTREGEN "财政部一般账户（周平均，以周三标记）" / 月行 "财政部一般账户（月内最后一次周平均观测，值为该周平均）"；RRPONTSYD 口径逐字取 FRED 序列页。
- **weekly 规则**：`NativeFrequency` + `'weekly'`；`releaseTimeliness`：weekly 的下一期 = 上一 period_end + 7 天，截止 = 下一期 + `releaseLagDays` + 3 天宽限（节假日由宽限吸收）；`catalog.test.ts` 不变式改为"daily/event/month_end 行 lag undefined；weekly 原生行 lag 必填；monthly/quarterly 原生按既有表"。
- `fredCosdFor(period, backfilled, today, firstPeriod?)`：未回填 → `max(FRED_COSD, firstPeriod)`；已回填 → 400 天窗口。
- 单位：`usd_mn {min:0,max:20_000_000,maxRelJump:0.5}`、`usd_bn {min:0,max:10_000,maxRelJump:null}`；i18n `units.usd_mn`="百万美元"/"USD mn"、`units.usd_bn`="十亿美元"/"USD bn"。
- transmission：`TRANSMISSION_V2` 常量；`buildTransmission` 按清单 `version` 分派（旧清单 v1）；`wiring` 新清单取 v2；v1 fixture 不变 + v2 fixture。
- F4 生产切换：`compensate.ts::MACRO_METHOD`、`strategy/playbooks.ts`、`strategy/deviations.ts::METHOD`、`ACCEPTED_F4_VERSIONS` → `v2`；测试 v1→v2 后 `compensate` 找到方法、`selectF4Mark` 接受 v2。
- `Timeliness` 新值 `awaiting_witness`：月度派生行的输入序列已有更新期但派生行未生成（`month_end` 完成见证）时显示"等待下一期确认"；`freshness.ts`/`views.ts` 在 D1 可改。
- 测试影响：`catalog.test.ts` 精确列表、`fred-csv.test.ts:75-78`、`replay.test.ts:116`（+`US_WALCL`）、`snapshots.test.ts`、`fred-csv.test.ts` 周频 + `.` 缺失、`derive.test.ts` weekly 三例（月末周三/周五/周日；缺最后一周不补）。

### 5.3 LPR（D0b → D2 → D5）

- `official_http`：`types.ts::Adapter`；迁移 `macro_evidence_objects.adapter` CHECK（`macro_retrievals` 无 adapter 列）；`ingest.ts::DATASET_OF.official_http='macro.akshare'`；`ingest/route.ts`：每证据项 adapter = `catalogById(series_id)?.source?.adapter`（无 → `unknown_series`），`parserFor(series_id)` 返回 `{parse, adapter}` 且必须等于推导 adapter（否则 `evidence_adapter_mismatch`），按 adapter 分组分别 `ingestEvidence`，解析失败证据保留其 adapter；content-type → 定位器：`application/json` → `json_pointer`、`text/html` → `html_cell`，其他 → `evidence_not_allowed`；URL 必须 `https:`，采集器 `redirect:'error'`，证据 host = `url.host`，比较沿用 `url.host === spec.fetch_host`；parser 产出 `ParsedPoint{seriesId, periodEnd, valueText, locator}`（`periodEnd` = 报价日 / 操作日 / 统计期月末），claims 只作交叉校验（既有链路）；`cn-series.ts` function `http_json`/`http_html`（`cn-series/2`，`cnSeriesSpecs` = akshare ∪ official_http）；`collect.py` `requests.get` 经 `recording()`；主机白名单 + `www.chinamoney.org.cn`、`www.pbc.gov.cn`。
- 目录（D5）：`CN_LPR_1Y_Q`、`CN_LPR_5Y_Q`：`role:'event_source'`，`type:'policy_rate'`，`nativeFrequency:'event'`，`period:'day'`（period_end = 报价日），`adjustment:'na'`，`unit:'pct'`，`changeKind:'bp'`，`revisionPolicy:'immutable'`，`weight:0`，`releaseLagDays` undefined，`source` = official_http（host `www.chinamoney.org.cn`，`seriesKey` 由 D0b 定，publisher CFETS，rights `official_open`）；`CN_LPR_1Y`（active，weight 10）、`CN_LPR_5Y`（weight 0）：monthly，`month_end` from `_Q`。**完成见证**：某月的月度行只在后续月份出现观测后产生（`derive.ts`），`available_at` 取见证；状态 `awaiting_witness`（§5.2）。
- parser `chinamoney.ts`：行键 = (报价日, 期限)；同键相同值 → 计数；不同值 → `parse_failed:conflicting_rows`（拒绝整页）；表头精确匹配"1年"/"5年以上"；fixture 原始字节。
- 事件 `deriveRateQuoteEvents(quotes)`：同一序列（同期限）按**已存储报价日**升序相邻比较（缺报价月不插值，事件的 `from` 即上一条存储报价），差 ≠ 0 → `{kind:'policy_rate_change', region:'CN', series_id, effective_date:报价日, from, to, change_bp, evidence:[prev,cur], source:'derived'}`；首条无事件；不变无事件；`macro-events/2`；`PolicyEvent` 可辨识联合；消费者更新；US 不变。

### 5.4 社融（D0c → D3 → D5）

只采官方"同比增长（%）"列（页面标题匹配 `^\d{4}年\d{1,2}月社会融资规模存量统计表`，表内行首单元格 === "社会融资规模存量"，列标题单元格匹配 `同比` 且单位行含 `%`；单位 `pct`）；行键 = 统计期（标题年月 → 月末）；一页一期；同期多页 → 按页面发布日期（列表页日期）升序，后者为新版本（`revisable`）；同一发布日期两页或同页同期两行 → `parse_failed:conflicting_rows`；无同比列 → missing。

### 5.5 MLF（D0d → D4 → D5）

仅列表页为表格：列 = 操作日期、期限、金额、中标利率；`CN_MLF_1Y_E` 行键 = (操作日, 1Y)；同日多笔同利率一条、不同利率拒绝；`CN_MLF_1Y` = `month_end` from `_E`（该月最后一次 1Y 操作），无操作月无行，完成见证延迟同 §5.3。

### 5.6 资产覆盖计划（不新增目录行）

| 资产 | 来源 | 权利/阻塞 | 动作 |
|---|---|---|---|
| 美股三指数 | FRED（S&P DJI、Nasdaq） | third_party，O2 | 保持 restricted |
| 沪深 300 | 中证 | third_party | 同上 |
| 港股 | 恒生指数公司 / HKEX | third_party；`Region` 只有 US/CN | 不入目录 |
| 黄金、铜 | LBMA/LME（版权）；World Bank Pink Sheet（月平均、XLSX） | 许可与 CSV 待核实 | 不入目录 |
| 债券总回报 | 无公开一手 | — | 不做；列头 tooltip |
| 北向资金 | 港交所（2024-08 起口径改） | 待核实 | not_in_catalog |
| 权益（内部） | DataGateway | O3 | 不实现 |

### 5.7 F4 方法版本

| 身份 | 值 | 变化 |
|---|---|---|
| 上游 `METHODOLOGY_VERSION` | v1.0 | 不变 |
| `RULES_VERSION` | 1.0 | 不变 |
| `CATALOG_VERSION` | D1 → A；D5 → B | 每次目录改动 |
| F4 `macro_regime@<v>` | v1 → v2 → v3 | 跟随目录 |
| `ACCEPTED_F4_VERSIONS` | ['v1'] → ['v2'] → ['v3'] | 同上 |

- v2：`macro-regime.common.ts` 工厂 `macroRegimeMethod({version, catalogVersion, doc})`；`macro-regime.v2.ts` pin 字面量（合并前算出）；`deps` 逐字 = v1 列表；`module` 指向 v2；测试：字面量 === 运行时 `CATALOG_VERSION`、新快照不弃权、旧快照弃权、`methodology-sync` 计划 = register v2 无 drift。
- `REGISTRY=[macroRegimeV2]`；v1 模块文件不改；`macro-regime.v1.test.ts` **迁移**：注册表断言改为 `[macroRegimeV2]`（移到 `registry.test.ts`）；历史回放用例改用隔离 fixture（固定目录版本 `30bcaa2a33c5`、历史 formula_hash 字面量、golden 结果），不再引用运行时 `CATALOG_VERSION`。
- v1 retire（迁移 `20261121090000`，幂等）：
```sql
do $$ declare m record; s int; begin
 select * into m from public.judgment_methodologies where methodology_id='macro_regime' and version='v1' for update;
 if not found or m.status='retired' then return; end if;
 select coalesce(max(seq),0)+1 into s from public.judgment_methodology_events where methodology_id='macro_regime' and version='v1';
 update public.judgment_methodologies set status='retired' where methodology_id='macro_regime' and version='v1';
 insert into public.judgment_methodology_events(event_id, methodology_id, version, seq, event, status, publishable, formula_hash, code_version, actor, occurred_at, reason)
 values (gen_random_uuid(), 'macro_regime', 'v1', s, 'status_changed', 'retired', m.publishable, m.formula_hash, m.code_version, 'script', now(), 'P5 D1: catalog v2 supersedes v1');
end $$;
```
（若表还有本语句未列的非空无默认列，按 `20261116090000_judgments.sql:50-60` 补齐；迁移测试对已有 ≥ 2 条事件的 v1 行执行两次，第二次无变化。）v1 判断由解析器 `catalog_version_mismatch` → unavailable → `judgments-settle` cron 在 `settle_by` 后记 `void`（F4 规格 §7）；已结算判断不受影响。
- 生产顺序：① 迁移 `20261121090000_macro_p5_schema.sql`（向后兼容：新列、新 RPC、CHECK 放宽；旧代码照常）→ ② 以合并提交运行 `sync-methodologies.ts`（register v2；v1 仍 active）→ ③ 部署 → ④ 验证目录 A 快照发布（`method_manifest` 非 null）与 v2 判断产出 → ⑤ 迁移 `20261121091000_macro_p5_retire_v1.sql`。①–⑤ 之间新旧方法同时 active、新旧 RPC 并存；任一步失败即停止，不回滚已应用迁移（均向后兼容）。

### 5.8 PR 矩阵与迁移

| PR | 目录 | F4 | 内容 |
|---|---|---|---|
| P5-D1 | A | v2 | 两个迁移、D0、`method_manifest`、weekly、`official_http` 枚举 + ingest 分组、三条 FRED 序列、单位、transmission v2、三常量切换、`awaiting_witness`、runbook（上线五步） |
| P5-D2 | 不改 | — | LPR parser + 采集器 http 分支 + fixture + CN 事件代码 |
| P5-D3 | 不改 | — | 社融 parser + fixture |
| P5-D4 | 不改 | — | MLF parser + fixture（D0d 为表格时） |
| P5-D5 | B | v3 | 事件源行 + `source` + 翻 active + `cn-series.json` + 精确列表测试 + v3 |

迁移一 `20261121090000_macro_p5_schema.sql`（向后兼容）与迁移二 `20261121091000_macro_p5_retire_v1.sql`（§5.7 的 retire 块）。迁移一：
```sql
do $$ declare r record; n int; begin
 select count(*) into n from pg_constraint where conrelid='public.macro_series'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '^CHECK \(\(native_frequency = ANY';
 if n<>1 then raise exception 'expected exactly one native_frequency check, found %', n; end if;
 for r in select conname from pg_constraint where conrelid='public.macro_series'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '^CHECK \(\(native_frequency = ANY' loop execute format('alter table public.macro_series drop constraint %I', r.conname); end loop;
 alter table public.macro_series add constraint macro_series_native_frequency_check check (native_frequency in ('daily','weekly','monthly','quarterly','event'));
 select count(*) into n from pg_constraint where conrelid='public.macro_evidence_objects'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '^CHECK \(\(adapter = ANY';
 if n<>1 then raise exception 'expected exactly one adapter check, found %', n; end if;
 for r in select conname from pg_constraint where conrelid='public.macro_evidence_objects'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '^CHECK \(\(adapter = ANY' loop execute format('alter table public.macro_evidence_objects drop constraint %I', r.conname); end loop;
 alter table public.macro_evidence_objects add constraint macro_evidence_objects_adapter_check check (adapter in ('fred_csv','akshare','official_http'));
end $$;
alter table public.macro_regime_results add column if not exists method_manifest jsonb check (method_manifest is null or jsonb_typeof(method_manifest)='object');
-- 新 RPC（显式签名，不改旧 RPC）：
create or replace function public.macro_publish_snapshot_v2(<旧 RPC 的全部参数逐字> , p_method_manifest jsonb) returns jsonb language plpgsql security definer set search_path = public as $$ … 与旧 RPC 同体，另写 method_manifest … $$;
revoke execute on function public.macro_publish_snapshot_v2(<同签名>) from public, anon, authenticated;
grant execute on function public.macro_publish_snapshot_v2(<同签名>) to service_role;
-- republish_macro_snapshot：create or replace（同签名）增加复制 method_manifest；随后同样 revoke/grant。
```
旧 RPC 保留到 D5 清理（旧代码在①–③之间仍调用它）。
`macro_evidence_path` 约束不匹配上述正则，保留；替换后断言新约束名存在且旧模式计数为 0。迁移测试：重放后插入 `official_http` 证据对象与 weekly 行成功；旧值仍合法；旧 RPC 与新 RPC 各发布一次；anon/authenticated 调用新 RPC 被拒。D1 可在无 `official_http` 目录行时部署。

### 5.9 测试

parser fixture；`derive.test.ts`（weekly、LPR 月内两次、无报价月、完成见证）；`events.test.ts`（CN 事件、US 不变）；`catalog.test.ts`；`fred-csv.test.ts`；F4 v2/v3（gather→compute→condition、sync 计划）；`compensate` 切换；transmission 清单分派；`ingest` 混合 adapter 块；`method_manifest` 写读；`read-api-asof.integration.test.ts`（WALCL 月行在 `asOf` 早于输入可得时间时不可见）；`replay.test.ts`。

---

## 6. 文件清单

WP-B：`src/lib/macro/{clock-view,clock-f4}.ts`(+tests)、`regime.rules-boundary.test.ts`、`src/app/api/macro/snapshots/[id]/clock/route.ts`(+test)、`src/components/macro/clock/{clock-model.ts,RegimeClockCard,QuadrantGrid,DecompositionTable,F4Strip}.tsx`、`clock/clock-imports.test.ts`、`RulesTable.tsx`、`MacroWorkbench.tsx`、`page.tsx`、`messages/*/macro.json`、`macro-messages.test.ts`、`pages.test.ts`、`testing/seed.ts`；删除 `MacroJudgmentSlot.tsx`、`judgment-view.ts`(+test)。
WP-C：`view-model.ts`、`KeyIndicatorCards.tsx`、`detail-model.ts`、`charts/{MacroLineChart.tsx,chart-geometry.ts}`、`IndicatorDetail.tsx`、`strategy-view-model.ts`、`strategy/{TransmissionFlow,PlaybookGrid,CycleReturnsTable,PolicyResponseMatrix}.tsx`、`messages/*/{macro,macroStrategy}.json`、`src/lib/macro/analysis-service.ts`(+test)、`src/app/api/macro/analyses/route.ts`、`src/app/api/macro/analyses/presets/route.ts`(+test)、`correlation-presets.ts`（`PRESETS_VERSION`）、`scripts/macro/bench-presets.ts`、`CorrelationWorkbench.tsx`、`CorrelationResult.tsx`。
WP-D：`catalog.ts`、`types.ts`、`snapshots.ts`、`freshness.ts`、`views.ts`、`quality.ts`、`macro-format.ts`、`providers/fred.ts`、`db.ts`/`db-contract.ts`/`memory-db.ts`、`cn-series.ts`、`ingest.ts`、`ingest/route.ts`、`parsers/{index,chinamoney,pboc-afre,pboc-mlf}.ts`、`events.ts`、`series-extras.ts`、`cycles.ts`、`strategy/data/transmission-v2.ts`、`strategy/{transmission,wiring,playbooks,deviations}.ts`、`src/lib/judgments/{compensate,registry}.ts`、`methodologies/{macro-regime.common,macro-regime.v2}.ts`、`macro-regime.v1.test.ts`（迁移）、`docs/methodologies/macro_regime/v2.md`、`licenses.json`、`scripts/macro/*`、迁移、runbook §10/§13/§14、fixtures。

---

## 7. Claude Design 画布

`https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH` P5 行（版本 17）：`Clock`、`ClockStates`、`OverviewP5`、`DetailP5`、`CorrelationP5`、`StrategyP5`、`ClockMobile`。第 4 稿差异（WP-B 开工前同步）：`ClockStates` 的 `reconcile_failed` 改为无数字；`not_matched` 行显示"上期：有；3M 前：缺"；摘要行加 `coverageLabel` 与 `marginLabel` 文案。

---

## 8. 验收

每项记录命令、commit、开关、fixture id、预期/实际、通过数、未运行项、浏览器版本；截图只作视觉证据。

| 面 | 必须成立 | 证明 |
|---|---|---|
| 贡献算术 | §3.4 八条 | `clock-view.test.ts`（含两份真实 F4 fixture 成功 + 全部破坏用例） |
| 快照一致 | 单一响应；活动快照；版本门槛；F4 同快照 | 路由与 `clock-f4` 测试 |
| 规则类型 | fx/GDP 边界 | `regime.rules-boundary.test.ts` |
| 缺失语义 | 11 卡级 + 2 传输 + 5 行级状态，无零 | 状态测试 + ClockStates 画板 |
| 覆盖率 | 分母含应计权重；<60% 不硬判 | 不变式 4；`regime_status` 用例 |
| 概率语义 | 禁词；categorical 无 percent；不渲染 F4 自由文本 | 文案与组件测试 |
| 数据对齐 | parser 行键/重复/拒绝；weekly 月内最后观测；LPR/MLF 完成见证 | parser/derive 测试 |
| 历史可知 | 新派生继承可得时间 | `read-api-asof.integration.test.ts` |
| 证据链 | drawer 的 `observationId` === `rows[].latest.observation_id`（= 不变式 1 的最新观测） | 组件模型测试 + 截图 |
| UI 可读性 | 1280/390；键盘可达 | 截图 + 走查 |
| 图表可用 | 标记层两态 | 截图 |
| 可用数据 | 列切换两态 | 截图 |
| 性能 | 时钟读取预算；预设基准脚本；历史/政策反应页 `X-Macro-Strategy-Memo` 冷/热 | 基准记录 |

---

## 9. 不在本规格内

O1 publishable；O2/O3 指数权利与 DataGateway；方法 v1.1；QE/QT 事件定义；`Region` 扩展；Pink Sheet；北向资金；按快照资格的详情历史（D1 后）。

---

## 10. 分期与 PR

P5-B → P5-C1（§4.1–4.3、4.5、4.6）→ P5-C2（§4.4）→ P5-D1 → P5-D2 → P5-D3 → P5-D4 → P5-D5。
