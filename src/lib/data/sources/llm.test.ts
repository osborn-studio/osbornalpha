import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/resolve', () => ({ resolveLlm: vi.fn() }));
vi.mock('@/lib/llm/openai-compat', () => ({ chat: vi.fn() }));
vi.mock('@/lib/llm/anthropic-compat', () => ({ anthropicChat: vi.fn() }));
vi.mock('./deepseek', () => ({
  deepseekChat: vi.fn(),
  isDeepSeekConfigured: vi.fn(() => Boolean(process.env.DEEPSEEK_API_KEY)),
}));
vi.mock('./anthropic', () => ({
  anthropicChat: vi.fn(),
  isAnthropicConfigured: vi.fn(() => Boolean(process.env.ANTHROPIC_API_KEY)),
}));

import { chat, getActiveProvider } from './llm';
import { resolveLlm } from '@/lib/llm/resolve';
import { chat as openAiChat } from '@/lib/llm/openai-compat';
import { anthropicChat as compatAnthropicChat } from '@/lib/llm/anthropic-compat';
import { deepseekChat } from './deepseek';
import { anthropicChat as legacyAnthropicChat } from './anthropic';

const ORIGINAL_ENV = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

beforeEach(() => {
  delete process.env.LLM_PROVIDER;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  vi.mocked(resolveLlm).mockReset();
  vi.mocked(openAiChat).mockReset();
  vi.mocked(compatAnthropicChat).mockReset();
  vi.mocked(deepseekChat).mockReset();
  vi.mocked(legacyAnthropicChat).mockReset();
});

afterAll(() => {
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('getActiveProvider', () => {
  it('fails closed when DeepSeek is explicitly pinned without its required key', () => {
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    expect(getActiveProvider()).toBe('none');
  });

  it('honors a valid explicit provider even when another provider is configured', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    expect(getActiveProvider()).toBe('anthropic');
  });

  it('prefers configured DeepSeek deterministically when no provider is pinned', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    expect(getActiveProvider()).toBe('deepseek');
  });
});

describe('chat', () => {
  it('keeps the facade usage contract when the OpenAI adapter is normalized', async () => {
    vi.mocked(resolveLlm).mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'deepseek-v4-flash',
      protocol: 'openai',
      source: 'user',
    });
    vi.mocked(openAiChat).mockResolvedValue({
      content: 'answer',
      usage: {
        inputTokens: 2_000_000,
        cacheHitInputTokens: 1_000_000,
        cacheMissInputTokens: 1_000_000,
        outputTokens: 1_000_000,
        estimated: false,
      },
    });

    const result = await chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.usage).toEqual({ input_tokens: 2_000_000, output_tokens: 1_000_000 });
    expect(result.est_cost_usd).toBe(0.4228);
  });

  it('propagates Anthropic normalized usage while leaving unpriced BYO costs at zero', async () => {
    vi.mocked(resolveLlm).mockResolvedValue({
      provider: 'ark',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'claude-test',
      protocol: 'anthropic',
      source: 'user',
    });
    vi.mocked(compatAnthropicChat).mockResolvedValue({
      content: 'answer',
      usage: {
        inputTokens: 100_075,
        cacheHitInputTokens: 100_000,
        cacheMissInputTokens: 75,
        outputTokens: 25,
        estimated: false,
      },
    });

    const result = await chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.usage).toEqual({ input_tokens: 100_075, output_tokens: 25 });
    expect(result.est_cost_usd).toBe(0);
  });

  it('passes the resolved auth header and prefix through to the Anthropic adapter', async () => {
    vi.mocked(resolveLlm).mockResolvedValue({
      provider: 'claude',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant',
      model: 'claude-test',
      chatPath: '/v1/messages',
      protocol: 'anthropic',
      authHeader: 'x-api-key',
      authPrefix: '',
      source: 'user',
    });
    vi.mocked(compatAnthropicChat).mockResolvedValue({
      content: 'answer',
      usage: { inputTokens: 1, cacheHitInputTokens: 0, cacheMissInputTokens: 1, outputTokens: 1, estimated: false },
    });

    await chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(vi.mocked(compatAnthropicChat).mock.calls[0][0]).toEqual({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant',
      model: 'claude-test',
      chatPath: '/v1/messages',
      authHeader: 'x-api-key',
      authPrefix: '',
    });
  });

  it('never falls back to a platform provider after a resolved BYO call fails', async () => {
    vi.mocked(resolveLlm).mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-user',
      model: 'deepseek-chat',
      protocol: 'openai',
      source: 'user',
    });
    vi.mocked(openAiChat).mockRejectedValue(new Error('user provider unavailable'));

    await expect(chat({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow('user provider unavailable');
    expect(deepseekChat).not.toHaveBeenCalled();
  });

  it('does not let a cron-style env call relay through Anthropic after a missing DeepSeek pin', async () => {
    vi.mocked(resolveLlm).mockResolvedValue(null);
    process.env.LLM_PROVIDER = 'deepseek';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    vi.mocked(legacyAnthropicChat).mockResolvedValue({
      content: 'must not be returned',
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
    });

    await expect(chat({ messages: [{ role: 'user', content: 'cron work' }] }))
      .rejects.toThrow('No LLM provider configured');
    expect(legacyAnthropicChat).not.toHaveBeenCalled();
  });
});
