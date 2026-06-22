# John Cameron Copilot — Agentic Vertical Slice (P1) · Design Spec

> Status: approved design · 2026-06-20
> Author: brainstorming session (osborn + Claude)
> Scope: P1 of the "Gen-2 Agentic Investment Copilot" re-architecture of stock-monitor.

## 1. Problem & Vision

stock-monitor today is a Gen-1 product: a Next.js GUI over real/mock data APIs, plus a
`skills/` directory of **Claude markdown skills that are never executed**. The investment
methodology exists as *content* (the `john-cameron` agent, the `hiphon-pm` doctrine, the
`stock-daily-radar` / bottleneck research skills) but the product has **no agency**: it
cannot call tools, cannot run a method step-by-step, and cannot improve itself.

Target = **Agentic Investment Copilot** with three capabilities the product currently lacks:

1. **Tool calling** — invoke quote/financials/DCF/flows/radar/guru-lens/search as real tools.
2. **Step-by-step reasoning** — execute multi-step methods (John Cameron 5-step, DCF) and show the work.
3. **Self-iteration** — learn from outcomes and tune its own methods (future phase).

### Phasing (each phase = its own spec → plan → build)

| Phase | Deliverable | Status |
|---|---|---|
| **P0** | Fix `/briefs` runtime error | separate, ships first (see §9) |
| **P1** | **This spec** — John Cameron Copilot vertical slice | designing |
| P2 | Broaden: full `/skills` Hub page, editable DcfStudio, all APIs as tools | future |
| P3 | Self-iteration: outcome capture + method tuning | future |

Product stance (decided): **augment, don't replace** — the Copilot is a NEW surface; the
existing dashboard / watchlist / stock / radar pages stay and are progressively wired to the
new tool layer.

## 2. Goals / Non-Goals

**Goals (P1)**
- A working `/copilot` surface that, given a stock, **executes** the John Cameron 5-step
  doctrine by calling real tools and **streams** step-by-step reasoning + visible tool calls +
  a structured verdict.
- A typed **tool registry** (the seed of the future Skill Hub) wrapping 8 capabilities.
- DCF ported as a **pure engine + `/api/dcf` endpoint + tool**, used inline by the copilot.
- A `skills/dcf-valuation/SKILL.md` so the same DCF is runnable by Claude/agents.

**Non-Goals (deferred)**
- Full `/skills` Hub *page* (P2). We build the registry data layer now, not the page.
- Rich editable DcfStudio UI (P2). P1 renders DCF output read-only inline.
- Broad tool coverage beyond the 8 below; scorecard persistence (P2).
- Self-iteration / learning loop (P3).
- Recovering the lost 股神/Twitter skills (explicitly out, per user).

## 3. Architecture — the vertical slice

```
┌─────────────────────────── Copilot UI  /(app)/copilot ───────────────────────────┐
│  stock input → streamed step cards §1..§5 (reasoning + collapsible tool calls)    │
│  → verdict card (评级 + 理由 + 仓位% + 止损 + 合规尾注)                              │
└───────────────▲───────────────────────────────────────────────────────────────────┘
                │ SSE events: step / tool_call / tool_result / token / verdict / done
┌───────────────┴─────────────── /api/copilot/route.ts ─────────────────────────────┐
│  Anthropic tool-use LOOP (reuse src/lib/data/sources/anthropic.ts)                 │
│   system = John Cameron persona + doctrine §1..§6   tools = registry (§4.1)        │
│   loop: model → (tool_use?) execute via registry → tool_result → repeat → verdict  │
└───────────────▲───────────────────────────────────────────────────────────────────┘
                │ direct server-side calls (no HTTP round-trip / no auth dance)
┌───────────────┴─────────────── Tool registry  src/lib/agent/tools.ts ─────────────┐
│  search · quote · radar · signals · financials · flows · perspectives · dcf        │
│  each = { name, description, inputSchema(JSON), handler(args, ctx) }               │
└───────────────▲───────────────────────────────────────────────────────────────────┘
                │
        existing API logic  +  NEW src/lib/dcf/engine.ts (pure) via /api/dcf
```

## 4. Components

### 4.1 Tool layer — `src/lib/agent/tools.ts`

A typed registry. Each tool wraps **existing server-side data logic** (call the underlying
lib function directly, not over HTTP — avoids the auth gate and a network hop):

| tool | wraps | coverage | notes |
|---|---|---|---|
| `search` | `/api/search` logic | A/HK/US | resolve name→ticker; call first if uncertain |
| `quote` | `/api/quote/{t}` | A/HK/US | price, change%, PE/PB |
| `radar` | `/api/radar/{t}` | A/HK/US | quote+flows+signals, **no LLM, instant** — prefer this |
| `signals` | `/api/signals/{t}` | A/HK/US | triggers[], bias, hit_rate_5d |
| `financials` | `/api/financials/{t}` | A-share | 5Y ROE/margins/cashflow/debt; seeds DCF |
| `flows` | `/api/flows/{t}` | A-share | 北向 hk_hold, 涨跌停 |
| `perspectives` | `/api/perspectives/{t}` | A/HK/US | 9-persona guru lens — **slow + LLM cost**, call only when needed |
| `dcf` | NEW `src/lib/dcf` (§4.2) | A-share-first | composite DCF valuation |

Each tool exposes an Anthropic-compatible `inputSchema` (JSON Schema). `ctx` carries the
authed user/session and a base for A-share-only gating (HK/US → tools return `{ available:false,
note:"暂无数据" }` rather than erroring). Registry shape:

```ts
export interface AgentTool {
  name: string;
  description: string;           // tells the model when/why to use it
  inputSchema: JSONSchema;       // Anthropic tool-use schema
  aShareOnly?: boolean;
  handler: (args: unknown, ctx: ToolCtx) => Promise<unknown>;
}
export const TOOLS: AgentTool[] = [...];
export const TOOLS_BY_NAME: Record<string, AgentTool>;
```

Cost/latency discipline baked into descriptions: prefer `radar` over `perspectives`; fan out
independent fetches; A-share-only tools skipped for HK/US.

### 4.2 DCF — pure engine + endpoint + tool

- **Port** `RE-Fund-AI/research-backend/src/dcf/engine.ts` → `src/lib/dcf/engine.ts` verbatim
  (it is dependency-free). Exports `computeComposite(a: DcfAssumptions): DcfResult` — FCFF,
  WACC discounting, Gordon terminal, mid-year convention, 4 cash-flow variants
  (standard / 扣非 adjusted / ex-SBC / EBITDA-exit), WACC×g sensitivity grid, `rangePerShare`.
- **Assumptions sourcing (hybrid)** in `src/lib/dcf/assemble.ts`:
  1. **Seed** from `financials` tool (revenue, margins, shares-diluted, net-debt where present).
  2. **LLM gap-fill** (revenue decomposition, CAGR, WACC/g defaults, missing items) — port
     `extract.ts`, adapting deps: bring `parseJsonLoose` as a small local util; use
     `src/lib/data/sources/llm.ts` as the provider.
  3. Defaults are returned to the caller so they are **overridable** (full editable UI = P2).
- **Narrative**: port `report.ts` → `src/lib/dcf/report.ts`; replace `mdToHtml` with the app's
  existing markdown rendering (or a tiny local md→html). Output includes `warnings[]`.
- **Endpoint** `src/app/api/dcf/[ticker]/route.ts`: `POST { overrides? } → DcfResult`.
- **Tool** `dcf`: `{ ticker, overrides? } → DcfResult` via the same assemble+compute path.
- On no financials (HK/US / guest) → seed from quote + LLM, attach a prominent `warning`.

### 4.3 Method — `src/lib/agent/methods/john-cameron-5step.ts`

Codifies the doctrine pipeline as the agent's plan. Provides:
- `systemPrompt` = John Cameron persona (from `.claude/agents/john-cameron.md`) + the
  operative doctrine sections loaded from `skills/hiphon-pm/references/doctrine.md`
  (§1 择时总闸 → §2 选股漏斗 → §3 评级 → §4 策略/止损 → §5 仓位; §6 合规尾注; §7 输出契约).
- `steps` scaffold — ordered step ids + titles the runtime emits as `step` events, so the UI
  renders §1..§5 cards even as the model reasons freely within each.
- `verdictSchema` — the structured final output (see §5.3) so §3/§5 produce machine-readable
  rating + sizing + stop.

The method is data (one object), so P2's Hub can list it and future methods alongside it.

### 4.4 Runtime — `src/app/api/copilot/route.ts`

Anthropic **tool-use loop**, reusing `src/lib/data/sources/anthropic.ts`:
1. Build `messages` from `{ ticker, question? }` + method `systemPrompt`, pass `tools` = registry schemas.
2. Stream model output. On `tool_use` blocks: look up in `TOOLS_BY_NAME`, run `handler`, append
   `tool_result`, continue the loop.
3. Emit SSE events to the client (§5.2). Enforce a **tool-hop cap** (e.g. 12) and a wall-clock
   budget to stay within Vercel limits.
4. Final assistant turn must include the `verdict` JSON (validated against `verdictSchema`);
   emit `verdict` then `done`.

Runtime is an Edge/Node route with `export const maxDuration = 60` (Vercel Pro). Streaming
keeps the connection alive; if the budget is hit, emit a `partial` verdict + warning rather
than failing.

### 4.5 Copilot UI — `src/app/(app)/copilot/page.tsx` (+ components)

- New **"Copilot 投研助手"** entry in `TabBar`.
- Input row: stock search/picker (reuse existing search) + optional free-text question.
- Live transcript (client component consuming the SSE stream):
  - **Step cards** §1..§5: streamed reasoning text + a collapsible list of the tool calls made
    in that step (tool name, args, result summary).
  - **Verdict card**: 评级 (买入/增持/持有/减持/卖出) + 理由 + 仓位% + 止损 + the fixed §6 合规尾注.
  - DCF, when called, renders a compact read-only result block (range min/median/max + 4 variants).
- **Augment hook**: a "🎩 用 John 分析这只股票" button on `/stock/[ticker]` deep-links to
  `/copilot?ticker=<t>` and auto-runs.

### 4.6 `skills/dcf-valuation/SKILL.md`

A Claude skill describing how to run a composite DCF (call `/api/dcf`, interpret the 4 variants
& sensitivity, cross-check with relative valuation, surface warnings). Lets the same capability
run from Claude/agents, not just the web UI. Registered in the (future) Hub registry.

## 5. Data contracts

### 5.1 Tool inputSchema (example — `dcf`)
```jsonc
{ "type":"object",
  "properties": {
    "ticker": {"type":"string","description":"e.g. 00700.HK, 600519.SH, NVDA"},
    "overrides": {"type":"object","description":"optional assumption overrides (wacc, terminalG, forecastYears...)"}
  },
  "required":["ticker"] }
```

### 5.2 SSE event stream (`/api/copilot`)
```jsonc
{"type":"step","id":"s1","title":"§1 择时总闸"}
{"type":"token","text":"我现在看到的流动性是…"}
{"type":"tool_call","step":"s1","name":"radar","args":{"ticker":"00700.HK"}}
{"type":"tool_result","step":"s1","name":"radar","ok":true,"summary":"price 380, bias bull, hit_rate_5d 0.7"}
{"type":"verdict","data": { /* §5.3 */ }}
{"type":"done"}
{"type":"error","message":"…"}        // terminal alternative
```

### 5.3 Verdict schema (final structured output)
```jsonc
{
  "ticker":"00700.HK", "name":"腾讯控股",
  "rating":"增持",                    // 买入|增持|持有|减持|卖出
  "thesis":"markdown 理由（落到 §1..§5 结论）",
  "positionPct": 8,                  // 仓位建议 %
  "stop":"跌破 350 或基本面证伪",       // 止损/风险
  "confidence": {"score":6.2,"n":0,"note":"暂无战绩，冷启动"},  // 校准诚实
  "dcf": { "rangePerShare":{"min":,"median":,"max":}, "warnings":[] },  // when run
  "compliance":"⚠️ 个人决策辅助，不构成投资建议…"
}
```

## 6. Data flow

```
/copilot?ticker=00700.HK
  → POST /api/copilot {ticker:"00700.HK"}
    → Claude loop (John Cameron 5-step system + tools)
        §1 radar/quote/flows → §2 financials/dcf/bottleneck → §3 signals/perspectives
        §4 strategy        → §5 sizing
    → stream step/tool/verdict events
  → UI renders §1..§5 cards + verdict
```

## 7. Error handling

- **Tool failure** → `tool_result {ok:false, note}`; the model continues and labels "暂无数据".
- **A-share-only tool on HK/US** → handler returns `{available:false}`; never throws.
- **LLM/timeout / hop-cap hit** → emit `partial` verdict + warning; UI shows what completed.
- **DCF with no financials** → seed from quote + LLM, prominent `warning`; never fabricate.
- **Stream/network drop** → client shows a retry; server is stateless per request.

## 8. Testing

- `src/lib/dcf/engine.test.ts` — port the golden test from RE-Fund `dcf-engine.test.ts`
  (assert per-variant EV/equity/perShare + terminal % within tolerance).
- `src/lib/agent/tools.test.ts` — each handler with mocked data libs; A-share gating.
- `src/app/api/copilot` integration smoke — **stubbed Anthropic** returns a scripted
  `tool_use` (e.g. `radar`) then a verdict; assert the loop executes the tool, streams a
  `tool_result`, and emits a schema-valid `verdict`.

## 9. P0 — `/briefs` bugfix (separate, ships first)

Independent of P1. Static reading shows both `briefs` pages are clean server components and
`MOCK_DATA` exists, so the "error after login" needs a **runtime reproduction**: run the dev
server (or read the Vercel function log for `/briefs`), capture the real stack, fix root cause,
verify the authed render. Tracked and shipped on its own, not bundled into the P1 plan.

## 10. File manifest (new/changed in P1)

```
NEW  src/lib/dcf/engine.ts            (port, pure)
NEW  src/lib/dcf/assemble.ts          (seed financials + LLM gap-fill)
NEW  src/lib/dcf/report.ts            (port; md→html adapted)
NEW  src/lib/dcf/extract.ts           (port; parseJsonLoose local)
NEW  src/lib/dcf/engine.test.ts       (port golden)
NEW  src/app/api/dcf/[ticker]/route.ts
NEW  src/lib/agent/tools.ts           (8-tool registry)
NEW  src/lib/agent/tools.test.ts
NEW  src/lib/agent/methods/john-cameron-5step.ts
NEW  src/app/api/copilot/route.ts     (tool-use loop + SSE)
NEW  src/app/(app)/copilot/page.tsx
NEW  src/app/(app)/copilot/CopilotClient.tsx   (SSE consumer / step + verdict cards)
NEW  skills/dcf-valuation/SKILL.md
EDIT src/components/TabBar.tsx         (+ Copilot tab)
EDIT src/app/(app)/stock/[ticker]/...  (+ "用 John 分析" hook)
```

## 11. Open implementation constraints (resolved in plan, not blocking)

- Vercel serverless timeout → streaming + `maxDuration=60` + hop-cap; degrade to partial verdict.
- `data-access.md` mentions the retired SITE_PASSWORD gate; current auth is Supabase session.
  Tools call lib logic **directly** server-side, so the gate is irrelevant to in-app tool use.
- Anthropic model + token budget per run → use the model already configured in `anthropic.ts`;
  cap `perspectives`/`dcf` (the LLM-heavy tools) to one call each per run by default.
