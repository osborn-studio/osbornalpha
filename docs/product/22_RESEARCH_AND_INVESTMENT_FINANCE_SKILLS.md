<!-- 22_RESEARCH_AND_INVESTMENT_FINANCE_SKILLS.md · osbornalpha 研究与投资金融能力（选股/跟踪校准/深研/卡脖子/HOUSE_DOCTRINE） · 最后更新 2026-06-20 -->

# 22 · 研究与投资金融能力

> 以 `skills/hiphon-pm/references/doctrine.md`、`data-access.md`、`storage.md` 与各 SKILL.md 真实内容为准。本文聚焦方法论与数据获取，skill 清单见文档 19。

## 22.1 HOUSE_DOCTRINE（投资宪法）

文件：`skills/hiphon-pm/references/doctrine.md`，§0–§11，是 John Cameron 及全部 hiphon-pm skill 的决策依据。

- **§0 第一性原理**：保本第一；流动性是潮水；高信念则集中；先证伪再下注；只在能力圈内开火。
- **§1 择时（宏观闸）**：§1.1 三态风险判断（🟢 risk-on / 🟡 neutral / 🔴 risk-off）→ 仓位天花板（80–100% / 40–60% / 0–30%）；§1.2 个股信号触发器（多：rsi_oversold、anomalous_volume、momentum_up、north_accum；空：rsi_overbought、large_move、north_outflow）。
- **§2 选股四层漏斗**：宏观顺风板块 → §11 卡脖子层 → 护城河 + 财务 → 信号确认。
- **§3 六级评级**：strong_buy / buy / add / hold / trim / sell，各有多因子触发条件。
- **§4 策略**：分 2–3 批建仓；金字塔加仓（绝不向下摊平亏损）；止损纪律 −8%~−15%；移动止损；认错优先于面子。
- **§5 仓位**：单票 ≤15%（strong_buy ≤20–25%），单板块 ≤35%，现金按宏观闸，仓位 ∝ 信念度。
- **§6 合规（个人版）**：允许买卖话术，但 **强制** 评级 + 理由 + 仓位% + 止损/风险 + 固定页脚。
- **§7 输出契约**：每个 pick = 评级 + 逻辑（带数据来源）+ 仓位%（§5）+ 进场区间 + 止损价（−n%）+ 主要风险。
- **§8 组合逻辑**：已持仓走加/减/卖（非「买」）+ 集中度检查（§5 上限强制）。
- **§9 校准（战绩）**：诚实引用 `scorecard.json`，只有 `n≥20` 可靠，永远报 n，冷启动承认「无战绩」。
- **§10 日志（call logging）**：append-only 写 `calls.jsonl`，记录决策而非结果。
- **§11 卡脖子方法（选股放大器）**：§11.1 双镜头 Serenity（被忽视的瓶颈/市值错配）+ Crux（全栈 + 角色 + 执行确定性 vs 早期投机）；§11.2 6–9 层栈映射；§11.3 「需求翻倍最先断哪」按集中度/可替代性/扩产难度/需求证明/共识程度排序；§11.4 四角色 executor/bottleneck/beneficiary/optionality；§11.5 证据三档 ● 高（财报/IR/官方）/ ◐ 中（券商/行业新闻）/ ○ 低（社媒/传闻）；§11.6 接 5 维 Lane/Name Score（Constraint/Evidence/Consensus/Mispricing/Catalyst）。

## 22.2 选股：`hiphon-pm-pick`

5 步流程（对应 doctrine）：① 宏观/流动性闸定总仓位 → ② §11 候选生成（终端系统→6–9 层栈→「需求翻倍最先断哪」→四角色带证据 ●/◐/○）→ ③ 多因子打分（`/api/signals /financials /flows /perspectives /radar`）→ ④ §3 评级 × 信念排序 → ⑤ 输出 + 追加 `calls.jsonl`（含 `chain_role` + `evidence` 供校准）。

护栏：每个 pick 必含评级/理由/仓位%/止损/风险；数字只来自 API；缺数据「暂无数据」绝不编造；A 股专属数据对 HK/US 标「暂无数据」。

## 22.3 深研：`hiphon-pm-deepdive`

4 步：① 解析 + 并行取数（`/api/quote /financials(5Y ROE/margins/FCF) /signals /flows /holders /calendar /perspectives /radar`）→ ② 系统性分析（商业模式 / 护城河 doctrine §2 layer3 / 财务质量 ROE 趋势·毛利·FCF·杠杆·应收 / 供应链位置（栈层 + 角色 + 证据，§11）/ 估值（历史·同业 PE/PB 分位）/ 催化剂观察（catalyst-watch.md：未来 3 件关键事件 + 多空确认信号）/ 风险 top3 + 触发 / 宏观契合）→ ③ 9 人委员会 + 终判（引用最尖锐反方）→ ④ 操作建议 + 追加日志（已持仓则加/减/卖 + 集中度检查 §8）。

输出：8 段 markdown 投资报告 → 操作建议 → 合规页脚。HK/US 因缺深度数据降级为「行情+信号+定性」。

## 22.4 跟踪与校准：`hiphon-pm-track`

确定性打分管线（无 LLM 自评）：

- **记一笔**：append `call` 记录到 `calls.jsonl`，schema 含 `call_id`（`YYYY-MM-DD-<ticker无点>-NNN`）、`rating`、`thesis`、`entry_basis`（next_open|same_close）、`entry_price_ref`、`target_pct`、`stop_pct/stop_price`、`size_pct`、`horizon_days`、`signal_mix[]`、`chain_role`、`evidence`、`source`。
- **平仓**：append `event` 记录（`manual_close` 等），不改原 call。
- **打分**：`bash skills/hiphon-pm/scripts/score-calls.sh` → 取前复权 K 线 `/api/kline/{ticker}?period=D&fqt=1` → 走 bar 判 hit_stop / hit_target / expired → 算 `(exit_adj−entry_adj)/entry_adj` → 写 `scorecard.json`。
- **命中定义**：多头（buy/add/strong_buy）= hit_target 或（到期/手动且收益>0）；空头（sell/trim）= call 后下跌（收益<0）；hold 不计分。
- **校准桶**：`by_signal_mix`、`by_evidence`、`by_chain_role`，均在 `n≥min_sample`（默认 20）才标 `reliable:true`。

## 22.5 卡脖子/瓶颈分析

`ai-supply-chain-bottleneck-hunter`（纯方法论，研究合规、不评级）与 `stock-bottleneck-picker`（方法 + osbornalpha 实盘数据，按角色给候选股）。核心问题恒为「若需求翻倍，最先断的是哪一环」。证据阶梯 A（财报/transcript/IR）> B（券商/行业媒体）> C（社媒/论坛）> D（未证实传闻），映射到 Confirmed/Inferred/Weak/Needs-verification。两者方向先行、论点未成立不给名单，与 doctrine §11 完全同源；带买卖评级时由 John Cameron 自己跑 §11 + doctrine 个人版评级（详见文档 19）。

## 22.6 数据获取（`data-access.md`）

- **Base URL**：生产 `https://stock-monitor-nu.vercel.app`，本地 `http://localhost:3000`。
- **鉴权**：生产受站点口令保护，`POST /api/auth/unlock {"password":...}` 取 HMAC `sm_auth` cookie（30 天），复用于所有 `/api/*`。
- **端点目录（节选）**：`/api/search`（名→ticker，总是先调）、`/api/quote/{ticker}`、`/api/quote/batch`、`/api/signals/{ticker}`（triggers + bias + hit_rate_5d）、`/api/radar/{ticker}`（即时无 LLM）、`/api/perspectives/{ticker}`（慢且有 token 成本，慎用）、`/api/financials/{ticker}`（A 股 5Y）、`/api/flows/{ticker}`（A 股北向/涨跌停）、`/api/holders /calendar`（A 股）、`/api/kline/{ticker}?period=D&fqt=1`（前复权）。
- **信号触发器**（源 `src/lib/signals/backtest.ts`）：`large_move(w3)`、`medium_move(w2)`、`anomalous_volume(w2)`、`high_amplitude(w1)`、`rsi_overbought(w2)`、`rsi_oversold(w2)`、`momentum_up(w1)`，各带 `bias` 与 `hit_rate_5d`。
- **成本纪律**：优先 `/api/radar`（即时）少用 `/api/perspectives`（慢/有成本）；独立请求并行 fan-out；批量行情走 `/api/quote/batch`；A 股专属端点对 HK/US 跳过并标「暂无数据」。

## 22.7 存储契约（`storage.md`）

私有状态全在 `~/.hiphon-pm/`（不入 git）：`calls.jsonl`（append-only 日志，写者：track/pick/agent 仅追加）、`portfolio.json`（当前持仓，用户/agent 可编辑）、`scorecard.json`（派生战绩，仅 `score-calls.sh` 写）。生命周期 `OPEN →[manual_close|hit_stop|hit_target|expired]→ CLOSED`，开仓计未实现 MTM 不计入已平仓命中率；打分基于前复权 K 线（公司行动校正）；`scorecard.json` 每个比率必带 n，`reliable = n≥min_sample`。集中度检查（§5.1）：单票 `existing+new>15%`（strong_buy 25%）或单板块 `>35%` 即拒绝并提议封顶仓位。

## 22.8 与既有事实的差异

- `references/` 三文件在共享目录 `skills/hiphon-pm/references/`。
- 卡脖子能力实为两个 skill（方法论 hunter + 接数据 picker），方法同源于 doctrine §11。
- 评分脚本为纯 bash + jq（确定性、可复现、无 LLM），命中判定不经模型。
