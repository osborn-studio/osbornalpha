import { describe, expect, it, vi, afterEach } from 'vitest';
import { chat, toolChat, type LlmConfig } from './openai-compat';

const CFG: LlmConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test-123',
  model: 'test-model',
};

function mockFetch(canned: unknown) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => canned, text: async () => '' }));
  // @ts-expect-error test stub
  global.fetch = fn;
  return fn;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('chat', () => {
  it('preserves DeepSeek cache usage and sends Bearer auth to the right URL', async () => {
    const fn = mockFetch({
      choices: [{ message: { content: '你好' } }],
      usage: {
        prompt_tokens: 100,
        prompt_cache_hit_tokens: 60,
        prompt_cache_miss_tokens: 40,
        completion_tokens: 25,
      },
    });
    const r = await chat(CFG, { system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('你好');
    expect(r.usage).toEqual({
      inputTokens: 100,
      cacheHitInputTokens: 60,
      cacheMissInputTokens: 40,
      outputTokens: 25,
      estimated: false,
    });
    const [url, init] = fn.mock.calls[0] as unknown as [string, any];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test-123');
    expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('test-model');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('ignores authHeader/authPrefix overrides: the OpenAI wire format is always Bearer', async () => {
    const fn = mockFetch({ choices: [{ message: { content: 'x' } }], usage: {} });
    await chat({ ...CFG, authHeader: 'x-goog-api-key', authPrefix: '' }, { messages: [{ role: 'user', content: 'hi' }] });
    const init = (fn.mock.calls[0] as any)[1];
    expect(init.headers.Authorization).toBe('Bearer sk-test-123');
    expect(init.headers['x-goog-api-key']).toBeUndefined();
  });

  it('uses chatPath override (e.g. MiniMax)', async () => {
    const fn = mockFetch({ choices: [{ message: { content: 'x' } }], usage: {} });
    await chat({ ...CFG, chatPath: '/text/chatcompletion_v2' }, { messages: [{ role: 'user', content: 'hi' }] });
    expect((fn.mock.calls[0] as any)[0]).toBe('https://api.example.com/v1/text/chatcompletion_v2');
  });

  it('treats OpenAI prompt tokens without cache breakdown as cache misses', async () => {
    mockFetch({
      choices: [{ message: { content: 'x' } }],
      usage: { prompt_tokens: 100, completion_tokens: 25 },
    });

    const r = await chat(CFG, { messages: [{ role: 'user', content: 'hi' }] });

    expect(r.usage).toEqual({
      inputTokens: 100,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 100,
      outputTokens: 25,
      estimated: false,
    });
  });

  it('marks malformed provider usage as estimated', async () => {
    mockFetch({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: '100' } });

    const r = await chat(CFG, { messages: [{ role: 'user', content: 'hi' }] });

    expect(r.usage).toEqual({
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      estimated: true,
    });
  });
});

describe('toolChat', () => {
  it('maps tools to function format and parses tool_calls with JSON arguments', async () => {
    const fn = mockFetch({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: 't1', function: { name: 'radar', arguments: '{"ticker":"NVDA"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    });
    const r = await toolChat(CFG, {
      messages: [{ role: 'user', content: 'analyze' }],
      tools: [{ name: 'radar', description: 'get radar', parameters: { type: 'object' } }],
    });
    expect(r.content).toBe('');
    expect(r.toolCalls).toEqual([{ id: 't1', name: 'radar', arguments: { ticker: 'NVDA' } }]);
    expect(r.finishReason).toBe('tool_calls');
    expect(r.usage).toEqual({
      inputTokens: 5,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 5,
      outputTokens: 3,
      estimated: false,
    });
    const body = JSON.parse((fn.mock.calls[0] as any)[1].body);
    expect(body.tools[0].type).toBe('function');
    expect(body.tools[0].function.name).toBe('radar');
    expect(body.tool_choice).toBe('auto');
  });

  it('tolerates unparseable tool arguments → {}', async () => {
    mockFetch({
      choices: [{ message: { content: '', tool_calls: [{ id: 't2', function: { name: 'x', arguments: 'not json' } }] }, finish_reason: 'tool_calls' }],
      usage: {},
    });
    const r = await toolChat(CFG, { messages: [], tools: [] });
    expect(r.toolCalls[0].arguments).toEqual({});
  });

  it('can disable DeepSeek thinking mode for multi-turn tool workflows', async () => {
    const fn = mockFetch({
      choices: [{ message: { content: '完成', tool_calls: [] }, finish_reason: 'stop' }],
      usage: {},
    });

    await toolChat(CFG, { messages: [], tools: [], thinking: 'disabled' });

    const body = JSON.parse((fn.mock.calls[0] as any)[1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });
});

describe('error handling', () => {
  it('throws on non-ok responses', async () => {
    // @ts-expect-error test stub
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' }));
    await expect(chat(CFG, { messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow('llm 401: unauthorized');
  });

  it('truncates a non-ok body to 64 KB in the thrown message', async () => {
    const big = 'x'.repeat(100_000);
    global.fetch = vi.fn(async () => new Response(big, { status: 500 }));
    await expect(chat(CFG, { messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/^llm 500: x{65536}$/);
  });
});

describe('response shape validation', () => {
  const MSG = { messages: [{ role: 'user' as const, content: 'hi' }] };
  it.each([
    ['no choices', {}],
    ['empty choices', { choices: [] }],
    ['message not an object', { choices: [{ message: 'x' }] }],
    ['content not a string', { choices: [{ message: { content: 123 } }] }],
    ['tool_calls not an array', { choices: [{ message: { content: null, tool_calls: {} } }] }],
    ['tool_call without function name', { choices: [{ message: { content: null, tool_calls: [{ id: '1', function: { arguments: '{}' } }] } }] }],
  ])('rejects %s as LlmResponseShapeError', async (_label, canned) => {
    mockFetch(canned);
    await expect(chat(CFG, MSG)).rejects.toMatchObject({ name: 'LlmResponseShapeError' });
    await expect(toolChat(CFG, { messages: [], tools: [] })).rejects.toMatchObject({ name: 'LlmResponseShapeError' });
  });

  it('accepts tool_calls: null (some providers send it on plain text turns)', async () => {
    mockFetch({ choices: [{ message: { content: 'text', tool_calls: null } }] });
    await expect(chat(CFG, MSG)).resolves.toMatchObject({ content: 'text' });
    await expect(toolChat(CFG, { messages: [], tools: [] })).resolves.toMatchObject({ content: 'text', toolCalls: [] });
  });

  it('accepts a null content with well-formed tool_calls and an omitted content', async () => {
    mockFetch({ choices: [{ message: { content: null, tool_calls: [{ id: '1', function: { name: 'f', arguments: '{}' } }] } }] });
    await expect(toolChat(CFG, { messages: [], tools: [] })).resolves.toMatchObject({ toolCalls: [{ id: '1', name: 'f' }] });
    mockFetch({ choices: [{ message: {} }] });
    await expect(chat(CFG, MSG)).resolves.toMatchObject({ content: '' });
  });

  it('reads a streamed JSON body within maxResponseBytes and rejects one over it', async () => {
    const ok = JSON.stringify({ choices: [{ message: { content: 'streamed' } }] });
    global.fetch = vi.fn(async () => new Response(ok, { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(chat({ ...CFG, maxResponseBytes: 1024 }, MSG)).resolves.toMatchObject({ content: 'streamed' });
    const huge = JSON.stringify({ choices: [{ message: { content: 'y'.repeat(5000) } }] });
    global.fetch = vi.fn(async () => new Response(huge, { status: 200 }));
    await expect(chat({ ...CFG, maxResponseBytes: 1024 }, MSG)).rejects.toMatchObject({ name: 'LlmResponseShapeError' });
  });
});
