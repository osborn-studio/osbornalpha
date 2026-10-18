# 研究 / 分析 / 我的投资 三层边界

状态：已采纳（2026-10-17）。首轮实施见 `docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md`；实施分支 `codex/analyst-scoring-m1`，合并后以 PR 为准。

## 决定

OsbornAlpha 内部按产出物分三层。层间只以建议 id 单向连接（另有 research 侧 `analyst_id` 与 `analyst_profiles.id` 的语义对应，不是数据链接）：

| 层 | 路由 | 产出物 | 真值来源 |
|---|---|---|---|
| 研究 Research | `/research` | 建议（recommendation） | 人 + 工具的方法论 |
| 分析 Analyst | `/analyst` | 分析师模拟账本 + 前向评分 | 冻结规则，系统自己是权威 |
| 我的投资 Portfolio | `/portfolio` | 真实交易 + 持仓 | 外部事实（手工记录，将来券商同步） |

- research 产出建议（首条自动投递通道：research 的 playbook `PAPER_TRADE` 运行审批通过后，可在 /research/playbooks 一键登记为建议，归属 Agent 档案「Research Playbook」，`source_type = 'playbook'`，`source_ref` 记 run / thesis / memo / entity；其他来源仍为手工登记，`thesis_ref` 为可选引用。设计见 `docs/superpowers/specs/2026-10-18-playbook-to-recommendation-design.md`）；analyst 登记建议、在首次评分时冻结模拟成交价（建议日交易所本地日的 K 线收盘）、按等权规则模拟、用前向 5/20/60 个交易日打分；portfolio 的决定可通过 `decisions.recommendation_id` 引用一条同标的、未撤回的建议（采纳）。
- 实盘永远不改写建议和评分；analyst 永远不写 `trades`。连接是单向的：portfolio 只读 analyst 表，只写自己的 `recommendation_id`。
- 建议只追加：API 只开放创建与撤回；`analyst_profiles` 与 `recommendations` 不开 RLS delete 策略，档案只归档。
- 前向评分内核只有一份：`src/lib/scoring/forward.ts`。portfolio 的决定复盘（`review.ts`）与 analyst 的建议评分（`score-store.ts`）共用，规则冻结：基准 = 建议日交易所本地日起首根 K 线收盘；hit = 5 日方向；score = 方向调整后的 20 日收益（缺则 5 日）；hold 不计 hit / score；pass 按看空方向计分。
- `analyst_profiles.kind ∈ {human, agent}`：AI Agent 是分析师。每个 owner 懒创建一个 `is_self` 档案（「我」）。research 侧的 `research_decisions.analyst_id`、`research_analyst_identities.analyst_id` 在语义上等于 `analyst_profiles.id`，但不建外键（S4 库与组合库是否同库未核实）。

## 不搬的东西

- **S4/S6 留在 research。** `research_decisions.arm ∈ {human_baseline, ai_candidate, collab, averaged}` 按 thesis-week 配对，评的是研究方法哪条路径更准，是方法论自检（与 `/research/evals` 同类），不是分析师的建议表现。首轮 analyst 不接 S5 引擎。
- **「我的决定」留在 portfolio。** `decisions` 是实盘账本上的采纳事件；「我」在 analyst 里只是一个 `is_self` 档案。
- **portfolio 不加账户层。** v4 M1a 的账户 / 版本化账本仍是接券商同步时的债务。

## 与 2026-09-22 v4 方案的关系

v4 主张把 OSanalyst 融进 `/portfolio`。本 ADR 改为分层。按 2026-09-22 审计 README 的理解，v4 的核心顾虑是同一账户出现两份真值；实盘账本与分析师模拟账本是不同账户，模拟成交不进 `trades`，所以不冲突。v4 的 M2（权重 / NAV / 规则执行）、M3（团队权限）本轮延后，若实施需另行决定归属，倾向落在 analyst 层。

## 已知局限（首轮）

- 价格基准漂移已通过 `recommendation_scores.base_close` 解决（`20261018090000_recommendation_scores_base_close.sql`）：`fill_price` 是首次评分基准下的基准日收盘并永久冻结，而每次刷新 `scoreForward` 都会在当前 K 线基准下重新算出同一根基准 K 线的 `base_close`，账本成交价 / 平仓价优先取它，与同次刷新的 `last_close` 同基准，无需复权因子。A 股前复权重算（送转 / 分红）由此自动跟随；港美股不复权的拆股在拆股当天到该代码下次刷新之间仍会短暂失真，刷新后即恢复。旧评分行 `base_close` 为 null 时回退到 `fill_price`；时间线「模拟成交价」列仍显示冻结值，两者不同时以悬停提示标出当前基准值。
- 某标的上所有建议停止再评分后（60 日已满或建议超过 130 天），其最新收盘冻结在最后一次评分。
- 建议日早于完整 120 根日线窗口首根 K 线的建议跳过不计分，也不会有模拟成交价。
- 追加写入已由数据库触发器保证（`20261017120000_recommendations_append_only.sql`）：`recommendations` 的 BEFORE UPDATE 触发器只放行 `withdrawn_at` / `withdraw_reason` 从 null 一次写入、`fill_price` / `fill_date` 从 null 一次成对写入，已撤回的行冻结，其余列任何改动一律拒绝并点名列名；持有本人 JWT 直写 Supabase 也绕不过。现有 `decisions` 表仍无同等保护，属 v4 M1a 债务。
- 模拟成交价取建议日交易所本地日的收盘，盘中登记的建议因此带有数小时的前视，属设计上的接受项。
- 建议超过 130 个自然日后不再重新评分（60 个交易日约 86–91 个自然日，跨长假更久；130 天仍能让基准 K 线留在 120 根抓取窗口内）。
- 建议时间线最多显示 500 条（`listRecommendations` 的显示上限）；模拟账本不受此上限。
- `portfolio/review-store.ts` 尚无同样的 K 线窗口保护，待跟进。

## 术语

研究 Research · 分析 Analyst · 我的投资 Portfolio · 建议 Recommendation · 采纳 Adopt · 撤回 Withdraw · 模拟账本 Simulated Book · 模拟成交价 Simulated Fill。完整对照见 `messages/GLOSSARY.md`。
