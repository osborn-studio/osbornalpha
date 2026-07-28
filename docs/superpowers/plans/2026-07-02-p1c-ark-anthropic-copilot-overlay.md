# P1c ARK Anthropic 协议 + Copilot 全局浮层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the copilot run on 火山引擎 Agent Plan (Anthropic protocol at `/api/coding`) and turn Copilot into a global overlay (floating button + ⌘K) instead of a bottom tab.

**Architecture:** `ProviderDef` gains `protocol: 'openai' | 'anthropic'`. The copilot loop keeps OpenAI-shaped messages (`OaiMessage`); a new `src/lib/llm/anthropic-compat.ts` converts at the model-callback boundary (messages→Anthropic blocks, ToolDef→input_schema, response→ModelTurn) with pure, unit-tested converter functions. The overlay is a client component (`CopilotFab`) mounted in `(app)/layout.tsx`, deriving ticker context from the pathname; the `/copilot` page remains as the expanded view.

**Tech Stack:** fetch + Anthropic Messages API (`anthropic-version: 2023-06-01`, Bearer auth per ARK Agent Plan docs), existing `runCopilotLoop`, P1b ui primitives for the overlay shell.

**Key existing facts:**
- `src/lib/llm/providers.ts`: `ark` currently OpenAI-protocol at `/api/v3`. Change it; other providers get `protocol: 'openai'`.
- `src/lib/llm/resolve.ts`: builds `ResolvedLlm` from def — must pass `protocol` through (both user and env paths).
- `src/app/api/copilot/route.ts:34-40`: the ONLY protocol-specific seam (model callback calls `toolChat`).
- `src/app/api/llm/test/route.ts`: connectivity test uses OpenAI `chat()` — must branch too (verify its current shape before editing).
- `src/lib/agent/tools.ts` exports `OPENAI_TOOL_DEFS` (ToolDef[] shape: name/description/parameters) — Anthropic needs `{name, description, input_schema}`.

---

## File Structure

- Modify: `src/lib/llm/providers.ts` (+protocol field, ark→coding endpoint)
- Modify: `src/lib/llm/providers.test.ts` (expectations)
- Modify: `src/lib/llm/resolve.ts` (+protocol passthrough)
- Create: `src/lib/llm/anthropic-compat.ts` + `anthropic-compat.test.ts`
- Modify: `src/app/api/copilot/route.ts` (branch on protocol)
- Modify: `src/app/api/llm/test/route.ts` (branch on protocol)
- Create: `src/components/CopilotFab.tsx`
- Modify: `src/app/(app)/layout.tsx` (mount CopilotFab), `src/components/TabBar.tsx` (remove copilot tab)
- Modify: `src/app/(app)/copilot/CopilotClient.tsx` (accept optional `initialTicker` prop if not already)

---

### Task 1: protocol field + ark redefinition + resolve passthrough

- [ ] **Step 1:** In `providers.ts`: add `protocol: 'openai' | 'anthropic';` to `ProviderDef`; add `protocol: 'openai'` to deepseek/openai/kimi/minimax; replace the ark entry with:

```ts
  ark: {
    id: 'ark',
    label: '火山引擎 ARK (Agent Plan)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    defaultModel: 'doubao-seed-code',
    chatPath: '/v1/messages',
    protocol: 'anthropic',
  },
```

- [ ] **Step 2:** In `resolve.ts`: add `protocol: 'openai' | 'anthropic'` to `ResolvedLlm`; in BOTH return sites add `protocol: def.protocol`.
- [ ] **Step 3:** Update `providers.test.ts` expectations (read it first; adjust asserted baseUrl/chatPath for ark, add protocol assertions for all providers).
- [ ] **Step 4:** `npm test` (all pass), `npx tsc --noEmit`. Commit `feat(llm): provider protocol field; ark → Agent Plan anthropic endpoint`.

### Task 2: anthropic-compat (TDD)

- [ ] **Step 1: failing tests** `src/lib/llm/anthropic-compat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { oaiToAnthropic, toolDefsToAnthropic, responseToTurn } from './anthropic-compat';

describe('oaiToAnthropic', () => {
  it('converts user/assistant text messages', () => {
    const out = oaiToAnthropic([
      { role: 'user', content: '分析300750' },
      { role: 'assistant', content: '好的' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: [{ type: 'text', text: '分析300750' }] },
      { role: 'assistant', content: [{ type: 'text', text: '好的' }] },
    ]);
  });

  it('converts assistant tool_calls to tool_use blocks', () => {
    const out = oaiToAnthropic([
      {
        role: 'assistant', content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_quote', arguments: '{"ticker":"NVDA"}' } }],
      },
    ]);
    expect(out).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'get_quote', input: { ticker: 'NVDA' } }] },
    ]);
  });

  it('converts tool results to user tool_result blocks and keeps assistant text alongside tool_use', () => {
    const out = oaiToAnthropic([
      {
        role: 'assistant', content: '先查行情',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_quote', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"price":480}' },
    ]);
    expect(out[0].content).toEqual([
      { type: 'text', text: '先查行情' },
      { type: 'tool_use', id: 'c1', name: 'get_quote', input: {} },
    ]);
    expect(out[1]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"price":480}' }],
    });
  });

  it('merges consecutive tool results into one user message', () => {
    const out = oaiToAnthropic([
      {
        role: 'assistant', content: '',
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } },
          { id: 'b', type: 'function', function: { name: 'y', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'a', content: '1' },
      { role: 'tool', tool_call_id: 'b', content: '2' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].content).toHaveLength(2);
  });
});

describe('toolDefsToAnthropic', () => {
  it('maps parameters to input_schema', () => {
    expect(toolDefsToAnthropic([{ name: 't', description: 'd', parameters: { type: 'object' } }]))
      .toEqual([{ name: 't', description: 'd', input_schema: { type: 'object' } }]);
  });
});

describe('responseToTurn', () => {
  it('extracts text, tool_use blocks and stop_reason', () => {
    const turn = responseToTurn({
      content: [
        { type: 'text', text: '结论' },
        { type: 'tool_use', id: 'c9', name: 'get_quote', input: { ticker: '0700' } },
      ],
      stop_reason: 'tool_use',
    });
    expect(turn).toEqual({
      content: '结论',
      toolCalls: [{ id: 'c9', name: 'get_quote', arguments: { ticker: '0700' } }],
      finishReason: 'tool_use',
    });
  });
});
```

- [ ] **Step 2:** red run. **Step 3: implement** `src/lib/llm/anthropic-compat.ts`:

```ts
// Anthropic Messages API adapter for the copilot loop. The loop speaks the
// OpenAI message shape (OaiMessage); these pure converters translate at the
// boundary. Used for providers with protocol: 'anthropic' (ARK Agent Plan).

import type { LlmConfig, ToolDef, ToolCall } from './openai-compat';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface AnthropicMessage { role: 'user' | 'assistant'; content: Block[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function oaiToAnthropic(messages: any[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block: Block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && last.content[0]?.type === 'tool_result') last.content.push(block);
      else out.push({ role: 'user', content: [block] });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: String(m.content) });
      for (const tc of m.tool_calls) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: [{ type: 'text', text: String(m.content ?? '') }] });
    }
    // system handled separately by the caller
  }
  return out;
}

export function toolDefsToAnthropic(tools: ToolDef[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function responseToTurn(data: { content?: any[]; stop_reason?: string }): {
  content: string; toolCalls: ToolCall[]; finishReason: string;
} {
  const blocks = data.content ?? [];
  const content = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, arguments: b.input ?? {} }));
  return { content, toolCalls, finishReason: data.stop_reason ?? '' };
}

export async function anthropicToolChat(
  cfg: LlmConfig,
  opts: { system?: string; messages: any[]; tools: ToolDef[]; max_tokens?: number; timeoutMs?: number }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ content: string; toolCalls: ToolCall[]; finishReason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  try {
    const res = await fetch(cfg.baseUrl + (cfg.chatPath ?? '/v1/messages'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: opts.max_tokens ?? 1500,
        ...(opts.system ? { system: opts.system } : {}),
        messages: oaiToAnthropic(opts.messages),
        ...(opts.tools.length ? { tools: toolDefsToAnthropic(opts.tools) } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('llm ' + res.status + ': ' + (await res.text().catch(() => '')));
    return responseToTurn(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-text completion for /api/llm/test connectivity checks. */
export async function anthropicChat(
  cfg: LlmConfig,
  opts: { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; max_tokens?: number; timeoutMs?: number },
): Promise<{ content: string }> {
  const r = await anthropicToolChat(cfg, { system: opts.system, messages: opts.messages, tools: [], max_tokens: opts.max_tokens ?? 64, timeoutMs: opts.timeoutMs });
  return { content: r.content };
}
```

- [ ] **Step 4:** green run (7 new tests) + `npm test`. **Step 5:** Commit `feat(llm): anthropic protocol adapter with tested converters`.

### Task 3: branch copilot route + llm test route

- [ ] **Step 1:** `src/app/api/copilot/route.ts` — import `anthropicToolChat`; in the model callback choose by `llm.protocol`:

```ts
        model: async (messages: OaiMessage[]) => {
          const cfg = { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model, chatPath: llm.chatPath };
          const call = llm.protocol === 'anthropic' ? anthropicToolChat : toolChat;
          const r = await call(cfg, { system: JOHN_CAMERON_5STEP.systemPrompt, messages, tools: OPENAI_TOOL_DEFS, max_tokens: 1500 });
          return { content: r.content, toolCalls: r.toolCalls, finishReason: r.finishReason };
        },
```

- [ ] **Step 2:** Read `src/app/api/llm/test/route.ts`; add the same protocol branch using `anthropicChat` vs `chat` (keep its response shape identical).
- [ ] **Step 3:** `npm test` + `npm run build` clean. Commit `feat(copilot): protocol-aware model callback (ARK Agent Plan support)`.

### Task 4: Copilot 全局浮层

- [ ] **Step 1:** Read `src/app/(app)/copilot/CopilotClient.tsx`; if it lacks one, add optional prop `initialTicker?: string` prefilling its ticker input (do not change behavior otherwise).
- [ ] **Step 2:** Create `src/components/CopilotFab.tsx` (client component):
  - Floating button fixed bottom-right (above TabBar: `bottom-20 right-4 z-50`), brass accent, 🎩 icon, `aria-label="打开 Copilot"`.
  - `⌘K` / `Ctrl+K` keydown listener toggles panel.
  - Panel: fixed right drawer `w-full sm:w-[420px]` full-height, `bg-[var(--bg-elevated)]` border-l, header with title + link to `/copilot`（展开）+ close ✕, body renders `<CopilotClient initialTicker={ticker} />`.
  - Ticker context: derive from `usePathname()` — match `/stock/([^/]+)` or `/intel/stock/([^/]+)`; pass as `initialTicker`.
  - Use P1b primitives (`Button`) where natural; lazy-mount the panel (`{open && <Panel…>}`) so the copilot client only loads when opened.
- [ ] **Step 3:** Mount `<CopilotFab />` in `src/app/(app)/layout.tsx` next to `<TabBar />`. In `TabBar.tsx` remove the 🎩 Copilot tab entry (route `/copilot` stays alive for the expanded view).
- [ ] **Step 4:** `npm run build` clean; `npm test`. Commit `feat(copilot): global overlay (FAB + ⌘K drawer), remove bottom tab`.

### Task 5: verification + merge

- [ ] Preview: `/dashboard` (dev) → FAB visible; ⌘K opens drawer; open a stock page → drawer prefills ticker; screenshot.
- [ ] ARK live check (user's key set in 设置→AI 模型 with provider ark): run a copilot analysis on DeepSeek fallback first, then switch to ark and repeat — verify SSE events stream and verdict arrives. (If the model id differs from `doubao-seed-code`, user corrects it in settings; report actual working id back into providers.ts default.)
- [ ] Final review, merge to main, push.
