import { describe, expect, it, vi, afterEach } from 'vitest';
import { platformBaseUrl, platformBaseUrlErrorMessage, type PlatformBaseUrlError } from './platform-base-url';

afterEach(() => vi.unstubAllEnvs());

describe('platformBaseUrl', () => {
  it.each([undefined, '', '  '])('treats %s as unset', (value) => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_BASE_URL: value })).toEqual({ kind: 'unset' });
  });
  it.each([undefined, '', '  '])('ignores an override before validation when provider is %s', (provider) => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_PROVIDER: provider, LLM_BASE_URL: 'invalid' })).toEqual({ kind: 'ignored', reason: 'provider_not_pinned' });
  });
  it.each([
    ['https://h', 'https://h', 'h'],
    ['https://h/', 'https://h', 'h'],
    [' https://h/v1/// ', 'https://h/v1', 'h'],
    ['https://h/v1', 'https://h/v1', 'h'],
    ['https://h:8443/v1/', 'https://h:8443/v1', 'h:8443'],
  ])('normalizes %s', (value, baseUrl, host) => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_PROVIDER: 'unknown', LLM_BASE_URL: value })).toEqual({ kind: 'ok', baseUrl, host, insecure: false });
  });
  it.each([undefined, 'true', 'yes', '0'])('refuses HTTP with flag %s', (flag) => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_PROVIDER: 'deepseek', LLM_BASE_URL: 'http://h/v1', LLM_BASE_URL_ALLOW_INSECURE: flag })).toEqual({ kind: 'invalid', reason: 'insecure_http_not_allowed' });
  });
  it('accepts HTTP only with trimmed 1', () => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_PROVIDER: 'deepseek', LLM_BASE_URL: 'http://h/v1/', LLM_BASE_URL_ALLOW_INSECURE: ' 1 ' })).toEqual({ kind: 'ok', baseUrl: 'http://h/v1', host: 'h', insecure: true });
  });
  it('does not mark HTTPS insecure when the flag is enabled', () => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_PROVIDER: 'deepseek', LLM_BASE_URL: 'https://h', LLM_BASE_URL_ALLOW_INSECURE: '1' })).toEqual({ kind: 'ok', baseUrl: 'https://h', host: 'h', insecure: false });
  });
  it.each<[string, PlatformBaseUrlError]>([
    ['ftp://h', 'unsupported_scheme'], ['/v1', 'not_a_url'], ['garbage', 'not_a_url'],
    ['https://user:pass@h/v1', 'credentials_not_allowed'],
    ['https://h/v1?x=1', 'query_or_fragment_not_allowed'],
    ['https://h/v1#f', 'query_or_fragment_not_allowed'],
    ['https://h/v1?', 'query_or_fragment_not_allowed'],
    ['https://h/v1#', 'query_or_fragment_not_allowed'],
    ['http://h', 'insecure_http_not_allowed'],
  ])('rejects %s without disclosing it', (value, reason) => {
    expect(platformBaseUrl({ NODE_ENV: 'test', LLM_PROVIDER: 'deepseek', LLM_BASE_URL: value })).toEqual({ kind: 'invalid', reason });
    expect(platformBaseUrlErrorMessage(reason)).not.toContain(value);
    expect(platformBaseUrlErrorMessage(reason).length).toBeGreaterThan(0);
  });
  it('reads the environment at call time', () => {
    vi.stubEnv('LLM_PROVIDER', 'deepseek');
    vi.stubEnv('LLM_BASE_URL', '');
    expect(platformBaseUrl()).toEqual({ kind: 'unset' });
    vi.stubEnv('LLM_BASE_URL', 'https://h');
    expect(platformBaseUrl()).toMatchObject({ kind: 'ok', baseUrl: 'https://h' });
  });
});
