# Product Manual

This file is the complete usage manual for `ai-supply-chain-bottleneck-hunter`.

## 1. What This Skill Is

This skill is a structured AI-infrastructure research workflow.

It is designed to:

- map AI supply chains
- identify real bottlenecks
- validate those bottlenecks with external evidence
- produce a directional lane first
- only later surface candidate companies

It is **not**:

- a stock-picking shortcut
- a momentum scanner
- a one-shot "tell me what to buy" prompt

## 2. Core Promise

This skill forces research to happen in the right order:

1. demand wave
2. stack map
3. bottleneck
4. evidence
5. directional thesis
6. candidate names
7. single-name underwrite

That order is the product.

## 3. Who Should Use It

Use this skill for users who want:

- AI infrastructure sector research
- photonics / semiconductor / packaging / power / cooling thesis building
- Serenity-style bottleneck hunting
- Crux-style stack construction and weighting discipline
- a reusable "research agent" workflow instead of one-off commentary

Do not use it for:

- daily trading signals
- macro-only market commentary
- meme stock chatter
- users who only want a quick ticker dump

## 4. Supported Input Modes

### Mode A: Raw Theme
Example: `What is the next AI infrastructure bottleneck?`
Expected: infer a supertrend → map the stack → output a directional lane

### Mode B: Theme + Constraint
Example: `I want the next AI lane, but avoid crowded large caps.`
Expected: map the stack → identify bottlenecks → note crowded areas → surface less-followed names only if asked

### Mode C: Predefined Sector
Example: `Look at optical interconnect and tell me where the real bottleneck sits now.`
Expected: stay within the chosen sector → build the stack → identify the narrowest choke point

### Mode D: Known Company
Example: `Underwrite AXTI using this skill.`
Expected: place the company in the stack → explain why it matters → separate fact, inference, and speculation

## 5. Output Layers

### Layer 1: Directional Lane (default first answer)
Required: thesis sentence, supertrend summary, stack summary, bottleneck call, strongest evidence, thesis breaker, next things to monitor

### Layer 2: Candidate Watchlist (only after directional lane)
Required: proven executors, bottleneck pure-plays, second-order beneficiaries, early optionality

### Layer 3: Single-Name Underwrite (deep dive on one company)
Required: what exact problem it solves, where it sits in the stack, why it is hard to replace, evidence quality, ramp/revenue timing, failure cases

## 6. Required Response Order

Unless the user asks for a single-company underwrite from the start, always respond in this order:

1. direction
2. stack
3. bottleneck
4. evidence
5. names if requested

## 7. Research Standards

Minimum evidence categories:
- company evidence
- industry evidence
- cross-company confirmation

Preferred source order:
1. company IR / earnings / filings
2. official customer or supplier statements
3. industry publications or trade reporting
4. broker or market-research summaries
5. social content as a weak signal only

Every strong answer should say:
- what is confirmed
- what is inferred
- what is speculative

## 8. Research Questions This Skill Must Ask

- what demand wave is actually expanding?
- what is the concrete deployed system or machine behind that demand?
- what physical buildout does that imply?
- which layer gets paid first?
- which layer breaks first?
- what makes that bottleneck hard to replace?
- has management or the industry already confirmed the constraint?
- is the bottleneck already consensus?
- if the thesis is right, who gets paid now and who gets paid later?
- if the supplier vanished tomorrow, how long would the downstream wait?

## 9. Positioning Logic

Default logic:
- proven executors: higher confidence, larger weight candidates
- bottleneck suppliers: high value if the evidence is hard
- early disruptors: smaller weight, more validation required
- optionality names: mention upside, but make risk explicit

Never present early-stage optionality names as if they deserve the same confidence as proven executors.

## 10. Style Contract

This skill should sound like:
- a researcher trying to map a real industrial system
- skeptical, concrete, and bottleneck-focused

It should not sound like:
- a hype thread
- a tip sheet
- a copy of Serenity or Crux

## 11. Failure Modes

This skill is failing if it does any of these:
- names stocks before naming the bottleneck
- says "AI is bullish" without identifying a real physical constraint
- treats one rumor as enough proof
- mixes fact and speculation together
- recommends low-cap names without saying what still needs validation
- uses generic LLM language instead of concrete industrial reasoning

## 12. Hand-Off Rule

If this skill is being given to another agent, tell that agent:
- start with the lane, not the ticker
- force a stack before a conclusion
- require at least one non-social evidence source when the user asks for current validation
- do not confuse "interesting" with "underwritten"
