import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./settings-store', () => ({
  getUserLlm: vi.fn(),
}));

vi.mock('./crypto', () => ({
  decrypt: vi.fn(),
}));

import { resolveLlm } from './resolve';
import { getUserLlm } from './settings-store';
import { decrypt } from './crypto';

const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'ARK_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'MINIMAX_API_KEY',
] as const;

const ORIGINAL_ENV: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    ORIGINAL_ENV[k] = process.env[k];
    delete process.env[k];
  }
  vi.mocked(getUserLlm).mockReset();
  vi.mocked(decrypt).mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = ORIGINAL_ENV[k];
    }
  }
});

describe('resolveLlm', () => {
  it('falls back to env (ARK default) when no per-user row exists', async () => {
    vi.mocked(getUserLlm).mockResolvedValue(null);
    process.env.ARK_API_KEY = 'ark-test';

    const r = await resolveLlm();

    expect(r).toEqual(
      expect.objectContaining({
        provider: 'ark',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
        model: 'doubao-seed-code',
        apiKey: 'ark-test',
        protocol: 'anthropic',
        source: 'env',
      })
    );
  });

  it('uses per-user settings (deepseek) when present and decryptable', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKeyCipher: 'cipher',
    });
    vi.mocked(decrypt).mockReturnValue('sk-user');

    const r = await resolveLlm();

    expect(r).not.toBeNull();
    expect(r!.provider).toBe('deepseek');
    expect(r!.apiKey).toBe('sk-user');
    expect(r!.protocol).toBe('openai');
    expect(r!.source).toBe('user');
  });

  it('uses DeepSeek V4 Flash when the platform model is not overridden', async () => {
    vi.mocked(getUserLlm).mockResolvedValue(null);
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';

    const r = await resolveLlm();

    expect(r).toEqual(expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      source: 'env',
    }));
  });
});
