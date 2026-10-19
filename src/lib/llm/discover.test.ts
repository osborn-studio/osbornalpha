import { describe, it, expect, vi } from 'vitest';
import { discoverModels, DISCOVERY_MAX_BYTES, DISCOVERY_MAX_IDS } from './discover';
import { getProvider } from './providers';

type FetchLike = typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('llm/discover', () => {
  const deepseek = getProvider('deepseek')!;
  const ark = getProvider('ark')!;
  const claude = getProvider('claude')!;

  it('GETs base + discovery_path with Bearer auth for openai-protocol providers, never follows redirects', async () => {
    const f = vi.fn(async () => jsonResponse({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-v4-flash' }] })) as unknown as FetchLike;
    const r = await discoverModels(deepseek, 'sk-1', { fetch: f });
    expect(r).toEqual({ ok: true, latency_ms: expect.any(Number), models: ['deepseek-chat', 'deepseek-v4-flash'], truncated: false });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/models');
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-1');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBeUndefined();
  });

  it('uses the registry auth header plus anthropic-version for anthropic-protocol providers', async () => {
    const f = vi.fn(async () => jsonResponse({ data: [{ id: 'doubao-seed-code' }] })) as unknown as FetchLike;
    await discoverModels(ark, 'ark-key', { fetch: f });
    let [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/coding/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ark-key');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');

    await discoverModels(claude, 'sk-ant', { fetch: f });
    [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('filters ids by the model-id pattern, dedupes and sorts', async () => {
    const f = (async () => jsonResponse({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { id: 'bad id' }, { id: 7 }, null] })) as unknown as FetchLike;
    const r = await discoverModels(deepseek, 'k', { fetch: f });
    expect(r).toMatchObject({ ok: true, models: ['a', 'b'] });
  });

  it('marks the result truncated when over the id cap or when the provider signals more pages', async () => {
    const many = Array.from({ length: DISCOVERY_MAX_IDS + 1 }, (_, i) => ({ id: `m${String(i).padStart(4, '0')}` }));
    let r = await discoverModels(deepseek, 'k', { fetch: (async () => jsonResponse({ data: many })) as unknown as FetchLike });
    expect(r).toMatchObject({ ok: true, truncated: true });
    expect((r as { models: string[] }).models).toHaveLength(DISCOVERY_MAX_IDS);
    r = await discoverModels(deepseek, 'k', { fetch: (async () => jsonResponse({ data: [{ id: 'a' }], has_more: true })) as unknown as FetchLike });
    expect(r).toMatchObject({ ok: true, truncated: true });
    r = await discoverModels(deepseek, 'k', { fetch: (async () => jsonResponse({ data: [{ id: 'a' }], next_page: 'tok' })) as unknown as FetchLike });
    expect(r).toMatchObject({ ok: true, truncated: true });
  });

  it('classifies 401/403 as auth, 404/405 as discovery_unsupported, 429 and 5xx by status; never carries the body', async () => {
    const cases: Array<[number, string]> = [[401, 'auth'], [403, 'auth'], [404, 'discovery_unsupported'], [405, 'discovery_unsupported'], [429, 'rate_limited'], [502, 'server_error'], [400, 'bad_request']];
    for (const [status, cls] of cases) {
      const r = await discoverModels(deepseek, 'k', { fetch: (async () => new Response('{"error":"secret-upstream-text"}', { status })) as unknown as FetchLike });
      expect(r).toEqual({ ok: false, class: cls, status });
      expect(JSON.stringify(r)).not.toContain('secret');
    }
  });

  it('classifies a non-JSON or non-list body as invalid_output', async () => {
    let r = await discoverModels(deepseek, 'k', { fetch: (async () => new Response('<html>', { status: 200 })) as unknown as FetchLike });
    expect(r).toEqual({ ok: false, class: 'invalid_output', status: 200 });
    r = await discoverModels(deepseek, 'k', { fetch: (async () => jsonResponse({ models: [] })) as unknown as FetchLike });
    expect(r).toEqual({ ok: false, class: 'invalid_output', status: 200 });
  });

  it('aborts a body over the byte limit without parsing it', async () => {
    const big = JSON.stringify({ data: [{ id: 'x'.repeat(DISCOVERY_MAX_BYTES) }] });
    const r = await discoverModels(deepseek, 'k', { fetch: (async () => new Response(big, { status: 200 })) as unknown as FetchLike });
    expect(r).toEqual({ ok: false, class: 'invalid_output', status: 200 });
  });

  it('classifies an abort as timeout and a fetch TypeError as network', async () => {
    const slow = ((_: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as FetchLike;
    expect(await discoverModels(deepseek, 'k', { fetch: slow, timeoutMs: 5 })).toEqual({ ok: false, class: 'timeout' });
    const refused = (async () => { throw new TypeError('fetch failed'); }) as unknown as FetchLike;
    expect(await discoverModels(deepseek, 'k', { fetch: refused })).toEqual({ ok: false, class: 'network' });
  });
});
