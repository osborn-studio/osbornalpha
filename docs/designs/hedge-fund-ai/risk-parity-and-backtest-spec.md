# Multi-Asset Risk-Parity + Weekly Portfolio Backtest/Attribution Engine

> Companion annex to `../hedge-fund-ai-prd.md`. Produced by specialist subagent (multi-asset quant), 2026-06-03.
> Makes PRD §3.4 concrete and specifies the **net-new** weekly portfolio backtest/attribution engine (PRD §6 `backtest-skill 净新增`).
> ★ Reuse vs net-new: `score-calls.sh` + `signals/backtest.ts` are a **single-ticker forward-return adjudicator** — no portfolio, weights, covariance, costs, turnover, settlement, or benchmark attribution. They **cannot be extended** into a portfolio engine. Reused only: the *discipline* (deterministic code-adjudication, 前复权 prices, append-only, n≥20 floor) + the *data plumbing* (`/api/kline?period=D` adjusted klines). Everything in Parts 1–3 is net-new.
> Footer (mandatory): 决策辅助，非投资建议；回测不代表未来；私募非公开。

---

## Part 1 — Risk-Parity Allocation (pinned numbers)

### 1.1 Asset buckets (sleeves, not names)
| Bucket | Contents | Return proxy | v1 |
|---|---|---|---|
| `eq_smallcap` | A股小盘 | 中证1000/国证2000 sleeve NAV | required |
| `eq_dividend` | A股红利 | 中证红利 sleeve NAV | required |
| `cb` | 可转债 sleeve | **basket NAV daily return** (§1.7) | required |
| `gold` | 黄金 | SHFE AU主连/黄金ETF(518880) | required |
| `tbond_fut` | 国债期货 | T主连(10Y) | optional, off by default |
| `commodity` | 商品 | 商品综合 sleeve | optional, off by default |

Default active: {eq_smallcap, eq_dividend, cb, gold}; {tbond_fut, commodity} disabled until PRD §11 resolved.

### 1.2 Risk budgeting — Equal Risk Contribution (ERC)
For weights w, annualized covariance Σ: σ_p=√(wᵀΣw); MRC_i=(Σw)_i/σ_p; RC_i=w_i·MRC_i; Σ RC_i=σ_p. **ERC: RC_i = σ_p/n ∀i** (or per risk-budget b_i, default 1/n).

### 1.3 Vol targeting
- **Default annualized vol target σ\*=8%**, configurable [6%,12%] (reject outside band).
- Solve unit-budget ERC direction w̃, then scale k=σ\*/σ_p(w̃), w_scaled=k·w̃.
- **Leverage** L=Σw_i, default cap L_max=1.0. If k·Σw̃_i > L_max → vol-constrained: cap leverage, accept ex-ante vol below target (record `vol_constrained:true`). Private fund may raise L_max via `risk_controls.max_leverage`, never silently.
- Annualize: vol ×√252; covariance ×252.

### 1.4 Covariance estimator (pinned)
- **EWMA λ=0.94** (RiskMetrics; deliberately responsive), re-estimated **weekly** on each rebalance date.
- **Window ≥120 trading days** of daily returns (≥120 valid obs/bucket or bench the bucket with a data-gap alert).
- Recursion: Σ_t = λΣ_{t-1} + (1-λ)r_t r_tᵀ; seed Σ_0 = sample cov of first 120d; annualize Σ̂=252·Σ_T.
- Numerical hygiene: symmetrize Σ̂←(Σ̂+Σ̂ᵀ)/2; ridge Σ̂←Σ̂+εI, ε=1e-8·tr(Σ̂)/n (positive-definite).
- Calendar: A股+转债 share SSE/SZSE calendar; gold/futures主连 own calendar. Inner-join common days; cross-calendar holes >5% → ffill ≤1d else drop.

### 1.5 Weight constraints
Per-bucket **min 5% / max 50%** on unit-budget weights before scaling, re-checked after. Sum-to-one on direction (long-only buckets v1, w̃_i≥0). Enforced **inside** the optimizer (projected), not clipped post-hoc.

### 1.6 Rebalance trigger (drift band — saves cost)
Rebalance only if **max_i |RC_i/σ_p − b_i| > 5pp** OR **max_i |w_i − w_i^target| > 3%**; else hold (`no_trade, within_band`). Also: if realized 20d ex-post vol breaches [0.75σ\*, 1.5σ\*], force re-estimate + rebalance.

### 1.7 CB sleeve → covariance (CRITICAL)
**v1 (ship): single asset via basket NAV vol.** CB sleeve = one bucket; r^cb_t = NAV^cb_t/NAV^cb_{t-1}−1 (holding-weighted, adjusted close). Enters Σ̂ as one row/col. Limitation to STATE in output: CB↔小盘 correlation is regime-dependent (high when 股性强, low near bond floor); EWMA captures adaptively but with lag — do not claim stationarity.
**v2: factor-decomposed.** r^cb_t = δ·r^eq_t − D·Δy_t + α_t (δ=sleeve equity delta Σ w_j δ_j, D=modified duration, Δy=govvie yield change, α=credit+idio). CB loads onto equity factor (via δ) + rates/duration factor (via D) + idio variance. Full cov in factor space: Σ̂=B F Bᵀ + diag(idio). Prevents double-counting equity risk between eq_smallcap and CB's 股性 portion; surfaces duration v1 hides. Gated behind per-bond delta/duration from convertible-bond-skill.

### 1.8 ERC algorithm (cyclical coordinate descent, deterministic)
Minimize over x≥0: f(x)=½xᵀΣx − Σ b_i ln x_i. Minimizer has Σx∝b/x ⇒ RC_i∝b_i. Then w̃=x/Σx, apply §1.3 scalar.
```
solve_erc(Sigma, b, w_min, w_max, tol=1e-8, max_iter=1000):
  x = 1/sqrt(diag(Sigma)); x = x/sum(x)        # inverse-vol warm start
  for iter in 1..max_iter:
    x_old = x
    for i in 1..n:                              # cyclic coordinate update
      a = Sigma[i,i]; c = sum_{j!=i} Sigma[i,j]*x[j]
      x[i] = (-c + sqrt(c*c + 4*a*b[i])) / (2*a)   # positive root of a*x^2+c*x-b=0
    x = clip_to_simplex_box(x, w_min, w_max)
    if max_abs(x-x_old) < tol: break
  w_unit = x/sum(x); sigma_p = sqrt(w_unit'·Sigma·w_unit)
  k = clip(vol_target/sigma_p, max = leverage_cap/sum(w_unit))
  return {w_unit, w_scaled=k*w_unit, sigma_p, leverage=sum(k*w_unit),
          risk_contrib=(w_unit*(Sigma@w_unit))/sigma_p, vol_constrained=(k*sum(w_unit)>=leverage_cap)}
```
Converges in tens of iters; O(n²)/sweep, trivial for n≤6; deterministic (no random restarts → reproducible). Box-constrained: ln barrier keeps x_i>0; projection enforces 5%/50% (if cap binds, RC not exactly equal — report residual RC drift). **Within-bucket name weights come from the playbook signal layer, NOT this optimizer** (optimizer allocates *across* buckets; playbook allocates *within*) — this separation lets CB factor scores attribute cleanly (Part 3).

---

## Part 2 — Weekly Portfolio Backtest Engine (NET-NEW)

### 2.1 Universe snapshotting (survivorship-bias avoidance)
Point-in-time universe: for each rebalance date t, build eligible universe from data **as it existed at t** (never today's surviving list). Persist `universe_snapshot[t]`. **Include the dead** — 退市股, 到期/强赎/违约 转债 must be in the snapshot up to their last trading day (dropping them is the #1 CB-backtest error; post-2021 defaults are real). Terminal events: CB 到期 redeem at 面值+末期息; CB 强赎 value at min(conversion value, call price) on redemption date; CB 违约/退市 mark to last/recovery (do NOT drop — loss must hit the curve); equity 退市 liquidate at exchange rules. Store: `~/.hiphon-pm/universe/<playbook_id>/<YYYY-MM-DD>.json` (append-only by date).

### 2.2 Weekly rebalance loop
```
for t in rebalance_dates (Fri close, weekly):
  snapshot = load_or_build_universe_snapshot(t)         # point-in-time
  signals  = playbook.score(snapshot, t)                # within-bucket name ranks
  cov      = ewma_cov(returns≤t, λ=0.94, window≥120)
  bucket_w = solve_erc(cov, b, 0.05, 0.50)              # -> w_scaled
  target   = expand(bucket_w, signals)                  # bucket% -> per-name target%
  drift    = compare(target, current); if within band: no_trade; continue
  trades   = target - current  (subject to liquidity caps §2.4)
  costs    = cost_model(trades, snapshot.ADV)           # §2.3
  execute  = apply at t+lag prices per settlement        # §2.5 (Fri close → Mon open, same lag as production)
  book     = update_nav(holdings, costs); record turnover (§2.6)
  attribute= weekly_attribution(prev_book, book, benchmark)   # Part 3
  journal  = append rebalances.jsonl row
```

### 2.3 Transaction-cost model
cost_name = c_comm + s_base + μ(ADV bucket)·√(trade notional / ADV).
Defaults: c_comm=**15bps** (per side; 佣金+过户+股票卖出印花税), s_base=**10bps**. Impact μ by 20d-ADV bucket: High(≥100mm)→5bps, Medium(20–100mm)→15bps, Low(<20mm)→**excluded** (min_adv floor). E.g. mid-liquidity at 10% participation: 15·√0.10≈4.7bps → ~29.7bps/side. The √-participation term self-limits size (ties to §2.4).

### 2.4 Liquidity constraints
Hard floor: drop 20d ADV<20mm. **Participation cap: ≤10% of name's 20d ADV per rebalance**; if target Δ exceeds, **stage across weeks** (book partial, carry residual, `liquidity_capped:true`). Position-vs-float cap: ≤5% of bond 余额/equity float (prevents un-exitable positions, esp small-余额 转债).

### 2.5 Settlement (T+1 equity / T+0 CB)
A股 T+1: shares bought at t not sellable until t+1 (sell-block flag). CB T+0: round-trip intraday, no block — but strategy weekly, so T+0 only matters for execution realism/emergency exits. 国债期货/商品: T+0 margin + daily 结算价 MTM (margin flows through leverage cap). Explicit cash ledger: each fill debits/credits net of cost; insufficient settled cash blocks a buy (no spending money it doesn't have).

### 2.6 Turnover accounting
Two-sided per rebalance: TO_t = ½ Σ |w_post − w_pre-drift| (one-way), also annualized ×52. Only *traded* delta counts (passive drift doesn't). Cost drag = Σ cost_name·|trade notional|/NAV. Surface turnover + implied cost-drag in every weekly row + summary.

### 2.7 Outputs
CAGR (net), Sharpe (net AND gross, vs 1y 国债 RF), max_drawdown (+ recovery duration), **hit_rate = basket-level weekly beats benchmark** (NOT single-name stop/target — PRD §4.1 redefines), turnover (weekly+annualized), exposure_breakdown (bucket weights+RC+leverage time series), **benchmark-relative** (excess, tracking error, information ratio, up/down capture vs 中证转债 + blended multi-asset benchmark e.g. 40% 中证转债/30% 中证1000/20% 中证红利/10% 黄金), cost_drag (gross−net). Deterministic code, written to `~/.hiphon-pm/backtests/<playbook>/<run>.json`, never LLM-graded.

---

## Part 3 — Attribution

### 3.1 Weekly attribution (three lenses, additive)
**By asset bucket** (Brinson vs blended benchmark): R−R^B = Σ(w_i−w_i^B)r_i^B [allocation] + Σ w_i^B(r_i−r_i^B) [selection] + Σ(w_i−w_i^B)(r_i−r_i^B) [interaction].
**By CB factor** (double_low/ytm/liquidity): regress sleeve cross-sectional weekly returns on standardized factor scores at t−1: r^cb_{j,t}=Σ β_{f,t} z_{f,j,t-1}+ε. β=weekly factor contribution. Answers "did double-low pay, or was it carry/YTM?"
**By name**: w_{j,t}·r_{j,t}, top/bottom contributors, cost netted per name.
**Reconciliation (hard req):** three lenses each sum to the same net return (within rounding) or the run is flagged invalid (deterministic-adjudication discipline).

### 3.2 Feedback into calibration + journal
New calibration cuts (extend the scorer, NOT the equity cuts — chain_role/by_evidence meaningless for CB): `by_factor` (hit-rate/mean factor-return of double_low/ytm/liquidity, n≥20-week gated), `by_playbook` (per-playbook net excess/Sharpe/hit, n≥20-week gated). Extend `scorecard.json` with new `calibration.by_factor`/`by_playbook` blocks (don't overload per-call buckets). Journal: weekly `rebalance` row + `attribution` row (decomposition + reconciliation hash, references rebalance_id), append-only. **Closed loop:** next week reads calibrated by_factor; a factor below benchmark after cost (n≥20) gets down-weighted in `signal_logic.ranking` — but only the human PM approves the change (PRD §8: AI proposes, PM disposes).

---

## Part 4 — Overfitting guards
1. **Walk-forward / OOS, no peeking.** Cov + factor weights at week t use only data ≤t (physically enforced by point-in-time snapshot). Rolling train/test folds (3y→1y OOS, step 1y); report per-OOS-fold. Hold out last 12 months untouched before any playbook goes active.
2. **Report n everywhere** (reuse MIN_SAMPLE=20). Every calibrated number carries n + reliable flag; below floor not quoted as probability (60% over 6 weeks is noise — say so). Prefer pinned defaults (λ=0.94, 8%, 5%/50%, 15+10bps) over fitted; justify each free parameter against OOS Sharpe.
3. **Cost realism (the common lie).** Always gross AND net; gap = cost_drag. Liquidity caps + √-participation auto-penalize high turnover (can't backtest into a 1000%-turnover book). Settlement + Fri-close→Mon-open lag prevent look-ahead. Survivorship: dead 转债/股 stay in the curve.
4. **Backtest ≠ future (state on every report).** Regime dependence (CB↔equity corr non-stationary); capacity (impact grows with AUM); structural breaks (post-2021 CB defaults changed the bond-floor assumption — pre-2021 over-credits "下有保底"). Mandatory footer; backtests are decision support, never a 收益宣称 to investors (PRD §3.5).

---

### Build sequencing
1. Net-new `backtest-skill`: snapshotter (§2.1) → cost/liquidity/settlement (§2.3–2.5) → weekly loop (§2.2) → outputs (§2.7). Reuse only adjusted-kline source.
2. Net-new ERC optimizer (§1.8) + EWMA cov (§1.4); CB v1 single-asset basket NAV; defer factor decomposition.
3. Net-new attribution (Part 3) + extend scorecard.json with by_factor/by_playbook (don't touch equity by_evidence/by_chain_role).
4. Wire rebalances.jsonl + attribution rows into journal + PRD §8 approval gate.
