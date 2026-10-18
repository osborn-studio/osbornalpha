import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));

import { getUserLlm, LlmStoreError, readUserLlm, saveUserLlm, updateUserLlmModel } from './settings-store';

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'update', 'upsert', 'maybeSingle']) {
    c[m] = vi.fn(() => (m === 'maybeSingle' ? Promise.resolve(result) : c));
  }
  // the last call in an update chain is select(); make it thenable
  (c as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return c as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('readUserLlm / getUserLlm', () => {
  it('returns the row with its version', async () => {
    mocks.from.mockReturnValue(chain({ data: { provider: 'ark', model: 'm', api_key_cipher: 'c', updated_at: '2026-10-18T01:00:00.000Z' }, error: null }));
    expect(await readUserLlm()).toEqual({ provider: 'ark', model: 'm', apiKeyCipher: 'c', updatedAt: '2026-10-18T01:00:00.000Z' });
  });
  it('readUserLlm throws typed errors; getUserLlm folds them into null (resolve.ts contract)', async () => {
    mocks.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    await expect(readUserLlm()).rejects.toMatchObject({ kind: 'store_unavailable' });
    expect(await getUserLlm()).toBeNull();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(readUserLlm()).rejects.toBeInstanceOf(LlmStoreError);
    expect(await getUserLlm()).toBeNull();
  });
});

describe('saveUserLlm', () => {
  it('upserts the storage id, model and ciphertext and returns the version it wrote', async () => {
    const c = chain({ data: null, error: null });
    mocks.from.mockReturnValue(c);
    const { version } = await saveUserLlm({ storageId: 'minimax_cn', model: 'MiniMax-M3', apiKeyCipher: 'cipher' });
    expect(c.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', provider: 'minimax_cn', model: 'MiniMax-M3', api_key_cipher: 'cipher', updated_at: version },
      { onConflict: 'user_id' },
    );
    expect(new Date(version).toISOString()).toBe(version);
  });
});

describe('updateUserLlmModel', () => {
  it('updates model and stored provider for a matching row without touching the ciphertext', async () => {
    const c = chain({ data: [{ updated_at: 'x' }], error: null });
    mocks.from.mockReturnValue(c);
    const r = await updateUserLlmModel({ storageId: 'minimax_cn', providerCandidates: ['minimax_cn', 'minimax'], model: 'MiniMax-M3' });
    expect(r).toEqual({ version: expect.any(String) });
    const payload = c.update.mock.calls[0][0];
    expect(payload).toEqual({ provider: 'minimax_cn', model: 'MiniMax-M3', updated_at: r!.version });
    expect(payload).not.toHaveProperty('api_key_cipher');
    expect(c.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(c.in).toHaveBeenCalledWith('provider', ['minimax_cn', 'minimax']);
  });
  it('returns null when no row matched (no row, or another provider saved)', async () => {
    mocks.from.mockReturnValue(chain({ data: [], error: null }));
    expect(await updateUserLlmModel({ storageId: 'deepseek', providerCandidates: ['deepseek'], model: 'm' })).toBeNull();
  });
  it('throws store_unavailable on a database error', async () => {
    mocks.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    await expect(updateUserLlmModel({ storageId: 'deepseek', providerCandidates: ['deepseek'], model: 'm' })).rejects.toMatchObject({ kind: 'store_unavailable' });
  });
});
