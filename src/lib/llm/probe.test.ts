import { afterEach, describe, it, expect, vi } from 'vitest';
import { probeModel } from './probe';
import { getProvider } from './providers';

afterEach(() => { vi.restoreAllMocks(); });

function stub(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('llm/probe', () => {
  it('goes through the real OpenAI adapter with the shared config builder (legacy MiniMax path, 1 token)', async () => {
    const fn = stub({ choices: [{ message: { content: 'pong' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    const r = await probeModel(getProvider('minimax')!, { model: 'MiniMax-Text-01', apiKey: 'k', storedProviderId: 'minimax' });
    expect(r).toEqual({ ok: true, latency_ms: expect.any(Number) });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.minimaxi.com/v1/text/chatcompletion_v2');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'MiniMax-Text-01', max_tokens: 1 });
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });

  it('goes through the real Anthropic adapter for anthropic-protocol providers', async () => {
    const fn = stub({ content: [{ type: 'text', text: 'p' }], usage: { input_tokens: 1, output_tokens: 1 } });
    const r = await probeModel(getProvider('claude')!, { model: 'claude-x', apiKey: 'sk-ant' });
    expect(r).toEqual({ ok: true, latency_ms: expect.any(Number) });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'claude-x', max_tokens: 1 });
  });

  it('reports upstream HTTP failures as a class plus status, without the body', async () => {
    stub({ error: { message: 'Incorrect API key provided: sk-secret' } }, 401);
    const r = await probeModel(getProvider('deepseek')!, { model: 'deepseek-chat', apiKey: 'k' });
    expect(r).toEqual({ ok: false, class: 'auth', status: 401 });
    expect(JSON.stringify(r)).not.toContain('secret');
    stub({}, 404);
    expect(await probeModel(getProvider('deepseek')!, { model: 'nope', apiKey: 'k' })).toEqual({ ok: false, class: 'not_found', status: 404 });
  });

  it('reports a protocol-shape failure as invalid_output', async () => {
    stub({ unexpected: true });
    expect(await probeModel(getProvider('deepseek')!, { model: 'm', apiKey: 'k' })).toEqual({ ok: false, class: 'invalid_output' });
    stub({ type: 'error', error: { type: 'overloaded_error' } });
    expect(await probeModel(getProvider('claude')!, { model: 'm', apiKey: 'k' })).toEqual({ ok: false, class: 'invalid_output' });
  });

  it('reports a network failure as network', async () => {
    global.fetch = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await probeModel(getProvider('deepseek')!, { model: 'm', apiKey: 'k' })).toEqual({ ok: false, class: 'network' });
  });
});
