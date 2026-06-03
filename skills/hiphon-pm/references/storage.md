# Storage & Scoring Spec — Hiphon PM Accountability Layer

> The append-only call journal, the portfolio file, and the deterministic scoring rules.
> This is the foundation for `hiphon-pm-track`, the calibration in `doctrine.md` §9, and
> the portfolio logic in §8. Built to the constraints from the CEO-review adversarial pass:
> append-only, hit adjudicated only by code, splits/dividends handled, sample-gated calibration.

All Hiphon PM personal state lives **outside the git repo**, under `~/.hiphon-pm/`:

| File | Purpose | Writer |
|---|---|---|
| `~/.hiphon-pm/calls.jsonl` | **Append-only** journal of every buy/sell call | `hiphon-pm-track` (append), pick/agent (append) |
| `~/.hiphon-pm/portfolio.json` | Current holdings | user / agent (edit) |
| `~/.hiphon-pm/scorecard.json` | Generated track record (derived, safe to delete) | `score-calls.sh` only |

`mkdir -p ~/.hiphon-pm` on first use. Never commit these to git (personal trading data).

---

## 1. `calls.jsonl` — append-only call journal

One JSON object per line. **Never edit or delete a line.** State changes are expressed by
appending a new `event` record that references the original `call_id`. This is what makes the
track record trustworthy: the agent cannot retroactively rewrite its own history.

### 1.1 Record types

Two `kind`s share the file: `call` (a new rating) and `event` (a lifecycle transition).

**`call` record** — emitted when John Cameron makes any buy/sell-side rating:

```json
{
  "kind": "call",
  "call_id": "2026-06-03-600519SH-001",
  "ts_utc": "2026-06-03T01:30:00Z",
  "exchange_session": "A:2026-06-03",
  "ticker": "600519.SH",
  "name": "贵州茅台",
  "market": "A",
  "rating": "buy",
  "thesis": "宏观中性、北向低位吸筹、PE 历史偏低；试探仓",
  "entry_basis": "next_open",
  "entry_price_ref": 1280.86,
  "target_pct": 18.0,
  "stop_price": 1180.0,
  "stop_pct": -8.0,
  "size_pct": 8.0,
  "horizon_days": 250,
  "signal_mix": ["rsi_oversold","north_accum"],
  "source": "hiphon-pm-pick"
}
```

| field | type | notes |
|---|---|---|
| `kind` | `"call"` | |
| `call_id` | string | unique: `YYYY-MM-DD-<ticker no dot>-NNN` |
| `ts_utc` | ISO-8601 UTC | when the call was made |
| `exchange_session` | `"<MKT>:<YYYY-MM-DD>"` | the exchange-local session the entry resolves against |
| `ticker` / `name` / `market` | string | `market` ∈ `A`/`HK`/`US` |
| `rating` | enum | `strong_buy`/`buy`/`add`/`hold`/`trim`/`sell` (doctrine §3) |
| `thesis` | string | one-line logic |
| `entry_basis` | enum | `next_open` (default) or `same_close` — see §3.1 |
| `entry_price_ref` | number | indicative price at call time (reference only; scoring uses adjusted klines) |
| `target_pct` / `stop_pct` | number | from doctrine §4; `stop_price` absolute if known |
| `size_pct` | number | suggested position size (doctrine §5) |
| `horizon_days` | int | expiry horizon for `expired` close (default 250 ≈ 12mo trading) |
| `signal_mix` | string[] | signal rules behind the call (for calibration buckets) |
| `source` | string | which skill/agent emitted it |

Scale-in (试探仓 → 目标仓) = **one** `call` with the final `size_pct`; the staged entry is
narrative in `thesis`. A later 减持/卖出 on the same name is a **new** `call` with rating
`trim`/`sell` plus an `event` (see below) that closes the original `call_id`.

**`event` record** — emitted to transition a call's lifecycle:

```json
{ "kind":"event", "call_id":"2026-06-03-600519SH-001", "ts_utc":"2026-08-01T07:00:00Z",
  "event":"manual_close", "note":"thesis broken, cutting", "ref_call_id":"2026-08-01-600519SH-007" }
```

`event` ∈ `manual_close` (user/agent closes early; optional `ref_call_id` to the sell call).
Automatic closes (`hit_target`/`hit_stop`/`expired`) are **not** written here — they are
adjudicated by `score-calls.sh` and recorded in `scorecard.json`, never in the journal.
This keeps the journal a pure record of *decisions*, not *outcomes*.

---

## 2. Call lifecycle (adjudicated by code, not the LLM)

```
            ┌──────────────────────────────────────────────┐
   call ──▶ │ OPEN                                          │
            │  scored daily as unrealized (MTM)            │
            └───┬───────────────┬───────────────┬──────────┘
                │ adj.low ≤ stop │ adj.close ≥   │ days since
                │ on any bar     │ entry*(1+tgt) │ entry > horizon
                ▼                ▼               ▼            ▼ manual_close event
            CLOSED:hit_stop  CLOSED:hit_target  CLOSED:expired  CLOSED:manual
```

- A call is **OPEN** until exactly one terminal condition fires. Conditions checked in order:
  `manual_close` event > `hit_stop` > `hit_target` > `expired`.
- **OPEN calls are reported as unrealized mark only** and are NOT counted in the closed-call
  hit rate. Open MTM and closed track record are separate numbers.
- Terminal state + realized return are written to `scorecard.json`, never back into `calls.jsonl`.

### 2.1 "Hit" definition — per rating (deterministic)

A *call* is not a 5-day signal. Hit is defined by rating side:

| rating | side | HIT (win) when closed... | MISS when closed... |
|---|---|---|---|
| `strong_buy`/`buy`/`add` | long | `hit_target`, or `expired`/`manual` with realized return > 0 | `hit_stop`, or `expired`/`manual` with return ≤ 0 |
| `trim`/`sell` | reduce | price **fell** after the call (avoided loss): return-from-ref < 0 at close | price rose after the call: return-from-ref > 0 |
| `hold` | n/a | not scored (no action) | not scored |

Realized return for longs = `(close_adj_at_terminal − entry_adj) / entry_adj`. The LLM never
decides hit/miss; `score-calls.sh` computes it.

---

## 3. Scoring basis (corporate-action correct)

`score-calls.sh` scores against **adjusted klines** from `GET /api/kline/{ticker}?period=D`
(eastmoney `fqt=1` 前复权 — confirmed in `src/lib/data/sources/eastmoney.ts`). Adjusted klines
make entry and current price continuous across splits/dividends, fixing the raw-close bug that
`/api/quote` would otherwise introduce. `entry_price_ref` in the journal is reference only.

### 3.1 Entry price resolution
- `entry_basis: next_open` (default): entry = adjusted **open** of the first session strictly
  after `exchange_session`. If the call was logged before that session's close, you may use
  `same_close`: entry = adjusted close of `exchange_session`.
- Times are exchange-local for session logic; `ts_utc` is the source of truth, `exchange_session`
  records the resolved trading day. A-share closes 15:00 CST; HK 16:00 HKT; US 16:00 ET.

### 3.2 Stop / target check
Walk adjusted daily bars from entry forward: if any bar's adjusted `low ≤ stop_price` → `hit_stop`
at that bar. Else if any bar's adjusted `close ≥ entry*(1+target_pct/100)` → `hit_target`. Else if
`now − entry > horizon_days` → `expired` at latest close. Else OPEN (report MTM).

---

## 4. `scorecard.json` — generated track record

```json
{
  "generated_utc": "2026-06-03T08:00:00Z",
  "closed": { "n": 22, "hits": 13, "hit_rate": 59, "avg_return_pct_long": 4.2,
              "by_rating": { "buy": {"n":15,"hit_rate":60}, "sell":{"n":7,"hit_rate":57} } },
  "open":   { "n": 4, "unrealized_avg_pct": 1.8 },
  "calibration": {
    "min_sample": 20,
    "buckets": [
      {"key":"A|rsi_oversold+north_accum","n":24,"hit_rate":0.58,"reliable":true},
      {"key":"A|momentum_up","n":6,"hit_rate":0.67,"reliable":false}
    ]
  }
}
```

- Every rate is reported **with its `n`**. `reliable` is `true` only when `n ≥ min_sample` (20).
- Calibration buckets key on `market | sorted(signal_mix)`. **Below the floor, the bucket is
  shown with `reliable:false` and must NOT be quoted as a calibrated probability** (doctrine §9).
  This is the guard against the journal becoming its own overfitting target on small n.

---

## 5. `portfolio.json` — current holdings

```json
{
  "as_of": "2026-06-03",
  "cash_pct": 45,
  "positions": [
    { "ticker": "600519.SH", "name": "贵州茅台", "market": "A",
      "cost_basis": 1305.0, "size_pct": 8.0, "sector": "白酒", "opened": "2026-05-20",
      "linked_call_id": "2026-05-20-600519SH-003" }
  ]
}
```

### 5.1 Concentration check (maps to doctrine §5)
Given a candidate buy of `size_pct` in `sector`:
- single-name: reject/trim if `existing(ticker).size_pct + new > 15%` (strong_buy ceiling 25%).
- sector: reject/trim if `sum(size_pct where sector==X) + new > 35%`.
- cash: total deployed must respect the §1 macro gate ceiling.
John Cameron states the breach explicitly and proposes the capped size instead of silently sizing.
