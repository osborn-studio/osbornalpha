import type { WatchlistAlertChannel, WatchlistAlertDeliveryMode } from './alert-delivery-preferences';

export interface WatchlistAlertPreferencesCommand {
  channels: WatchlistAlertChannel[];
  mode: WatchlistAlertDeliveryMode;
  telegramChatId: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  digestTime: string;
}

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TELEGRAM_CHAT_ID = /^-?\d{1,20}$/;

export function parseWatchlistAlertPreferencesCommand(body: unknown): WatchlistAlertPreferencesCommand | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.channels)
    || input.channels.length > 2
    || input.channels.some((channel) => channel !== 'email' && channel !== 'telegram')) return null;
  const channels = [...new Set(input.channels)] as WatchlistAlertChannel[];
  if (channels.length !== input.channels.length) return null;
  if (input.mode !== 'instant' && input.mode !== 'digest') return null;
  const telegramChatId = input.telegramChatId === null ? null
    : typeof input.telegramChatId === 'string' && TELEGRAM_CHAT_ID.test(input.telegramChatId.trim())
      ? input.telegramChatId.trim()
      : undefined;
  if (telegramChatId === undefined || (channels.includes('telegram') && !telegramChatId)) return null;
  const quietStart = input.quietStart === null ? null : typeof input.quietStart === 'string' && TIME.test(input.quietStart) ? input.quietStart : undefined;
  const quietEnd = input.quietEnd === null ? null : typeof input.quietEnd === 'string' && TIME.test(input.quietEnd) ? input.quietEnd : undefined;
  if (quietStart === undefined || quietEnd === undefined || (quietStart === null) !== (quietEnd === null)) return null;
  if (typeof input.digestTime !== 'string' || !TIME.test(input.digestTime)) return null;
  return {
    channels,
    mode: input.mode,
    telegramChatId,
    quietStart,
    quietEnd,
    digestTime: input.digestTime,
  };
}

export function watchlistAlertPreferencesUpdate(command: WatchlistAlertPreferencesCommand) {
  return {
    watchlist_alert_channels: command.channels,
    watchlist_alert_delivery_mode: command.mode,
    telegram_chat_id: command.telegramChatId,
    email_notifications: command.channels.includes('email'),
    watchlist_alert_quiet_start: command.quietStart,
    watchlist_alert_quiet_end: command.quietEnd,
    watchlist_alert_digest_time: command.digestTime,
    updated_at: new Date().toISOString(),
  };
}
