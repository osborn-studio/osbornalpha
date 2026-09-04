export type WatchlistAlertChannel = 'email' | 'telegram';
export type WatchlistAlertDeliveryMode = 'instant' | 'digest';

export interface WatchlistAlertDeliveryPreferences {
  channels: WatchlistAlertChannel[];
  mode: WatchlistAlertDeliveryMode;
  language: 'zh' | 'en';
  timezone: string;
  telegramChatId: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  digestTime: string;
}

export interface WatchlistAlertPreferenceRow {
  language?: unknown;
  timezone?: unknown;
  telegram_chat_id?: unknown;
  email_notifications?: unknown;
  watchlist_alert_channels?: unknown;
  watchlist_alert_delivery_mode?: unknown;
  watchlist_alert_quiet_start?: unknown;
  watchlist_alert_quiet_end?: unknown;
  watchlist_alert_digest_time?: unknown;
}

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function time(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' && TIME.test(value) ? value.slice(0, 5) : fallback;
}

function validTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

export function parseWatchlistAlertDeliveryPreferences(
  row: WatchlistAlertPreferenceRow | null,
): WatchlistAlertDeliveryPreferences {
  const configured = Array.isArray(row?.watchlist_alert_channels)
    ? row.watchlist_alert_channels.filter((value): value is WatchlistAlertChannel => value === 'email' || value === 'telegram')
    : row?.email_notifications === false ? [] : ['email' as const];
  const channels = [...new Set(configured)].filter((channel) => (
    channel !== 'telegram' || typeof row?.telegram_chat_id === 'string' && row.telegram_chat_id.trim().length > 0
  ));
  const quietStart = time(row?.watchlist_alert_quiet_start, null);
  const quietEnd = time(row?.watchlist_alert_quiet_end, null);
  return {
    channels,
    mode: row?.watchlist_alert_delivery_mode === 'digest' ? 'digest' : 'instant',
    language: row?.language === 'zh' ? 'zh' : 'en',
    timezone: validTimezone(row?.timezone),
    telegramChatId: typeof row?.telegram_chat_id === 'string' && row.telegram_chat_id.trim()
      ? row.telegram_chat_id.trim()
      : null,
    quietStart: quietStart && quietEnd ? quietStart : null,
    quietEnd: quietStart && quietEnd ? quietEnd : null,
    digestTime: time(row?.watchlist_alert_digest_time, '08:30')!,
  };
}

function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function timeMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function isWatchlistAlertQuietTime(now: Date, preferences: WatchlistAlertDeliveryPreferences): boolean {
  if (!preferences.quietStart || !preferences.quietEnd) return false;
  const current = localMinutes(now, preferences.timezone);
  const start = timeMinutes(preferences.quietStart);
  const end = timeMinutes(preferences.quietEnd);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function nextWatchlistAlertDeliveryAt(
  now: Date,
  preferences: WatchlistAlertDeliveryPreferences,
): Date | null {
  const digest = timeMinutes(preferences.digestTime);
  const current = localMinutes(now, preferences.timezone);
  const inDigestWindow = current >= digest && current < digest + 15;
  if (!isWatchlistAlertQuietTime(now, preferences)
    && (preferences.mode === 'instant' || inDigestWindow)) return null;

  const start = new Date(Math.ceil(now.getTime() / 900_000) * 900_000);
  for (let index = 0; index < 192; index += 1) {
    const candidate = new Date(start.getTime() + index * 900_000);
    const candidateMinute = localMinutes(candidate, preferences.timezone);
    const digestReady = preferences.mode === 'instant'
      || candidateMinute >= digest && candidateMinute < digest + 15;
    if (digestReady && !isWatchlistAlertQuietTime(candidate, preferences)) return candidate;
  }
  return new Date(now.getTime() + 24 * 60 * 60_000);
}
