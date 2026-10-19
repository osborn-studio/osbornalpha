import { afterEach, describe, it, expect, vi } from 'vitest';
import { anthropicChat, anthropicToolChat, oaiToAnthropic, toolDefsToAnthropic, responseToTurn } from './anthropic-compat';

afterEach(() => { vi.restoreAllMocks(); });

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
      usage: { input_tokens: 100, output_tokens: 25 },
    });
    expect(turn).toEqual({
      content: '结论',
      toolCalls: [{ id: 'c9', name: 'get_quote', arguments: { ticker: '0700' } }],
      finishReason: 'tool_use',
      usage: {
        inputTokens: 100,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 100,
        outputTokens: 25,
        estimated: false,
      },
    });
  });

  it('adds Anthropic input and cache counters into one normalized total', () => {
    const turn = responseToTurn({
      content: [],
      usage: {
        input_tokens: 50,
        output_tokens: 25,
        cache_read_input_tokens: 100_000,
        cache_creation_input_tokens: 25,
      },
    });

    expect(turn.usage).toEqual({
      inputTokens: 100_075,
      cacheHitInputTokens: 100_000,
      cacheMissInputTokens: 75,
      outputTokens: 25,
      estimated: false,
    });
  });

  it('marks missing Anthropic usage as estimated', () => {
    expect(responseToTurn({ content: [] }).usage).toEqual({
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: true,
    });
  });
});

describe('anthropicChat', () => {
  it('preserves normalized usage for plain-text completions', async () => {
    // @ts-expect-error test stub
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'answer' }],
        usage: { input_tokens: 100, output_tokens: 25 },
      }),
    }));

    await expect(anthropicChat(
      { baseUrl: 'https://api.example.com', apiKey: 'sk-test', model: 'claude-test' },
      { messages: [{ role: 'user', content: 'hi' }] },
    )).resolves.toEqual({
      content: 'answer',
      usage: {
        inputTokens: 100,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 100,
        outputTokens: 25,
        estimated: false,
      },
    });
  });
});

describe('anthropicToolChat auth', () => {
  it('defaults to Authorization: Bearer (ARK), never follows redirects', async () => {
    const fn = vi.fn(async () => ({ ok: true, json: async () => ({ content: [], usage: { input_tokens: 1, output_tokens: 1 } }) }));
    // @ts-expect-error test stub
    global.fetch = fn;
    await anthropicChat({ baseUrl: 'https://ark.example/api/coding', apiKey: 'ark-key', model: 'm' }, { messages: [{ role: 'user', content: 'hi' }] });
    const [url, init] = fn.mock.calls[0] as unknown as [string, any];
    expect(url).toBe('https://ark.example/api/coding/v1/messages');
    expect(init.headers.Authorization).toBe('Bearer ark-key');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.redirect).toBe('error');
  });

  it('uses the configured auth header and prefix (Claude: x-api-key with no prefix)', async () => {
    const fn = vi.fn(async () => ({ ok: true, json: async () => ({ content: [], usage: { input_tokens: 1, output_tokens: 1 } }) }));
    // @ts-expect-error test stub
    global.fetch = fn;
    await anthropicChat(
      { baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant', model: 'm', authHeader: 'x-api-key', authPrefix: '' },
      { messages: [{ role: 'user', content: 'hi' }] },
    );
    const init = (fn.mock.calls[0] as any)[1];
    expect(init.headers['x-api-key']).toBe('sk-ant');
    expect(init.headers.Authorization).toBeUndefined();
  });
});

describe('anthropic response shape validation', () => {
  const stub = (canned: unknown) => {
    // @ts-expect-error test stub
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => canned }));
  };
  it.each([
    ['error envelope', { type: 'error', error: { type: 'authentication_error', message: 'bad key' } }],
    ['content missing', {}],
    ['content not an array', { content: 'x' }],
    ['null block', { content: [null] }],
    ['block without type', { content: [{ text: 'x' }] }],
    ['text block without string text', { content: [{ type: 'text', text: 1 }] }],
    ['tool_use block without id', { content: [{ type: 'tool_use', name: 'f', input: {} }] }],
  ])('rejects %s as LlmResponseShapeError', async (_label, canned) => {
    stub(canned);
    await expect(anthropicChat({ baseUrl: 'https://a.example', apiKey: 'k', model: 'm' }, { messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toMatchObject({ name: 'LlmResponseShapeError' });
  });

  it('accepts text and tool_use blocks and unknown block types', async () => {
    stub({ content: [{ type: 'text', text: 'a' }, { type: 'tool_use', id: 't1', name: 'f', input: { q: 1 } }, { type: 'thinking', thinking: '...' }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } });
    await expect(anthropicToolChat({ baseUrl: 'https://a.example', apiKey: 'k', model: 'm' }, { messages: [{ role: 'user', content: 'hi' }], tools: [] }))
      .resolves.toMatchObject({ content: 'a', toolCalls: [{ id: 't1', name: 'f', arguments: { q: 1 } }], finishReason: 'tool_use' });
  });
});

describe('empty-content hardening', () => {
  it('never emits an empty text block (Anthropic 400 guard)', () => {
    const out = oaiToAnthropic([{ role: 'user', content: '' }]);
    expect(out[0].content).toEqual([{ type: 'text', text: ' ' }]);
  });
});
