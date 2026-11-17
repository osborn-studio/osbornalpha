export type PlatformBaseUrl =
  | { kind: 'unset' }
  | { kind: 'ignored'; reason: 'provider_not_pinned' }
  | { kind: 'ok'; baseUrl: string; host: string; insecure: boolean }
  | { kind: 'invalid'; reason: PlatformBaseUrlError };

export type PlatformBaseUrlError =
  | 'not_a_url' | 'unsupported_scheme' | 'credentials_not_allowed'
  | 'query_or_fragment_not_allowed' | 'insecure_http_not_allowed';

export function platformBaseUrl(env: NodeJS.ProcessEnv = process.env): PlatformBaseUrl {
  const value = env.LLM_BASE_URL?.trim();
  if (!value) return { kind: 'unset' };
  if (!env.LLM_PROVIDER?.trim()) return { kind: 'ignored', reason: 'provider_not_pinned' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'invalid', reason: 'not_a_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'invalid', reason: 'unsupported_scheme' };
  }
  if (url.username || url.password) {
    return { kind: 'invalid', reason: 'credentials_not_allowed' };
  }
  if (url.search || url.hash || value.includes('?') || value.includes('#')) {
    return { kind: 'invalid', reason: 'query_or_fragment_not_allowed' };
  }
  const insecure = url.protocol === 'http:';
  if (insecure && env.LLM_BASE_URL_ALLOW_INSECURE?.trim() !== '1') {
    return { kind: 'invalid', reason: 'insecure_http_not_allowed' };
  }
  // Deployment operator configuration permits private hosts; user-input SSRF guards are separate.
  return { kind: 'ok', baseUrl: (url.origin + url.pathname).replace(/\/+$/, ''), host: url.host, insecure };
}

/** Operator-facing sentence. Never includes the URL value (it may hold credentials). */
export function platformBaseUrlErrorMessage(reason: PlatformBaseUrlError): string {
  const messages: Record<PlatformBaseUrlError, string> = {
    not_a_url: 'Provide an absolute URL',
    unsupported_scheme: 'Only HTTP and HTTPS schemes are supported',
    credentials_not_allowed: 'URL credentials are not allowed',
    query_or_fragment_not_allowed: 'URL queries and fragments are not allowed',
    insecure_http_not_allowed: 'HTTP requires LLM_BASE_URL_ALLOW_INSECURE=1; prefer HTTPS',
  };
  return messages[reason];
}
