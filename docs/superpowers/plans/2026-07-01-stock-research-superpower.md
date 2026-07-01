# Stock Research Superpower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local version of the Stock Research Superpower skill pack, starting with industry/theme-to-stock research and vendoring the first OsbornHub research skills as local adapters.

**Architecture:** Add one user-facing orchestration skill at `skills/stock-research-superpower` and five supporting local adapter skills under `skills/osbornhub-*`. Keep `SKILL.md` files concise and put detailed workflow, evidence, data, and output contracts in `references/` files so the agent loads only the needed context.

**Tech Stack:** Codex/Claude-style Agent Skills in Markdown, local repository skill discovery, existing Stock Monitor APIs, existing local research skills, optional Node/Python validation through shell commands.

---

## File Structure

- Create `skills/stock-research-superpower/SKILL.md`: main routing skill for B/C/A/D投研 workflows.
- Create `skills/stock-research-superpower/references/workflow-b-industry-to-stocks.md`: detailed first-phase B workflow.
- Create `skills/stock-research-superpower/references/workflow-c-research-dashboard.md`: C workflow contract for later dashboard/tracking.
- Create `skills/stock-research-superpower/references/workflow-a-single-stock-book.md`: A workflow contract for single-stock deep research.
- Create `skills/stock-research-superpower/references/workflow-d-pm-decision-pack.md`: D workflow contract for PM decision packs.
- Create `skills/stock-research-superpower/references/evidence-policy.md`: evidence grading, citation, and source handling rules.
- Create `skills/stock-research-superpower/references/data-source-map.md`: Stock Monitor, WindPy, Tushare, filings, news, and user-provided research source map.
- Create `skills/stock-research-superpower/references/output-contracts.md`: reusable schemas for chain maps, candidates, evidence ledgers, and follow-up queues.
- Create `skills/osbornhub-industry-chain-diligence/SKILL.md`: local adapter for `research.industry-chain-diligence`.
- Create `skills/osbornhub-company-diligence/SKILL.md`: local adapter for `research.company-diligence`.
- Create `skills/osbornhub-generic-dcf/SKILL.md`: local adapter for `equity.generic-dcf`.
- Create `skills/osbornhub-group-effect-ledger/SKILL.md`: local adapter for `signals.group-effect-ledger`.
- Create `skills/osbornhub-ic-memo/SKILL.md`: local adapter for `research.ic-memo`.
- Create `skills/osbornhub-*/references/*.md`: one compact provenance/contract reference per adapter.

## Task 1: Create The Superpower Skill Shell

**Files:**
- Create: `skills/stock-research-superpower/SKILL.md`
- Create: `skills/stock-research-superpower/references/output-contracts.md`

- [ ] **Step 1: Create `SKILL.md` with routing logic**

Use `apply_patch` to create `skills/stock-research-superpower/SKILL.md`:

```markdown
---
name: stock-research-superpower
description: Use when the user wants integrated equity research across industry-chain stock discovery, research dashboards, single-stock deep dives, valuation, and PM decision packs. Triggers on 投研 superpower, 产业链选股, 主题选股, 找瓶颈股, 每日投研工作台, 单股深研, 股票 research book, 基金经理决策包, or PM decision pack. Starts with workflow B unless the user explicitly asks for C/A/D.
---

# Stock Research Superpower

This is the user-facing orchestration skill for Stock Monitor's投研 workflow.

It routes four modes:

- **B: Industry/theme to stocks** - default first-phase workflow. Read `references/workflow-b-industry-to-stocks.md`.
- **C: Research dashboard** - daily/weekly tracking and prioritization. Read `references/workflow-c-research-dashboard.md`.
- **A: Single-stock research book** - source-first company research. Read `references/workflow-a-single-stock-book.md`.
- **D: PM decision pack** - position/risk/IC memo workflow. Read `references/workflow-d-pm-decision-pack.md`.

Always read these shared references before producing material research output:

- `references/evidence-policy.md`
- `references/data-source-map.md`
- `references/output-contracts.md`

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
```

- [ ] **Step 2: Create the initial output contract reference**

Use `apply_patch` to create `skills/stock-research-superpower/references/output-contracts.md`:

```markdown
# Output Contracts

Use these structures for integrated research outputs.

## Chain Map

```text
Theme:
Geography:
Horizon:
End system:
Demand driver:

Layers:
1. End demand / deployment:
2. System integrator / OEM:
3. Subsystems:
4. Core components:
5. Manufacturing / assembly / test:
6. Equipment / tooling:
7. Specialty materials:
8. Raw inputs:
```

## Bottleneck Record

```text
Bottleneck:
Chain layer:
Constraint type:
Why it is narrow:
Evidence status: confirmed | management-claim | inference | speculation
Consensus awareness: low | medium | high
What confirms it:
What breaks it:
```

## Candidate Record

```text
Company:
Ticker:
Market:
Role: proven-executor | true-bottleneck | second-order-beneficiary | early-optionality | crowded-leader | avoid-watch-only
Chain layer:
Why it belongs:
Evidence grade: primary | medium | weak | unknown
Key sources:
Validation questions:
Falsification trigger:
Next workflow: C | A | D | reject
```

## Evidence Ledger

```text
Claim:
Source:
Source class: primary | medium | weak | unknown
Date:
Quote or retrieval note:
Interpretation:
Confidence: high | medium | low
```

## Follow-Up Queue

```text
Strong research candidates:
Needs company diligence:
Needs valuation:
Needs signal watch:
Rejected but watch:
Missing evidence:
```
```

- [ ] **Step 3: Verify files exist**

Run:

```bash
test -f skills/stock-research-superpower/SKILL.md
test -f skills/stock-research-superpower/references/output-contracts.md
```

Expected: both commands exit with status `0`.

- [ ] **Step 4: Commit**

Run:

```bash
git add skills/stock-research-superpower/SKILL.md skills/stock-research-superpower/references/output-contracts.md
git commit -m "feat: add stock research superpower shell"
```

Expected: a commit containing only the superpower shell and output contract.

## Task 2: Add Shared Evidence And Data Source References

**Files:**
- Create: `skills/stock-research-superpower/references/evidence-policy.md`
- Create: `skills/stock-research-superpower/references/data-source-map.md`

- [ ] **Step 1: Create evidence policy**

Use `apply_patch` to create `skills/stock-research-superpower/references/evidence-policy.md`:

```markdown
# Evidence Policy

Research outputs must make evidence quality visible.

## Source Classes

### Primary

Use for:

- exchange filings and announcements
- annual reports, quarterly reports, 10-K, 10-Q, 20-F, prospectuses
- earnings call transcripts
- official investor presentations
- official company press releases
- regulator or exchange data
- Tushare/WindPy structured financial and market data when retrieved from the user's licensed account or local cache

### Medium

Use for:

- Reuters, Bloomberg, 财联社, WSJ, Nikkei, 36Kr, and reputable industry/trade press
- broker research summaries when the user has lawful access
- conference notes and expert commentary with identifiable source and date
- professional databases summarized through user-provided exports

### Weak

Use for:

- social media posts
- unattributed screenshots
- forum discussions
- unsourced "market consensus"
- rumors without dated professional confirmation

### Unknown

Use when a claim appears useful but no concrete source has been captured.

## Claim Labels

Every material claim should be labeled:

- confirmed evidence
- management claim
- inference
- speculation

## Copyright And Paid Research

Do not reproduce paid research in public-facing outputs. For user-provided private research, summarize the user's own lawful material and preserve source metadata. Keep quotations short and only when needed for auditability.

## Missing Evidence

When evidence is missing, write a missing-source note with the exact source type needed, such as "missing-source: official capacity data" or "missing-source: latest earnings transcript".

## Research Versus Recommendation

B and A outputs are research analysis. They should not present buy/sell orders. D outputs may include PM-style actions only when explicitly requested and must include position sizing, falsification triggers, and risk language.
```

- [ ] **Step 2: Create data source map**

Use `apply_patch` to create `skills/stock-research-superpower/references/data-source-map.md`:

```markdown
# Data Source Map

Use available local and connected data sources before inventing new acquisition paths.

## Stock Monitor APIs

Use local or production Stock Monitor endpoints when available:

- `/api/search` for ticker resolution.
- `/api/stocks/[ticker]` for stock metadata.
- `/api/kline/[ticker]` for price series.
- `/api/signals/[ticker]` for technical and internal signals.
- `/api/flows/[ticker]` for A-share capital flow where available.
- `/api/holders/[ticker]` for holder data where available.
- `/api/perspectives/[ticker]` for AI committee perspectives.
- `/api/radar/[ticker]` and `/api/radar/batch` for radar-style priority signals.

## Local Code Sources

Relevant modules:

- `src/lib/data/sources/tushare.ts`
- `src/lib/data/sources/tushare-cached.ts`
- `src/lib/data/sources/eastmoney.ts`
- `src/lib/data/sources/sina.ts`
- `src/lib/data/sources/tencent.ts`
- `src/lib/stocks/search.ts`
- `src/lib/stocks/wind-normalize.ts`
- `src/lib/data/evidence-confidence.ts`

## WindPy

Use WindPy only when the user has a working local interface, exported files, or provides data. Do not claim live WindPy access unless it has been verified in the current environment.

## Tushare

Use Tushare for A-share structured data when a token or cache is available. Prefer cached data for repeatable local research.

## Source Files

For deep research, keep source files under a research workspace:

```text
research-books/<Company-or-Theme>/
  sources/
  references/
  chapters/
  exports/
```

## RAG Layer

RAG is a retrieval layer behind structured workflows. Do not make it the first product surface. Index source metadata, dates, issuer, company, ticker, source class, and workflow tags.
```

- [ ] **Step 3: Validate references are mentioned by the shell**

Run:

```bash
rg -n "evidence-policy|data-source-map" skills/stock-research-superpower/SKILL.md
```

Expected: both reference file names appear.

- [ ] **Step 4: Commit**

Run:

```bash
git add skills/stock-research-superpower/references/evidence-policy.md skills/stock-research-superpower/references/data-source-map.md
git commit -m "feat: add research evidence and data source policies"
```

Expected: a commit containing only the two shared references.

## Task 3: Add Workflow B In Detail

**Files:**
- Create: `skills/stock-research-superpower/references/workflow-b-industry-to-stocks.md`

- [ ] **Step 1: Create B workflow reference**

Use `apply_patch` to create `skills/stock-research-superpower/references/workflow-b-industry-to-stocks.md`:

```markdown
# Workflow B: Industry To Stocks

Use this workflow when the user starts from a theme, sector, technology wave, or supply-chain question and wants investable stock candidates.

## Default Scope

- Geography: global, then resolve A/HK/US tickers where possible.
- Horizon: 6-18 months.
- Output: direction plus candidate pool.

Ask at most three questions when scope is unclear:

1. What theme or industry are we underwriting?
2. Which market scope matters: A-share, HK, US, China supply chain, or global?
3. Do you want direction only, candidates, or a deep memo?

## Stage 1: Define The End System

Write one compact paragraph before naming companies:

- actual end product or service
- demand wave
- physical or operational buildout required
- consensus/crowded areas
- specific machine, rack, process, subsystem, or use case when possible

## Stage 2: Chain Panorama

Map 6-9 layers:

1. End demand / deployment
2. System integrator / OEM
3. Subsystems / modules
4. Core components
5. Manufacturing / assembly / test
6. Equipment / tooling
7. Specialty materials
8. Raw inputs / commodities

For each layer, capture:

- who gets paid
- margin structure if known
- supply-demand state
- technology route
- barriers
- high-frequency indicators

## Stage 3: Bottleneck Diagnosis

Ask: if demand doubles, what breaks first?

Constraint types:

- capacity
- qualification
- yield
- regulation
- equipment
- materials
- power / thermal
- capital intensity
- customer switching cost
- geopolitical concentration

Score bottlenecks qualitatively:

- concentration: low | medium | high
- substitutability: low | medium | high
- ramp difficulty: low | medium | high
- proof of demand: low | medium | high
- consensus awareness: low | medium | high

## Stage 4: Candidate Roles

Group companies by role:

- proven executor
- true bottleneck supplier
- second-order beneficiary
- early optionality
- crowded consensus leader
- avoid/watch-only

Never present names before the chain map and bottleneck diagnosis.

## Stage 5: Data Enrichment

Resolve tickers with Stock Monitor search. Then enrich candidates where possible with quote, kline, signals, flows, holders, perspectives, radar, Tushare, WindPy exports, filings, and source files.

If data is unavailable, write a missing-source note.

## Stage 6: Evidence Ledger

For every material claim, attach:

- source
- source class
- date
- quote or retrieval note
- interpretation
- confidence

## Stage 7: Handoff

End with:

- strong research candidates
- needs company diligence
- needs valuation
- needs signal watch
- rejected but watch
- missing evidence

## Minimum Output

Return:

1. Scope
2. Chain map
3. Bottleneck diagnosis
4. Candidate table
5. Evidence ledger
6. What would break the thesis
7. Follow-up queue for C/A/D

End B outputs with: 本分析仅作研究参考，不构成投资建议.
```

- [ ] **Step 2: Validate B workflow trigger appears in shell**

Run:

```bash
rg -n "workflow-b-industry-to-stocks|产业链选股|找瓶颈股" skills/stock-research-superpower/SKILL.md
```

Expected: all key routing strings appear.

- [ ] **Step 3: Commit**

Run:

```bash
git add skills/stock-research-superpower/references/workflow-b-industry-to-stocks.md
git commit -m "feat: document industry-to-stocks research workflow"
```

Expected: a commit containing only the B workflow reference.

## Task 4: Add C/A/D Workflow Contracts

**Files:**
- Create: `skills/stock-research-superpower/references/workflow-c-research-dashboard.md`
- Create: `skills/stock-research-superpower/references/workflow-a-single-stock-book.md`
- Create: `skills/stock-research-superpower/references/workflow-d-pm-decision-pack.md`

- [ ] **Step 1: Create C workflow contract**

Use `apply_patch` to create `skills/stock-research-superpower/references/workflow-c-research-dashboard.md`:

```markdown
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

## Handoff

Promote names to A when evidence or price action justifies single-company work. Promote names to D only when the user asks for a decision pack or position action.
```

- [ ] **Step 2: Create A workflow contract**

Use `apply_patch` to create `skills/stock-research-superpower/references/workflow-a-single-stock-book.md`:

```markdown
# Workflow A: Single-Stock Research Book

Use this workflow when the user names one company and asks for 单股深研, research book, due diligence, earnings research, or valuation support.

## Inputs

- company name
- ticker and exchange when available
- fiscal period when earnings-focused
- user-provided source files when available
- prior B/C artifacts when promoted from a theme workflow

## Use Local Skills

- Use `earnings-research-book` for source-first earnings books.
- Use `osbornhub-company-diligence` for seven-section company diligence.
- Use `osbornhub-generic-dcf` when valuation is requested.

## Outputs

- entity resolution
- source inventory
- business and segment map
- financial quality
- moat and competition
- management and governance
- catalysts
- risks and falsification triggers
- valuation range if requested
- open questions

## Source Rule

Do not cite sources that are not captured in the source inventory or explicitly retrieved during the current workflow.
```

- [ ] **Step 3: Create D workflow contract**

Use `apply_patch` to create `skills/stock-research-superpower/references/workflow-d-pm-decision-pack.md`:

```markdown
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

## Guardrails

D may include direct PM-style action language only when explicitly requested. Every action must include evidence quality, position size, risk, and falsification logic. No automated trading.
```

- [ ] **Step 4: Validate all workflow references exist**

Run:

```bash
for f in workflow-c-research-dashboard.md workflow-a-single-stock-book.md workflow-d-pm-decision-pack.md; do test -f "skills/stock-research-superpower/references/$f"; done
```

Expected: command exits with status `0`.

- [ ] **Step 5: Commit**

Run:

```bash
git add skills/stock-research-superpower/references/workflow-c-research-dashboard.md skills/stock-research-superpower/references/workflow-a-single-stock-book.md skills/stock-research-superpower/references/workflow-d-pm-decision-pack.md
git commit -m "feat: add research dashboard and decision workflow contracts"
```

Expected: a commit containing only the C/A/D workflow references.

## Task 5: Vendor OsbornHub Research Adapter Skills

**Files:**
- Create: `skills/osbornhub-industry-chain-diligence/SKILL.md`
- Create: `skills/osbornhub-company-diligence/SKILL.md`
- Create: `skills/osbornhub-generic-dcf/SKILL.md`
- Create: `skills/osbornhub-group-effect-ledger/SKILL.md`
- Create: `skills/osbornhub-ic-memo/SKILL.md`
- Create: `skills/osbornhub-industry-chain-diligence/references/provenance.md`
- Create: `skills/osbornhub-company-diligence/references/provenance.md`
- Create: `skills/osbornhub-generic-dcf/references/provenance.md`
- Create: `skills/osbornhub-group-effect-ledger/references/provenance.md`
- Create: `skills/osbornhub-ic-memo/references/provenance.md`

- [ ] **Step 1: Create adapter directories**

Run:

```bash
mkdir -p skills/osbornhub-industry-chain-diligence/references skills/osbornhub-company-diligence/references skills/osbornhub-generic-dcf/references skills/osbornhub-group-effect-ledger/references skills/osbornhub-ic-memo/references
```

Expected: command exits with status `0`.

- [ ] **Step 2: Create industry-chain adapter**

Use `apply_patch` to create `skills/osbornhub-industry-chain-diligence/SKILL.md`:

```markdown
---
name: osbornhub-industry-chain-diligence
description: Use when the user wants a full industry-chain panorama diligence across upstream, midstream, downstream tiers and multi-region 15-dimension segment research. Local adapter for OsbornHub research.industry-chain-diligence, integrated with Stock Research Superpower.
---

# OsbornHub Industry-Chain Diligence

Read `references/provenance.md` for source metadata and the preserved contract.

Use for full 产业链全景尽调.

Output:

- chain panorama
- tier segments
- 15-dimension segment research
- source citations

Do not use for single-company due diligence, valuation math, or buy/sell recommendations.

Required dimensions:

1. regional market size
2. growth
3. lifecycle
4. policy
5. technology route
6. barriers
7. value distribution
8. supply and demand
9. competitive landscape
10. risks
11. high-frequency indicators
12. upstream dependencies
13. downstream customers
14. regional differences
15. source coverage
```

Use `apply_patch` to create `skills/osbornhub-industry-chain-diligence/references/provenance.md`:

```markdown
# Provenance

Original OsbornHub id: `research.industry-chain-diligence`

Original summary: Map an industry across upstream/midstream/downstream tiers and research each segment over a 15-dimension framework across multiple regions; built-in PPTX-faithful data-center chain.

Local adaptation:

- Preserves the chain-panorama contract.
- Adds Stock Research Superpower evidence rules.
- Supports B workflow as the first industry mapping stage before bottleneck diagnosis and candidate mapping.
```

- [ ] **Step 3: Create company diligence adapter**

Use `apply_patch` to create `skills/osbornhub-company-diligence/SKILL.md`:

```markdown
---
name: osbornhub-company-diligence
description: Use when the user wants an investment-grade single-company due-diligence brief with entity resolution, seven-section web research, cross-verification, and source citations. Local adapter for OsbornHub research.company-diligence.
---

# OsbornHub Company Diligence

Read `references/provenance.md` for source metadata and the preserved contract.

Use for single-company research after a name is promoted from B/C or when the user directly asks for 公司调研, 尽调, or due diligence.

Seven sections:

1. entity resolution
2. business model
3. products and segments
4. market and competition
5. financial quality
6. management and governance
7. risks, catalysts, and open questions

Do not provide buy/sell recommendations. Use `osbornhub-generic-dcf` for valuation math.
```

Use `apply_patch` to create `skills/osbornhub-company-diligence/references/provenance.md`:

```markdown
# Provenance

Original OsbornHub id: `research.company-diligence`

Original summary: Single-company investment-grade due-diligence brief: entity resolution, seven-section web research, cross-verification, A4 report.

Local adaptation:

- Preserves the seven-section diligence contract.
- Adds Stock Research Superpower evidence classes.
- Serves Workflow A and D input preparation.
```

- [ ] **Step 4: Create generic DCF adapter**

Use `apply_patch` to create `skills/osbornhub-generic-dcf/SKILL.md`:

```markdown
---
name: osbornhub-generic-dcf
description: Use when the user wants a company DCF, intrinsic value, fair value range, or valuation sensitivity. Local adapter for OsbornHub equity.generic-dcf, using four cash-flow variants and WACC x terminal-growth sensitivity.
---

# OsbornHub Generic DCF

Read `references/provenance.md` for source metadata and the preserved contract.

Use for valuation support only after company identity and core assumptions are clear.

Outputs:

- revenue and cost decomposition
- forecast
- valuation range
- WACC x terminal growth sensitivity
- narrative linking valuation to evidence

Use four variants where data allows:

- FCFF
- EBITDA-exit cross-check
- adjusted / 扣非
- ex-SBC / 扣 SBC when relevant

Do not fabricate financials. If assumptions are missing, state the assumption explicitly and label the confidence.
```

Use `apply_patch` to create `skills/osbornhub-generic-dcf/references/provenance.md`:

```markdown
# Provenance

Original OsbornHub id: `equity.generic-dcf`

Original summary: Input a company name; AI decomposes assumptions and a deterministic engine returns a four-variant DCF valuation with WACC x g sensitivity.

Local adaptation:

- Preserves the DCF output contract.
- Uses Stock Research Superpower evidence and missing-source rules.
- Supports Workflow A valuation and Workflow D decision packs.
```

- [ ] **Step 5: Create group-effect ledger adapter**

Use `apply_patch` to create `skills/osbornhub-group-effect-ledger/SKILL.md`:

```markdown
---
name: osbornhub-group-effect-ledger
description: Use when the user wants a deterministic stock-signal ledger for UP/DC resonance records, strong/medium/weak signal zones, MA20 re-entry monitoring, secondary discovery, blind-spot mining, per-target tracking, and daily change logs. Local adapter for OsbornHub signals.group-effect-ledger.
---

# OsbornHub Group-Effect Signal Ledger

Read `references/provenance.md` for source metadata and the preserved contract.

Use for Workflow C signal and tracking surfaces.

Inputs:

- signal records
- config
- as-of date

Outputs:

- dashboard
- targets
- strong zone
- re-entry monitor
- blind spots
- daily log

Do not fabricate prices, emit price targets, place orders, or perform intrinsic valuation.
```

Use `apply_patch` to create `skills/osbornhub-group-effect-ledger/references/provenance.md`:

```markdown
# Provenance

Original OsbornHub id: `signals.group-effect-ledger`

Original summary: Deterministic stock-signal ledger: aggregate UP/DC 共振 signal records into 强/中/弱 classification, 重返 MA20 / 二次发现 / 盲区挖掘 partitions, per-target tracking, signal history, an overview dashboard, and a daily-change log.

Local adaptation:

- Preserves deterministic ledger categories.
- Serves Workflow C and B tracking handoff.
- Remains signal tracking, not valuation or trade execution.
```

- [ ] **Step 6: Create IC memo adapter**

Use `apply_patch` to create `skills/osbornhub-ic-memo/SKILL.md`:

```markdown
---
name: osbornhub-ic-memo
description: Use when the user wants an investment committee memo, 投资上会报告, 投决会材料, or decision-pack memo with project overview, deal structure, industry, target, financials, highlights, risks, mitigants, recommendation, returns, and exit paths. Local adapter for OsbornHub research.ic-memo.
---

# OsbornHub IC Memo

Read `references/provenance.md` for source metadata and the preserved contract.

Use for Workflow D when the user asks for an approval-ready memo or PM decision pack.

Eight sections:

1. project overview
2. deal structure and terms
3. industry analysis
4. target-company analysis
5. financials and valuation
6. investment highlights and synergies
7. risks and mitigants
8. recommendation, return math, and exit paths

Do not auto-approve investments or fabricate financials.
```

Use `apply_patch` to create `skills/osbornhub-ic-memo/references/provenance.md`:

```markdown
# Provenance

Original OsbornHub id: `research.ic-memo`

Original summary: Eight-section investment-committee memo: overview, deal structure and terms, industry, target, financials and valuation, highlights and synergies, risks and mitigants, recommendation with return math and exit.

Local adaptation:

- Preserves the eight-section memo framework.
- Serves Workflow D as the memo container.
- Uses Stock Research Superpower evidence and PM decision guardrails.
```

- [ ] **Step 7: Validate all adapter frontmatter**

Run:

```bash
for f in skills/osbornhub-*/SKILL.md; do sed -n '1,8p' "$f"; done
```

Expected: each file has YAML frontmatter with `name` and `description`.

- [ ] **Step 8: Commit**

Run:

```bash
git add skills/osbornhub-*
git commit -m "feat: vendor osbornhub research skill adapters"
```

Expected: a commit containing only the five adapter skills and their provenance files.

## Task 6: Validate Skill Triggerability And Content Hygiene

**Files:**
- Read: `skills/stock-research-superpower/SKILL.md`
- Read: `skills/osbornhub-*/SKILL.md`

- [ ] **Step 1: Check frontmatter names and descriptions**

Run:

```bash
for f in skills/stock-research-superpower/SKILL.md skills/osbornhub-*/SKILL.md; do
  printf '\n== %s ==\n' "$f"
  sed -n '1,6p' "$f"
done
```

Expected: every skill has a clear `name` and a trigger-rich `description`.

- [ ] **Step 2: Check references are discoverable**

Run:

```bash
rg -n "references/|Read `" skills/stock-research-superpower/SKILL.md skills/osbornhub-*/SKILL.md
```

Expected: every detailed reference file has a direct mention from its parent `SKILL.md`.

- [ ] **Step 3: Check for prohibited gap markers**

Run:

```bash
rg -n "T[B]D|T[O]DO|place""holder|implement"" later|fill"" in details" skills/stock-research-superpower skills/osbornhub-* || true
```

Expected: no matches.

- [ ] **Step 4: Check no unrelated files are staged**

Run:

```bash
git status --short
```

Expected: staged files, if any, are only files created by this plan. Existing unrelated dirty files such as `src/components/TabBar.tsx` and `src/components/TopBar.tsx` remain untouched and unstaged.

- [ ] **Step 5: Commit validation fixes if needed**

If Step 1-3 required wording fixes, run:

```bash
git add skills/stock-research-superpower skills/osbornhub-*
git commit -m "chore: tighten stock research skill metadata"
```

Expected: commit only if validation edits were made. If no edits were made, skip this commit.

## Self-Review

Spec coverage:

- B workflow is covered by Tasks 1-3 and supported by the industry-chain adapter in Task 5.
- C workflow is covered by Task 4 and the group-effect ledger adapter in Task 5.
- A workflow is covered by Task 4 and the company diligence / generic DCF adapters in Task 5.
- D workflow is covered by Task 4 and the IC memo / generic DCF adapters in Task 5.
- Evidence, data source, and output contract requirements are covered by Tasks 1-2.

Gap-marker scan:

- The plan avoids common gap markers and open-ended test instructions.
- Each created file has concrete content.

Type and naming consistency:

- Superpower skill name: `stock-research-superpower`.
- Vendor adapter skill names all use `osbornhub-*`.
- Reference filenames match the names used in `SKILL.md`.
