# Workflow D: PM Decision Pack

Use this workflow when the user asks for a PM-style decision, position sizing, entry zone, stop, trim/add/exit decision, or investment committee memo.

## Inputs

- candidate from B/C/A
- portfolio and constraints when provided
- valuation range
- signal state
- evidence quality
- thesis confidence
- risk and falsification triggers

## Use Local Skills

- Use `osbornhub-ic-memo` for the memo skeleton.
- Use `osbornhub-generic-dcf` when fair value bands are required.
- Use Hiphon PM doctrine and tracking discipline when producing personal PM-style decisions.

## Outputs

- decision: research-only | watch | starter | add | trim | exit | reject
- position sizing range
- entry zone
- stop or falsification condition
- catalyst path
- downside case
- IC memo
- tracking record suggestion

## Stages

### 1. Decision Boundary

Confirm that the user asked for a PM decision, position action, 仓位, 止损, IC memo, or decision pack. Without that explicit request, downgrade to A or C research output.

### 2. Inputs And Constraints

List portfolio, cash, existing position, concentration limit, risk budget, liquidity, time horizon, and mandate constraints when provided. If portfolio is missing, position sizing must be framed as a model range, not as actual account instruction.

### 3. Evidence And Valuation

Summarize evidence quality, source gaps, valuation range, downside case, and signal state. Evidence quality caps conviction.

### 4. Decision Matrix

Use this state machine:

- research-only: evidence insufficient
- watch: evidence interesting but timing or valuation weak
- starter: evidence medium+, valuation acceptable, risk bounded
- add: already owned or starter exists, evidence improves, valuation still acceptable
- trim: thesis intact but valuation or concentration too stretched
- exit: thesis falsified or risk trigger fires
- reject: poor economics, weak evidence, or broken thesis

### 5. Position Sizing And Stop

Every action must include position sizing, entry zone, stop or falsification condition, downside case, and next review trigger. Never imply automated trading.

### 6. IC Memo

Use the eight-section IC memo skeleton from `osbornhub-ic-memo` and attach recommendation, return math, risk mitigants, and exit paths.

### 7. Tracking

Suggest an append-only tracking record with decision, evidence quality, confidence, valuation range, position sizing, entry zone, falsification, and review date.

## Minimum Output

Return:

1. decision
2. evidence quality and confidence
3. valuation range
4. signal state
5. position sizing
6. entry zone
7. falsification / stop
8. downside case
9. IC memo
10. tracking record suggestion

## Guardrails

D may include direct PM-style action language only when explicitly requested. Every action must include evidence quality, position size, risk, and falsification logic. No automated trading.

End D outputs with: 本决策包仅作个人/内部决策辅助，不构成对第三方的投资建议；不执行自动交易.
