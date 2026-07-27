import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/resolve', () => ({ resolveLlm: vi.fn() }));
vi.mock('@/lib/llm/openai-compat', () => ({ chat: vi.fn() }));
vi.mock('@/lib/llm/anthropic-compat', () => ({ anthropicChat: vi.fn() }));

import { chat } from './llm';
import { resolveLlm } from '@/lib/llm/resolve';
import { chat as openAiChat } from '@/lib/llm/openai-compat';
import { anthropicChat } from '@/lib/llm/anthropic-compat';

beforeEach(() => {
  vi.mocked(resolveLlm).mockReset();
  vi.mocked(openAiChat).mockReset();
  vi.mocked(anthropicChat).mockReset();
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
    vi.mocked(anthropicChat).mockResolvedValue({
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
});
