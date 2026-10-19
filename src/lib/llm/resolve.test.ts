import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./settings-store', () => ({
  getUserLlm: vi.fn(),
}));

vi.mock('./crypto', () => ({
  decrypt: vi.fn(),
}));

import { resolveLlm, resolvePlatformLlm, resolveUserLlm } from './resolve';
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
  it('uses the only configured ARK environment key when no per-user row exists', async () => {
    vi.mocked(getUserLlm).mockResolvedValue(null);
    process.env.ARK_API_KEY = 'ark-test';

    const r = await resolveLlm();

    expect(r).toEqual(
      expect.objectContaining({
        provider: 'doubao',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
        chatPath: '/v1/messages',
        model: 'doubao-seed-code',
        apiKey: 'ark-test',
        protocol: 'anthropic',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        source: 'env',
      })
    );
  });

  it('uses per-user settings (deepseek) when present and decryptable', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKeyCipher: 'cipher', updatedAt: null,
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

describe('resolvePlatformLlm', () => {
  it('selects DeepSeek V4 Flash when DeepSeek is the only configured platform key', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';

    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-test',
      source: 'env',
    }));
  });

  it('keeps an explicit ARK provider authoritative when its key is configured', () => {
    process.env.LLM_PROVIDER = 'ark';
    process.env.ARK_API_KEY = 'ark-test';
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';

    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({
      provider: 'doubao',
      model: 'doubao-seed-code',
      apiKey: 'ark-test',
    }));
  });

  it('accepts the registry id in LLM_PROVIDER as well as the legacy id', () => {
    process.env.LLM_PROVIDER = 'doubao';
    process.env.ARK_API_KEY = 'ark-test';

    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({ provider: 'doubao', apiKey: 'ark-test' }));
  });

  it('keeps the env-fallback default models byte for byte for all five legacy providers', () => {
    const cases: Array<[string, string, string]> = [
      ['ark', 'ARK_API_KEY', 'doubao-seed-code'],
      ['deepseek', 'DEEPSEEK_API_KEY', 'deepseek-v4-flash'],
      ['openai', 'OPENAI_API_KEY', 'gpt-4o'],
      ['kimi', 'KIMI_API_KEY', 'moonshot-v1-32k'],
      ['minimax', 'MINIMAX_API_KEY', 'MiniMax-Text-01'],
    ];
    for (const [legacy, envKey, model] of cases) {
      for (const k of ENV_KEYS) delete process.env[k];
      process.env.LLM_PROVIDER = legacy;
      process.env[envKey] = 'k';
      expect(resolvePlatformLlm()).toEqual(expect.objectContaining({ model, apiKey: 'k', source: 'env' }));
    }
  });

  it('keeps LLM_PROVIDER=minimax on the legacy chat path for any model; minimax_cn uses the registry path', () => {
    process.env.LLM_PROVIDER = 'minimax';
    process.env.MINIMAX_API_KEY = 'k';
    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({
      provider: 'minimax_cn',
      baseUrl: 'https://api.minimaxi.com/v1',
      chatPath: '/text/chatcompletion_v2',
      model: 'MiniMax-Text-01',
    }));
    process.env.LLM_MODEL = 'MiniMax-M3';
    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({ chatPath: '/text/chatcompletion_v2', model: 'MiniMax-M3' }));
    process.env.LLM_PROVIDER = 'minimax_cn';
    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({ chatPath: '/chat/completions', model: 'MiniMax-M3' }));
  });

  it('keeps the legacy MiniMax path for the unpinned auto fallback (only MINIMAX_API_KEY set)', () => {
    process.env.MINIMAX_API_KEY = 'k';
    process.env.LLM_PROVIDER = '  ';
    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({ chatPath: '/text/chatcompletion_v2' }));
    delete process.env.LLM_PROVIDER;
    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({
      provider: 'minimax_cn',
      baseUrl: 'https://api.minimaxi.com/v1',
      chatPath: '/text/chatcompletion_v2',
      model: 'MiniMax-Text-01',
    }));
  });

  it('never resolves a registry provider without an Alpha env binding from the environment', () => {
    process.env.LLM_PROVIDER = 'zhipu';
    process.env.ZHIPU_API_KEY = 'k';
    expect(resolvePlatformLlm()).toBeNull();
    delete process.env.LLM_PROVIDER;
    expect(resolvePlatformLlm()).toBeNull();
  });

  it('fails closed when an explicit provider is missing its own key', () => {
    process.env.LLM_PROVIDER = 'ark';
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';

    expect(resolvePlatformLlm()).toBeNull();
  });

  it('returns null when no supported platform key is configured', () => {
    expect(resolvePlatformLlm()).toBeNull();
  });

  it('applies LLM_MODEL only after selecting the configured provider', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';
    process.env.LLM_MODEL = 'reviewed-model-override';

    expect(resolvePlatformLlm()).toEqual(expect.objectContaining({
      provider: 'deepseek',
      model: 'reviewed-model-override',
    }));
  });
});

describe('resolveUserLlm', () => {
  it('resolves a legacy saved provider id through the alias without changing its endpoint', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({ provider: 'ark', model: 'doubao-seed-code', apiKeyCipher: 'c', updatedAt: null });
    vi.mocked(decrypt).mockReturnValue('sk-user');

    await expect(resolveUserLlm()).resolves.toEqual(expect.objectContaining({
      provider: 'doubao',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
      chatPath: '/v1/messages',
      protocol: 'anthropic',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      model: 'doubao-seed-code',
      source: 'user',
    }));
  });

  it('keeps a row stored under the legacy minimax id on the legacy chat path whatever its model', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({ provider: 'minimax', model: 'some-custom-model', apiKeyCipher: 'c', updatedAt: null });
    vi.mocked(decrypt).mockReturnValue('sk-user');

    await expect(resolveUserLlm()).resolves.toEqual(expect.objectContaining({
      provider: 'minimax_cn',
      baseUrl: 'https://api.minimaxi.com/v1',
      chatPath: '/text/chatcompletion_v2',
      model: 'some-custom-model',
    }));

    vi.mocked(getUserLlm).mockResolvedValue({ provider: 'minimax_cn', model: 'MiniMax-M3', apiKeyCipher: 'c', updatedAt: null });
    await expect(resolveUserLlm()).resolves.toEqual(expect.objectContaining({
      provider: 'minimax_cn',
      chatPath: '/chat/completions',
    }));
  });

  it('passes the registry auth header for anthropic-protocol providers such as claude', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({ provider: 'claude', model: 'claude-sonnet-4-6', apiKeyCipher: 'c', updatedAt: null });
    vi.mocked(decrypt).mockReturnValue('sk-ant');

    await expect(resolveUserLlm()).resolves.toEqual(expect.objectContaining({
      provider: 'claude',
      protocol: 'anthropic',
      authHeader: 'x-api-key',
      authPrefix: '',
    }));
  });

  it('returns null for a saved row whose provider is unknown to the catalog', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({ provider: 'bogus', model: 'm', apiKeyCipher: 'c', updatedAt: null });
    vi.mocked(decrypt).mockReturnValue('sk');
    await expect(resolveUserLlm()).resolves.toBeNull();
  });

  it('never falls back to the platform key when the user has no BYO settings', async () => {
    vi.mocked(getUserLlm).mockResolvedValue(null);
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'platform-key';

    await expect(resolveUserLlm()).resolves.toBeNull();
  });

  it('returns a decryptable user provider without consulting platform credentials', async () => {
    vi.mocked(getUserLlm).mockResolvedValue({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKeyCipher: 'cipher', updatedAt: null,
    });
    vi.mocked(decrypt).mockReturnValue('sk-user');
    process.env.DEEPSEEK_API_KEY = 'platform-key';

    await expect(resolveUserLlm()).resolves.toEqual(expect.objectContaining({
      provider: 'deepseek',
      apiKey: 'sk-user',
      source: 'user',
    }));
  });
});
