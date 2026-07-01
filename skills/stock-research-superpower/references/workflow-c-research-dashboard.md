# Workflow C: Research Dashboard

Use this workflow when the user wants daily or weekly tracking of watchlists, candidate pools, signals, flows, news, and research priorities.

## Inputs

- watchlist
- B-stage candidate pools
- user positions when provided
- daily signals
- capital flows
- price moves
- earnings calendar
- news and filings
- prior research artifacts

## Outputs

- daily priority queue
- new evidence since last run
- thesis changes
- candidates promoted to deep research
- candidates downgraded or rejected
- weekly research backlog
- missing-source list

## Sections

1. Market and theme context
2. High-priority changes
3. Candidate movements
4. Signal ledger summary
5. Evidence updates
6. Deep-dive queue
7. Weekly backlog

## Stages

### 1. Snapshot Inputs

List the watchlist, candidate pool, positions if provided, prior B/A/D artifacts, and as-of date. If input data is missing, write a missing-source line instead of inventing it.

### 2. Change Detection

Compare new signals, flows, price moves, filings, news, earnings calendar, and radar outputs against the previous snapshot. Separate new evidence from price-only movement.

### 3. Priority Scoring

Rank the daily priority queue with a transparent heuristic:

- evidence delta: primary > medium > weak > unknown
- thesis impact: confirms, weakens, or unchanged
- signal urgency: strong, medium, weak, re-entry, blind spot
- time sensitivity: earnings, filing, policy, customer event, technical break

Do not treat signal urgency as a buy/sell recommendation.

### 4. Candidate Movement

Every candidate must be marked:

- promoted to A
- hold in C
- downgraded
- rejected but watch
- promote to D only on explicit user request

### 5. Weekly Backlog

End with a weekly backlog grouped by source collection, company diligence, valuation, signal watch, and rejected-but-watch.

## Minimum Output

Return:

1. daily priority queue
2. new evidence
3. thesis changes
4. candidate movements
5. signal ledger summary
6. deep-dive queue
7. weekly backlog
8. missing-source list

## Handoff

Promote names to A when evidence or price action justifies single-company work. Promote names to D only when the user asks for a decision pack or position action.

End C outputs with: 本工作台仅作研究优先级管理，不构成投资建议.
