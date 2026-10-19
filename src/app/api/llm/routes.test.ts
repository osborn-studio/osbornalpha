import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  readUserLlm: vi.fn(),
  saveUserLlm: vi.fn(),
  updateUserLlmModel: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  discoverModels: vi.fn(),
  probeModel: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/llm/settings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/settings-store')>();
  return { ...actual, readUserLlm: mocks.readUserLlm, saveUserLlm: mocks.saveUserLlm, updateUserLlmModel: mocks.updateUserLlmModel };
});
vi.mock('@/lib/llm/crypto', () => ({ decrypt: mocks.decrypt, encrypt: mocks.encrypt }));
vi.mock('@/lib/llm/discover', () => ({ discoverModels: mocks.discoverModels }));
vi.mock('@/lib/llm/probe', () => ({ probeModel: mocks.probeModel }));

import { GET as catalogGet } from './catalog/route';
import { POST as discoverPost } from './discover/route';
import { POST as testPost } from './test/route';
import { GET as settingsGet, POST as settingsPost } from './settings/route';
import { __resetRateLimitForTests, LLM_RATE_LIMIT_PER_MINUTE } from '@/lib/llm/request-guard';

const post = (path: string, body: unknown) => new Request(`https://x/api/llm/${path}`, { method: 'POST', body: JSON.stringify(body) });
const json = async (r: Response) => ({ status: r.status, body: await r.json() });

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mocks.readUserLlm.mockResolvedValue(null);
  mocks.decrypt.mockReturnValue('sk-saved');
  mocks.encrypt.mockImplementation((k: string) => `enc(${k})`);
});

describe('GET /api/llm/catalog', () => {
  it('lists every derived provider without secrets and models for one provider with reference prices', async () => {
    const all = await json(await catalogGet(new Request('https://x/api/llm/catalog')));
    expect(all.status).toBe(200);
    expect(all.body.providers.map((p: { id: string }) => p.id)).toContain('doubao');
    expect(all.body.providers).toHaveLength(14);
    expect(JSON.stringify(all.body)).not.toMatch(/api_key_cipher|secret|env/i);
    const ds = all.body.providers.find((p: { id: string }) => p.id === 'deepseek');
    expect(ds).toEqual({ id: 'deepseek', legacyId: 'deepseek', label: 'DeepSeek（深度求索）', protocol: 'openai', region: 'cn', suggestedModel: 'deepseek-v4-flash', keyUrl: 'https://platform.deepseek.com/api_keys', docsUrl: 'https://api-docs.deepseek.com/' });

    const one = await json(await catalogGet(new Request('https://x/api/llm/catalog?provider=kimi')));
    expect(one.body.provider).toBe('kimi_cn');
    const ids = one.body.models.map((m: { id: string }) => m.id);
    expect(ids).toContain('kimi-k3');
    expect(ids.every((id: string) => !/embedding|tts/i.test(id))).toBe(true);
    const k3 = one.body.models.find((m: { id: string }) => m.id === 'kimi-k3');
    expect(k3).toMatchObject({ context: expect.any(Number), output: expect.any(Number), price: { input: expect.any(Number), output: expect.any(Number), reference: true } });

    expect((await catalogGet(new Request('https://x/api/llm/catalog?provider=nope'))).status).toBe(404);
    // doubao entries are hand-written overrides: present, unpriced, with a verification hint
    const doubao = await json(await catalogGet(new Request('https://x/api/llm/catalog?provider=doubao')));
    expect(doubao.body.models.map((m: { id: string }) => m.id)).toContain('doubao-seed-code');
    expect(doubao.body.models.find((m: { id: string }) => m.id === 'doubao-seed-code')).toMatchObject({ price: null, hint: expect.stringContaining('待核对') });
  });
});

describe('POST /api/llm/discover', () => {
  it('requires a signed-in user and rate-limits per user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await discoverPost(post('discover', { provider: 'deepseek', apiKey: 'k' }))).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mocks.discoverModels.mockResolvedValue({ ok: true, latency_ms: 1, models: [], truncated: false });
    for (let i = 0; i < LLM_RATE_LIMIT_PER_MINUTE; i++) {
      expect((await discoverPost(post('discover', { provider: 'deepseek', apiKey: 'k' }))).status).toBe(200);
    }
    expect((await discoverPost(post('discover', { provider: 'deepseek', apiKey: 'k' }))).status).toBe(429);
  });

  it('validates provider and apiKey before any upstream call', async () => {
    expect(await json(await discoverPost(post('discover', { provider: 'constructor', apiKey: 'k' })))).toEqual({ status: 400, body: { ok: false, error: 'unknown_provider' } });
    expect(await json(await discoverPost(post('discover', { provider: 'deepseek', apiKey: 'bad\nkey' })))).toEqual({ status: 400, body: { ok: false, error: 'invalid_api_key' } });
    expect(mocks.discoverModels).not.toHaveBeenCalled();
  });

  it('runs discovery with the request key and returns the sanitized result', async () => {
    mocks.discoverModels.mockResolvedValue({ ok: true, latency_ms: 42, models: ['deepseek-chat'], truncated: false });
    const r = await json(await discoverPost(post('discover', { provider: 'deepseek', apiKey: 'sk-req' })));
    expect(r).toEqual({ status: 200, body: { ok: true, latency_ms: 42, models: ['deepseek-chat'], truncated: false, provider: 'deepseek', key_source: 'request' } });
    expect(mocks.discoverModels.mock.calls[0][0].id).toBe('deepseek');
    expect(mocks.discoverModels.mock.calls[0][1]).toBe('sk-req');
  });

  it('uses the saved key only for the saved provider and never echoes it', async () => {
    mocks.readUserLlm.mockResolvedValue({ provider: 'ark', model: 'm', apiKeyCipher: 'c', updatedAt: 'v1' });
    mocks.discoverModels.mockResolvedValue({ ok: false, class: 'auth', status: 401 });
    const r = await json(await discoverPost(post('discover', { provider: 'doubao' })));
    expect(r).toEqual({ status: 200, body: { ok: false, class: 'auth', status: 401, provider: 'doubao', key_source: 'saved' } });
    expect(mocks.discoverModels.mock.calls[0][1]).toBe('sk-saved');
    expect(JSON.stringify(r.body)).not.toContain('sk-saved');
    expect(await json(await discoverPost(post('discover', { provider: 'deepseek' })))).toEqual({ status: 400, body: { ok: false, error: 'key_required' } });
  });
});

describe('POST /api/llm/test', () => {
  it('probes with the saved key, the stored provider id (legacy path) and returns the saved version', async () => {
    mocks.readUserLlm.mockResolvedValue({ provider: 'minimax', model: 'MiniMax-Text-01', apiKeyCipher: 'c', updatedAt: 'v7' });
    mocks.probeModel.mockResolvedValue({ ok: true, latency_ms: 9 });
    const r = await json(await testPost(post('test', { provider: 'minimax_cn', model: 'MiniMax-Text-01' })));
    expect(r).toEqual({ status: 200, body: { ok: true, latency_ms: 9, provider: 'minimax_cn', model: 'MiniMax-Text-01', key_source: 'saved', version: 'v7' } });
    expect(mocks.probeModel.mock.calls[0][1]).toEqual({ model: 'MiniMax-Text-01', apiKey: 'sk-saved', storedProviderId: 'minimax' });
  });

  it('probes with a request key under the storage id and reports failures as class + status only', async () => {
    mocks.probeModel.mockResolvedValue({ ok: false, class: 'not_found', status: 404 });
    const r = await json(await testPost(post('test', { provider: 'minimax', model: 'MiniMax-M3', apiKey: 'sk-new' })));
    expect(r).toEqual({ status: 200, body: { ok: false, class: 'not_found', status: 404, provider: 'minimax_cn', model: 'MiniMax-M3', key_source: 'request', version: null } });
    expect(mocks.probeModel.mock.calls[0][1]).toEqual({ model: 'MiniMax-M3', apiKey: 'sk-new', storedProviderId: 'minimax_cn' });
  });

  it('rejects a malformed model before any call', async () => {
    expect(await json(await testPost(post('test', { provider: 'deepseek', model: 'bad model', apiKey: 'k' })))).toEqual({ status: 400, body: { ok: false, error: 'invalid_model' } });
    expect(mocks.probeModel).not.toHaveBeenCalled();
  });
});

describe('/api/llm/settings', () => {
  it('GET reports the saved row with registry id, stored id, version and legacy-path flag', async () => {
    mocks.readUserLlm.mockResolvedValue({ provider: 'minimax', model: 'MiniMax-Text-01', apiKeyCipher: 'c', updatedAt: 'v1' });
    expect((await json(await settingsGet())).body).toEqual({ provider: 'minimax_cn', legacyId: 'minimax', storedProvider: 'minimax', model: 'MiniMax-Text-01', configured: true, version: 'v1', legacyPath: true, known: true });
    mocks.readUserLlm.mockResolvedValue({ provider: 'ark', model: 'doubao-seed-code', apiKeyCipher: 'c', updatedAt: 'v2' });
    expect((await json(await settingsGet())).body).toMatchObject({ provider: 'doubao', legacyId: 'ark', legacyPath: false });
    mocks.readUserLlm.mockResolvedValue(null);
    expect((await json(await settingsGet())).body).toMatchObject({ provider: null, configured: false, version: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await settingsGet()).status).toBe(401);
  });

  it('POST with a key encrypts it and upserts under the storage id', async () => {
    mocks.saveUserLlm.mockResolvedValue({ version: 'v9' });
    const r = await json(await settingsPost(post('settings', { provider: 'minimax', model: 'MiniMax-M3', apiKey: 'sk-new' })));
    expect(r).toEqual({ status: 200, body: { ok: true, provider: 'minimax_cn', legacyId: 'minimax', storedProvider: 'minimax_cn', model: 'MiniMax-M3', version: 'v9', legacyPath: false } });
    expect(mocks.saveUserLlm).toHaveBeenCalledWith({ storageId: 'minimax_cn', model: 'MiniMax-M3', apiKeyCipher: 'enc(sk-new)' });
    const ark = await json(await settingsPost(post('settings', { provider: 'doubao', model: 'doubao-seed-code', apiKey: 'k' })));
    expect(ark.body).toMatchObject({ provider: 'doubao', storedProvider: 'ark' });
    expect(mocks.saveUserLlm).toHaveBeenLastCalledWith(expect.objectContaining({ storageId: 'ark' }));
  });

  it('POST without a key atomically updates the model of the same provider, else key_required', async () => {
    mocks.updateUserLlmModel.mockResolvedValue({ version: 'v10' });
    const r = await json(await settingsPost(post('settings', { provider: 'minimax_cn', model: 'MiniMax-M3' })));
    expect(r.body).toMatchObject({ ok: true, storedProvider: 'minimax_cn', version: 'v10' });
    expect(mocks.updateUserLlmModel).toHaveBeenCalledWith({ storageId: 'minimax_cn', providerCandidates: ['minimax_cn', 'minimax'], model: 'MiniMax-M3' });
    expect(mocks.encrypt).not.toHaveBeenCalled();
    mocks.updateUserLlmModel.mockResolvedValue(null);
    expect(await json(await settingsPost(post('settings', { provider: 'deepseek', model: 'deepseek-chat' })))).toEqual({ status: 400, body: { ok: false, error: 'key_required' } });
  });

  it('POST validates fields and tells store failures from auth failures', async () => {
    expect((await settingsPost(post('settings', { provider: 'deepseek', model: 'bad model', apiKey: 'k' }))).status).toBe(400);
    expect((await settingsPost(post('settings', { provider: 'nope', model: 'm', apiKey: 'k' }))).status).toBe(400);
    mocks.saveUserLlm.mockRejectedValue(Object.assign(new Error('store_unavailable'), { kind: 'store_unavailable' }));
    const { LlmStoreError } = await import('@/lib/llm/settings-store');
    mocks.saveUserLlm.mockRejectedValue(new LlmStoreError('store_unavailable'));
    expect((await settingsPost(post('settings', { provider: 'deepseek', model: 'm', apiKey: 'k' }))).status).toBe(503);
    mocks.encrypt.mockImplementation(() => { throw new Error('LLM_ENC_KEY not configured'); });
    expect(await json(await settingsPost(post('settings', { provider: 'deepseek', model: 'm', apiKey: 'k' })))).toEqual({ status: 500, body: { ok: false, error: 'encryption_not_configured' } });
  });
});
