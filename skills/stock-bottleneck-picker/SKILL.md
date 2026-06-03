---
name: stock-bottleneck-picker
description: Use when the user wants to discover stocks through supply-chain bottleneck analysis. Maps any sector's value chain, identifies the narrowest constraint, verifies with evidence, then surfaces candidate stocks grouped by role (executor / bottleneck / beneficiary / optionality). Integrates with Stock Monitor's data pipeline for live quotes, financials, signals, and AI committee perspectives. Triggers on "选股", "bottleneck pick", "找瓶颈股", "供应链选股", "stack pick", "拆产业链".
---

# Stock Bottleneck Picker

A stock-selection skill that adapts the Chokepoint Atlas bottleneck-hunting methodology for general equity research. Instead of starting with tickers, it starts with a sector → maps the value chain → finds the narrowest constraint → then surfaces candidate stocks.

Built on top of the `ai-supply-chain-bottleneck-hunter` research framework, integrated with Stock Monitor's live data pipeline.

## When to Use

Use this skill when the user wants to:

- discover stocks through structural analysis rather than screeners
- understand a sector's value chain before picking names
- find the "choke point" companies that are hardest to replace
- get a thesis-first, ticker-second research output
- combine Stock Monitor's data (quotes, financials, signals, AI committee) with bottleneck logic

Triggers:
- "帮我在XX行业选股"
- "bottleneck pick: 光通信"
- "拆一下新能源汽车产业链，找卡脖子环节"
- "stack pick: semiconductor packaging"
- "用瓶颈逻辑看储能"

## Core Model

**Treat a sector as a physical value chain, not a ticker list.**

The workflow is:

1. **Define the end system** — what is being built/delivered?
2. **Map the value chain** — 6-9 layers from raw materials to end demand
3. **Find the bottleneck** — which layer is the narrowest constraint?
4. **Verify with evidence** — earnings, filings, industry data, cross-chain confirmation
5. **Output direction first** — the lane, not the names
6. **Surface candidates** — grouped by role, with evidence quality labeled

## Integration with Stock Monitor

This skill can pull live data from Stock Monitor's API endpoints to ground the analysis:

| Data Need | Stock Monitor Endpoint | Coverage |
|-----------|----------------------|----------|
| Live quote + fundamentals | `GET /api/quote/{ticker}` | A / HK / US |
| Financial history (5Y) | `GET /api/financials/{ticker}` | A-share |
| Technical signals | `GET /api/signals/{ticker}` | A / HK / US |
| AI 9-persona perspectives | `GET /api/perspectives/{ticker}` | A / HK / US |
| Capital flows (北向) | `GET /api/flows/{ticker}` | A-share |
| Stock search | `GET /api/search?q={keyword}` | A / HK / US |

**Base URL**: `https://stock-monitor-nu.vercel.app` (production) or `http://localhost:3000` (local dev)

### When to call Stock Monitor APIs

- **Always call** `/api/search` to resolve company names to tickers
- **Call `/api/quote/{ticker}`** to get current price, PE, PB, ROE, market cap for candidate names
- **Call `/api/financials/{ticker}`** when the user wants revenue/cost structure evidence
- **Call `/api/signals/{ticker}`** to check if technical signals align with the bottleneck thesis
- **Call `/api/perspectives/{ticker}`** only when the user wants AI committee cross-validation (expensive)

### Evidence confidence integration

Use Stock Monitor's evidence-confidence classifier (`src/lib/data/evidence-confidence.ts`) mental model:

- **High (●)**: Tushare financials, SEC/交易所 filings, earnings transcripts, official IR
- **Medium (◐)**: Broker reports, professional news (Reuters/Bloomberg/财联社), dated sources
- **Low (○)**: Social media, unverified rumors, vague "consensus"
- **Unknown**: No concrete source

Every candidate name must carry an evidence-quality label.

## Workflow

### Step 0: Scope Gate

If the user is vague, ask at most 3 short questions:

- Which sector / industry?
- A-share, HK, US, or global?
- Direction first, or already want candidate names?

Defaults:
- Geography: global (use Stock Monitor's A/HK/US coverage)
- Horizon: 6-18 months
- Output: direction first

### Step 1: Define the End System

Before any names, force one paragraph on:

- What is the actual end product or service being delivered?
- What demand wave is expanding?
- What physical/operational buildout does it require?
- Which parts are already consensus and crowded?

Ground it in something concrete:
- Not "新能源车"
- But "800V 高压平台量产爬坡" or "L3 自动驾驶域控制器"

### Step 2: Map the Value Chain

Always map 6-9 layers before concluding. Generic template:

1. End demand / consumer
2. Brand / OEM / system integrator
3. Key subsystems / modules
4. Core components / devices
5. Manufacturing / assembly / test
6. Equipment / tooling
7. Specialty materials / inputs
8. Raw materials / commodities

For each layer, ask:
- Who gets paid here?
- What's the margin structure?
- What unlocks the next layer?
- Is the bottleneck capacity, technology, regulation, certification, or materials?

### Step 3: Hunt the Bottleneck

The key question: **If demand doubles, what breaks first?**

Check these bottleneck types:
- Capacity shortage (fab/tool/factory booked out)
- Technology barrier (only 1-2 players can do it)
- Regulatory/certification moat (long approval cycles)
- Customer switching cost (deep integration)
- Supply concentration (single region/supplier)
- Capital intensity (nobody can afford to add capacity fast)

Rank by:
- Concentration (how many suppliers?)
- Substitutability (can customers switch?)
- Ramp difficulty (how fast can capacity expand?)
- Proof of demand (is the constraint already visible?)
- Consensus awareness (does the market already price this in?)

### Step 4: Verify With Evidence

Use three evidence buckets:

1. **Company evidence**: earnings calls, IR presentations, guidance language, customer/supplier mentions
2. **Industry evidence**: trade press, capacity/lead-time news, industry reports
3. **Cross-chain evidence**: multiple companies describing the same stress point from different angles

For A-share stocks, prioritize:
- 年报/季报 (annual/quarterly reports)
- 交易所公告 (exchange announcements)
- 券商研报 (broker reports — medium confidence)
- 财联社/路透 (professional news — medium confidence)

### Step 5: Output Direction First

Default first response: a directional lane, not a stock list.

Must include:
- The lane worth tracking
- Why now
- What confirms it
- What breaks it
- What upstream/downstream would feel it first

### Step 6: Surface Candidate Names (only after direction)

When the user follows up, offer 3-7 names grouped by role:

- **Proven executor** (成熟执行者): market leader, strong financials, clear revenue from this lane
- **Bottleneck pure-play** (真瓶颈): narrow supplier, hard to replace, capacity-constrained
- **Second-order beneficiary** (二阶受益): cheaper, indirect exposure to the bottleneck
- **Early optionality** (早期高波动): pre-revenue or early ramp, high upside, high risk

For each name:
- Ticker (resolved via Stock Monitor search)
- Role in the chain
- Why it belongs
- Evidence quality (●/◐/○)
- What still needs confirmation
- Main risk

### Step 7: Optional — Pull Live Data

If the user wants current numbers, call Stock Monitor APIs for the candidate tickers:

```bash
# Parallel fetch for candidate tickers
curl -s "https://stock-monitor-nu.vercel.app/api/quote/600519.SH" | jq
curl -s "https://stock-monitor-nu.vercel.app/api/signals/600519.SH" | jq
```

Use the live data to validate or challenge the bottleneck thesis.

## Output Levels

### Level 1: Directional Lane (default)
- Thesis in 4-8 paragraphs
- Value chain map
- Bottleneck call
- Proof/disproof checklist
- **No stock names yet**

### Level 2: Candidate Watchlist
- 3-7 names grouped by role
- Each with: role, reason, evidence quality, risk, next check
- Pull live quotes from Stock Monitor if available

### Level 3: Single-Name Deep Dive
- Why this company matters
- Exact bottleneck it touches
- Customer/supplier map
- Revenue timing and ramp path
- Failure cases
- Live financials from Stock Monitor `/api/financials/{ticker}`

## Hard Rules

- **Never output stock names before building the thesis.**
- Always separate: confirmed evidence / management claims / inference / speculation.
- Always say what would break the thesis.
- For A-share stocks, never use "建议买入/卖出" — use "信号偏多/偏空/中性" per Stock Monitor compliance.
- Do not present candidate names as buy recommendations.
- If evidence is weak, label output as "names worth validating" not "names worth buying".
- Always end with: *本分析仅作研究参考，不构成投资建议*

## Sector-Specific Chain Templates

### AI / Semiconductor
1. End demand (cloud/hyperscaler) → 2. Systems (GB300 NVL72 rack) → 3. Modules (1.6T optical) → 4. Chips (GPU/ASIC) → 5. Advanced packaging (CoWoS) → 6. Foundry (3nm/2nm) → 7. Equipment (litho/etch) → 8. Materials (substrates/gases)

### New Energy Vehicle
1. Consumer → 2. OEM/品牌 → 3. 域控制器/智驾 → 4. 三电系统 (电池/电机/电控) → 5. 核心零部件 (IGBT/SiC) → 6. 电池材料 (正极/负极/电解液/隔膜) → 7. 锂/钴/镍资源

### Energy Storage
1. Grid/utility → 2. System integrator → 3. Battery pack → 4. Battery cell → 5. Core materials (cathode/anode) → 6. Raw materials (lithium/phosphorus) → 7. Power electronics (PCS/BMS)

### Pharma / Biotech
1. Patient/healthcare system → 2. Drug product → 3. CDMO/manufacturing → 4. API/原料药 → 5. Intermediates → 6. Raw chemicals/reagents → 7. Equipment/consumables

## Tone and Style

Write like a researcher mapping a real industrial system:
- Direct, skeptical, bottleneck-focused
- Concrete nouns over abstract hype
- Willing to say "this is still too early" or "not enough proof yet"
- Separate "great story" from "real ramp"

Avoid:
- Generic "sector is bullish" cheerleading
- Ticker spam without chain logic
- Fake certainty
- Copying Serenity/Crux catchphrases

## Quick Start Examples

### Example 1: Direction First
```
User: 帮我看 AI 光通信产业链，找瓶颈
Agent: [Loads this skill → maps optical chain → identifies DSP/retimer as bottleneck → outputs directional lane → waits for follow-up before naming stocks]
```

### Example 2: With Stock Monitor Integration
```
User: bottleneck pick: 人形机器人，给我候选名单
Agent: [Maps chain → identifies harmonic reducer as bottleneck → searches Stock Monitor for 绿的谐波, 双环传动 → pulls live quotes → outputs grouped watchlist with evidence labels]
```

### Example 3: Single Name Deep Dive
```
User: 用瓶颈逻辑深挖一下 300750.SZ
Agent: [Places CATL in battery chain → identifies its bottleneck position → pulls financials from Stock Monitor → outputs underwrite sheet with failure cases]
```

## Relationship to Other Skills

- **ai-supply-chain-bottleneck-hunter**: The parent methodology. This skill generalizes it beyond AI supply chains to any sector.
- **stock-daily-radar**: Per-ticker daily monitoring. This skill is for discovery; radar is for tracking.
- **13f-holdings-research**: Institutional holdings. Can cross-reference bottleneck picks with what funds actually own.

## Failure Modes

This skill is failing if it:
- Names stocks before mapping the chain
- Calls something a "bottleneck" without explaining the physical/structural reason
- Treats one data point as proof
- Mixes fact and speculation without labeling
- Recommends small-cap names without saying what still needs validation
- Ignores Stock Monitor's available live data when the user asks for current numbers
