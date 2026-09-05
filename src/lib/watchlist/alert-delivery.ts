import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/data/sources/resend';
import { sendTelegram } from '@/lib/data/sources/telegram';
import type { Database, WatchlistAlertEvent } from '@/lib/supabase/database.types';
import { watchlistAlertEventLabel } from './alert-events';
import {
  nextWatchlistAlertDeliveryAt,
  parseWatchlistAlertDeliveryPreferences,
  type WatchlistAlertChannel,
  type WatchlistAlertPreferenceRow,
} from './alert-delivery-preferences';

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatWatchlistAlertDigest(events: WatchlistAlertEvent[], locale: 'zh' | 'en' = 'en') {
  const lines = events.map((event) => `${event.ticker}: ${watchlistAlertEventLabel(event, locale)}`);
  const title = locale === 'zh' ? '股票池提醒' : 'Watchlist alerts';
  const subject = locale === 'zh'
    ? `[股票池] ${events.length} 条提醒`
    : `[Watchlist] ${events.length} alert${events.length === 1 ? '' : 's'}`;
  const text = [title, '', ...lines.map((line) => `- ${line}`)].join('\n');
  return {
    subject,
    text,
    html: `<h2>${title}</h2><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
  };
}

export function watchlistAlertRetryAt(now: Date, attempts: number): string {
  const delayMinutes = Math.min(60, 5 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

interface ChannelState {
  status: 'delivered' | 'failed';
  attemptedAt: string;
  providerMessageId?: string;
  error?: string;
}

function channelStates(event: WatchlistAlertEvent): Record<string, ChannelState> {
  if (!event.delivery_channels || typeof event.delivery_channels !== 'object' || Array.isArray(event.delivery_channels)) return {};
  return event.delivery_channels as Record<string, ChannelState>;
}

function pendingForChannel(events: WatchlistAlertEvent[], channel: WatchlistAlertChannel) {
  return events.filter((event) => channelStates(event)[channel]?.status !== 'delivered');
}

function failurePatch(
  event: WatchlistAlertEvent,
  error: string,
  now: Date,
  channels: Record<string, ChannelState>,
): Partial<WatchlistAlertEvent> {
  const deadLetter = event.delivery_attempts >= 3;
  return {
    delivery_status: deadLetter ? 'dead_letter' : 'failed',
    delivery_channels: channels,
    last_delivery_error: error.slice(0, 500),
    claimed_at: null,
    next_delivery_at: deadLetter ? now.toISOString() : watchlistAlertRetryAt(now, event.delivery_attempts),
    dead_lettered_at: deadLetter ? now.toISOString() : null,
  };
}

interface ChannelOutcome {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

async function deliverChannel(
  channel: WatchlistAlertChannel,
  events: WatchlistAlertEvent[],
  recipient: { email: string | null; telegramChatId: string | null },
  language: 'zh' | 'en',
): Promise<ChannelOutcome> {
  const message = formatWatchlistAlertDigest(events, language);
  if (channel === 'email') {
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'email_not_configured' };
    if (!recipient.email) return { ok: false, error: 'email_recipient_unavailable' };
    const ids = events.map((event) => event.id).sort();
    const idempotencyKey = `watchlist-${createHash('sha256').update(ids.join('|')).digest('hex')}`;
    const result = await sendEmail({ to: recipient.email, ...message, idempotencyKey });
    return result.ok
      ? { ok: true, providerMessageId: result.id ?? undefined }
      : { ok: false, error: result.error || 'email_delivery_failed' };
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'telegram_not_configured' };
  if (!recipient.telegramChatId) return { ok: false, error: 'telegram_recipient_unavailable' };
  const result = await sendTelegram(message.text, {
    chatId: recipient.telegramChatId,
    parseMode: 'none',
    autoSplit: true,
  });
  return result.ok
    ? { ok: true, providerMessageId: result.message_id == null ? undefined : String(result.message_id) }
    : { ok: false, error: result.error || 'telegram_delivery_failed' };
}

interface RepositoryError {
  message: string;
}

interface AlertDeliveryDatabase {
  claim(limit: number): Promise<{ data: WatchlistAlertEvent[] | null; error: RepositoryError | null }>;
  updateEvent(id: string, patch: Partial<WatchlistAlertEvent>): Promise<{ error: RepositoryError | null }>;
  loadPreferences(userId: string): Promise<{ data: WatchlistAlertPreferenceRow | null; error: RepositoryError | null }>;
  defer(eventIds: string[], nextDeliveryAt: string): Promise<{ data: number | null; error: RepositoryError | null }>;
}

function alertDeliveryDatabase(db: SupabaseClient<Database>): AlertDeliveryDatabase {
  const repository = db as unknown as {
    from(table: string): unknown;
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: RepositoryError | null }>;
  };
  return {
    async claim(limit) {
      return repository.rpc('claim_watchlist_alert_events', { p_limit: limit }) as Promise<{
        data: WatchlistAlertEvent[] | null;
        error: RepositoryError | null;
      }>;
    },
    async updateEvent(id, patch) {
      const table = repository.from('watchlist_alert_events') as {
        update(value: Partial<WatchlistAlertEvent>): {
          eq(column: 'id', value: string): Promise<{ error: RepositoryError | null }>;
        };
      };
      return table.update(patch).eq('id', id);
    },
    async loadPreferences(userId) {
      const table = repository.from('user_preferences') as {
        select(columns: string): {
          eq(column: 'user_id', value: string): {
            maybeSingle(): Promise<{ data: WatchlistAlertPreferenceRow | null; error: RepositoryError | null }>;
          };
        };
      };
      return table
        .select('email_notifications,language,timezone,telegram_chat_id,watchlist_alert_channels,watchlist_alert_delivery_mode,watchlist_alert_quiet_start,watchlist_alert_quiet_end,watchlist_alert_digest_time')
        .eq('user_id', userId)
        .maybeSingle();
    },
    async defer(eventIds, nextDeliveryAt) {
      return repository.rpc('defer_watchlist_alert_events', {
        p_event_ids: eventIds,
        p_next_delivery_at: nextDeliveryAt,
      }) as Promise<{ data: number | null; error: RepositoryError | null }>;
    },
  };
}

export async function deliverWatchlistAlertEvents(db: SupabaseClient<Database>) {
  if (!process.env.RESEND_API_KEY && !process.env.TELEGRAM_BOT_TOKEN) {
    return { claimed: 0, delivered: 0, failed: 0, deadLetter: 0, skipped: 0, deferred: 0 };
  }
  const repository = alertDeliveryDatabase(db);
  const { data, error } = await repository.claim(200);
  if (error) throw new Error(`watchlist_alert_claim_failed:${error.message}`);
  const events = (data ?? []) as WatchlistAlertEvent[];
  const byUser = new Map<string, WatchlistAlertEvent[]>();
  for (const event of events) byUser.set(event.user_id, [...(byUser.get(event.user_id) ?? []), event]);

  let delivered = 0;
  let failed = 0;
  let deadLetter = 0;
  let skipped = 0;
  let deferred = 0;
  const updateEvent = async (id: string, patch: Partial<WatchlistAlertEvent>) => {
    const result = await repository.updateEvent(id, patch);
    if (result.error) throw new Error(`watchlist_alert_delivery_state_failed:${result.error.message}`);
  };
  for (const [userId, userEvents] of byUser) {
    const { data: preferenceRow, error: preferenceError } = await repository.loadPreferences(userId);
    if (preferenceError) throw new Error(`watchlist_alert_preferences_failed:${preferenceError.message}`);
    const preferences = parseWatchlistAlertDeliveryPreferences(preferenceRow as WatchlistAlertPreferenceRow | null);
    const eventIds = userEvents.map((event) => event.id);
    if (preferences.channels.length === 0) {
      skipped += userEvents.length;
      for (const event of userEvents) {
        await updateEvent(event.id, { delivery_status: 'skipped', claimed_at: null, last_delivery_error: null });
      }
      continue;
    }

    const nextDeliveryAt = nextWatchlistAlertDeliveryAt(new Date(), preferences);
    if (nextDeliveryAt) {
      const result = await repository.defer(eventIds, nextDeliveryAt.toISOString());
      if (result.error) throw new Error(`watchlist_alert_defer_failed:${result.error.message}`);
      deferred += Number(result.data ?? userEvents.length);
      continue;
    }

    const needsEmail = preferences.channels.includes('email') && pendingForChannel(userEvents, 'email').length > 0;
    let email: string | null = null;
    if (needsEmail) {
      const { data: authUser, error: authError } = await db.auth.admin.getUserById(userId);
      if (!authError) email = authUser.user?.email ?? null;
    }
    const outcomes = new Map<WatchlistAlertChannel, ChannelOutcome>();
    for (const channel of preferences.channels) {
      const channelEvents = pendingForChannel(userEvents, channel);
      if (channelEvents.length === 0) continue;
      outcomes.set(channel, await deliverChannel(channel, channelEvents, {
        email,
        telegramChatId: preferences.telegramChatId,
      }, preferences.language));
    }

    const attemptedAt = new Date();
    for (const event of userEvents) {
      const states = { ...channelStates(event) };
      for (const channel of preferences.channels) {
        const outcome = outcomes.get(channel);
        if (!outcome || states[channel]?.status === 'delivered') continue;
        states[channel] = outcome.ok
          ? { status: 'delivered', attemptedAt: attemptedAt.toISOString(), providerMessageId: outcome.providerMessageId }
          : { status: 'failed', attemptedAt: attemptedAt.toISOString(), error: outcome.error };
      }
      const complete = preferences.channels.every((channel) => states[channel]?.status === 'delivered');
      if (complete) {
        delivered += 1;
        await updateEvent(event.id, {
          delivery_status: 'delivered',
          delivery_channels: states,
          delivered_at: attemptedAt.toISOString(),
          provider_message_id: Object.values(states).map((state) => state.providerMessageId).filter(Boolean).join(',') || null,
          last_delivery_error: null,
          claimed_at: null,
        });
      } else {
        const errors = preferences.channels
          .map((channel) => states[channel]?.status === 'failed' ? `${channel}:${states[channel].error}` : null)
          .filter((value): value is string => !!value)
          .join(';') || 'delivery_failed';
        if (event.delivery_attempts >= 3) deadLetter += 1;
        else failed += 1;
        await updateEvent(event.id, failurePatch(event, errors, attemptedAt, states));
      }
    }
  }
  return { claimed: events.length, delivered, failed, deadLetter, skipped, deferred };
}
