import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/resolve', () => ({ resolveLlm: vi.fn() }));
vi.mock('@/lib/llm/openai-compat', () => ({ chat: vi.fn() }));

import { chat } from './llm';
import { resolveLlm } from '@/lib/llm/resolve';
import { chat as openAiChat } from '@/lib/llm/openai-compat';

beforeEach(() => {
  vi.mocked(resolveLlm).mockReset();
  vi.mocked(openAiChat).mockReset();
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
        inputTokens: 100,
        cacheHitInputTokens: 60,
        cacheMissInputTokens: 40,
        outputTokens: 25,
        estimated: false,
      },
    });

    const result = await chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 25 });
  });
});
