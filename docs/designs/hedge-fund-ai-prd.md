# Hedge Fund AI — 产品需求草案 (PRD)

> 状态: Draft v1 · 2026-06-03
> 抽象自 `alva_ai_study_note_for_hedge_fund_ai.md`，嫁接到现有 **Hiphon PM**（John Cameron agent + doctrine + 战绩 journal + OSStack）。
> 注：本文对 Alva 的描述均据其公开材料与该学习笔记（非一手核实）；目的是借鉴模式，非竞品对标。
> 面向：中国私募基金经理（PM Miller / osborn）。可转债 + A 股多资产 + 周频 + risk parity。
> 合规：本产品是**决策辅助**，不直接下单。任何对外/实盘动作前须人类 PM 确认。最终合规口径以基金的法务/合规为准。

---

## 0. 一句话定位

> 投资 AI 的终态不是"报告生成器"，而是 **Playbook 操作系统**：把投资想法变成可重复、可审查、可刷新、可审计的工作流。

Alva 给的最大启发是这条流水线（我们照搬其**形**，换其**料**）：

```
Idea → Thesis → 需要的数据 → 信号定义 → 历史回测 → 风控检查
     → 实时监控 → Alert → 人类 PM 决策 → (批准后)执行 → 事后归因 → 策略记忆
```

我们的差异化护城河（不与 Alva 正面竞争）：
**中国私募工作流 + 可转债 edge + 周频纪律 + Wind/Choice/券商数据 + 人在环 + 战绩记忆（已在 Hiphon PM 落地）。**

---

## 0.1 参考架构（5 层，源自笔记 §5）

笔记最核心的抽象：**agent 负责推理，playbook runtime 负责记忆/刷新/校验/审计**。

```
┌───────────────────────────────────────────────┐
│ PM / 人决策层   thesis 批准 | 风控override | 执行确认 │  ← §8 审批闸
├───────────────────────────────────────────────┤
│ 投资 Agent 层   研究 | 风险 | 回测 | 复盘 agent      │  ← Hiphon PM 技能套件
├───────────────────────────────────────────────┤
│ Playbook Runtime 层  schema|调度|alert|审计|记忆     │  ← §4 schema + §9 工作流 + journal
├───────────────────────────────────────────────┤
│ Skill/Tool 层   Wind|Choice|转债|组合|新闻|宏观       │  ← §6 数据 Skill
├───────────────────────────────────────────────┤
│ 数据基础层   行情|基本面|另类|内部 PnL                │  ← §3.1
└───────────────────────────────────────────────┘
```

## 1. Part 1 — 应该复制的产品模式

每一项都映射到我们**已有**或**待建**的组件，保持与 Hiphon PM 的连续性：

| Alva 原语 | 复制什么 | 我们现状 / 落点 |
|---|---|---|
| **Playbook** | "想法→活的工作流"，而非一次性报告。每个严肃策略=一个 playbook 实例 | doctrine.md 是单一"house playbook"雏形 → **泛化为多 playbook schema**（§4），可转债/risk-parity 各一份 |
| **Agent Skill（skill-first）** | 能力以可复用 Skill 暴露，非单体 chatbot；可被 Claude Code / OpenClaw / Hermes / Telegram 调用 | 已有 SKILL 套件（pick/deepdive/track/bottleneck）→ **加数据 Skill**（§6） |
| **Backtest** | 历史检验 + 成本/滑点/流动性假设 + CAGR/Sharpe/回撤/胜率/换手 | 已有 `score-calls.sh`（前复权战绩）+ `signals/backtest.ts` → **加周频再平衡回测器**（成本/流动性） |
| **Alert / Live monitor** | 信号变化/thesis 破/风控越界/催化事件触发提醒 | 待建：**风控雷达 + 周频决策包**（§9），复用 catalyst-watch |
| **Human Approval** | 实盘/改风控/对外发布前强制人确认 | personal-version 合规雏形；OSStack daemon 已有 approval/clarify 表 → **接成审批闸**（§8） |
| **Review Loop** | 周度复盘 + 事后归因 + 教训进持久记忆 | 已有 append-only journal + scorecard 校准 + OSStack 看板 → **加归因 + 周度复盘**（§9） |
| **Quantamental** | 量化纪律 + 基本面 thesis + 叙事 + 自动化，二者都要 | doctrine 已是"叙事→假设→可量代理→信号→历史检验→风控→人决策"骨架 |
| **Idea→Playbook 提问清单** | 10 问（thesis/什么为真/什么数据验证/信号/可回测/什么证伪/什么风险/监控什么/何时 alert/人要决策什么） | 纳入 playbook 创建流程 |
| **Use-case catalog** | 一组明确用例（但换成我们的） | 见 §5 catalog（可转债周池/风险雷达/风格轮动/risk-parity/周度复盘/归因/PM memo/投资者问答） |
| **Decision support, not execution** | 只研究/排序/模拟/草拟订单/草拟 memo；不自动下单 | §7 边界（我们更严） |

---

## 2. Part 2 — 不应该照搬的部分

| 不照搬 | 为什么（尤其中国私募语境） |
|---|---|
| **社区化 / 公开 Playbook / remix 分享** | 中国私募**非公开**，不得公开宣传/荐股（《私募投资基金监督管理暂行办法》）。策略=核心机密。默认 **private-first**：按策略/账户/产品隔离，用户审计，无意外公开。社区分享=合规与泄密双重雷区。 |
| **一键交易 / Live execution** | 实盘下单须经风控+合规+人工。AI 只能**草拟订单**（draft order），不碰券商交易接口。规避操作风险与监管红线（老鼠仓/异常交易）。 |
| **泛美股 / crypto / on-chain / 另类数据假设** | Alva 的数据假设是全球/美股/crypto。我们换成 **A 股 + 可转债 + Wind/Choice/券商**。crypto/on-chain 直接砍。中文财经新闻、国内市场微结构、A 股交易规则（T+1、涨跌停、可转债 T+0+20%熔断）才是 edge。 |
| **prosumer 订阅 / agent-builder 定价 / community discovery** | 我们是单基金内部工具，不做 SaaS 分发。无 community discovery。 |
| **把 backtest 当未来证明** | 回测=参考非承诺。强制样本外/前瞻校准（已在 Hiphon scorecard 用 n≥20 sample floor + by_evidence/by_chain_role）。不得用回测对投资者宣称收益。 |

---

## 3. Part 3 — 中国本地化实现方案

### 3.1 数据层（替换泛美股/crypto 假设）

| 数据 | 来源（优先级） | 备注 |
|---|---|---|
| 行情/财报/估值 | **Wind (WindPy)** → **东方财富 Choice (ChoiceData)** → Tushare/聚源 → 现有 eastmoney 级联 | Wind/Choice 需 license + 终端；Tushare/eastmoney 做免费兜底 |
| 可转债全量 | **集思录 / 宁稳网 / Wind 转债库** | 双低、溢价率、纯债价值、YTM、条款、评级、余额、换手 |
| 北向/资金面 | Tushare 5k（已用）/ Wind | A 股专属 |
| 宏观/利率 | Wind EDB / 同花顺 iFinD | 利率、流动性、政策 |
| 持仓/交易/PnL | **券商 PB 系统（恒生 O32/O45、华锐）** 导出 / 托管估值表 | 内部数据，read-only 导入；不接交易写权限 |
| 新闻/催化 | 财联社 / 同花顺 / 公告（巨潮 cninfo） | 中文，evidence ladder 分级 |

> 复用现有：行情 4 层级联 + tushare 5k 已能覆盖 A 股 + 北向 + 财报；可转债与 Wind/Choice 是**净新增**数据 Skill（§6）。

### 3.2 可转债策略（核心 edge）

可转债的双重属性（债底 + 股性）决定打分维度：
- **双低**：价格（如 <115）+ 转股溢价率（如 <25%）联合排序
- **债底安全**：纯债价值 / 到期收益率 YTM（正 YTM = 下有保底）
- **条款博弈**：下修预期（促转股）、强赎规避（临近强赎线减仓）、回售保护
- **信用**：评级 + 余额 + 发行人基本面（避雷信用瑕疵）
- **流动性**：成交额/换手过滤（小余额低流动性剔除）
- **正股联动**：delta-like（转股价值对正股敏感度）
- **周频再平衡**：可转债 T+0，但策略**周频**调仓，降换手、控成本

### 3.3 周频交易

- 周频 rebalance（如每周五盘后生成、下周一执行），非日内
- 成本模型：佣金 + 冲击成本（按成交额分档）+ 双低策略的换手约束
- 流动性过滤：日均成交额阈值；剔除停牌/临近强赎/到期
- A 股 T+1、可转债 T+0：执行规则进 playbook 的 `execution_rules`

### 3.4 多资产 risk parity

- 资产桶：A 股（小盘/红利）、可转债 sleeve、黄金、（可选：国债期货/商品）
- 风险预算：波动率平价（各桶风险贡献相等）+ **年化总波动率目标默认 8%**（可配 6–12%）
- 协方差：**EWMA λ=0.94（≈60 日半衰），滚动窗口 ≥120 交易日**，周度再估
- **CB sleeve 进协方差的方式（关键，须明确）**：v1 把可转债篮子作为**单一资产**用其篮子净值波动率入协方差；v2 再做因子分解（股性 delta + 久期），因为转债同时含权益 beta 与利率久期
- 权重约束：单桶 **min 5% / max 50%**；杠杆默认 1.0（私募可调，受 `risk_controls.max_leverage` 约束）
- 周频再平衡 + **偏离带触发：风险贡献偏离目标 > 5 个百分点（或权重漂移 > 3%）才动**，省成本

### 3.5 合规（中国私募，硬约束）

> 本产品是**私募证券投资基金**（二级市场：转债+A股），不是私募股权。操作规则锚定 **《私募证券投资基金运作指引》（2024-08 施行）**，而非仅泛用的《私募投资基金监督管理暂行办法》。以下为常识性边界，**非法律意见，每个数字须基金法务/合规确认**（见 §11）。

- **管理人/产品**：管理人 AMAC 登记、产品备案；最低募集/存续规模门槛（运作指引：成立后长期低于一定规模触发清算，具体数额以现行指引为准）
- **合格投资者**：金融资产门槛 + 单只基金投资者**人数上限（契约型 ≤200；有限合伙/有限责任 ≤50，以产品结构为准，法务确认）**
- **投资者适当性**：风险承受能力匹配 + **双录（录音录像）** + 冷静期/回访（如涉申赎/募集材料）
- **信息披露（合规义务，区别于内部周报）**：向投资者定期披露净值与定期报告（季度/年度，按指引）+ 重大事项临时披露。**内部周度 memo 是非披露义务的管理工具，不等于对外披露**
- **不得**承诺收益/保本、**不得**公开宣传/荐股（私募非公开募集）
- **从业人员**：本人证券账户及交易**申报/报备**；**公平交易制度**（多账户不得抢先于基金/利益输送）+ 异常交易监控；反内幕/反老鼠仓
- **交易**：须风控+人工；AI 不接交易写权限
- AI 输出一律带"决策辅助、非投资建议、回测不代表未来"尾注；对外材料须人类 PM + 合规双确认

---

## 4. 核心 Playbook Schema

YAML，存为 `playbooks/<id>.yaml`（Markdown 叙事 + YAML 结构）。每个策略一个文件。与 Hiphon PM 的 journal/scorer/doctrine 对接字段已标注。

```yaml
playbook:
  id: cb-weekly-doublelow            # 唯一 id
  name: 可转债双低周频池
  owner: pm_miller
  status: draft | active | paused | retired
  version: 1
  created: 2026-06-03

  universe:
    asset_class: [convertible_bond]   # convertible_bond | equity | etf | gold | bond_future
    market: [CN]                      # A股/转债 = CN
    filters:                          # 硬性纳入门槛
      min_adv_cny: 20_000_000         # 日均成交额下限（流动性）
      exclude: [near_forced_redemption, suspended, near_maturity_30d, rating_below_AA-, delisting_risk, credit_event]

  thesis:
    summary: 风险偏好回暖时，中等溢价、流动性好的双低转债跑赢。
    hypothesis: [双低组合在震荡/温和上行市有正期望, 债底在无违约假设下提供下行保护]
    invalidation:                     # 证伪条件（必填）
      - 个券信用事件 / 正股退市风险（债底失效——2021 后已有违约/退市转债）
      - 信用利差快速走阔（避险）
      - 正股系统性破位 + 转债跟跌
      - 流动性骤降致无法按计划调仓

  data_dependencies:
    market: [cb_price, premium_rate, conversion_value, bond_floor, ytm, volume, rating, outstanding]
    fundamentals: [issuer_financials, credit]
    alt: [news_catalyst, announcements]      # 中文公告/财联社
    internal: [portfolio_positions, transactions, risk_limits, prior_calls]  # 接 ~/.hiphon-pm

  signal_logic:
    factors:
      - {name: double_low, def: "0.5*price_rank + 0.5*premium_rank（升序）", freq: weekly}
      - {name: ytm_floor, def: "正 YTM 优先", freq: weekly}
      - {name: liquidity, def: "ADV 分位", freq: weekly}
    ranking: 综合分升序取前 N（双低分主导，债底/流动性为过滤+加权）
    rebalance_frequency: weekly        # 周频
    position_count: 20-30              # 分散

  risk_controls:                       # 映射 doctrine §5/§8
    max_position_weight: 0.06
    max_issuer_weight: 0.06
    max_sector_exposure: 0.30
    max_leverage: 1.0
    max_drawdown_alert: 0.10
    liquidity_constraint: ADV>=20mm CNY
    forced_redemption_rule: 见 clause_rules.forced_redemption（正股≥转股价×130% 满足 15/30 交易日，逐券解析）
    credit_floor_caveat: 债底仅在无违约假设下有效；信用事件/退市使纯债价值失效

  backtest:
    start: 2018-01-01
    end: rolling
    benchmark: 中证转债指数
    assumptions: {transaction_cost_bps: 15, slippage_bps: 10, liquidity_filter: ADV>=20mm}
    outputs: [CAGR, Sharpe, max_drawdown, hit_rate, turnover, exposure_breakdown]
    discipline: 样本外 + 前瞻校准；不得过拟合（标注 n、报样本量）

  execution_rules:
    settlement: CB_T0                  # 可转债 T+0；A股=T+1
    generate: 周五盘后                 # 生成决策包
    execute: 下周一开盘后人工          # 人执行，AI 不下单
    order_type: draft_only             # ★ 只草拟订单
  clause_rules:                        # 逐券按募集说明书解析（条款各异）
    forced_redemption: 正股≥转股价×130% 满足 15/30 交易日（或各券约定）→ 临近即减/清
    put_protection: 正股<转股价×70% 满足约 30 交易日 → 回售保护（下有支撑）
    maturity_redemption: 到期按 面值+末期息 赎回（≈106–110）；YTM 即以此为基准，强赎触发后 YTM 假设作废
    downward_revision: 下修预期（促转股）作为正向 catalyst，但稀释正股

  live_monitoring:
    refresh: daily
    alert_conditions: [signal_change, thesis_break, risk_limit_breach, forced_redemption_near, abnormal_price_volume, credit_event]

  human_approval:                      # 见 §8
    required_before: [draft_order_to_live, risk_limit_change, strategy_publication, investor_memo_send]
    approver: pm_miller
    gate: 决策包 → PM 勾选确认 → 方可执行

  review_loop:
    weekly_review: required
    post_trade_attribution: required   # 归因到因子/标的
    memory: ~/.hiphon-pm/calls.jsonl (append-only) + rebalances.jsonl + scorecard.json
    calibration: by_factor(double_low/ytm/liquidity) / by_playbook（★需扩展 scorer 新增切面；chain_role/by_evidence 是权益卡脖子概念，对转债无意义）

  compliance:
    disclaimers: [决策辅助非投资建议, 回测不代表未来, 私募不得公开宣传]
    private: true                      # 不公开、不分享
```

---

### 4.1 篮子再平衡记录（journal schema gap — 必须新增）

现有 `~/.hiphon-pm/calls.jsonl` 的 `call` 记录是**单标的、单评级**（storage.md §1.1）。周频再平衡是**一篮子**（20–30 只、目标权重、同时买/卖/持），现有 schema 装不下。**新增** `~/.hiphon-pm/rebalances.jsonl`（append-only）：

```yaml
kind: rebalance
rebalance_id: cb-weekly-doublelow-2026-06-05
playbook_id: cb-weekly-doublelow
as_of: 2026-06-05
benchmark: 中证转债指数
target_weights: [{ticker: 113xxx.SH, w: 0.05, action: add, factor_scores:{double_low:..,ytm:..,liq:..}}, ...]
turnover: 0.18
approval_id: <OSStack approval row id>     # 接 §8 审批闸
```
每条 `rebalance` 可 reference 其拆解的 per-name `call` 行（保留篮子身份与 risk-parity 上下文）。
**篮子级 hit 定义**：篮子相对 benchmark 的超额收益（不是单券 stop/target）。`score-calls.sh` 是单券前瞻打分器，**无法**算篮子相对基准——需新建篮子回测/归因器（见 §6/§10 标 net-new）。

## 5. MVP 功能列表（分期）

**MVP 1（旗舰）— 周度研究 + 再平衡助手**（= 我们之前 deferred 的"每日推送"，按周频/转债重定为更合适的**周度决策包**）
- 输入：当前持仓 + 本周行情 + 可转债全池 + risk-parity 目标 + 宏观/催化 + 内部交易规则
- 输出：周度排序表、买卖持候选、风险警告、持仓漂移分析、再平衡建议、PM 决策 memo、人确认清单
- 这是 §9 工作流的产物

**MVP 2 — 可转债 playbook**
- 导入全池 → 流动性/价格/溢价/信用/到期/强赎过滤 → 策略打分排序 → 对比持仓 → 周频再平衡历史模拟 → 草拟订单 → 风险标注 → PM 审批 → 存决策与结果

**MVP 3 — 市场叙事→组合影响**
- 侦测叙事（AI capex / 国内刺激 / 利率 / 黄金 / 流动性）→ 映射受影响板块/资产 → 识别组合暴露 → 历史类比 → **仅当改变组合级风险/机会才 alert**

**用例 catalog（我们的，非 Alva 的）**：可转债周池 · 可转债风险雷达 · A 股风格轮动监控 · risk-parity 配置复盘 · 小盘/红利/黄金轮动 · 周度再平衡助手 · 持仓漂移监控 · 回撤归因 · 基金周报 memo · 投资者问答草稿 · 宏观→组合影响图

---

## 6. 数据 Skill 列表（skill-first）

| Skill | 职责 | 数据源 | 状态 |
|---|---|---|---|
| `wind-data-skill` | Wind 行情/财报/EDB | WindPy | 新建（需 license） |
| `choice-data-skill` | 东方财富 Choice | ChoiceData | 新建（需 license） |
| `convertible-bond-skill` | 转债全池+条款+双低+YTM+强赎 | 集思录/宁稳网/Wind | 新建（核心 edge） |
| `portfolio-skill` | 当前持仓/权重/行业 | 券商 PB 导出 / portfolio.json | 扩展现有 |
| `transaction-skill` | 成交/成本/换手 | PB 流水导出 | 新建（read-only） |
| `portfolio-risk-skill` | 集中度/暴露/波动率/回撤/risk-parity | 内部 + 行情 | 新建 |
| `weekly-rebalance-skill` | 周频再平衡 + 成本/流动性约束 | playbook + 行情 | 新建 |
| `backtest-skill` | 组合周频回测器（建仓/成本/滑点/流动性/换手/基准归因） | 行情历史 | **净新增**（score-calls.sh / backtest.ts 是单券前瞻打分器，无组合/成本/换手机制——是新引擎，非扩展） |
| `macro-radar-skill` | 宏观/利率/流动性叙事 | Wind EDB/iFinD | 新建 |
| `earnings-catalyst-skill` | 公告/财报/催化日历 | 巨潮/财联社 | 复用 catalyst-watch |
| `compliance-review-skill` | 对外措辞合规审阅 | 规则库 | 新建 |
| `pm-memo-skill` | 周报/投资者问答草稿 | 内部 | 新建 |

> 复用现有：`hiphon-pm-pick`/`deepdive`/`track`/`bottleneck` 作为研究与战绩层；新增上表为**数据与组合层**。

---

## 7. 风控与合规边界

**AI 可以做**：研究、排序、模拟、回测、监控、报警、**草拟订单**、草拟 PM memo、解释风险、归因。

**AI 不可以做**：
- 不经人确认**实盘下单**（draft-only，不接交易写接口）
- 不经批准**改风控限额**
- 未经合规审阅**对外发布**客户材料/收益宣称
- 把**回测当未来证明**
- **隐藏**不确定性/数据缺失（缺数据明说"暂无数据"）
- **公开/分享** playbook（private-first）

**中国私募硬边界**（§3.5）：不承诺收益、不公开荐股、合格投资者+适当性、反内幕/老鼠仓、定期披露、最终以基金合规口径为准。

每条输出尾注：*决策辅助，非投资建议；回测不代表未来；私募非公开。*

---

## 8. 人类基金经理确认机制（Approval Gate）

复用 OSStack daemon 已有的 approval/clarify 表 + 看板（已核实：`ApprovalRow` 状态 pending/accepted/rejected/timed_out，持久化），做一个**显式审批闸**。注：OSStack 原生无 `AMENDED` 态——"修改后再审"实现为**驳回原审批 + 提交一条新审批**（薄扩展，非纯复用）：

```
决策包生成 → 状态 PENDING_APPROVAL
   PM 审阅（看排序/风险/草拟订单/归因）
   ├─ 逐条勾选确认 → APPROVED → 生成最终订单清单（人工执行）
   ├─ 修改（改仓位/剔除/加止损）→ AMENDED → 重新风控检查 → 再审
   └─ 驳回 → REJECTED（记录原因，进 review_loop 记忆）
```

**必须人确认的动作**（playbook.human_approval.required_before）：
1. 任何 draft order 转为可执行 2. 改风控限额 3. 对外/投资者材料发布 4. 策略上/下线 5. 新 playbook 激活

**Pre-trade checklist**（审批前自动跑）：风险暴露检查 · 仓位/集中度检查 · 流动性检查 · 强赎/到期检查 · 合规措辞检查 · 订单预览。审批后写**执行日志**，T+1 后跑**事后归因**。

> 原则：AI 提建议，PM 保留全部决策权（preserve PM authority）。命中/收益由确定性脚本裁定，非 AI 自评（沿用 Hiphon 战绩纪律）。

---

## 9. 每周投资决策包工作流（旗舰）

```
周五盘后 (cron / 手动 run)
  │
  1. 数据刷新   wind/choice/cb/portfolio/txn/macro skills 拉本周数据
  │
  2. Playbook 运行  对每个 active playbook：
  │     - 信号/因子打分 → 排序
  │     - 对比当前持仓 → 漂移分析
  │     - risk-parity 目标 vs 实际暴露
  │
  3. 回测/风控   weekly-rebalance-skill 模拟（成本/流动性）+ portfolio-risk-skill 检查限额
  │
  4. 生成决策包 (decision pack)：
  │     ├ 本周市场/宏观摘要
  │     ├ 组合表现 + 归因（上周）
  │     ├ 周度排序表（可转债池 / 多资产）
  │     ├ 买/卖/持候选 + 草拟订单（仓位%/理由/风险/强赎检查）
  │     ├ 风险警告（集中度/回撤/流动性/信用/强赎）
  │     ├ 再平衡建议（仅 drift>阈值才动）
  │     ├ 置信度（按 scorecard 校准，n≥20 才说概率）
  │     └ 合规尾注
  │
  5. 审批闸  → PENDING_APPROVAL → PM 勾选 → APPROVED/AMENDED/REJECTED   (§8)
  │
  6. 执行   人工按最终清单下单（AI 不下单）；写执行日志
  │
  7. 记忆+复盘  调用入 calls.jsonl(append-only) → 周度复盘 + T+1 后事后归因
  │             → score-calls.sh 按因子/证据/角色校准 → 下周 playbook 微调
  └→ 循环
```

输出物 = **一份每周决策包**（Markdown + 结构化 JSON）。这是 PM 每周真正用的东西，也是整个产品的"心跳"。

---

## 10. 与现有 Hiphon PM 的关系（连续性）

| Hedge Fund AI 概念 | 复用 Hiphon PM 现有 | 净新增 |
|---|---|---|
| Playbook | doctrine.md（house playbook 雏形）+ §4 schema | 多 playbook 文件 + runtime |
| 战绩/backtest | 复用**纪律**（确定性打分、前复权、append-only）非引擎 | **组合周频回测器=净新增**（单券打分器装不下篮子/成本/换手/基准归因） |
| 策略记忆 | calls.jsonl 的 append-only **属性**（非 schema） | rebalances.jsonl 篮子记录（§4.1）+ 组合层 + 归因 |
| 研究 | pick/deepdive/track/bottleneck + chokepoint 方法 | 可转债/risk-parity playbook |
| Review/PM | OSStack 看板/approval 表 + CEO/对抗复审模式 | 审批闸 + 周度复盘 |
| 数据 | 行情4层级联 + tushare5k + 东财 | wind/choice/cb/PB 数据 Skill |

**结论**：Hedge Fund AI 不是另起炉灶，是把 Hiphon PM 从"个人选股顾问"升级为"**私募 playbook 操作系统**"——加多 playbook、周频再平衡回测、组合/风险/归因、显式审批闸、Wind/Choice/可转债数据。

---

## 10.1 验收标准（源自笔记 §11 — 按工作流质量而非答案流畅度评）

- **研究质量**：识别正确数据？区分事实/推断/观点？引用来源？发现缺失数据？产出可证伪 thesis？
- **投资纪律**：避免后视偏差？尽量样本外？计入成本与流动性？给出证伪条件？标注过拟合？
- **运营可靠**：自动刷新？跨周保持状态？说清"自上次复盘以来变了什么"？审计日志？数据缺失能恢复？
- **人类控制**：下单前要确认？建议与执行分离？解释不确定性？保留 PM 全部决策权？
- **MVP 验收**：每周能稳定产出一份合规、带草拟订单+风险+归因+置信度(带 n)的决策包，且全程经审批闸、可在 journal/看板追踪。

## 11. 开放问题（PM/合规需拍板）

- [ ] Wind/Choice/PB **数据 license** 与接口可得性（决定数据 Skill 排期）
- [ ] 可转债数据源选型（集思录 API vs Wind 转债库）
- [ ] risk-parity 资产桶最终范围（是否含国债期货/商品）
- [ ] 合规口径细节须经基金**法务/合规**确认（本 PRD §3.5/§7 为常识性边界，非法律意见）
- [ ] 审批闸落地形态：CLI 勾选 vs 轻量 Web cockpit（Phase 5）
- [ ] 决策包交付渠道：Markdown / Telegram / 未来 PM cockpit
```
