import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 120, remaining: 119, retryAfterSeconds: 0,
  })),
}));
vi.mock('@/lib/watchlist/alert-preferences-repository', () => ({
  loadWatchlistAlertPreferences: mocks.load,
  updateWatchlistAlertPreferences: mocks.update,
}));

import { GET, PUT } from './route';

const row = {
  language: 'en', timezone: 'UTC', telegram_chat_id: null, email_notifications: true,
  watchlist_alert_channels: ['email'], watchlist_alert_delivery_mode: 'instant',
  watchlist_alert_quiet_start: null, watchlist_alert_quiet_end: null,
  watchlist_alert_digest_time: '08:30',
};

describe('watchlist alert preference route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.load.mockResolvedValue({ data: row, error: null });
    mocks.update.mockResolvedValue({ data: row, error: null });
  });

  it('returns normalized delivery preferences', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/alert-preferences'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preferences: { channels: ['email'], mode: 'instant' } });
  });

  it('validates and replaces the complete preference set', async () => {
    const response = await PUT(new Request('http://localhost/api/watchlist/alert-preferences', {
      method: 'PUT',
      body: JSON.stringify({
        channels: ['email'], mode: 'digest', telegramChatId: null,
        quietStart: '22:00', quietEnd: '07:00', digestTime: '08:30',
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.objectContaining({ mode: 'digest' }));
  });

  it('rejects incomplete schedules before writing', async () => {
    const response = await PUT(new Request('http://localhost/api/watchlist/alert-preferences', {
      method: 'PUT', body: JSON.stringify({ channels: [], mode: 'instant' }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
