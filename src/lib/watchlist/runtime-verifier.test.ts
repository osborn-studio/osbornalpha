import { describe, expect, it } from 'vitest';
import {
  isWatchlistRuntimeReadPayload,
  isVercelDeploymentProtectionResponse,
  isWatchlistOverviewRuntimePayload,
  resolveWatchlistRuntimeAuth,
  resolveWatchlistRuntimeUrl,
} from './runtime-verifier';

describe('Watchlist runtime verifier', () => {
  it('requires an explicit HTTPS deployment URL and normalizes it to an origin', () => {
    expect(resolveWatchlistRuntimeUrl({ WATCHLIST_RUNTIME_URL: 'https://deploy.example.test/' }))
      .toBe('https://deploy.example.test');
    expect(() => resolveWatchlistRuntimeUrl({})).toThrow('watchlist_runtime_url_missing');
    expect(() => resolveWatchlistRuntimeUrl({ WATCHLIST_RUNTIME_URL: 'http://deploy.example.test' }))
      .toThrow('watchlist_runtime_url_invalid');
    expect(() => resolveWatchlistRuntimeUrl({ WATCHLIST_RUNTIME_URL: 'https://deploy.example.test/path' }))
      .toThrow('watchlist_runtime_url_invalid');
  });

  it('recognizes Vercel protection responses so they cannot pass app probes', () => {
    expect(isVercelDeploymentProtectionResponse('https://vercel.com/sso-api?url=x', null)).toBe(true);
    expect(isVercelDeploymentProtectionResponse(null, { protection: true })).toBe(true);
    expect(isVercelDeploymentProtectionResponse('/login', null)).toBe(false);
  });

  it('requires complete, valid credentials for an authenticated runtime probe', () => {
    expect(resolveWatchlistRuntimeAuth({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co/',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      WATCHLIST_RUNTIME_EMAIL: 'runtime@example.com',
      WATCHLIST_RUNTIME_PASSWORD: 'password-123',
    })).toEqual({
      supabaseUrl: 'https://project.supabase.co',
      anonKey: 'anon-key',
      email: 'runtime@example.com',
      password: 'password-123',
    });
    expect(() => resolveWatchlistRuntimeAuth({})).toThrow('watchlist_runtime_auth_missing');
    expect(() => resolveWatchlistRuntimeAuth({
      NEXT_PUBLIC_SUPABASE_URL: 'http://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      WATCHLIST_RUNTIME_EMAIL: 'runtime@example.com',
      WATCHLIST_RUNTIME_PASSWORD: 'password-123',
    })).toThrow('watchlist_runtime_auth_invalid');
  });

  it('accepts only a structurally valid overview response', () => {
    expect(isWatchlistOverviewRuntimePayload({
      generatedAt: '2026-09-05T12:00:00.000Z',
      ownerId: 'user-1',
      dataStatus: 'complete',
      rows: [],
      capabilities: [],
      page: { limit: 1, hasMore: false },
    })).toBe(true);
    expect(isWatchlistOverviewRuntimePayload({ rows: [] })).toBe(false);
    expect(isWatchlistOverviewRuntimePayload({
      generatedAt: 'invalid', ownerId: 'user-1', dataStatus: 'complete', rows: [], capabilities: [],
      page: { limit: 1, hasMore: false },
    })).toBe(false);
  });
});

describe('Watchlist authenticated read contracts', () => {
  it('accepts the required top-level structures', () => {
    expect(isWatchlistRuntimeReadPayload('/api/watchlist', { watchlists: [] })).toBe(true);
    expect(isWatchlistRuntimeReadPayload('/api/watchlist/reviews', { rows: [], summary: {} })).toBe(true);
    expect(isWatchlistRuntimeReadPayload('/api/watchlist/ui-preferences', {
      preferences: {}, version: 0, updatedAt: null,
    })).toBe(true);
  });

  it('rejects structurally invalid route payloads', () => {
    expect(isWatchlistRuntimeReadPayload('/api/watchlist/alerts', { alerts: {}, catalog: {} })).toBe(false);
    expect(isWatchlistRuntimeReadPayload('/api/watchlist/alert-preferences', { preferences: null })).toBe(false);
  });
});
