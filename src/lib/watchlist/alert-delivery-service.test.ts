import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchlistAlertEvent } from '@/lib/supabase/database.types';

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), sendTelegram: vi.fn() }));
vi.mock('@/lib/data/sources/resend', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/lib/data/sources/telegram', () => ({ sendTelegram: mocks.sendTelegram }));

import { deliverWatchlistAlertEvents } from './alert-delivery';

const event = {
  id: 'event-1', user_id: 'user-1', alert_id: 'alert-1', watchlist_item_id: 'item-1', ticker: 'AAPL',
  alert_type: 'price', event_key: 'price:gte:200:bucket', observed_value: 201, threshold_numeric: 200,
  payload: { label: 'Price above 200' }, delivery_status: 'processing', delivery_attempts: 1,
  last_delivery_error: null, claimed_at: '2026-09-04T12:00:00Z', delivered_at: null, read_at: null,
  next_delivery_at: '2026-09-04T12:00:00Z', dead_lettered_at: null, provider_message_id: null,
  triggered_at: '2026-09-04T12:00:00Z', created_at: '2026-09-04T12:00:00Z',
} as WatchlistAlertEvent;

function database(
  updateError: { message: string } | null = null,
  claimedEvent: WatchlistAlertEvent = event,
  preferences: Record<string, unknown> = { email_notifications: true, language: 'en' },
) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: updateError })) }));
  const rpc = vi.fn(async (name: string) => name === 'defer_watchlist_alert_events'
    ? { data: 1, error: null }
    : { data: [claimedEvent], error: null });
  const from = vi.fn((table: string) => {
    if (table === 'user_preferences') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: preferences, error: null }) }) }) };
    }
    return { update };
  });
  return {
    client: {
      rpc,
      from,
      auth: { admin: { getUserById: async () => ({ data: { user: { email: 'user@example.com' } }, error: null }) } },
    },
    rpc,
    update,
  };
}

describe('deliverWatchlistAlertEvents', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalTelegramToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    delete process.env.TELEGRAM_BOT_TOKEN;
    mocks.sendEmail.mockResolvedValue({ ok: true, id: 'email-1' });
    mocks.sendTelegram.mockResolvedValue({ ok: true, message_id: 42, chunks_sent: 1 });
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalTelegramToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalTelegramToken;
  });

  it('does not claim pending events while email delivery is unconfigured', async () => {
    delete process.env.RESEND_API_KEY;
    const db = database();
    await expect(deliverWatchlistAlertEvents(db.client as never)).resolves.toEqual({
      claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0,
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('uses a stable provider idempotency key and persists delivery state', async () => {
    const db = database();
    await expect(deliverWatchlistAlertEvents(db.client as never)).resolves.toEqual({
      claimed: 1, delivered: 1, failed: 0, deadLetter: 0, skipped: 0, deferred: 0,
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com', idempotencyKey: expect.stringMatching(/^watchlist-[a-f0-9]{64}$/),
    }));
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: 'delivered' }));
  });

  it('fails the run when delivery state cannot be persisted', async () => {
    const db = database({ message: 'write failed' });
    await expect(deliverWatchlistAlertEvents(db.client as never))
      .rejects.toThrow('watchlist_alert_delivery_state_failed:write failed');
  });

  it('moves a third failed attempt to dead-letter', async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, error: 'provider unavailable' });
    const db = database(null, { ...event, delivery_attempts: 3 });
    await expect(deliverWatchlistAlertEvents(db.client as never)).resolves.toEqual({
      claimed: 1, delivered: 0, failed: 0, deadLetter: 1, skipped: 0, deferred: 0,
    });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      delivery_status: 'dead_letter', last_delivery_error: 'email:provider unavailable',
    }));
  });

  it('delivers configured email and Telegram channels and records both outcomes', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-key';
    const db = database(null, event, {
      language: 'en', timezone: 'UTC', telegram_chat_id: 'chat-1',
      watchlist_alert_channels: ['email', 'telegram'], watchlist_alert_delivery_mode: 'instant',
    });
    await expect(deliverWatchlistAlertEvents(db.client as never)).resolves.toMatchObject({ delivered: 1 });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendTelegram).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ chatId: 'chat-1' }));
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      delivery_channels: expect.objectContaining({
        email: expect.objectContaining({ status: 'delivered' }),
        telegram: expect.objectContaining({ status: 'delivered' }),
      }),
    }));
  });

  it('defers events during quiet time without consuming a delivery attempt', async () => {
    const db = database(null, event, {
      language: 'en', timezone: 'UTC', watchlist_alert_channels: ['email'],
      watchlist_alert_delivery_mode: 'instant',
      watchlist_alert_quiet_start: '00:00', watchlist_alert_quiet_end: '00:00',
    });
    await expect(deliverWatchlistAlertEvents(db.client as never)).resolves.toMatchObject({ deferred: 1 });
    expect(db.rpc).toHaveBeenCalledWith('defer_watchlist_alert_events', expect.objectContaining({
      p_event_ids: ['event-1'], p_next_delivery_at: expect.any(String),
    }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
