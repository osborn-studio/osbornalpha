---
name: hiphon-pm-pick
description: John Cameron 的主动选股+择时引擎。先判宏观/流动性总闸定总仓位，再用产业链卡脖子+护城河+信号面四层漏斗，直接产出当前应买入的排序标的清单，每只带评级/仓位%/进场区间/止损位/风险。复用 Stock Monitor 实时数据 API。Triggers on "今天买什么", "选股", "买入建议", "current picks", "hiphon pick", "该买什么", "组合建议", "give me buys".
---

# Hiphon PM — Active Stock Picker (主动选股 + 择时)

John Cameron 治下的主动选股技能：**自上而下，先择时定总闸，再选股排序**。直接回答"现在该买什么"。

> 严格遵循 `../hiphon-pm/references/doctrine.md`（投资宪法）。取数方式见 `../hiphon-pm/references/data-access.md`。
> 既可被用户单独调用（"今天买什么"），也可被 `john-cameron` 主代理在对话中编排。

## When to use

- 用户问"今天买什么 / 选股 / 给我买入建议 / current picks / 组合建议"
- 用户给定行业/主题想在其中选股（"在 AI 算力里选 / bottleneck pick: 储能"）
- 需要一份带评级+仓位+止损的可执行买入清单

不适用：单只股票的深度报告 → 用 `hiphon-pm-deepdive`（或 `stock-daily-radar`）。

## Inputs (all optional)

- **市场**：A / HK / US（默认 A 股为主 + 港美机会）
- **行业/主题**：限定赛道；无则全市场扫描
- **风险偏好**：进攻 / 均衡 / 防御（默认随宏观总闸自适应）
- **标的数量**：默认 3–5 只

## Workflow

### Step 0 — 取数准备 + 读持仓/战绩
按 `data-access.md` 设好 `STOCK_MONITOR_BASE_URL` 与 `sm_unlock`/`sm_get` helper。先 `sm_unlock`。
再读两份本地状态（若存在，见 `../hiphon-pm/references/storage.md`）：
- `~/.hiphon-pm/portfolio.json` → 现有持仓，使建议变成"基于持仓"的真决策（doctrine §8）
- `~/.hiphon-pm/scorecard.json` → 战绩校准桶，给置信度提供真实依据（doctrine §9）

### Step 1 — 宏观/流动性总闸（择时）
依 doctrine §1.1 判定 risk 状态（🟢顺风 / 🟡中性 / 🔴逆风）→ 定**总仓位上限**与风格。
材料：可用宏观叙事 + 指数/板块行情 + A 股看 `/api/flows` 北向趋势。**判不准就降一档保守。**
> 这一步决定后面所有个股仓位的"天花板"。逆风时即使有好票，总仓位也压低、多给观望。

### Step 2 — 候选生成（选股漏斗 1–2 层 · 用 §11 卡脖子作业法）
按 doctrine §11 跑作业法（不只是路由）：
- 有赛道：定终端系统 → 拆栈 6–9 层（模板见 `stock-bottleneck-picker/references/sector-chain-templates.md`）→ "需求翻倍先断哪里"找瓶颈 → 按**四角色**出候选（executor/bottleneck/beneficiary/optionality），每个标**证据等级 ●/◐/○**。
- 无赛道：从顺风行业 + watchlist + 主题龙头组候选池（10–20 只）。
- `GET /api/search` 解析名称→ticker；`GET /api/quote/batch` 批量拉现价/估值。
- **先方向后名字**：候选必须建立在"拆完链+找到瓶颈"之上，不做无逻辑的 ticker 堆砌。

### Step 3 — 多因子打分（漏斗 3–4 层）
对候选并行拉取并按 doctrine 打分：
- `GET /api/signals/{ticker}` → 时机分（bull/bear 触发器权重 + `hit_rate_5d`）
- `GET /api/financials/{ticker}`（A 股）→ 质量分（ROE/毛利/现金流/负债）
- `GET /api/flows/{ticker}`（A 股）→ 资金面（北向/涨跌停）
- 必要时 `GET /api/perspectives/{ticker}` → 9 人委员会（慢/费 token，仅对入围前几名调用）
- `GET /api/radar/{ticker}` 可一次性拿 quote+flows+signals 综合（instant，省调用）

淘汰：护城河/财务不过关一票否决；信号明显偏空的好公司降为观望。

### Step 4 — 裁决与排序
John Cameron 作主持人综合：质量分 × 时机分 × 宏观总闸 → 给每只 doctrine §3 六档评级，按评级+conviction 排序。仓位与 conviction 正相关（doctrine §5）。

### Step 4.5 — 持仓 + 校准叠加
- 对已持有标的，评级用 增持/减持/卖出 并跑集中度检查（doctrine §8）；新标的才用 买入/强烈买入。
- 置信度引用战绩校准桶：仅 `n≥20`（reliable）桶可说成概率，否则只报计数（doctrine §9），永远带 n。

### Step 5 — 输出 + 入库
对每只标的用 doctrine §7 输出契约；末尾给**组合层建议**（总仓位上限、行业分布、现金比例）+ 合规尾注。
**入库**：对每个给出的买卖评级，调 `hiphon-pm-track` 把该 `call` append 到 `~/.hiphon-pm/calls.jsonl`（doctrine §10，append-only），并写入 `chain_role`（§11.4 四角色之一）与 `evidence`（●/◐/○）字段，供战绩按证据质量/角色分桶校准。

## Output format (Markdown)

```
# John Cameron · 今日买入清单 · <日期>

**宏观总闸**：🟢/🟡/🔴 <状态> — 建议总仓位上限 <X%>，风格 <进攻/均衡/防御>
理由：<流动性/政策/指数/北向 一句话>

---
## 1. 【强烈买入】<名称> <ticker> · <现价> (<涨跌幅>) · PE <x>
- **链位置**：<栈第几层> · 角色 <执行者/真瓶颈/二阶受益/早期期权> · 证据 <●/◐/○>
- **一句话逻辑**：<宏观→赛道→卡脖子→护城河→时机>
- **建议仓位**：<x%>（试探 <y%> → 目标 <x%>）（Crux：仓位随执行确定性，§5/§11.1）
- **进场区间**：<区间>
- **止损位**：<价> (<-n%>)
- **主要风险**：<...>

## 2. 【买入】...
（按评级+conviction 排序）

---
**组合建议**：总仓位 <X%>，<行业分布>，现金 <Y%>。
> ⚠️ 以上为基于公开数据的个人决策辅助，不构成对任何第三方的投资建议。市场有风险，决策需自负。
```

可选：用户要 JSON 时，输出同结构的机器可读 payload（供后续 Web 消费）。

## Guardrails (from doctrine §6)

- 每只标的必带 评级 + 理由 + 仓位% + 止损 + 风险。
- 数字必须来自真实 API；缺数据写"暂无数据"，绝不编造。
- A 股专属数据（财报/资金流）对港美标注"暂无数据"，不臆测。
- 逆风宏观下宁可少推甚至空仓，不为凑数硬推。
- 永远附合规尾注。
