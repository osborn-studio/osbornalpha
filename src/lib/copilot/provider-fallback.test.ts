import { describe, expect, it, vi } from 'vitest';
import { createModelInvoker } from './provider-fallback';

describe('createModelInvoker', () => {
  it('falls back once from a broken personal provider and stays on the platform provider', async () => {
    const primary = { source: 'user' as const, provider: 'ark' };
    const fallback = { source: 'env' as const, provider: 'deepseek' };
    const beforeFallback = vi.fn().mockResolvedValue(undefined);
    const onFallback = vi.fn();
    const call = vi.fn(async (provider: typeof primary | typeof fallback, prompt: string) => {
      if (provider.source === 'user') throw new Error('llm 401: invalid api key');
      return `${provider.provider}:${prompt}`;
    });
    const invoke = createModelInvoker({ primary, fallback, beforeFallback, onFallback, call });

    await expect(invoke('first')).resolves.toBe('deepseek:first');
    await expect(invoke('second')).resolves.toBe('deepseek:second');

    expect(beforeFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(call.mock.calls.map(([provider]) => provider.provider)).toEqual([
      'ark',
      'deepseek',
      'deepseek',
    ]);
  });

  it('does not retry a failing platform provider', async () => {
    const platform = { source: 'env' as const, provider: 'deepseek' };
    const call = vi.fn().mockRejectedValue(new Error('llm 500: unavailable'));
    const invoke = createModelInvoker({
      primary: platform,
      fallback: null,
      beforeFallback: vi.fn(),
      onFallback: vi.fn(),
      call,
    });

    await expect(invoke('prompt')).rejects.toThrow('unavailable');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
