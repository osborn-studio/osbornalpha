import { describe, expect, it } from 'vitest';
import {
  isWatchlistAlertQuietTime,
  nextWatchlistAlertDeliveryAt,
  parseWatchlistAlertDeliveryPreferences,
} from './alert-delivery-preferences';

describe('watchlist alert delivery preferences', () => {
  it('keeps legacy email behavior and validates configured channels', () => {
    expect(parseWatchlistAlertDeliveryPreferences({ email_notifications: true }).channels).toEqual(['email']);
    expect(parseWatchlistAlertDeliveryPreferences({ email_notifications: false }).channels).toEqual([]);
    expect(parseWatchlistAlertDeliveryPreferences({
      watchlist_alert_channels: ['email', 'telegram'], telegram_chat_id: '123',
    }).channels).toEqual(['email', 'telegram']);
    expect(parseWatchlistAlertDeliveryPreferences({
      watchlist_alert_channels: ['telegram'], telegram_chat_id: null,
    }).channels).toEqual([]);
  });

  it('handles same-day and overnight quiet windows in the selected timezone', () => {
    const sameDay = parseWatchlistAlertDeliveryPreferences({
      timezone: 'UTC', watchlist_alert_quiet_start: '09:00', watchlist_alert_quiet_end: '17:00',
    });
    expect(isWatchlistAlertQuietTime(new Date('2026-09-04T12:00:00Z'), sameDay)).toBe(true);
    const overnight = parseWatchlistAlertDeliveryPreferences({
      timezone: 'Asia/Shanghai', watchlist_alert_quiet_start: '22:00', watchlist_alert_quiet_end: '07:00',
    });
    expect(isWatchlistAlertQuietTime(new Date('2026-09-04T15:00:00Z'), overnight)).toBe(true);
  });

  it('defers digest delivery to the next local digest window outside quiet hours', () => {
    const preferences = parseWatchlistAlertDeliveryPreferences({
      timezone: 'UTC', watchlist_alert_delivery_mode: 'digest', watchlist_alert_digest_time: '08:30',
    });
    expect(nextWatchlistAlertDeliveryAt(new Date('2026-09-04T07:00:00Z'), preferences)?.toISOString())
      .toBe('2026-09-04T08:30:00.000Z');
    expect(nextWatchlistAlertDeliveryAt(new Date('2026-09-04T08:35:00Z'), preferences)).toBeNull();
  });
});
