import { describe, expect, it } from 'vitest';
import { parseWatchlistAlertPreferencesCommand, watchlistAlertPreferencesUpdate } from './alert-preferences';

const valid = {
  channels: ['email', 'telegram'], mode: 'digest', telegramChatId: '-100123',
  quietStart: '22:00', quietEnd: '07:00', digestTime: '08:30',
};

describe('watchlist alert preference command', () => {
  it('parses a complete channel and schedule replacement', () => {
    const command = parseWatchlistAlertPreferencesCommand(valid);
    expect(command).toEqual(valid);
    expect(command && watchlistAlertPreferencesUpdate(command)).toMatchObject({
      watchlist_alert_channels: ['email', 'telegram'],
      watchlist_alert_delivery_mode: 'digest',
      email_notifications: true,
    });
  });

  it('rejects duplicate channels, missing Telegram recipients, and partial quiet windows', () => {
    expect(parseWatchlistAlertPreferencesCommand({ ...valid, channels: ['email', 'email'] })).toBeNull();
    expect(parseWatchlistAlertPreferencesCommand({ ...valid, telegramChatId: null })).toBeNull();
    expect(parseWatchlistAlertPreferencesCommand({ ...valid, quietEnd: null })).toBeNull();
    expect(parseWatchlistAlertPreferencesCommand({ ...valid, digestTime: '25:00' })).toBeNull();
  });
});
