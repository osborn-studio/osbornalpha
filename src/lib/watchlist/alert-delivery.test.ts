import { describe, expect, it } from 'vitest';
import type { WatchlistAlertEvent } from '@/lib/supabase/database.types';
import { formatWatchlistAlertDigest } from './alert-delivery';

const event = {
  ticker: 'AAPL.O', alert_type: 'price', payload: { label: 'price crosses above 200' },
} as unknown as WatchlistAlertEvent;

describe('watchlist alert delivery', () => {
  it('groups events into an escaped localized digest', () => {
    const message = formatWatchlistAlertDigest([event], 'zh');
    expect(message.subject).toBe('[股票池] 1 条提醒');
    expect(message.text).toContain('AAPL.O: price crosses above 200');
  });

  it('escapes event labels in HTML', () => {
    const message = formatWatchlistAlertDigest([{ ...event, payload: { label: '<script>' } }], 'en');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).not.toContain('<script>');
  });
});
