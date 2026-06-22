# John Cameron Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn stock-monitor's static GUI into an agentic copilot by shipping one end-to-end vertical slice: a `/copilot` surface that executes the John Cameron 5-step doctrine via real tool-calling and streams step-by-step reasoning + a structured verdict.

**Architecture:** A typed 8-tool registry wraps the existing data APIs; a ported pure DCF engine becomes one tool behind `/api/dcf`; a tool-use loop in `/api/copilot` drives Claude through the 5-step method, streaming SSE events; a client page renders streamed step cards + verdict. Augments the existing GUI (new tab + a stock-page hook); nothing is removed.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Anthropic Messages API (tool use), Vitest (added here), Supabase (existing), Server-Sent Events.

**Spec:** `docs/superpowers/specs/2026-06-20-john-cameron-copilot-design.md`

**Branch:** `feat/john-cameron-copilot` (already created).

---

## File Structure

```
NEW  vitest.config.ts                              test runner config
NEW  src/lib/dcf/engine.ts                         pure DCF engine (port, verbatim)
NEW  src/lib/dcf/engine.test.ts                    golden test (port)
NEW  src/lib/dcf/assemble.ts                        seed financials + LLM gap-fill → DcfAssumptions
NEW  src/lib/dcf/assemble.test.ts
NEW  src/app/api/dcf/[ticker]/route.ts             POST → DcfResult
NEW  src/lib/agent/data-client.ts                  internal-fetch helper to /api/*
NEW  src/lib/agent/tools.ts                        8-tool registry (the Skill Hub seed)
NEW  src/lib/agent/tools.test.ts
NEW  src/lib/agent/methods/john-cameron-5step.ts   method: system prompt + steps + verdict schema
NEW  src/app/api/copilot/route.ts                  tool-use loop + SSE
NEW  src/app/api/copilot/loop.ts                    pure loop driver (testable)
NEW  src/app/api/copilot/loop.test.ts
NEW  src/app/(app)/copilot/page.tsx                server page shell
NEW  src/app/(app)/copilot/CopilotClient.tsx       SSE consumer + step/verdict cards
NEW  skills/dcf-valuation/SKILL.md                 runnable-by-Claude DCF skill
EDIT src/lib/data/sources/anthropic.ts             + anthropicToolChat (tool-use capable)
EDIT src/components/TabBar.tsx                      + Copilot tab
EDIT src/app/(app)/stock/[ticker]/page.tsx         + "用 John 分析" hook (link to /copilot?ticker=)
```

---

## Task 1: Test infrastructure (Vitest)

stock-monitor has no test runner. Add Vitest so later tasks can TDD.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Install Vitest**

Run:
```bash
cd stock-monitor
npm i -D vitest@^2.1.0
```
Expected: adds `vitest` to devDependencies, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` block add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Smoke-test the runner**

Create `src/lib/_smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```
Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 5: Remove smoke file and commit**

```bash
rm src/lib/_smoke.test.ts
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add vitest runner"
```

---

## Task 2: Port the pure DCF engine + golden test

The engine is dependency-free; port it verbatim from RE-Fund-AI.

**Files:**
- Create: `src/lib/dcf/engine.ts`
- Test: `src/lib/dcf/engine.test.ts`

- [ ] **Step 1: Copy the engine verbatim**

Run:
```bash
cd stock-monitor
mkdir -p src/lib/dcf
cp ../RE-Fund-AI/research-backend/src/dcf/engine.ts src/lib/dcf/engine.ts
```
The file exports: `RevenueLine`, `DcfAssumptions`, `ForecastRow`, `VariantValuation`, `SensitivityGrid`, `DcfResult`, and `computeComposite(a: DcfAssumptions): DcfResult`. It has zero imports — no edits needed.

- [ ] **Step 2: Write the golden test**

Create `src/lib/dcf/engine.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeComposite, type DcfAssumptions } from './engine';

const BASE: DcfAssumptions = {
  revenueLines: [
    { name: '主营', baseRevenue: 100, cagr: 0.1 },
    { name: '次要', baseRevenue: 50, cagr: 0.05 },
  ],
  grossMarginPct: 0.6, sgaPct: 0.2, rdPct: 0.05, sbcPct: 0.03,
  daPct: 0.04, capexPct: 0.05, wcPctOfRev: 0.1, taxRate: 0.25,
  wacc: 0.1, terminalG: 0.03, forecastYears: 8,
  sharesDiluted: 100, netDebt: 200, exitEvEbitda: 12,
  currency: 'CNY', currencyUnit: '亿',
};

describe('computeComposite', () => {
  it('ev = pvExplicit + pvTerminal for every variant', () => {
    const r = computeComposite(BASE);
    for (const k of ['fcff', 'ebitda', 'adjusted', 'exSbc'] as const) {
      const v = r.valuation[k];
      expect(v.ev).toBeCloseTo(v.pvExplicit + v.pvTerminal, 6);
    }
  });
  it('equity = ev - netDebt; perShare = equity / sharesDiluted', () => {
    const v = computeComposite(BASE).valuation.fcff;
    expect(v.equity).toBeCloseTo(v.ev - BASE.netDebt, 6);
    expect(v.perShare).toBeCloseTo(v.equity / BASE.sharesDiluted, 6);
  });
  it('fcfExSbc < fcff when SBC > 0', () => {
    const r = computeComposite(BASE);
    for (const row of r.forecast) expect(row.fcfExSbc).toBeLessThan(row.fcff);
    expect(r.valuation.exSbc.perShare).toBeLessThan(r.valuation.fcff.perShare);
  });
  it('nonRecurring lowers fcffAdj', () => {
    const r0 = computeComposite(BASE);
    const r1 = computeComposite({ ...BASE, nonRecurring: Array(8).fill(10) });
    expect(r0.forecast[0].fcffAdj).toBeCloseTo(r0.forecast[0].fcff, 6);
    expect(r1.forecast[0].fcffAdj).toBeLessThan(r0.forecast[0].fcffAdj);
  });
  it('terminalPctEv in (0,1)', () => {
    const r = computeComposite(BASE);
    for (const k of ['fcff', 'ebitda', 'adjusted', 'exSbc'] as const) {
      expect(r.valuation[k].terminalPctEv).toBeGreaterThan(0);
      expect(r.valuation[k].terminalPctEv).toBeLessThan(1);
    }
  });
  it('rangePerShare: min <= median <= max', () => {
    const { min, median, max } = computeComposite(BASE).valuation.rangePerShare;
    expect(min).toBeLessThanOrEqual(median);
    expect(median).toBeLessThanOrEqual(max);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- src/lib/dcf/engine.test.ts`
Expected: 6 passing tests. If the source `FIRST_YEAR` uses `new Date()`, tests are still deterministic (assertions are relative). 

- [ ] **Step 4: Commit**

```bash
git add src/lib/dcf/engine.ts src/lib/dcf/engine.test.ts
git commit -m "feat(dcf): port pure composite DCF engine + golden test"
```

---

## Task 3: DCF assumptions assembler

Build `DcfAssumptions` from the app's financials (seed) + LLM gap-fill, with safe defaults so the engine always gets a valid input.

**Files:**
- Create: `src/lib/dcf/assemble.ts`
- Test: `src/lib/dcf/assemble.test.ts`

- [ ] **Step 1: Write failing tests for the pure default-merge logic**

Create `src/lib/dcf/assemble.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mergeAssumptions, DEFAULT_ASSUMPTIONS } from './assemble';

describe('mergeAssumptions', () => {
  it('fills every required field from defaults when seed is empty', () => {
    const a = mergeAssumptions({}, {});
    expect(a.revenueLines.length).toBeGreaterThan(0);
    expect(a.wacc).toBe(DEFAULT_ASSUMPTIONS.wacc);
    expect(a.forecastYears).toBe(DEFAULT_ASSUMPTIONS.forecastYears);
  });
  it('seed overrides defaults; overrides beat seed', () => {
    const a = mergeAssumptions({ wacc: 0.09, sharesDiluted: 500 }, { wacc: 0.12 });
    expect(a.wacc).toBe(0.12);          // override wins
    expect(a.sharesDiluted).toBe(500);  // seed wins over default
  });
  it('never returns NaN for numeric fields', () => {
    const a = mergeAssumptions({ revenueLines: [] }, {});
    for (const v of [a.wacc, a.terminalG, a.taxRate, a.sharesDiluted, a.netDebt])
      expect(Number.isFinite(v)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/dcf/assemble.test.ts`
Expected: FAIL — `mergeAssumptions` not defined.

- [ ] **Step 3: Implement `assemble.ts`**

```ts
import type { DcfAssumptions } from './engine';
import { chat, extractJson, isLLMConfigured } from '@/lib/data/sources/llm';

export const DEFAULT_ASSUMPTIONS: Omit<DcfAssumptions, 'revenueLines'> & { revenueLines: DcfAssumptions['revenueLines'] } = {
  revenueLines: [{ name: '主营业务', baseRevenue: 100, cagr: 0.08 }],
  grossMarginPct: 0.4, sgaPct: 0.15, rdPct: 0.05, sbcPct: 0.02,
  daPct: 0.04, capexPct: 0.05, wcPctOfRev: 0.05, taxRate: 0.25,
  wacc: 0.1, terminalG: 0.025, forecastYears: 8,
  sharesDiluted: 1000, netDebt: 0, exitEvEbitda: 12,
  currency: 'CNY', currencyUnit: '亿',
};

/** Pure deep-merge: defaults < seed < overrides. Guarantees a complete, finite DcfAssumptions. */
export function mergeAssumptions(
  seed: Partial<DcfAssumptions>,
  overrides: Partial<DcfAssumptions>,
): DcfAssumptions {
  const merged = { ...DEFAULT_ASSUMPTIONS, ...clean(seed), ...clean(overrides) } as DcfAssumptions;
  if (!merged.revenueLines || merged.revenueLines.length === 0)
    merged.revenueLines = DEFAULT_ASSUMPTIONS.revenueLines;
  return merged;
}

/** Drop undefined/null/NaN so they don't overwrite a good default. */
function clean<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export interface AssembleResult { assumptions: DcfAssumptions; warnings: string[]; }

/**
 * Build assumptions for a ticker: seed from financials JSON (best-effort field mapping),
 * optionally ask the LLM to fill revenue decomposition + growth, then merge with overrides.
 */
export async function assembleAssumptions(
  ticker: string,
  financials: unknown,
  overrides: Partial<DcfAssumptions> = {},
): Promise<AssembleResult> {
  const warnings: string[] = [];
  const seed = seedFromFinancials(financials, warnings);

  let llmSeed: Partial<DcfAssumptions> = {};
  if (isLLMConfigured()) {
    try {
      const resp = await chat({
        system: 'You are a sell-side analyst. Output ONLY JSON matching the requested shape. Numbers in 亿 (CNY 100M) unless told otherwise.',
        messages: [{ role: 'user', content: extractPrompt(ticker, seed) }],
        max_tokens: 700,
      });
      llmSeed = clean(extractJson(resp.content) as Partial<DcfAssumptions>);
    } catch {
      warnings.push('AI 假设抽取失败，使用财报种子 + 默认值。');
    }
  } else {
    warnings.push('未配置 LLM，使用财报种子 + 默认假设。');
  }

  const assumptions = mergeAssumptions({ ...seed, ...llmSeed }, overrides);
  warnings.push('DCF 假设含 AI/默认估计，关键数据请人工复核。');
  return { assumptions, warnings };
}

/** Best-effort map of the /api/financials payload onto seed fields. Unknown → omitted. */
function seedFromFinancials(financials: unknown, warnings: string[]): Partial<DcfAssumptions> {
  const f = financials as Record<string, any> | null;
  if (!f || typeof f !== 'object') { warnings.push('暂无财报数据，DCF 基于默认假设。'); return {}; }
  const seed: Partial<DcfAssumptions> = {};
  const latestRevenue = num(f.revenue ?? f.totalRevenue ?? f?.latest?.revenue);
  if (latestRevenue) seed.revenueLines = [{ name: '主营业务', baseRevenue: latestRevenue, cagr: 0.08 }];
  const gm = num(f.grossMargin ?? f?.latest?.grossMargin);
  if (gm) seed.grossMarginPct = gm > 1 ? gm / 100 : gm;
  const shares = num(f.sharesDiluted ?? f.shares ?? f?.latest?.shares);
  if (shares) seed.sharesDiluted = shares;
  const netDebt = num(f.netDebt ?? f?.latest?.netDebt);
  if (netDebt !== null) seed.netDebt = netDebt;
  return seed;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function extractPrompt(ticker: string, seed: Partial<DcfAssumptions>): string {
  return [
    `为 ${ticker} 估计一组 DCF 假设。已知种子（可能不全）：`,
    JSON.stringify(seed),
    '返回 JSON，仅含这些键（缺失用合理行业值）：',
    '{"revenueLines":[{"name":"","baseRevenue":0,"cagr":0}],"grossMarginPct":0,"sgaPct":0,"rdPct":0,',
    '"sbcPct":0,"daPct":0,"capexPct":0,"wcPctOfRev":0,"taxRate":0,"wacc":0,"terminalG":0,',
    '"forecastYears":8,"sharesDiluted":0,"netDebt":0,"exitEvEbitda":12}',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/lib/dcf/assemble.test.ts`
Expected: 3 passing (the pure `mergeAssumptions`/defaults path; `assembleAssumptions` is exercised in Task 4 integration).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dcf/assemble.ts src/lib/dcf/assemble.test.ts
git commit -m "feat(dcf): assumptions assembler (seed + LLM gap-fill + safe defaults)"
```

---

## Task 4: `/api/dcf/[ticker]` route

Expose the engine as an endpoint. Seeds financials from the app's own data client (Task 5 introduces the shared helper; here use a direct internal fetch).

**Files:**
- Create: `src/app/api/dcf/[ticker]/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from 'next/server';
import { computeComposite } from '@/lib/dcf/engine';
import { assembleAssumptions } from '@/lib/dcf/assemble';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Ctx { params: { ticker: string } }

/** POST /api/dcf/[ticker]  body: { overrides?: Partial<DcfAssumptions> } → { assumptions, result, warnings } */
export async function POST(req: Request, { params }: Ctx) {
  const ticker = decodeURIComponent(params.ticker);
  let overrides = {};
  try { overrides = (await req.json())?.overrides ?? {}; } catch { /* empty body ok */ }

  const origin = new URL(req.url).origin;
  let financials: unknown = null;
  try {
    const r = await fetch(`${origin}/api/financials/${encodeURIComponent(ticker)}`, { cache: 'no-store' });
    if (r.ok) financials = await r.json();
  } catch { /* leave null → defaults */ }

  const { assumptions, warnings } = await assembleAssumptions(ticker, financials, overrides);
  const result = computeComposite(assumptions);
  return NextResponse.json({ ticker, assumptions, result, warnings });
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run typecheck`
Expected: no type errors in the new file.

- [ ] **Step 3: Manual smoke (dev server)**

Run (separate terminal): `npm run dev`
Then:
```bash
curl -s -XPOST http://localhost:3000/api/dcf/00700.HK -H 'content-type: application/json' -d '{}' | head -c 400
```
Expected: JSON with `result.valuation.rangePerShare` and a `warnings` array. (Mock/no-key env → warnings include the default-assumptions notice; still returns a valid result.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dcf/[ticker]/route.ts
git commit -m "feat(dcf): POST /api/dcf/[ticker] endpoint"
```

---

## Task 5: Agent data client + 8-tool registry

The registry is the Skill Hub seed. Tools call the app's own `/api/*` over internal fetch (those routes are auth-exempt per `src/middleware.ts`).

**Files:**
- Create: `src/lib/agent/data-client.ts`, `src/lib/agent/tools.ts`
- Test: `src/lib/agent/tools.test.ts`

- [ ] **Step 1: Implement the data client**

```ts
// src/lib/agent/data-client.ts
export async function callApi(origin: string, path: string, init?: RequestInit): Promise<any> {
  try {
    const res = await fetch(`${origin}${path}`, {
      cache: 'no-store',
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
    if (!res.ok) return { available: false, status: res.status, note: '暂无数据' };
    return await res.json();
  } catch (e) {
    return { available: false, note: '请求失败', error: String(e) };
  }
}
```

- [ ] **Step 2: Write failing tests for the registry shape**

Create `src/lib/agent/tools.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TOOLS, TOOLS_BY_NAME } from './tools';

describe('tool registry', () => {
  it('exposes the 8 P1 tools', () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ['dcf', 'financials', 'flows', 'perspectives', 'quote', 'radar', 'search', 'signals'].sort(),
    );
  });
  it('every tool has description + inputSchema + handler', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toHaveProperty('type', 'object');
      expect(typeof t.handler).toBe('function');
    }
  });
  it('TOOLS_BY_NAME indexes every tool', () => {
    for (const t of TOOLS) expect(TOOLS_BY_NAME[t.name]).toBe(t);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- src/lib/agent/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the registry**

```ts
// src/lib/agent/tools.ts
import { callApi } from './data-client';

export interface ToolCtx { origin: string; }
export interface AgentTool {
  name: string;
  description: string;
  category: '行情' | '研究' | '估值' | '资金';
  inputSchema: Record<string, unknown>;
  aShareOnly?: boolean;
  handler: (args: any, ctx: ToolCtx) => Promise<unknown>;
}

const tickerSchema = {
  type: 'object',
  properties: { ticker: { type: 'string', description: '如 00700.HK / 600519.SH / NVDA' } },
  required: ['ticker'],
} as const;

const enc = encodeURIComponent;

export const TOOLS: AgentTool[] = [
  { name: 'search', category: '行情',
    description: '按名称或代码解析股票 → ticker。当 ticker 不确定时先调用。',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    handler: (a, c) => callApi(c.origin, `/api/search?q=${enc(a.q)}`) },
  { name: 'quote', category: '行情',
    description: '实时行情：价格、涨跌幅、PE/PB。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/quote/${enc(a.ticker)}`) },
  { name: 'radar', category: '研究',
    description: '个股雷达（行情+资金+信号，无 LLM，最快）。优先用它而非 perspectives。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/radar/${enc(a.ticker)}`) },
  { name: 'signals', category: '研究',
    description: '技术信号 + 回测命中率：triggers[]、bias、hit_rate_5d。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/signals/${enc(a.ticker)}`) },
  { name: 'financials', category: '研究', aShareOnly: true,
    description: '5 年财务：ROE/利润率/现金流/负债。仅 A 股。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/financials/${enc(a.ticker)}`) },
  { name: 'flows', category: '资金', aShareOnly: true,
    description: '资金流：北向持股、涨跌停。仅 A 股。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/flows/${enc(a.ticker)}`) },
  { name: 'perspectives', category: '研究',
    description: 'AI 9 视角（股神镜头）。慢 + 花 token，只在需要多空辩论时调用一次。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/perspectives/${enc(a.ticker)}`) },
  { name: 'dcf', category: '估值',
    description: '组合式 DCF 估值：4 个现金流变体 + 每股区间 + 敏感性。可传 overrides 调假设。',
    inputSchema: {
      type: 'object',
      properties: { ticker: { type: 'string' }, overrides: { type: 'object', description: '可选假设覆盖：wacc/terminalG/forecastYears…' } },
      required: ['ticker'],
    },
    handler: (a, c) => callApi(c.origin, `/api/dcf/${enc(a.ticker)}`, {
      method: 'POST', body: JSON.stringify({ overrides: a.overrides ?? {} }) }) },
];

export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Anthropic tool-use schema array. */
export const TOOL_DEFS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/lib/agent/tools.test.ts`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/data-client.ts src/lib/agent/tools.ts src/lib/agent/tools.test.ts
git commit -m "feat(agent): 8-tool registry + internal-fetch data client (Skill Hub seed)"
```

---

## Task 6: Tool-capable Anthropic call

`anthropicChat` returns plain text; the loop needs raw content blocks (incl. `tool_use`).

**Files:**
- Modify: `src/lib/data/sources/anthropic.ts` (append; do not change existing exports)

- [ ] **Step 1: Append `anthropicToolChat` and block types**

Add at the end of `src/lib/data/sources/anthropic.ts`:
```ts
// ── Tool-use capable call (for the agent loop) ──────────────────────────────
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown>; }
export interface TextBlock { type: 'text'; text: string; }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: any; }
export type ContentBlock = TextBlock | ToolUseBlock;
export interface AnthropicMessage { role: 'user' | 'assistant'; content: any; }
export interface ToolChatResp { content: ContentBlock[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number }; }

export async function anthropicToolChat(opts: {
  model?: 'claude-sonnet-4-6' | 'claude-opus-4-7';
  system?: string;
  messages: AnthropicMessage[];
  tools: ToolDef[];
  max_tokens?: number;
  timeoutMs?: number;
}): Promise<ToolChatResp> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 55_000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: opts.model || 'claude-sonnet-4-6',
        max_tokens: opts.max_tokens ?? 1500,
        system: opts.system,
        tools: opts.tools,
        messages: opts.messages,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${await resp.text()}`);
    const j = await resp.json();
    return { content: j.content as ContentBlock[], stop_reason: j.stop_reason, usage: j.usage };
  } finally { clearTimeout(timer); }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/sources/anthropic.ts
git commit -m "feat(anthropic): add tool-use capable anthropicToolChat"
```

---

## Task 7: John Cameron 5-step method module

Codify the doctrine pipeline as the agent's system prompt + step scaffold + verdict schema. Doctrine rules are distilled inline (full source: `skills/hiphon-pm/references/doctrine.md`).

**Files:**
- Create: `src/lib/agent/methods/john-cameron-5step.ts`

- [ ] **Step 1: Implement the method**

```ts
export interface MethodStep { id: string; title: string; }
export interface AgentMethod {
  id: string; name: string; description: string;
  steps: MethodStep[];
  systemPrompt: string;
}

export const VERDICT_INSTRUCTION = `
完成 §1–§5 后，最后输出一个 \`\`\`json 代码块，且仅一个，形如：
{"ticker":"","name":"","rating":"买入|增持|持有|减持|卖出","thesis":"markdown 理由",
 "positionPct":0,"stop":"止损/风险","confidence":{"score":0,"n":0,"note":""},
 "compliance":"⚠️ 个人决策辅助，不构成投资建议，市场有风险，决策需自负。"}
若调用过 dcf，可在 thesis 内引用每股区间。绝不编造数字：缺数据说"暂无数据"。`;

export const JOHN_CAMERON_5STEP: AgentMethod = {
  id: 'john-cameron-5step',
  name: 'John Cameron 五步分析法',
  description: '资深基金经理 John Cameron 的择时→选股→评级→策略→仓位五步法，全程调真实工具取数。',
  steps: [
    { id: 's1', title: '§1 择时总闸（宏观/流动性）' },
    { id: 's2', title: '§2 选股漏斗（基本面/估值）' },
    { id: 's3', title: '§3 评级' },
    { id: 's4', title: '§4 策略 / 止损' },
    { id: 's5', title: '§5 仓位' },
  ],
  systemPrompt: [
    '你是 John Cameron，Hiphon 资本首席 PM。Druckenmiller DNA（自上而下、顺势重仓、快速止损）+ 价值护城河 + 产业链卡脖子。osborn 是你唯一客户（个人决策辅助）。',
    '严格按五步顺序作业，每步先调用相应工具取真实数据再下判断：',
    '§1 择时总闸：先看宏观/流动性定方向（用 radar / quote / flows）。',
    '§2 选股漏斗：基本面 + 估值（用 financials、dcf；A 股可用 flows）。',
    '§3 评级：买入/增持/持有/减持/卖出（可用 signals、perspectives 交叉验证，但 perspectives 最多调一次）。',
    '§4 策略 / 止损：给出明确止损线或证伪条件。',
    '§5 仓位：给出仓位 %（结合集中度）。',
    '数据纪律：行情/财报/信号一律来自工具；缺数据明说"暂无数据"，绝不靠记忆编造。A 股专属数据（financials/flows）对港美标注"暂无数据"。',
    '成本纪律：优先 radar（快、免费）而非 perspectives（慢、花钱）。独立取数可并行。',
    '语言：中文为主，术语可中英混用。先判断、再依据、最后"如果是我会怎么做"。',
    VERDICT_INSTRUCTION,
  ].join('\n'),
};
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` (expected: clean)
```bash
git add src/lib/agent/methods/john-cameron-5step.ts
git commit -m "feat(agent): John Cameron 5-step method (system prompt + steps + verdict schema)"
```

---

## Task 8: Copilot loop + `/api/copilot` route (SSE)

Split the loop into a pure, testable driver and a thin SSE route.

**Files:**
- Create: `src/app/api/copilot/loop.ts`, `src/app/api/copilot/route.ts`
- Test: `src/app/api/copilot/loop.test.ts`

- [ ] **Step 1: Write failing test for the loop driver (stubbed model + tools)**

Create `src/app/api/copilot/loop.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { runCopilotLoop, type CopilotEvent } from './loop';

describe('runCopilotLoop', () => {
  it('executes a tool_use then emits a verdict', async () => {
    // model: first turn asks for radar, second turn returns final text with verdict json
    const model = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          { type: 'text', text: '先看雷达。' },
          { type: 'tool_use', id: 'tu1', name: 'radar', input: { ticker: 'NVDA' } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: '结论。\n```json\n{"ticker":"NVDA","rating":"增持","positionPct":5}\n```' }],
      });
    const runTool = vi.fn().mockResolvedValue({ price: 1000, bias: 'bull' });
    const events: CopilotEvent[] = [];
    await runCopilotLoop({ ticker: 'NVDA', model, runTool, maxHops: 5, onEvent: (e) => events.push(e) });

    expect(runTool).toHaveBeenCalledWith('radar', { ticker: 'NVDA' });
    const types = events.map((e) => e.type);
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('verdict');
    const verdict = events.find((e) => e.type === 'verdict') as any;
    expect(verdict.data.rating).toBe('增持');
    expect(types[types.length - 1]).toBe('done');
  });

  it('stops at maxHops and still emits done', async () => {
    const model = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'tool_use', id: 'x', name: 'radar', input: { ticker: 'NVDA' } }],
    });
    const events: CopilotEvent[] = [];
    await runCopilotLoop({ ticker: 'NVDA', model, runTool: async () => ({}), maxHops: 2, onEvent: (e) => events.push(e) });
    expect(model).toHaveBeenCalledTimes(2);
    expect(events[events.length - 1].type).toBe('done');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/app/api/copilot/loop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure loop driver**

```ts
// src/app/api/copilot/loop.ts
import { extractJson } from '@/lib/data/sources/llm';
import type { ContentBlock, ToolChatResp, AnthropicMessage } from '@/lib/data/sources/anthropic';

export type CopilotEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'verdict'; data: any }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface LoopOpts {
  ticker: string;
  question?: string;
  model: (messages: AnthropicMessage[]) => Promise<ToolChatResp>;
  runTool: (name: string, args: any) => Promise<unknown>;
  maxHops: number;
  onEvent: (e: CopilotEvent) => void;
}

export async function runCopilotLoop(o: LoopOpts): Promise<void> {
  const task = o.question
    ? `${o.question}（标的：${o.ticker}）`
    : `请用 John Cameron 五步分析法分析 ${o.ticker}，给出买卖评级、仓位与止损。`;
  const messages: AnthropicMessage[] = [{ role: 'user', content: task }];

  try {
    for (let hop = 0; hop < o.maxHops; hop++) {
      const resp = await o.model(messages);
      const toolResults: any[] = [];

      for (const block of resp.content as ContentBlock[]) {
        if (block.type === 'text' && block.text) o.onEvent({ type: 'token', text: block.text });
        if (block.type === 'tool_use') {
          o.onEvent({ type: 'tool_call', name: block.name, args: block.input });
          let result: unknown; let ok = true;
          try { result = await o.runTool(block.name, block.input); }
          catch (e) { ok = false; result = { error: String(e) }; }
          o.onEvent({ type: 'tool_result', name: block.name, ok, summary: summarize(result) });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result).slice(0, 6000) });
        }
      }

      messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'tool_use' && toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
        continue;
      }
      // Final turn: extract verdict from the concatenated text.
      const finalText = (resp.content as ContentBlock[]).filter((b) => b.type === 'text').map((b: any) => b.text).join('\n');
      const verdict = safeJson(finalText);
      if (verdict) o.onEvent({ type: 'verdict', data: verdict });
      break;
    }
  } catch (e) {
    o.onEvent({ type: 'error', message: String(e) });
  } finally {
    o.onEvent({ type: 'done' });
  }
}

function safeJson(text: string): any | null {
  try { return extractJson(text); } catch { return null; }
}
function summarize(result: unknown): string {
  const s = typeof result === 'string' ? result : JSON.stringify(result);
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/app/api/copilot/loop.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Implement the SSE route wiring model + tools to the loop**

```ts
// src/app/api/copilot/route.ts
import { runCopilotLoop, type CopilotEvent } from './loop';
import { anthropicToolChat, type AnthropicMessage } from '@/lib/data/sources/anthropic';
import { TOOLS_BY_NAME, TOOL_DEFS } from '@/lib/agent/tools';
import { JOHN_CAMERON_5STEP } from '@/lib/agent/methods/john-cameron-5step';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { ticker, question } = await req.json().catch(() => ({}));
  if (!ticker) return new Response('missing ticker', { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CopilotEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      // Emit step scaffold first so the UI can render §1..§5 placeholders.
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'steps', steps: JOHN_CAMERON_5STEP.steps })}\n\n`));
      await runCopilotLoop({
        ticker, question, maxHops: 12, onEvent: send,
        model: (messages: AnthropicMessage[]) => anthropicToolChat({
          system: JOHN_CAMERON_5STEP.systemPrompt, messages, tools: TOOL_DEFS, max_tokens: 1500,
        }),
        runTool: (name, args) => {
          const tool = TOOLS_BY_NAME[name];
          if (!tool) return Promise.resolve({ error: `unknown tool ${name}` });
          return tool.handler(args, { origin });
        },
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (expected: clean)
```bash
git add src/app/api/copilot/loop.ts src/app/api/copilot/loop.test.ts src/app/api/copilot/route.ts
git commit -m "feat(copilot): tool-use loop + SSE /api/copilot route"
```

---

## Task 9: Copilot UI (page + SSE client)

**Files:**
- Create: `src/app/(app)/copilot/page.tsx`, `src/app/(app)/copilot/CopilotClient.tsx`

- [ ] **Step 1: Server page shell**

```tsx
// src/app/(app)/copilot/page.tsx
import { CopilotClient } from './CopilotClient';

export default function CopilotPage({ searchParams }: { searchParams: { ticker?: string } }) {
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">🎩 John Cameron · 投研助手</h1>
      <CopilotClient initialTicker={searchParams.ticker ?? ''} />
    </>
  );
}
```

- [ ] **Step 2: Client SSE consumer + cards**

```tsx
// src/app/(app)/copilot/CopilotClient.tsx
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface ToolCall { name: string; args: unknown; ok?: boolean; summary?: string; }
interface Verdict { ticker?: string; name?: string; rating?: string; thesis?: string;
  positionPct?: number; stop?: string; compliance?: string; confidence?: { score: number; n: number; note: string }; }

export function CopilotClient({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [running, setRunning] = useState(false);
  const [text, setText] = useState('');
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState('');
  const startedRef = useRef(false);

  const run = useCallback(async (t: string) => {
    if (!t || running) return;
    setRunning(true); setText(''); setCalls([]); setVerdict(null); setErr('');
    const resp = await fetch('/api/copilot', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: t }),
    });
    if (!resp.body) { setErr('无响应流'); setRunning(false); return; }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.replace(/^data: /, '').trim();
        if (!line) continue;
        let e: any; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'token') setText((s) => s + e.text);
        else if (e.type === 'tool_call') setCalls((c) => [...c, { name: e.name, args: e.args }]);
        else if (e.type === 'tool_result') setCalls((c) => { const u = [...c]; for (let i = u.length - 1; i >= 0; i--) if (u[i].name === e.name && u[i].ok === undefined) { u[i] = { ...u[i], ok: e.ok, summary: e.summary }; break; } return u; });
        else if (e.type === 'verdict') setVerdict(e.data);
        else if (e.type === 'error') setErr(e.message);
      }
    }
    setRunning(false);
  }, [running]);

  useEffect(() => {
    if (initialTicker && !startedRef.current) { startedRef.current = true; run(initialTicker); }
  }, [initialTicker, run]);

  return (
    <div className="space-y-3">
      <div className="card-base flex gap-2">
        <input value={ticker} onChange={(e) => setTicker(e.target.value)}
          placeholder="输入代码，如 00700.HK / 600519.SH / NVDA"
          className="flex-1 rounded-md bg-bg-card px-3 py-2 text-sm" />
        <button onClick={() => run(ticker)} disabled={running || !ticker}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {running ? '分析中…' : '让 John 分析'}
        </button>
      </div>

      {err && <div className="card-base text-sm text-down">⚠️ {err}</div>}

      {(text || calls.length > 0) && (
        <div className="card-base">
          <div className="mb-2 text-sm font-semibold text-text-dim">🪜 推理过程</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
          {calls.length > 0 && (
            <div className="mt-3 space-y-1">
              {calls.map((c, i) => (
                <details key={i} className="rounded bg-bg-card px-2 py-1 text-xs">
                  <summary className="cursor-pointer">
                    {c.ok === undefined ? '⏳' : c.ok ? '✅' : '❌'} 工具 <b>{c.name}</b>
                    {c.summary ? ` — ${c.summary}` : ''}
                  </summary>
                  <pre className="mt-1 overflow-auto text-[11px] text-text-muted">{JSON.stringify(c.args, null, 2)}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {verdict && (
        <div className="card-base border border-accent-dim">
          <div className="mb-1 text-sm font-semibold">📌 结论 · {verdict.name ?? verdict.ticker}</div>
          <div className="text-lg font-bold text-accent">{verdict.rating}</div>
          {verdict.thesis && <div className="mt-2 whitespace-pre-wrap text-sm">{verdict.thesis}</div>}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {verdict.positionPct != null && <div>仓位：<b>{verdict.positionPct}%</b></div>}
            {verdict.stop && <div>止损：{verdict.stop}</div>}
          </div>
          {verdict.confidence && <div className="mt-1 text-xs text-text-dim">置信 {verdict.confidence.score}（n={verdict.confidence.n}）{verdict.confidence.note}</div>}
          {verdict.compliance && <div className="mt-2 text-[11px] text-text-muted">{verdict.compliance}</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: compiles; `/copilot` appears in the route list.

- [ ] **Step 4: Manual verify (dev server)**

Run `npm run dev`; open `http://localhost:3000/copilot`, enter `NVDA`, click 让 John 分析.
Expected: reasoning text streams, tool-call rows appear (✅/❌), a verdict card renders. (With no `ANTHROPIC_API_KEY` locally, expect an `error` event — that is acceptable for this step; the loop is unit-tested. Set the key to see a full run.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/copilot/page.tsx" "src/app/(app)/copilot/CopilotClient.tsx"
git commit -m "feat(copilot): /copilot UI — streamed step reasoning + verdict card"
```

---

## Task 10: Navigation + stock-page hook (augment)

**Files:**
- Modify: `src/components/TabBar.tsx`
- Modify: `src/app/(app)/stock/[ticker]/page.tsx`

- [ ] **Step 1: Add the Copilot tab to the `TABS` array**

`TabBar.tsx` defines `interface TabDef { id; emoji; label; href; Icon }` and a `TABS: TabDef[]` array. Insert this object **immediately after the `briefs` entry and before the `backtest` entry** (the shared `stroke` const is already in scope):

```tsx
  {
    id: 'copilot', emoji: '🎩', label: 'Copilot', href: '/copilot',
    // Robot/assistant glyph — head + shoulders
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
```
No other change needed — the `TABS.map(...)` render and the active-state logic (`pathname.startsWith('/copilot')`) handle the new tab automatically.

- [ ] **Step 2: Add the stock-page hook**

In `src/app/(app)/stock/[ticker]/page.tsx`, near the page header, add a link (server component — plain `<Link>`):
```tsx
import Link from 'next/link';
// …within the rendered header area, using the page's resolved `ticker`:
<Link href={`/copilot?ticker=${encodeURIComponent(ticker)}`}
  className="inline-block rounded-md bg-bg-card px-3 py-1 text-xs font-semibold">
  🎩 用 John 分析这只股票
</Link>
```
(Place it where the existing header actions live; reuse the page's existing `ticker` variable — do not refetch.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean; tab shows; stock page renders the link.

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.tsx "src/app/(app)/stock/[ticker]/page.tsx"
git commit -m "feat(copilot): add Copilot tab + '用 John 分析' hook on stock page"
```

---

## Task 11: `dcf-valuation` skill (Claude-runnable)

**Files:**
- Create: `skills/dcf-valuation/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: dcf-valuation
description: 对某只股票跑组合式 DCF 估值（4 个现金流变体 + 每股区间 + 敏感性）。当用户问"X 值多少钱/内在价值/DCF/估值"时使用。
---

# DCF 估值（dcf-valuation）

## 何时用
用户想要某标的的内在价值 / DCF / 估值区间时。

## 怎么做
1. 解析 ticker（不确定先用 search）。
2. 调用 Stock Monitor API：`POST /api/dcf/<ticker>`，body 可带 `{ "overrides": { "wacc": 0.1, "terminalG": 0.025, "forecastYears": 8 } }`。
   - Base URL 见 `skills/hiphon-pm/references/data-access.md`。
3. 读取响应：`result.valuation.rangePerShare`（min/median/max）、四变体 `fcff/ebitda/adjusted/exSbc` 的 `perShare`、`sensitivity` 网格、`warnings`。
4. 解读：
   - 中枢取 median；用 4 变体的离散度表达不确定性。
   - terminalPctEv 过高（>0.8）→ 提示终值依赖大、敏感性高。
   - 必看 `warnings`：AI/默认假设要人工复核；港美无 A 股财报时数据更弱。
5. 与相对估值（PE/PB，来自 quote/financials）交叉验证后再下结论。

## 纪律
- 绝不编造数字；缺数据说"暂无数据"。
- 估值是区间不是点；务必带假设与敏感性。
```

- [ ] **Step 2: Commit**

```bash
git add skills/dcf-valuation/SKILL.md
git commit -m "feat(skills): dcf-valuation skill — runnable composite DCF"
```

---

## Final: full verification

- [ ] **Step 1: Whole test suite**

Run: `npm test`
Expected: all tests pass (engine 6, assemble 3, tools 3, loop 2).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean build; routes `/copilot`, `/api/copilot`, `/api/dcf/[ticker]` present.

- [ ] **Step 3: End-to-end manual (requires ANTHROPIC_API_KEY in `.env.local`)**

Run `npm run dev`; visit `/copilot?ticker=00700.HK`.
Expected: §1–§5 reasoning streams, tool calls show ✅, verdict card with 评级/仓位/止损/合规尾注.

- [ ] **Step 4: Push the branch (only when asked by the user)**

```bash
git push -u origin feat/john-cameron-copilot
```

---

## Notes / Out of Scope (deferred)
- **P0 `/briefs` bugfix** — separate task; reproduce at runtime, fix, ship on its own.
- **P2** — full `/skills` Hub page rendering the registry; editable DcfStudio; broaden tools (holders/calendar/backtest); persist verdicts to the hiphon-pm scorecard.
- **P3** — self-iteration (outcome capture → method tuning).
