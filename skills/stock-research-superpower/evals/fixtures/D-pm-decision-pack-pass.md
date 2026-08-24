# Workflow D: PM Decision Pack - 新易盛

## scope

Workflow D, PM decision pack. The user explicitly requested position sizing and stop rules, so PM-style action language is allowed. This remains decision support. No automated trading.

## decision

Decision: starter / watch, pending evidence quality. Alternative states are add, trim, exit, or reject if valuation range, signal state, or evidence quality changes.

## evidence quality

- source: prior Workflow B chain thesis. Confidence: medium until primary source is attached.
- source: prior Workflow A company diligence. Confidence: medium if source inventory is complete.
- source: signal state from Stock Monitor radar/signals. Confidence: low to medium because signals do not prove fundamentals.
- risk: missing-source items must reduce conviction.

## valuation range

Valuation range uses explicit assumptions from DCF and cross-checks. If the current price is above fair value range, position sizing is capped or decision moves to watch. If downside case is severe, no add recommendation is allowed.

## signal state

Signal state summarizes trend, re-entry monitor, strong/medium/weak signal zone, and whether a recent move is supported by new evidence. Signal state cannot override missing-source risk.

## position sizing

position sizing:

- starter: 1-3% when evidence quality is medium and valuation is not stretched
- add: only after primary evidence improves and price remains inside entry zone
- trim: if valuation stretches beyond the range or evidence weakens
- exit: if falsification trigger fires

The pack avoids full allocation and never recommends maximum concentration.

## entry zone

entry zone is tied to valuation range and volatility, not a fabricated target. If data is missing, write missing-source: latest quote and valuation assumptions.

## falsification

falsification triggers:

- customer qualification is delayed or contradicted
- margin thesis breaks
- signal state turns weak while evidence quality deteriorates
- downside case becomes base case

Stop rule: use a hard stop or thesis stop, whichever triggers first, and state the risk.

## downside case

downside case covers demand slowdown, margin compression, customer concentration, technology route shift, and valuation multiple contraction.

## IC memo

IC memo sections:

1. project overview
2. industry context
3. target-company analysis
4. financials and valuation
5. investment highlights
6. risks and mitigants
7. recommendation
8. return math and exit paths

## tracking record suggestion

Record decision, evidence quality, confidence, valuation range, position sizing, entry zone, falsification, risk, and next review date. This is not automated trading and requires human PM approval.
