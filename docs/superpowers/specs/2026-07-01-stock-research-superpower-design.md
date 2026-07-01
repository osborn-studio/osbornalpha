# Stock Research Superpower Design

Date: 2026-07-01
Status: Draft for implementation planning

## Purpose

Build a reusable投研 superpower skill pack for Stock Monitor. The pack should turn scattered market data, WindPy/Tushare outputs, filings, earnings calls, research notes, news, and existing skills into a repeatable equity research workflow.

The long-term workflow covers four modes:

1. B - industry/theme to investable stock candidates.
2. C - daily and weekly research dashboard for watchlists and candidate pools.
3. A - single-stock institutional research book.
4. D - PM decision pack with position sizing, risk, valuation, and approval-ready memo.

The first implementation phase starts with B. B is the highest-leverage workflow because it expresses the product's original research edge: theme-first, value-chain-first, bottleneck-first, ticker-second.

## Product Thesis

OpenBB-style data aggregation is useful but not the moat. The moat is the private research language, data processing pipeline, evidence discipline, skill orchestration, and feedback loop from later market outcomes.

The system should therefore treat data vendors as raw material sources, not as the product core:

- WindPy and Tushare provide structured market, financial, and ownership data.
- Company filings, IR materials, transcripts, and public reports provide primary evidence.
- News, broker summaries, social posts, and sector commentary provide weaker but useful leads.
- Skills turn raw data into reusable research artifacts.
- The superpower skill decides which skill to call, what evidence standard applies, and what output contract must be satisfied.

## Existing Assets

### Local Stock Monitor skills

- `ai-supply-chain-bottleneck-hunter`: maps AI/semiconductor/datacenter supply chains, identifies physical bottlenecks, separates evidence from inference, and outputs directional lanes.
- `stock-bottleneck-picker`: generalizes bottleneck analysis into stock candidate discovery and integrates with Stock Monitor data endpoints.
- `earnings-research-book`: creates source-first single-company earnings research books with preserved source quotes.
- `portfolio-pdf-report`: converts portfolio PDFs into searchable HTML reports.
- `hiphon-pm-*`: existing PM-style investment adviser workflow and tracking philosophy.

### OsbornHub skills to vendor and adapt

The first vendor set should be copied into this repo as standardized local skills or thin adapters:

- `research.industry-chain-diligence`: full upstream/midstream/downstream panorama diligence with 15-dimension segment research.
- `research.company-diligence`: single-company seven-section due-diligence report.
- `equity.generic-dcf`: four-variant DCF valuation with WACC x terminal growth sensitivity.
- `signals.group-effect-ledger`: deterministic stock-signal ledger for strong/medium/weak signal classification, re-entry monitoring, secondary discovery, blind-spot mining, and daily change logs.
- `research.ic-memo`: eight-section investment committee memo.

The local copies should preserve provenance and key output contracts, but they should be adapted to Stock Monitor's evidence policy, data source map, and Chinese/English research output style.

## Architecture

Create a new orchestration skill:

```text
skills/stock-research-superpower/
  SKILL.md
  references/
    workflow-b-industry-to-stocks.md
    workflow-c-research-dashboard.md
    workflow-a-single-stock-book.md
    workflow-d-pm-decision-pack.md
    evidence-policy.md
    data-source-map.md
    output-contracts.md
```

Create or adapt the OsbornHub vendor skills under a clear namespace:

```text
skills/osbornhub-industry-chain-diligence/
skills/osbornhub-company-diligence/
skills/osbornhub-generic-dcf/
skills/osbornhub-group-effect-ledger/
skills/osbornhub-ic-memo/
```

The superpower skill is the only user-facing entrypoint for the integrated投研 workflow. Vendor skills remain directly callable when needed, but the superpower decides routing for integrated research requests.

## Workflow B: Industry To Stocks

Default trigger examples:

- "用投研 superpower 看 AI 光模块"
- "拆一下机器人产业链，找瓶颈股"
- "从固态电池主题里找二阶受益公司"
- "B 模式：产业链选股"

The B workflow has seven stages.

### 1. Scope Gate

If the user is vague, ask only the missing minimum:

- industry/theme
- geography: A/HK/US/global
- horizon: default 6-18 months
- output depth: direction-only, candidate pool, or deep memo

Defaults:

- geography: global, with A/HK/US ticker resolution where possible
- horizon: 6-18 months
- output: direction plus candidate pool

### 2. Industry Panorama

Use the industry-chain diligence method to map:

- upstream / midstream / downstream
- regional differences
- market size and growth
- lifecycle stage
- policy and regulation
- technology route
- barriers to entry
- value distribution
- supply and demand
- competitive landscape
- risks
- high-frequency tracking indicators

Output a compact chain map before naming stocks.

### 3. Bottleneck Diagnosis

Use the bottleneck hunter method to ask:

- If demand doubles, what breaks first?
- Is the constraint physical capacity, qualification, yield, regulation, equipment, materials, thermal, power, or capital intensity?
- How concentrated is supply?
- How substitutable is the constrained input?
- How long would downstream players need to qualify alternatives?
- Is the bottleneck already priced by consensus?

Every bottleneck must be labeled as confirmed evidence, management claim, inference, or speculation.

### 4. Candidate Mapping

Use the stock-bottleneck-picker method to map candidate companies by role:

- proven executor
- true bottleneck supplier
- second-order beneficiary
- early optionality
- possible crowded consensus leader
- avoid/watch-only due to weak evidence or poor economics

Candidate records should include:

- company name
- ticker and market when resolved
- chain layer
- role
- why it belongs
- evidence grade
- key validation questions
- what would falsify the thesis

### 5. Data Enrichment

Resolve candidates through Stock Monitor and available local data sources:

- `/api/search` for ticker resolution
- quote, kline, signals, flows, holders, perspectives, and radar endpoints where available
- Tushare cached data for A-share fundamentals and market data
- WindPy output when user-provided or when a WindPy bridge is available

The first phase may use existing API endpoints and cached data. A later phase can add deterministic importers for WindPy/Tushare outputs.

### 6. Evidence Ledger

Create a structured evidence table, not just prose:

- primary source: filings, exchange announcements, transcripts, official IR
- medium source: Reuters/Bloomberg/财联社, reputable trade press, broker research summaries
- weak source: social posts, unverified rumor, unsourced consensus
- unknown: no concrete source yet

Each material claim must have a source class and retrieval note. If the evidence is not available, mark it as a missing-source note instead of fabricating.

### 7. Tracking Handoff

Pass shortlisted candidates into a daily/weekly tracking queue:

- strong research candidate
- needs single-company diligence
- needs valuation
- needs signal watch
- rejected but watch for new evidence

For candidates with signal records, use the group-effect-ledger method to classify:

- strong / medium / weak signal
- re-entry monitor
- secondary discovery
- blind spot
- daily change log

## Workflow C: Research Dashboard

C turns the B output into a routine operating rhythm.

Inputs:

- watchlist
- B-stage candidate pools
- existing positions if provided
- daily signals, flows, news, earnings calendar, and price moves

Outputs:

- daily priority queue
- new evidence since last run
- thesis changes
- candidates moving from research to deep-dive
- candidates downgraded or rejected
- weekly research backlog

First implementation should only define the output contract and reuse existing Stock Monitor pages/APIs. UI changes are not part of the first phase.

## Workflow A: Single-Stock Research Book

A is triggered when B or C promotes a company to deep research.

Use:

- `earnings-research-book` for source-first earnings work
- `research.company-diligence` for company background and seven-section due diligence
- `equity.generic-dcf` when valuation is requested or when D needs fair value bands

Outputs:

- entity resolution
- source inventory
- business and segment map
- financial quality
- moat and competition
- management and governance
- catalyst and risk
- valuation range if requested
- open questions

## Workflow D: PM Decision Pack

D is not phase-one execution, but its contract should shape earlier outputs.

Inputs:

- candidate from B/C/A
- user portfolio and constraints when available
- valuation range
- signal state
- evidence quality
- thesis confidence
- risk/falsification triggers

Outputs:

- decision: research-only, watch, starter, add, trim, exit, or reject
- position sizing range
- entry zone
- stop/falsification condition
- expected catalyst path
- downside case
- approval-ready IC memo

Use `research.ic-memo` as the memo skeleton and Hiphon PM doctrine/tracking as the decision discipline. Personal-version outputs may include direct buy/sell language only when the surrounding Hiphon PM guardrails are active; otherwise outputs remain research analysis and not investment advice.

## Data And RAG Strategy

Do not make RAG the first product surface. Make RAG a storage and retrieval layer behind structured workflows.

Phase-one data handling:

- keep source inventories in research folders
- preserve original source files where legally available
- record extracted text and quote snippets with source metadata
- store structured candidate and evidence tables as Markdown/JSON artifacts
- leave broker reports or paid research as user-provided private inputs only

Later RAG layer:

- index company filings, earnings transcripts, IR decks, user-provided broker reports, and prior research artifacts
- chunk by source section, not arbitrary fixed token windows when possible
- maintain source class, date, issuer, company, ticker, and workflow tags
- require citations for material claims

## Non-Goals For Phase One

- no automated trading
- no public redistribution of paid research
- no full UI rebuild
- no complete WindPy integration unless the user already has a local working script or exported files
- no claim that Codex has access to non-public data
- no "top picks" without chain map and evidence grading

## Implementation Plan Seed

The next plan should implement in this order:

1. Create `skills/stock-research-superpower` with concise routing instructions and references.
2. Add the B workflow reference in detail.
3. Add shared evidence policy, data source map, and output contract references.
4. Vendor/adapt the five OsbornHub skills as local skills or adapters, preserving provenance.
5. Add a sample B output contract and a dry-run prompt for one theme such as AI optical modules.
6. Validate that the new skills trigger correctly and that references are discoverable without bloating `SKILL.md`.

## Success Criteria

Phase one is successful when a user can ask:

> 用投研 superpower 拆一下 AI 光模块，找瓶颈股

and the agent reliably:

1. scopes the theme if needed,
2. maps the industry chain,
3. identifies the bottleneck,
4. produces candidate companies by role,
5. labels evidence quality,
6. separates facts from inference,
7. creates a follow-up queue for C/A/D,
8. avoids unsupported buy/sell recommendations.
