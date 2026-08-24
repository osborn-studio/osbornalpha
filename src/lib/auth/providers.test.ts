import { describe, expect, it } from 'vitest';
import { configuredOAuthProviders } from './providers';

describe('configuredOAuthProviders', () => {
  it('hides providers when none are configured', () => {
    expect(configuredOAuthProviders(undefined)).toEqual([]);
  });

  it('keeps only supported configured providers', () => {
    expect(configuredOAuthProviders('github, google, wechat, GOOGLE')).toEqual(['github', 'google']);
  });
});
