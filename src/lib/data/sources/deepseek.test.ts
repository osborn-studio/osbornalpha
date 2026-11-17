import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deepseekChat } from './deepseek';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv('DEEPSEEK_API_KEY', 'platform-test-key');
  vi.stubEnv('LLM_PROVIDER', '');
  vi.stubEnv('LLM_BASE_URL', '');
  vi.stubEnv('LLM_BASE_URL_ALLOW_INSECURE', '');
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('deepseekChat platform endpoint', () => {
  it.each([
    ['', '', 'https://api.deepseek.com/chat/completions'],
    [' DeepSeek ', 'https://relay.example.com/v1/', 'https://relay.example.com/v1/chat/completions'],
    ['', 'https://relay.example.com/v1', 'https://api.deepseek.com/chat/completions'],
  ])('routes provider %s and override %s safely', async (provider, baseUrl, endpoint) => {
    vi.stubEnv('LLM_PROVIDER', provider);
    vi.stubEnv('LLM_BASE_URL', baseUrl);
    await deepseekChat({ messages: [] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(endpoint, expect.objectContaining({ method: 'POST', redirect: 'error' }));
  });
  it.each([
    ['deepseek', 'garbage', 'not_a_url'],
    ['deepseek', 'http://h/v1', 'insecure_http_not_allowed'],
    ['anthropic', 'https://relay.example.com/v1', 'provider_mismatch'],
  ])('refuses %s / %s before fetch', async (provider, baseUrl, reason) => {
    vi.stubEnv('LLM_PROVIDER', provider);
    vi.stubEnv('LLM_BASE_URL', baseUrl);
    await expect(deepseekChat({ messages: [] })).rejects.toThrow(`LLM_BASE_URL rejected (${reason}); refusing to send the platform key to the official endpoint`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
