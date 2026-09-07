import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn((..._args: unknown[]) => ({ client: true })),
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

import { getServerSupabase } from './server';

describe('server Supabase client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('forwards a validated Bearer session for API clients', async () => {
    await getServerSupabase(new Request('https://app.example.test/api/watchlist/overview', {
      headers: { authorization: 'Bearer access-token' },
    }));
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      expect.objectContaining({ global: { headers: { Authorization: 'Bearer access-token' } } }),
    );
  });

  it('does not forward unsupported authorization schemes', async () => {
    await getServerSupabase(new Request('https://app.example.test/api/watchlist/overview', {
      headers: { authorization: 'Basic credentials' },
    }));
    expect(mocks.createServerClient.mock.calls[0][2]).not.toHaveProperty('global');
  });
});
