# Hedge Fund AI — Playbook Runtime + Schema (Deep Buildable Spec)

> Companion annex to `../hedge-fund-ai-prd.md`. Produced by specialist subagent (playbook/runtime architect), 2026-06-03.
> Scope: the **Playbook runtime + schema** subsystem — the "heartbeat". Connects honestly to the existing Hiphon PM journal (`~/.hiphon-pm/calls.jsonl`, `score-calls.sh`, `scorecard.json`).
> Guardrail (inherited): decision support only. AI drafts orders; the human PM executes. Hits adjudicated by deterministic code, never the LLM.
> Compliance numbers marked `# LEGAL` must be confirmed by the fund's 法务/合规.

---

## 0. Layout on disk

State lives **outside git**, alongside existing Hiphon PM state. Playbook definitions live **in repo** (versioned, reviewed).

```
stock-monitor/                                  # repo (versioned)
  playbooks/
    cb-weekly-doublelow.yaml                     # one file per playbook (§1)
    equity-style-rotation.yaml
    gold-sleeve.yaml
    risk-parity-multi-asset.yaml
    _schema/playbook.schema.json                 # JSON Schema for validation (§1.9)
  skills/hiphon-pm/scripts/
    score-calls.sh                               # EXISTING — single-name scorer (reused, not changed)
    score-baskets.sh                             # NET-NEW — basket/benchmark-relative scorer (§2.4)
    pb-run.sh                                     # NET-NEW — runtime entrypoint (§3, §4)
    pb-validate.sh                               # NET-NEW — schema + invariant validator (§3)

~/.hiphon-pm/                                    # personal state (NEVER committed)
  calls.jsonl              # EXISTING append-only single-name journal (storage.md §1)
  portfolio.json          # EXISTING current holdings (storage.md §5)
  scorecard.json          # EXISTING single-name track record (storage.md §4)
  rebalances.jsonl        # NET-NEW append-only basket journal (§2.1)
  basket_scorecard.json   # NET-NEW basket-level, benchmark-relative track record (§2.4)
  runtime/
    state.json            # runtime state machine (§3.3, §4.5)
    runs/<run_id>/         # one dir per weekly run
      decision_pack.md     # human-readable pack (§4.4)
      decision_pack.json   # structured pack (§4.4)
      data_snapshot/       # frozen inputs for reproducibility (§3.2)
      audit.log            # append-only audit trail for this run (§3.2)
    audit.jsonl            # GLOBAL append-only audit log across all runs (§3.2)
    alerts.jsonl           # append-only live-monitoring alerts (§1, live_monitoring)
```

Discipline (mirrors storage.md exactly): **playbook YAML is declarative + versioned in git; outcomes/decisions/audits are append-only JSONL in `~/.hiphon-pm/`; derived scorecards are regenerable.**

---

## 1. Core Playbook schema

One YAML per strategy at `playbooks/<id>.yaml`. Multi-playbook via a discriminated `universe.asset_class` + an explicit `strategy_type`.

### 1.0 Improvements over PRD v1's schema

| Area | PRD v1 | This spec (v2) |
|---|---|---|
| Versioning | `version: 1` | semver + `schema_version` + `lineage` + `content_hash` (audit traceability) |
| Strategy typing | implicit per-file | explicit `strategy_type` enum drives required blocks (validator §1.9) |
| Signal logic | flat factor list | `factors[]` with winsorize/zscore/direction/weight + `combine` + `neutralize` + `tie_break` |
| Risk controls | flat caps | `hard` (block) vs `soft` (warn) + per-asset-class extensions |
| Execution | `order_type: draft_only` | full `execution_rules`: settlement calendar, drift-band, lot rounding, draft_only invariant |
| Data deps | name list | each typed with `skill`, `freshness_sla`, `staleness_action` (block/warn/degrade) |
| Review/memory | path string | binds to `rebalances.jsonl` + `score-baskets.sh` cuts (by_factor/by_playbook) |
| Approval | enum list | references OSStack `ApprovalRow`; `amend` = reject+new (§4.5) |

### 1.1 Full schema (annotated) — convertible-bond instance

```yaml
schema_version: "2.0"
playbook:
  id: cb-weekly-doublelow
  name: 可转债双低周频池
  owner: pm_miller
  strategy_type: convertible_bond     # convertible_bond | equity | gold | risk_parity
  status: draft                       # draft | active | paused | retired
  version: "1.3.0"
  lineage: {parent_id: null, created: 2026-06-03, last_modified: 2026-06-03}
  content_hash: null                  # pb-validate.sh writes sha256 of canonical YAML
  compliance:
    private: true
    disclaimers: [决策辅助非投资建议, 回测不代表未来, 私募不得公开宣传]
    legal_review_ref: null            # ticket once 法务/合规 signs off thresholds

  universe:
    asset_class: [convertible_bond]
    market: [CN]
    source_universe: jisilu_all_cb    # named universe convertible-bond-skill returns
    filters:
      min_adv_cny: 20_000_000
      max_price: 130
      exclude: [near_forced_redemption, suspended, near_maturity_30d, rating_below_AA-, delisting_risk, credit_event]  # # LEGAL/credit policy

  thesis:
    summary: 风险偏好回暖时，中等溢价、流动性好的双低转债跑赢。
    hypothesis: [双低组合在震荡/温和上行市有正期望, 债底在无违约假设下提供下行保护]
    invalidation:                     # each a MONITORABLE predicate (drives alerts)
      - {id: credit_break, rule: "any holding credit_event OR delisting_risk == true"}
      - {id: spread_blowout, rule: "cn_credit_spread_5d_change_bps > 40"}
      - {id: equity_breakdown, rule: "csi_convertible_index_20d_return < -0.08 AND underlying_breadth_below_ma < 0.3"}
      - {id: liquidity_collapse, rule: "median_holding_adv_cny < 10_000_000"}

  data_dependencies:
    - {key: cb_universe, skill: convertible-bond-skill, fields: [cb_price, premium_rate, conversion_value, bond_floor, ytm, volume, rating, outstanding, clauses], freshness_sla: 1d, staleness_action: block}
    - {key: portfolio, skill: portfolio-skill, fields: [positions, weights, sector, cost_basis], freshness_sla: 1d, staleness_action: block}
    - {key: transactions, skill: transaction-skill, fields: [fills, cost, turnover], freshness_sla: 3d, staleness_action: warn}
    - {key: catalysts, skill: earnings-catalyst-skill, fields: [announcements, forced_redemption_notices], freshness_sla: 1d, staleness_action: warn}
    - {key: macro, skill: macro-radar-skill, fields: [cn_credit_spread, rate_level, liquidity_regime], freshness_sla: 2d, staleness_action: degrade}

  signal_logic:
    factors:
      - {name: double_low, def: "0.5*pct_rank(price, asc) + 0.5*pct_rank(premium_rate, asc)", transform: {winsorize: [0.01, 0.99]}, direction: lower_is_better, weight: 0.55, freq: weekly}
      - {name: ytm_floor, def: "ytm", direction: higher_is_better, weight: 0.25, freq: weekly}
      - {name: liquidity, def: "pct_rank(adv_cny_20d)", direction: higher_is_better, weight: 0.20, freq: weekly}
    combine: weighted_zscore
    neutralize: [rating_bucket]
    tie_break: [adv_cny_20d, ytm]
    ranking: composite_ascending
    rebalance_frequency: weekly
    position_count: {min: 20, max: 30}

  risk_controls:
    hard: {max_position_weight: 0.06, max_issuer_weight: 0.06, max_sector_exposure: 0.30, max_leverage: 1.0, liquidity_constraint_adv_cny: 20_000_000}
    soft: {max_drawdown_alert: 0.10, turnover_warn: 0.35}
    asset_class_specific:
      forced_redemption_rule: clause_rules.forced_redemption
      credit_floor_caveat: 债底仅在无违约假设下有效；信用事件/退市使纯债价值失效

  clause_rules:                        # per-bond, parsed from prospectus
    forced_redemption: {trigger: "underlying >= conversion_price * 1.30 for 15 of 30 trading days", action: trim_or_exit_when_within: 5d}
    put_protection: {trigger: "underlying < conversion_price * 0.70 for ~30 trading days", effect: downside_support}
    maturity_redemption: {basis: "face + final_coupon (~106-110); YTM benchmark; void once forced-redemption triggers"}
    downward_revision: {effect: positive_catalyst_but_dilutive}

  backtest:
    start: 2018-01-01
    end: rolling
    benchmark: "000832.CSI"            # 中证转债指数
    assumptions: {transaction_cost_bps: 15, slippage_bps: 10, liquidity_filter_adv_cny: 20_000_000, rebalance_at: weekly_close}
    outputs: [CAGR, sharpe, max_drawdown, hit_rate_vs_bench, turnover, exposure_breakdown]
    discipline: "out-of-sample + forward calibration; report n; flag overfitting"

  execution_rules:
    settlement: CB_T0                  # CB T+0; equities CN_T1
    generate_at: "Fri 16:30 CST"
    execute_at: "next Mon open, manual"
    order_type: draft_only             # ★ INVARIANT
    drift_band: {weight_drift_abs: 0.03}
    lot_rounding: {cb_lot: 10}
    no_broker_write: true              # ★ no trade-write credential, ever

  live_monitoring:
    refresh: daily
    alert_conditions: [signal_change, thesis_break, risk_limit_breach, forced_redemption_near, abnormal_price_volume, credit_event]
    alert_sink: ~/.hiphon-pm/runtime/alerts.jsonl
    alert_dedup_window: 1d

  human_approval:
    required_before: [draft_order_to_live, risk_limit_change, strategy_publication, investor_memo_send, playbook_activation]
    approver: pm_miller
    gate: "decision pack -> PENDING_APPROVAL -> PM per-line confirm -> APPROVED"
    backend: osstack_approval_row

  review_loop:
    weekly_review: required
    post_trade_attribution: required
    memory:
      single_name_journal: ~/.hiphon-pm/calls.jsonl
      basket_journal: ~/.hiphon-pm/rebalances.jsonl        # NET-NEW (§2.1)
      single_name_scorecard: ~/.hiphon-pm/scorecard.json
      basket_scorecard: ~/.hiphon-pm/basket_scorecard.json # NET-NEW (§2.4)
    calibration:
      reuse: [append_only_discipline, min_sample_floor_20]
      extend: {by_factor: [double_low, ytm_floor, liquidity], by_playbook: [cb-weekly-doublelow]}
      not_applicable: [by_chain_role, by_evidence]          # equity-only; meaningless for CB basket
```

### 1.2–1.4 Other instances (deltas)
- **equity-style-rotation** (`strategy_type: equity`): factors momentum_3m/north_flow/value_quality, `neutralize: [sw_sector]`, `settlement: CN_T1`, hard caps per doctrine §5 (max_position 0.15, max_sector 0.35). Per-name equity legs DO use existing by_evidence/by_chain_role cuts.
- **gold-sleeve** (`strategy_type: gold`): factors real_rate_inverse/trend, thin sleeve (1–3 instruments, 黄金ETF 518880 etc.), `settlement: CN_T1`.
- **risk-parity-multi-asset** (`strategy_type: risk_parity`): does NOT pick names — allocates risk budget across child sleeve playbooks via `universe.composition`. `signal_logic.method: ewma_risk_parity`, covariance EWMA λ=0.94 window≥120d, `cb_sleeve_in_cov: basket_nav_vol` (v1), `vol_target_annual: 0.08`, bucket weight 5%/50%, drift trigger RC>5pp OR weight>3%. See risk-parity annex.

### 1.9 Validation invariants (`pb-validate.sh`)
1. `id == filename stem`, unique. 2. strategy_type-conditional requirements (CB⇒clause_rules; risk_parity⇒composition refs existing ids; equity/gold⇒factors non-empty). 3. **`order_type==draft_only` and `no_broker_write != false` everywhere — fail build otherwise (hard safety invariant).** 4. every invalidation/alert rule resolves to a known predicate. 5. factor weights sum ≈ 1.0. 6. each skill registered; staleness_action ∈ {block,warn,degrade}. 7. write `content_hash` (sha256 canonical YAML) into run audit.

---

## 2. Journal/memory — closing the single-name vs basket gap

`calls.jsonl` + `score-calls.sh` are single-name, per-rating, absolute-return. A weekly rebalance is a basket of 20–30 legs with target weights measured **relative to a benchmark**. We **add** a basket layer that *references* the per-name layer.

### 2.1 `rebalances.jsonl` (NET-NEW, append-only)
Two kinds: `rebalance` (decision) and `rebalance_event` (lifecycle). Outcomes never written here — adjudicated by `score-baskets.sh` into `basket_scorecard.json`.

```json
{ "kind":"rebalance", "rebalance_id":"cb-weekly-doublelow-2026-06-05", "ts_utc":"2026-06-05T08:30:00Z",
  "as_of":"2026-06-05", "exchange_session":"A:2026-06-05", "playbook_id":"cb-weekly-doublelow",
  "playbook_version":"1.3.0", "playbook_content_hash":"sha256:ab12…",
  "run_id":"2026-06-05T1630_cb-weekly-doublelow", "benchmark":"000832.CSI", "benchmark_basis":"single",
  "horizon_days":5, "entry_basis":"next_open", "prior_rebalance_id":"cb-weekly-doublelow-2026-05-29",
  "target_weights":[
    {"ticker":"113xxx.SH","name":"某转债","w_target":0.05,"w_prior":0.00,"action":"add",
     "factor_scores":{"double_low":0.81,"ytm_floor":0.40,"liquidity":0.72},"leg_call_id":"2026-06-05-113xxxSH-001"},
    {"ticker":"127yyy.SZ","name":"某转债","w_target":0.00,"w_prior":0.05,"action":"exit","leg_call_id":"2026-06-05-127yyySZ-002"}],
  "turnover":0.18, "approval_id":"osstack:appr_9f3c", "approval_status":"approved", "source":"pb-run.sh" }
```

`benchmark_basis`: `single` or `blended` (§2.3). `horizon_days`: basket scoring horizon (default 5 = one week). `target_weights[].leg_call_id` == `calls.jsonl` `call_id` (the bridge). `approval_id`: OSStack ApprovalRow. `rebalance_event.event` ∈ {superseded, aborted, amended}.

### 2.2 Bridge to per-name calls
Each real-action leg also appends a `call`/`trim`/`sell` to `calls.jsonl` per storage.md §1.1, with two added fields: `basket_id` (= rebalance_id) and `is_basket_leg: true`. `chain_role`/`evidence` = null for CB legs. `score-calls.sh` filters `is_basket_leg==true` out of the discretionary scorecard by default (one-line filter) so the two views never double-count. Two views of one decision: leg-level absolute P&L via `score-calls.sh`; basket benchmark-relative via `score-baskets.sh`.

### 2.3 Basket-level, benchmark-relative HIT (deterministic)
```
entry = first session strictly after exchange_session (next_open); exit = entry + H trading days (or next rebalance entry if sooner — no overlap)
basket_return = Σ_i w_target[i]*adj_return(ticker_i, entry, exit)
bench_return  = adj_return(B, entry, exit)
net_basket_return = basket_return − turnover*(transaction_cost_bps+slippage_bps)/1e4
HIT ⇔ (net_basket_return − bench_return) > 0
```
Benchmark `single` (000832.CSI) or `blended` (fixed-weight, declared in playbook, reconstituted daily; stored in the rebalance row for reproducibility). **Costs charged to the basket not the benchmark** (honest test). Adjusted prices reuse 前复权 path (storage.md §3). No-overlap windowing → excess returns chainable into a cumulative curve. The in-flight basket = unrealized excess MTM, excluded from closed hit-rate.

### 2.4 `basket_scorecard.json` + `score-baskets.sh` (NET-NEW)
Fields: `closed{n,hits,hit_rate_vs_bench,avg_net_excess_pct,cumulative_excess_pct,info_ratio_ann,avg_turnover,by_playbook}`, `open{n,unrealized_excess_pct}`, `calibration{min_sample:20, by_factor[], by_playbook[]}`. `by_factor` uses **return attribution** (bps contribution per factor), not hit-rate. Every rate carries `n`; `reliable:true` only at n≥20 (same floor as single-name).

### 2.5 Reuse vs extend (honest)
- **Reused:** append-only discipline; n≥20 floor; adjusted-price basis; code-adjudicated outcomes.
- **Net-new:** `score-baskets.sh` (NOT a patch to score-calls.sh); `by_factor`/`by_playbook` cuts; one-line `is_basket_leg` filter in score-calls.sh.
- **Not applicable:** `by_chain_role`/`by_evidence` (equity bottleneck concepts; meaningless for CB baskets — playbook declares `not_applicable`).

---

## 3. 5-layer runtime architecture

Principle: **the agent reasons; the runtime remembers/refreshes/validates/audits.** LLM non-determinism is allowed ONLY in the Agent layer; everything trust-bearing (state, refresh, validation, outcomes, audit) is deterministic runtime/skill/data.

```
L1 PM/Human Decision   thesis approval · risk override · per-line execution confirm
                       Component: OSStack approval kanban + ApprovalRow. Authority: FINAL.
   ▲ decision pack       │ APPROVED/AMENDED/REJECTED
L2 Investment Agent (REASONS, may be non-deterministic)
   research/risk-narrative/backtest-interpret/review agents (Hiphon PM skills)
   Writes prose/thesis/review. CANNOT write outcomes/hits/audit/state.
   ▲ structured signals  │ asks for data/runs
L3 Playbook Runtime (REMEMBERS·REFRESHES·VALIDATES·AUDITS) ★ trust boundary
   pb-run.sh · pb-validate.sh · state machine · cron · audit.jsonl · rebalances writer · score-baskets.sh
   ▲ typed data+freshness │ skill calls
L4 Skill/Tool   convertible-bond/wind/choice/portfolio/transaction/risk/rebalance/backtest/macro/catalyst/compliance/memo
   read-only to broker data; NO trade-write surface anywhere
   ▲                      │
L5 Data Foundation   Wind→Choice→Tushare→eastmoney cascade · CB universe · macro EDB · internal PnL (PB)
```

### 3.1 Cron scheduler
| Job | Cron (CST) | Command | Purpose |
|---|---|---|---|
| daily monitor | `0 16 * * 1-5` | `pb-run.sh monitor --all-active` | refresh, eval alert_conditions, append alerts.jsonl, push |
| weekly pack | `30 16 * * 5` | `pb-run.sh weekly --all-active` | full §4 → decision pack → PENDING_APPROVAL |
| basket scoring | `0 8 * * 1` | `score-baskets.sh && score-calls.sh` | adjudicate matured baskets/legs (Mon morning) |

`monitor` is read-only + alert-only; `weekly` stops at the gate.

### 3.2 Audit + data snapshot
Global `audit.jsonl` (append-only): every action emits a line with `playbook_content_hash` (traces a pack to exact YAML). Actions: validate/data_refresh/staleness_*/signal_run/risk_check/backtest_run/pack_built/gate_opened/approval_received/rebalance_written/score_run. Per-run `data_snapshot/` freezes inputs → reproducible (same snapshot + content_hash ⇒ same pack). Freshness: each dep compared to `freshness_sla`; `staleness_action` block(→FAILED_DATA)/warn/degrade.

### 3.3 State store
`runtime/state.json` = live state machine per playbook/run + pointer to current PENDING_APPROVAL run; survives across weeks.

### 3.4 Approval backend
Reuse OSStack `ApprovalRow` (pending/accepted/rejected/timed_out, persisted, kanban). One ApprovalRow per weekly pack; id stored in run state + rebalance row. No native AMENDED → reject original + new ApprovalRow (thin extension); record lineage.

---

## 4. Weekly decision-package workflow

`pb-run.sh weekly`. Each step emits an audit line + advances the state machine.

```
T = Fri 16:30 CST
0 VALIDATE      pb-validate.sh (§1.9). Fail-fast on draft_only/no_broker_write. Compute content_hash.  IDLE→VALIDATING
1 DATA REFRESH  each dep: call skill, check freshness_sla, apply staleness_action. Freeze data_snapshot/.  →REFRESHING (FAILED_DATA on block)
2 PLAYBOOK RUN  score factors→composite→rank; portfolio vs target drift; risk-parity covariance→budget→weights.  →RUNNING
3 BACKTEST/RISK weekly-rebalance-skill sim (cost/liq); portfolio-risk-skill checks hard(block)/soft(warn); drift_band decides if act.  →RISK_CHECKED
4 DECISION PACK assemble (§4.4); agent writes prose, runtime fills numbers; confidence only from n≥20 buckets. Write md+json.  →PACK_BUILT
5 APPROVAL GATE create ApprovalRow; →PENDING_APPROVAL. Runtime STOPS.
  --- human PM reviews ranking/drafts/risk/attribution ---
  approve→APPROVED | edit→AMENDED(reject+new,§4.5) | reject→REJECTED(reason→review_loop)
6 EXECUTION     emit FINAL draft order list (lot-rounded). PM executes MANUALLY (Mon open). Append calls+rebalance rows w/ approval_id. Exec log.  APPROVED→EXECUTED
7 ATTRIBUTION   T+1..T+H: Mon score job → score-baskets.sh (benchmark-relative HIT, by_factor) + score-calls.sh (legs, filtered).  →SCORING→SCORED
8 MEMORY/REVIEW weekly review reads scorecards+prior reviews; "what changed", "what we got wrong"; feeds next-week micro-tuning (PM-approved version bump only).  SCORED→IDLE
```

### 4.4 Decision-pack contents
`decision_pack.json` + `.md`. Sections: run_id/as_of/playbooks_run; data_provenance (freshness per dep); market_macro_summary (agent prose); portfolio_performance (last week + attribution by sleeve/factor); ranking_tables; candidates (buy/sell/hold + DRAFT orders + reason + risk_flags + clause_check); risk_warnings{hard:[] (non-empty⇒BLOCKED), soft:[]}; rebalance_recommendation (act/turnover/risk_contribution_after); confidence (ONLY n≥20 buckets, else raw count); approval_checklist (pre-trade ticks); compliance_footnote; approval{row_id,status}. **Invariants:** hard breach⇒BLOCKED, gate can't open; any probability must carry n and reliable:true else rendered as raw count (enforced in builder, not LLM).

### 4.5 State machine (formal)
```
IDLE→VALIDATING→(FAILED_VALIDATION→IDLE)→REFRESHING→(FAILED_DATA→IDLE)→RUNNING→RISK_CHECKED→PACK_BUILT→(BLOCKED→IDLE)
  →PENDING_APPROVAL→{APPROVED|AMENDED(reject old+new→RISK_CHECKED)|REJECTED→IDLE}→EXECUTED→SCORING→SCORED→IDLE
```
AMENDED is not native OSStack: reject original → re-enter RISK_CHECKED with PM edits → delta pack → new ApprovalRow; record `amended_from` lineage. **No path reaches a broker** (draft_only/no_broker_write, validator-enforced). Transitions append audit + update state.json atomically (write-temp-then-rename) → crashed runs resumable.

---

### Build notes / honest gaps
- `score-baskets.sh` is genuinely new; reuse only score-calls.sh's price-adjust helper + n≥20/append-only discipline.
- The bridge contract: `rebalance.target_weights[].leg_call_id == calls.jsonl call_id`; `is_basket_leg` prevents double-count.
- CB sleeve in risk-parity covariance is v1-approximate (basket NAV vol as single asset); v2 must factor-decompose (equity-delta + duration).
- Compliance thresholds are placeholders marked `# LEGAL`; confirm with 法务 before activation.
