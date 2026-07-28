export interface ProviderWithSource {
  source: 'user' | 'env';
}

interface ModelInvokerOptions<TProvider extends ProviderWithSource, TArgs extends unknown[], TResult> {
  primary: TProvider;
  fallback: TProvider | null;
  beforeFallback: (error: unknown) => Promise<void> | void;
  onFallback: (error: unknown) => Promise<void> | void;
  call: (provider: TProvider, ...args: TArgs) => Promise<TResult>;
}

/**
 * Keep a Copilot run on the user's provider when it works, but switch once to
 * the platform provider when that personal configuration fails. The selected
 * fallback remains sticky for every later model turn in the same run.
 */
export function createModelInvoker<
  TProvider extends ProviderWithSource,
  TArgs extends unknown[],
  TResult,
>(options: ModelInvokerOptions<TProvider, TArgs, TResult>) {
  let active = options.primary;
  let fallbackUsed = false;

  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await options.call(active, ...args);
    } catch (error) {
      if (fallbackUsed || active.source !== 'user' || !options.fallback) throw error;
      await options.beforeFallback(error);
      active = options.fallback;
      fallbackUsed = true;
      await options.onFallback(error);
      return options.call(active, ...args);
    }
  };
}
