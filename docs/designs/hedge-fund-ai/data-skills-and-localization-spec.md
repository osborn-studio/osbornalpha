# Copy / Don't-Copy / Localize + Data-Skill Layer

> Companion annex to `../hedge-fund-ai-prd.md`. Produced by specialist subagent (data-integration + strategy), 2026-06-03.
> Posture: borrow the **shape** (workflow runtime), replace the **substance** (US/crypto/SaaS → A股/可转债/Wind·Choice·券商/私募合规).
> Legal note: compliance lines are commonsense engineering boundaries, **not legal advice**; anchor to《私募证券投资基金运作指引》(2024-08), 法务 confirms thresholds.

---

## Part 1 — What to Copy (abstracted patterns, not an Alva recap)

Single transferable idea: **investment AI's output is a living runtime object, not a document.** Each pattern → principle → Hiphon PM mapping → reuse-vs-net-new verdict.

1. **Playbook = unit of durable value.** *Pattern:* separate cheap regenerable *reasoning* from durable versioned *specification*; the agent is interchangeable, the playbook is the asset (it accrues calibration history against a stable key). *Maps to:* generalize `doctrine.md` (single implicit house playbook) into N declarative YAML files. *Verdict:* doctrine concept reuse; multi-playbook schema+loader **net-new**.
2. **Skill-first capability surface (deepest copy).** *Pattern:* narrow composable capabilities each with typed I/O, callable by any front-end/orchestrator, testable in isolation; the skill is the deterministic boundary (math/data in scripts, judgment in model). *Maps to:* already skill-shaped (pick/deepdive/track/bottleneck); add a data/portfolio/risk tier beneath. *Verdict:* architecture reuse; data tier **net-new**.
3. **Backtest as discipline not a number.** *Pattern:* credible only with explicit cost/slippage/liquidity, OOS, sample-size honesty (report n), fixed benchmark; output a bundle not a CAGR headline. *Maps to:* reuse discipline (deterministic, 前复权, append-only, n≥20). *Verdict:* discipline reuse; **portfolio weekly backtester = net-new engine** (biggest build — score-calls.sh/backtest.ts are single-name forward scorers).
4. **Alert = state-change detector.** *Pattern:* not refresh — detect change in a named condition (signal flip, thesis invalidation, risk breach, catalyst, abnormal vol) and alert only on the delta; quiet by default, loud on change, each alert references its playbook condition. *Maps to:* reuse catalyst-watch plumbing + OSStack board. *Verdict:* plumbing reuse; risk radar + delta engine **net-new**.
5. **Human approval = hard gate not a setting.** *Pattern:* any real-world action passes an explicit logged stateful transition (PENDING→APPROVED/AMENDED/REJECTED); agent drafts, human commits; decision journaled as memory. *Maps to:* OSStack `ApprovalRow` (pending/accepted/rejected/timed_out). *Caveat:* no native AMENDED → reject+new. *Verdict:* table reuse; AMENDED + pre-trade checklist **thin net-new**.
6. **Review loop / strategy memory.** *Pattern:* every executed decision → post-trade attribution → append-only memory that recalibrates next run; answer "what changed + were we right last time"; calibration buckets need stable keys or they fragment. *Maps to:* reuse calls.jsonl append-only property + scorecard machinery. *But:* single-name record can't hold a basket → add `rebalances.jsonl`; basket hit = excess vs benchmark (single-name scorer can't adjudicate); 权益 facets (by_evidence/chain_role) **meaningless for 可转债** → add by_factor/by_playbook. *Verdict:* property+machinery reuse; rebalances.jsonl + basket attribution + new facets **net-new**.

**Quantamental meta-pattern** binding all six: 叙事→假设→可量化代理→信号→历史检验→风控→人决策. doctrine.md already this skeleton — copy nothing new, just enforce per playbook.

---

## Part 2 — What NOT to Copy

| Don't copy | Why (China private-fund) |
|---|---|
| **Community marketplace / public playbooks / remix & share** | 私募非公开募集, 不得公开宣传/荐股. A shared playbook is both a **strategy leak** (the spec IS the edge) and a **compliance breach** (public recommendation). Default **private-first**: isolated by 产品/账户/策略, audited, zero accidental sharing. Invert Alva's growth engine. |
| **One-click / live execution** | A股/转债 live orders must pass 风控+合规+human. A 券商 trading-write API = operational risk + regulatory exposure (异常交易/老鼠仓 surveillance). Terminal output is a **draft order list**; human keys it into PB. Read-only position import OK; write-path forbidden. |
| **US/crypto/on-chain/alt-data assumptions** | Alva's spine = global equities+crypto+on-chain+Western alt-data. **Cut crypto/on-chain entirely.** Edge is the opposite: A股 microstructure (T+1,涨跌停), 可转债 (T+0, ±20% first-day, 强赎/下修/回售), 北向, 中文公告/财联社, Wind/Choice/券商. Alt-data here = 巨潮公告+财联社+事件, not Western 社媒 sentiment. |
| **Prosumer/agent-builder pricing + community discovery** | Single-fund internal tool, not SaaS. No tiered pricing/discovery/funnel — would conflict with private-first and create 宣传 surface 私募 cannot have. |
| **Backtest-as-proof framing** | Reference, never 承诺. Hard-enforce OOS + sample-size honesty (n≥20). Using backtested numbers in 收益宣称 to investors is a violation. Every output footnoted; external = PM+合规 double sign-off. |

---

## Part 3 — China Localization (global assumption → China reality)

| Dimension | Global (Alva) | → China substitution |
|---|---|---|
| PM context | Open prosumer/RIA, public playbooks | **私募证券基金 PM**: 非公开, 合格投资者 (门槛+人数 契约型≤200/合伙·有限责任≤50, 法务确认), 双录+冷静期/回访, 定期净值+季度/年度披露. Internal weekly memo ≠ regulated disclosure |
| 可转债 | US-convert style (delta+credit, deep liq) | **双低** (price<~115 + 溢价率<~25% joint rank), **纯债价值/YTM** floor (positive YTM=保底, *void on default/退市* — post-2021 defaults real), **条款博弈** (下修促转股但稀释; 强赎 正股≥转股价×130% 15/30日→trim/exit; 回售 正股<×70% ~30日→support), 评级+余额+换手 filters, T+0 |
| Rebalance cadence | Daily/intraday | **周频** (generate 周五盘后, execute 下周一开盘 by human). Cost = 佣金+冲击(按成交额分档)+turnover constraint. ADV≥~20mm; exclude 停牌/临强赎/到期. Encode T+1(A股)/T+0(转债) |
| Risk parity | Equities/bonds/crypto, global vol target | Buckets A股(小盘/红利)·可转债·黄金·(opt 国债期货/商品). Vol target **8%** (6–12%). Cov EWMA **λ=0.94, ≥120d**, weekly. **CB into cov: v1 single asset basket-NAV vol; v2 factor split (equity-delta+duration)**. Bucket 5%/50%; leverage 1.0. Rebalance only when RC drift>5pp (or weight>3%) |
| Data vendors | Bloomberg/FactSet + crypto + Western alt-data | **Wind(WindPy)→东方财富 Choice(ChoiceData)→Tushare/聚源→eastmoney cascade**. 可转债: **集思录/宁稳网/Wind 转债库**. 宏观: Wind EDB/同花顺 iFinD. 持仓/PnL: **券商 PB (恒生 O32/O45, 华锐)** read-only. 新闻/催化: 财联社/巨潮 cninfo. Wind/Choice need license+terminal; Tushare/eastmoney free fallback |
| Compliance | Light-touch, marketing allowed | Hard: 不承诺收益/保本, 不公开宣传/荐股, 合格投资者+适当性+双录, 从业人员申报+公平交易+异常交易/反老鼠仓, 定期披露. AI never holds trading-write. Every output footnoted; external = PM+合规 double sign-off |

---

## Part 4 — Data-Skill Layer (skill-first)

Tier *beneath* the research tier (pick/deepdive/track/bottleneck). Research skills reuse the Stock Monitor API; these supply the portfolio/data/risk substance the API lacks.

| Skill | Responsibility | Source | License/access reality | Status |
|---|---|---|---|---|
| `wind-data-skill` | A股/转债 行情·财报·估值·EDB宏观 | Wind WindPy | Paid终端+per-seat license; WindPy bound to a logged-in Wind terminal; quotas; no headless cloud w/o enterprise deal | net-new (needs license) |
| `choice-data-skill` | 行情·财报·公告·因子 (Wind fallback) | 东方财富 Choice (ChoiceData) | Paid, terminal-bound SDK; cheaper than Wind, common 私募 2nd source | net-new (needs license) |
| `convertible-bond-skill` | 转债全池+条款(强赎/下修/回售/到期)+双低/纯债价值/YTM+评级/余额/换手 | 集思录+宁稳网+Wind 转债库 | **集思录 NO official API** — web/CSV scrape (fragile, ToS-sensitive); 宁稳网 similar. **Wind 转债库 = licensed authoritative.** Clauses per募集说明书 → parse per-bond | net-new (core edge) |
| `portfolio-skill` | Holdings/weights/sector/sleeve | 券商 PB export (恒生 O32/O45, 华锐) → portfolio.json | **Read-only import only**, no PB write API; format varies by 券商/PB → per-broker adapter | extend existing |
| `transaction-skill` | Fills/cost/turnover history | PB 流水 export | Read-only CSV/Excel; reconcile vs 托管估值表; no live feed | net-new (read-only) |
| `portfolio-risk-skill` | 集中度·暴露·波动率·回撤·RP 风险贡献 | internal + 行情 | Compute-only; depends on upstream data skills | net-new |
| `weekly-rebalance-skill` | 周频再平衡 proposal + 成本/流动性约束 + drift-band | playbook + 行情 | Compute-only; emits **draft orders, never executes** | net-new |
| `backtest-skill` | **Portfolio** weekly backtester: 建仓/成本/滑点/流动性/换手 + benchmark attribution | 行情历史 | **NOT an extension of score-calls.sh/backtest.ts** (single-name forward scorers). New engine | net-new (largest build) |
| `macro-radar-skill` | 宏观/利率/流动性 叙事 + narrative→sector map | Wind EDB / 同花顺 iFinD | EDB needs Wind license; iFinD separate | net-new |
| `earnings-catalyst-skill` | 公告/财报/催化日历 + event alerts | 巨潮 cninfo + 财联社 | cninfo public (announcements); 财联社 paid/scrape (ToS-sensitive) | reuse catalyst-watch |
| `compliance-review-skill` | 对外措辞合规审阅 | internal rule library | Rule-based pre-check only; not a substitute for 法务/合规 sign-off | net-new |
| `pm-memo-skill` | 周报+投资者问答草稿 (compliance-safe) | internal | Draft-only; external send gated by approval+合规 | net-new |

**Access-reality call-outs (roadmap depends on these):**
1. **集思录/宁稳网 = no official API.** Build `convertible-bond-skill` against **Wind 转债库 as authoritative**; treat 集思录/宁稳网 as scrape-based cross-check with graceful "暂无数据" fallback. Don't let the core strategy depend on an unofficial scrape.
2. **Wind/Choice WindPy/ChoiceData are terminal-bound + license-gated** — won't run headless in cloud cron without enterprise arrangement. Phase data skills around *which licenses the fund actually holds* (PRD §11 open question).
3. **券商 PB is read-only, format-variant** — every PB (恒生 O32 vs O45 vs 华锐) needs its own import adapter; budget for it, don't assume one parser.
4. **Existing cascade covers the free floor:** Stock Monitor 4-layer cascade + Tushare 5k + eastmoney already deliver A股 行情/财报/北向/flows — reuse as fallback + dev-mode path. The genuinely net-new data surface is 可转债 + Wind/Choice premium + 券商 PB internal data.
