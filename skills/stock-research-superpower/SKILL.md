---
name: stock-research-superpower
description: Use when the user wants integrated equity research across industry-chain stock discovery, research dashboards, single-stock deep dives, valuation, and PM decision packs. Triggers on 投研 superpower, 产业链选股, 主题选股, 找瓶颈股, 每日投研工作台, 单股深研, 股票 research book, 基金经理决策包, or PM decision pack. Starts with workflow B unless the user explicitly asks for C/A/D.
---

# Stock Research Superpower

This is the user-facing orchestration skill for Stock Monitor's 投研 workflow.

It routes four modes:

- **B: Industry/theme to stocks** - default first-phase workflow. Read `references/workflow-b-industry-to-stocks.md`.
- **C: Research dashboard** - daily/weekly tracking and prioritization. Read `references/workflow-c-research-dashboard.md`.
- **A: Single-stock research book** - source-first company research. Read `references/workflow-a-single-stock-book.md`.
- **D: PM decision pack** - position/risk/IC memo workflow. Read `references/workflow-d-pm-decision-pack.md`.

Always read these shared references before producing material research output:

- `references/evidence-policy.md`
- `references/data-source-map.md`
- `references/output-contracts.md`
- `references/benchmark-and-scoring.md` when changing the skill pack or judging whether an output is complete/good enough.

## Routing

Default to B when the user asks for 产业链选股, 主题选股, 找瓶颈股, or a broad theme.

Route to C when the user asks for daily, weekly, dashboard, watchlist, radar, monitoring, tracking, or research queue.

Route to A when the user names one company and asks for deep research, research book, due diligence, 财报深研, or 单股深研.

Route to D when the user asks for portfolio action, PM decision, 仓位, 止损, decision pack, 投委会, 上会, or IC memo.

## Hard Rules

- Do not start with "top stock picks". Build the chain map and bottleneck thesis first.
- Separate confirmed evidence, management claims, inference, and speculation.
- Attach evidence quality to material claims.
- Mark missing evidence explicitly instead of fabricating.
- Respect paid research boundaries: use user-provided private material only for the user's private workflow.
- No automated trading or order placement.
- For general research output, avoid direct buy/sell recommendations. PM-style recommendations are allowed only when the user explicitly asks for D or Hiphon PM-style personal decision output.
- When evaluating this skill pack, use `evals/benchmark.json` and `scripts/score-stock-research-superpower.mjs` as the deterministic completion/quality gate.

## Local Supporting Skills

Prefer existing local skills when their scope matches:

- `ai-supply-chain-bottleneck-hunter`
- `stock-bottleneck-picker`
- `earnings-research-book`
- `portfolio-pdf-report`
- `osbornhub-industry-chain-diligence`
- `osbornhub-company-diligence`
- `osbornhub-generic-dcf`
- `osbornhub-group-effect-ledger`
- `osbornhub-ic-memo`
