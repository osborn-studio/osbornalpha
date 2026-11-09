import {act, createElement} from 'react';
import {create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';

const auth = vi.hoisted(() => ({signIn: vi.fn(), getUser: vi.fn()}));
vi.mock('@supabase/ssr', () => ({createServerClient: () => ({auth: {getUser: auth.getUser}})}));
vi.mock('@/lib/supabase/client', () => ({isSupabaseConfigured: () => true, getBrowserSupabase: () => ({auth: {signInWithPassword: auth.signIn}})}));
vi.mock('next/link', () => ({default: ({children}: {children: React.ReactNode}) => children}));
vi.mock('next-intl', () => ({useTranslations: () => (key: string) => key}));
vi.mock('@/components/Toast', () => ({useToast: () => ({show: vi.fn()})}));
vi.mock('@/lib/analytics/client', () => ({trackEvent: vi.fn(), getAnonymousAnalyticsId: () => null}));
import {AuthForm} from './AuthForm';
import {middleware} from '../middleware';

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS', '');
  auth.getUser.mockResolvedValue({data: {user: null}});
  auth.signIn.mockResolvedValue({error: null});
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function login(search: string) {
  const location = {origin: 'https://alpha.example', search, href: `https://alpha.example/login${search}`};
  vi.stubGlobal('window', {location});
  await act(async () => {root = create(createElement(AuthForm, {mode: 'login'}));});
  await act(async () => {
    root!.root.findByProps({type: 'email'}).props.onChange({target: {value: 'reader@example.test'}});
    root!.root.findByProps({type: 'password'}).props.onChange({target: {value: 'test-password'}});
  });
  await act(async () => {await root!.root.findAllByType('button').find(b => b.children.includes('form.loginButton'))!.props.onClick();});
  return location.href;
}

describe('password login return flow', () => {
  it('returns from the actual anonymous middleware redirect to the requested US SIC list', async () => {
    const target = '/intel/industries?scheme=sic&metric=member_count';
    const response = await middleware(new NextRequest(`https://alpha.example${target}`));
    expect(response.status).toBe(307);
    const loginUrl = new URL(response.headers.get('location')!);
    expect(loginUrl.searchParams.get('next')).toBe(target);
    expect(await login(loginUrl.search)).toBe(target);
    expect(auth.signIn).toHaveBeenCalledWith({email: 'reader@example.test', password: 'test-password'});
  });
  it('honors a safe path from a direct login link', async () => {
    expect(await login('?next=%2Fportfolio')).toBe('/portfolio');
  });
  it.each(['', '?next=https://evil.example', '?next=//evil.example', '?next=/login?next=/portfolio', '?next=/en/register', '?next=/auth/callback?code=secret', '?next=/api/auth/logout', '?next=/%5Cevil.example', '?next=/%252f%252fevil.example'])('falls back safely for %s', async search => {
    expect(await login(search)).toBe('/macro');
  });
  it.each([
    ['/intel/industries?scheme=sw2021&level=3&metric=roe&duration=TTM&view=table&periods=44', '/intel/industries?scheme=sw2021&metric=roe&level=3&duration=TTM&view=table&periods=44'],
    ['/intel/industries?scheme=sic&metric=member_count&access_token=private&password=private&code=private&next=/login#private', '/intel/industries?scheme=sic&metric=member_count'],
    ['/intel/industries?scheme=sic&scheme=sw2021&metric=private&view=private&periods=999', '/intel/industries'],
    ['/portfolio?access_token=private#private', '/portfolio'],
    ['/en//evil.example', '/macro'],
    ['/x/../login', '/macro'],
  ])('sanitizes the return destination %s', async (target, expected) => {
    expect(await login(`?next=${encodeURIComponent(target)}`)).toBe(expected);
  });
  it('does not navigate when authentication fails', async () => {
    auth.signIn.mockResolvedValue({error: {message: 'Invalid login credentials', status: 400}});
    expect(await login('?next=/portfolio')).toBe('https://alpha.example/login?next=/portfolio');
  });
});
