import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  readUserLlm: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('./settings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings-store')>();
  return { ...actual, readUserLlm: mocks.readUserLlm };
});
vi.mock('./crypto', () => ({ decrypt: mocks.decrypt }));

import {
  __resetRateLimitForTests,
  apiKeyField,
  LLM_RATE_LIMIT_PER_MINUTE,
  modelField,
  providerField,
  rateLimited,
  readLlmBody,
  requireLlmUser,
  resolveRequestKey,
} from './request-guard';
import { LlmStoreError } from './settings-store';
import { getProvider } from './providers';

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
});

describe('requireLlmUser', () => {
  it('rejects anonymous callers with 401 and a broken auth backend with 503', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    let r = await requireLlmUser();
    expect(r.ok).toBe(false);
    expect((r as { response: Response }).response.status).toBe(401);
    mocks.getUser.mockRejectedValue(new Error('down'));
    r = await requireLlmUser();
    expect((r as { response: Response }).response.status).toBe(503);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    expect(await requireLlmUser()).toEqual({ ok: true, value: { userId: 'u1' } });
  });
});

describe('readLlmBody', () => {
  const req = (body: string, headers: Record<string, string> = {}) => new Request('https://x/api', { method: 'POST', body, headers });
  it('parses a small JSON object', async () => {
    expect(await readLlmBody(req('{"provider":"deepseek"}'))).toEqual({ ok: true, value: { provider: 'deepseek' } });
  });
  it('rejects oversize bodies (declared or actual), arrays and non-JSON', async () => {
    const big = JSON.stringify({ apiKey: 'x'.repeat(9000) });
    expect(((await readLlmBody(req(big))) as { response: Response }).response.status).toBe(413);
    expect(((await readLlmBody(req('{}', { 'content-length': '99999' }))) as { response: Response }).response.status).toBe(413);
    // multibyte: 3,000 CJK characters are 9,000 bytes although only 3,000 UTF-16 units
    expect(((await readLlmBody(req(JSON.stringify({ apiKey: '密'.repeat(3000) })))) as { response: Response }).response.status).toBe(413);
    expect(((await readLlmBody(req('[1]'))) as { response: Response }).response.status).toBe(400);
    expect(((await readLlmBody(req('nope'))) as { response: Response }).response.status).toBe(400);
  });
});

describe('field validators', () => {
  it('providerField accepts registry and legacy ids only', () => {
    expect(providerField('ark')!.id).toBe('doubao');
    expect(providerField('doubao')!.id).toBe('doubao');
    expect(providerField('constructor')).toBeNull();
    expect(providerField(7)).toBeNull();
    expect(providerField('x'.repeat(65))).toBeNull();
  });
  it('modelField applies the model-id pattern', () => {
    expect(modelField('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    expect(modelField('bad model')).toBeNull();
    expect(modelField(1)).toBeNull();
  });
  it('apiKeyField: undefined when absent or empty, null when malformed, else the key', () => {
    expect(apiKeyField(undefined)).toBeUndefined();
    expect(apiKeyField('')).toBeUndefined();
    expect(apiKeyField(null)).toBeUndefined();
    expect(apiKeyField('sk-1')).toBe('sk-1');
    expect(apiKeyField('x'.repeat(513))).toBeNull();
    expect(apiKeyField('sk\n1')).toBeNull();
    expect(apiKeyField(1)).toBeNull();
  });
});

describe('rateLimited', () => {
  it('allows the per-minute budget and refuses the next call until the window slides', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LLM_RATE_LIMIT_PER_MINUTE; i++) expect(rateLimited('u', t0 + i)).toBe(false);
    expect(rateLimited('u', t0 + 100)).toBe(true);
    expect(rateLimited('other', t0 + 100)).toBe(false);
    expect(rateLimited('u', t0 + 60_001)).toBe(false);
  });
});

describe('resolveRequestKey', () => {
  const deepseek = getProvider('deepseek')!;
  const minimax = getProvider('minimax')!;

  it('uses the request key as-is, stored under the storage id, with no version', async () => {
    expect(await resolveRequestKey(minimax, 'sk-req')).toEqual({ ok: true, value: { apiKey: 'sk-req', storedProviderId: 'minimax_cn', version: null } });
    expect(mocks.readUserLlm).not.toHaveBeenCalled();
  });

  it('uses the saved key only for the same provider, reporting the stored id and version', async () => {
    mocks.readUserLlm.mockResolvedValue({ provider: 'minimax', model: 'm', apiKeyCipher: 'c', updatedAt: '2026-10-18T00:00:00.000Z' });
    mocks.decrypt.mockReturnValue('sk-saved');
    expect(await resolveRequestKey(minimax, undefined)).toEqual({ ok: true, value: { apiKey: 'sk-saved', storedProviderId: 'minimax', version: '2026-10-18T00:00:00.000Z' } });
    const r = await resolveRequestKey(deepseek, undefined);
    expect(r.ok).toBe(false);
    expect((r as { response: Response }).response.status).toBe(400);
    expect(await (r as { response: Response }).response.json()).toEqual({ ok: false, error: 'key_required' });
  });

  it('never reads environment keys: no row means key_required even with a platform key configured', async () => {
    process.env.DEEPSEEK_API_KEY = 'platform';
    mocks.readUserLlm.mockResolvedValue(null);
    const r = await resolveRequestKey(deepseek, undefined);
    expect((r as { response: Response }).response.status).toBe(400);
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('tells store failures (503), auth (401) and unreadable keys (500) apart', async () => {
    mocks.readUserLlm.mockRejectedValue(new LlmStoreError('store_unavailable'));
    expect(((await resolveRequestKey(deepseek, undefined)) as { response: Response }).response.status).toBe(503);
    mocks.readUserLlm.mockRejectedValue(new LlmStoreError('not_authenticated'));
    expect(((await resolveRequestKey(deepseek, undefined)) as { response: Response }).response.status).toBe(401);
    mocks.readUserLlm.mockResolvedValue({ provider: 'deepseek', model: 'm', apiKeyCipher: 'c', updatedAt: null });
    mocks.decrypt.mockImplementation(() => { throw new Error('bad'); });
    expect(((await resolveRequestKey(deepseek, undefined)) as { response: Response }).response.status).toBe(500);
  });
});
