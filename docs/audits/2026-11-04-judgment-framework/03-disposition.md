# F4 判断层框架规格 · 审计处置表

日期：2026-11-04。对象：`docs/superpowers/specs/2026-11-04-judgment-framework-design.md`。审计：Codex CLI gpt-6-astra（medium）两轮（`01-codex-round1.md` 对第 1 稿，`02-codex-round2.md` 对第 2 稿）。本表对两轮的每一条给出处置；第 3 稿是处置后的结果。两轮上限已用完，第 3 稿未再送 Codex；§"第 3 稿自查"列出作者对第 3 稿新改动的自查结论。

状态含义：ACCEPT = 已按建议（或等价方案）改入第 3 稿；DECLINE = 不改，附理由；OWNER = 转为 §17 owner 决策；OPEN-verify = 规格已给出规则，但依赖实施期验证（§18 开放问题）。

## 第一轮（F01–F30）

| ID | P | 处置 | 第 3 稿落点 / 理由 |
|---|---|---|---|
| F01 | P1 | ACCEPT | §3.5 公共输入白名单 + 固定构造器（anon 路径）+ 登记重跑校验；§5.2 `subject_type/producer_kind` CHECK；§6.1 私有行需租户命名空间 |
| F02 | P1 | ACCEPT | §3.5 冻结投影；§6.3 回放用冻结输入；§7.3 证据保存完整 bar 窗口 |
| F03 | P1 | ACCEPT | §2.1 / §12.2 对齐规格二第 8 稿（`readFacts` 信封、`factsByIds`、`metricsOfIssuer` 含 market、`deriveMetricsAsOf`）；§3.3 `fact_metric` 完整自然键 |
| F04 | P1 | ACCEPT | §3.3 按 resolver 区分的联合类型；宏观改为 `macro_regime_replay`；配对条件列为未实现 |
| F05 | P1 | ACCEPT | §11.1 标签 = 同一分类函数、同一参考期、截止 vintage；资产含义拆为未实现类型 |
| F06 | P1 | ACCEPT | §8.2 三态（insufficient / failed / calibrated），门控用原始 `p` 的留出段 ECE 与 Brier skill |
| F07 | P1 | ACCEPT | §8.6 / §11.2 自评永不解锁百分比；O5 第二阶段可信私有证据表 |
| F08 | P1 | ACCEPT | §7.4 不允许 `none`；复权能力表；未验证即 `void` |
| F09 | P2 | ACCEPT | §3.4 `target` 登记时固定、`settle_after` 只是扫描提示、`retrospective` 三条规则 |
| F10 | P2 | ACCEPT | §3.7 |
| F11 | P2 | ACCEPT | §5.3 转移表与序号示例；§5.6 `append_settlement` 返回 `already_final` 而非 23505 |
| F12 | P2 | ACCEPT | §3.4 `label_policy` 改名 `first_observed`（如实披露调度依赖）/ `cutoff_vintage`；§7.2 按可得时刻判定 |
| F13 | P2 | ACCEPT | §5.4 队列排序、退避、租约 token、inconsistent 到期终止 |
| F14 | P2 | ACCEPT | §5.6 显式撤销 service_role 并按表授权 |
| F15 | P2 | ACCEPT | §5.6 十个 RPC（公共读 / 服务写分组）、keyset 分页；§5.7 |
| F16 | P2 | ACCEPT | §7.1 统一 deadline / signal、小批领取、校准独立 cron 与续跑 |
| F17 | P2 | ACCEPT | §2.3 / §7.4 `endDate`、按冻结 source 读、范围分页 |
| F18 | P2 | ACCEPT | §7.3 benchmark 同日对齐与算式、`date` 终点、事实完整键 |
| F19 | P2 | ACCEPT | §8.2 非重叠抽样、§8.4 标为运营门槛并写明宏观后果 |
| F20 | P2 | ACCEPT | §8.1 按 kind 分开评估；§5.5 `state` 按 kind CHECK |
| F21 | P2 | ACCEPT | §5.5 cohort 清单、`query_bounds`、指纹含阈值与算法版本、`isotonic_segments` |
| F22 | P2 | ACCEPT | §3.6 稳定 nonce；§4.1 `deps_sha256` 进 `formula_hash`；§6.2 完整载荷比较 |
| F23 | P2 | ACCEPT | §3.2 判别联合；§5.2 约束 |
| F24 | P2 | ACCEPT | §9.1 两个维度；§9.4 派生门控 |
| F25 | P2 | ACCEPT | §10 `as_known` 按系统事件时间；§12.4 合并反查 |
| F26 | P2 | ACCEPT | §11.2 `PrivateJudgmentCard`、`pending_fill`、`legacy_fill`、`security` 主体 |
| F27 | P2 | ACCEPT | §7.5 `deferred` 计数器（改 `batches.ts`）；§7.6 裁决 `resolution` |
| F28 | P2 | ACCEPT | §7.1 补偿扫描含 superseded 快照 + marker；§11.1 上游版本绑定 |
| F29 | P2 | ACCEPT | §3.5 `origins` 冻结表；§4.1 `publishable` 发布准入；§17 许可确认 |
| F30 | P3 | ACCEPT | §2.4 明确 S4 改动范围；政策常量逐处标注；估算标"非证据" |

## 第二轮（G01–G32）

| ID | P | 处置 | 第 3 稿落点 / 理由 |
|---|---|---|---|
| G01 | P1 | ACCEPT | §8.1 / §8.2：门控用**原始 `p`** 在时间外留出段的 `ece_raw_holdout ≤ ece_max` 且 `brier_skill_holdout > 0`；isotonic 只进报告；§15 验收 4 含反例 |
| G02 | P1 | ACCEPT | §11.1：判断 = 当前期 nowcast；标签 = **同一分类函数**对同一参考期在截止 vintage 下重算；`calendar_months` 期限；§12.1 `classifyAsOf` |
| G03 | P1 | ACCEPT | §3.5 固定构造器 + anon 读取路径 + 登记重跑一致性 + `input_not_public`；证据同规则 |
| G04 | P1 | ACCEPT | §7.4 复权能力表初始全 `unverified`，验证程序以已知除权 / 拆股事件为证据，只有 `verified` 可用 |
| G05 | P2 | ACCEPT | §7.5 第七计数器 `deferred`，`accounted()` 计入；改 `batches.ts` 并向后兼容 |
| G06 | P2 | ACCEPT | §5.6 公共读 RPC（invoker，anon 可执行）/ 服务写 RPC（definer）分组；`judgment_envelope` 返回形状 |
| G07 | P2 | ACCEPT | §5.5 `state` 按 `kind` CHECK（score → evaluated） |
| G08 | P2 | ACCEPT（改名披露） | 改为 `first_observed` 并在 §3.4 如实写明调度依赖；"按披露序列选最早合格版本"需要规格二的历史披露读取接口，v1 不做（§3.4） |
| G09 | P2 | ACCEPT | §7.2 按 `label_available_at ≤ settle_by` 判定；inconsistent 到期 `void(unresolved_inconsistency)`；§5.4 退避不设过去时刻 |
| G10 | P2 | ACCEPT | §5.4 `lease_token`；§5.6 `release_lease` / `append_settlement` 带 token、`request_key`、`already_final`；§14.2 测试改为实际锁语义 |
| G11 | P2 | ACCEPT | §5.6 service_role 对 `judgments / judgment_settlements / queue` 无直接写，只经 RPC，RPC 内校验方法一致性与时间戳 |
| G12 | P2 | ACCEPT | §7.6 按原因码定义裁决 `resolution`（accept_refetched / choose_fact），缺 bar 只能 reject；裁决、审计、翻转同事务 |
| G13 | P2 | ACCEPT | §7.3 / §12.2 消费 `truncated` 信封、完整键、`deriveMetricsAsOf` 不读缓存、无 `status` 列的到期判定 |
| G14 | P2 | ACCEPT | §3.4 方法级 `resolveTarget`、`calendar_months` 单位、`fiscal_period` 多季外推 + 冻结日历 |
| G15 | P2 | ACCEPT | §3.4 `retrospective` 三条规则（含 `labelAvailableAt`）；恢复资格转 O7 |
| G16 | P2 | ACCEPT | §5.7 / §7.3 / §7.4 按冻结 source、范围含两端、向后分页、`n + 6` 根 |
| G17 | P2 | ACCEPT | §8.2 确定性非重叠贪心抽样（每主体流），不用连通分量；§8.4 写明宏观后果 |
| G18 | P2 | ACCEPT | §8.1 所有推断只在独立样本上；留出段边界重叠剔除；categorical 基准 `majority_rate`；interval `width_ratio` |
| G19 | P2 | ACCEPT | §5.5 / §8.3 cohort 清单 + `query_bounds`；`valid_until`；withdraw / reopen 即时失效 |
| G20 | P2 | ACCEPT | §4.1 `deps` + `deps_sha256` + import lint；§7.3 宏观证据冻结目录 / 权重 / 规则版本 |
| G21 | P2 | ACCEPT | §6.2 完整规范化载荷（列出排除的运行元数据） |
| G22 | P2 | ACCEPT | §10 `as_known` 按 `registered_at` 等系统事件时间截止 |
| G23 | P2 | ACCEPT | §9.4 两者 open、情景一致、`p` 差 ≤ 0.01、`b > 0` |
| G24 | P2 | ACCEPT | §11.2 `PrivateJudgmentCard` 判别联合、`pending_fill` 形状、撤回优先、`stocks_universe` 取 market |
| G25 | P2 | ACCEPT | §7.1 补偿扫描含 superseded、marker 只在全部成功后推进 |
| G26 | P2 | ACCEPT | §7.1 小批领取按剩余预算、`repair_stale_batches`、校准工作单元续跑 |
| G27 | P2 | ACCEPT | §3.5 `origins` 冻结表、`license_status`；`price_bar` close-only 字段为 null 并标 transform；§4.1 `publishable` |
| G28 | P2 | ACCEPT | §8.1 `margin_pp` 百分点，§11.1 冻结，§12.1 / §18.8 要求宏观规格写明单位 |
| G29 | P2 | ACCEPT（随 G02 消失） | 不再有第二套轴规则；混频与缺失沿用宏观 `regime.ts` |
| G30 | P3 | ACCEPT | §3.3 / §4.3 / §11.1 / §18.1 `asset_pair` 列为未实现能力，不在 Condition 联合里 |
| G31 | P3 | ACCEPT | §11.2 改为"域分离的内容 id，不承担授权语义" |
| G32 | P3 | ACCEPT | §5.3 序号示例、只有 settled 有 outcome；§14.3 / §15 验收 5 改序号 |

未采纳 / 部分采纳的说明：
- G08 的"按历史披露序列选最早合格版本"：规格二的 `readFacts` 只给某 `asOf` 的当前值，没有"该期第一次披露"的读取接口；v1 用 `first_observed` 并如实披露，列入 §18.4 与规格二对齐时一起看。
- F19 / G17 的统计保证：第 3 稿明确 N 是运营门槛，且写明宏观在默认阈值下长期"未校准"是正确结果；没有声称显著性。

## 第 3 稿自查（未送 Codex）

- 改名残留：`macro_axis`、`first_release`、`n_effective`、`axis-v1`、`settled_sample`、`latest_judgments(` 已全部清除（grep 为 0）。
- 新增的数字：`deferred` 计数器（无数字）；留出段 30% / 最少 20 条（标政策常量并给出来源量级）；`valid_until` 14 天（两个周跑周期）；小批 20 条与 30 s 收尾（政策常量，§7.1 写明预算推导依赖 resolver 声明的 `maxFetchMs`）；K 线范围 `base_date − 10 天`、`+ 20 天`（政策常量，覆盖长假）。
- 仍依赖实施期验证的项全部在 §18（复权能力、PostgREST `max_rows`、`maxDuration`、security definer owner、宏观规格补齐）。

## Codex 最终判定（第二轮原句）

> Verdict: 该规格在修复所列 P1/P2 后可实施，目前不可直接按稿实施。

第 3 稿即"修复所列 P1/P2"后的版本；按 owner 规则两轮已满，下一次 Codex 复审在计划四（实施计划）成稿时进行。
