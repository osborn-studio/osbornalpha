export type OAuthProvider = 'google' | 'github' | 'apple';

const SUPPORTED = new Set<OAuthProvider>(['google', 'github', 'apple']);

export function configuredOAuthProviders(value: string | undefined): OAuthProvider[] {
  if (!value) return [];
  const providers: OAuthProvider[] = [];
  for (const token of value.split(',')) {
    const provider = token.trim().toLowerCase() as OAuthProvider;
    if (SUPPORTED.has(provider) && !providers.includes(provider)) providers.push(provider);
  }
  return providers;
}
