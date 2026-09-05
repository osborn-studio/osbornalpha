import { describe, expect, it, vi } from 'vitest';
import {
  fetchExchangeCalendarSnapshot,
  loadStoredMarketCalendar,
  parseExchangeCalendarSnapshot,
  persistExchangeCalendarSnapshot,
} from './calendar-service';

const payload = {
  source: 'exchange-feed',
  sourceUpdatedAt: '2026-09-01T00:00:00.000Z',
  coverage: {
    from: '2027-01-01',
    to: '2027-12-31',
    markets: ['A', 'HK', 'US', 'JP', 'KR', 'TW'],
    complete: true,
  },
  entries: [
    { market: 'US', date: '2027-01-01', kind: 'closed', name: 'New Year' },
    { market: 'HK', date: '2027-02-05', kind: 'sessions', name: 'Half day', sessions: [{ open: 570, close: 720 }] },
  ],
};

describe('exchange calendar service', () => {
  it('normalizes closed days and exceptional sessions', () => {
    expect(parseExchangeCalendarSnapshot(payload)).toMatchObject({
      source: 'exchange-feed',
      entries: [
        { market: 'US', date: '2027-01-01', override: { kind: 'closed' } },
        { market: 'HK', date: '2027-02-05', override: { kind: 'sessions', sessions: [{ open: 570, close: 720 }] } },
      ],
    });
  });

  it('rejects malformed dates and session windows', () => {
    expect(() => parseExchangeCalendarSnapshot({
      ...payload, entries: [{ market: 'US', date: 'tomorrow', kind: 'closed', name: 'bad' }],
    })).toThrow('invalid_exchange_calendar_entry');
    expect(() => parseExchangeCalendarSnapshot({
      ...payload, entries: [{ market: 'US', date: '2027-01-01', kind: 'sessions', name: 'bad', sessions: [{ open: 960, close: 570 }] }],
    })).toThrow('invalid_exchange_calendar_sessions');
    expect(() => parseExchangeCalendarSnapshot({
      ...payload, entries: [{ market: 'US', date: '2027-01-01', kind: 'sessions', name: 'bad', sessions: [{ open: 570, close: 720 }, { open: 700, close: 900 }] }],
    })).toThrow('invalid_exchange_calendar_sessions');
  });

  it('rejects duplicate, out-of-coverage and incomplete provider data', async () => {
    expect(() => parseExchangeCalendarSnapshot({
      ...payload,
      entries: [payload.entries[0], payload.entries[0]],
    })).toThrow('invalid_exchange_calendar_entry');
    expect(() => parseExchangeCalendarSnapshot({
      ...payload,
      entries: [{ ...payload.entries[0], date: '2028-01-01' }],
    })).toThrow('invalid_exchange_calendar_entry');
    await expect(fetchExchangeCalendarSnapshot('https://calendar.example/v1', '2027-01-01', '2027-12-31', {
      fetcher: async () => new Response(JSON.stringify({
        ...payload,
        coverage: { ...payload.coverage, complete: false },
      }), { status: 200 }),
    })).rejects.toThrow('incomplete_exchange_calendar_snapshot');
  });

  it('passes a bounded date window and optional bearer to the provider', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    await fetchExchangeCalendarSnapshot('https://calendar.example/v1', '2027-01-01', '2027-12-31', {
      apiKey: 'secret', fetcher,
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://calendar.example/v1?from=2027-01-01&to=2027-12-31'),
      expect.objectContaining({ headers: { authorization: 'Bearer secret' }, cache: 'no-store' }),
    );
  });

  it('replaces a complete normalized snapshot in one transaction', async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    const count = await persistExchangeCalendarSnapshot({
      rpc,
    }, parseExchangeCalendarSnapshot(payload), new Date('2026-09-04T00:00:00.000Z'));
    expect(count).toBe(2);
    expect(rpc).toHaveBeenCalledWith('replace_market_calendar_overrides', {
      p_rows: expect.arrayContaining([
        expect.objectContaining({ market: 'US', date_key: '2027-01-01', kind: 'closed', sessions: [] }),
      ]),
      p_source: 'exchange-feed',
      p_from: '2027-01-01',
      p_to: '2027-12-31',
      p_markets: ['A', 'HK', 'US', 'JP', 'KR', 'TW'],
    });
  });

  it('creates a synchronous provider from stored overrides', async () => {
    const lte = vi.fn(async () => ({
      data: [{
        market: 'US', date_key: '2027-01-01', kind: 'closed', name: 'New Year', sessions: [],
        source: 'exchange-feed', source_updated_at: null, fetched_at: '2026-09-04T00:00:00.000Z',
      }],
      error: null,
    }));
    const calendar = await loadStoredMarketCalendar({
      from: () => ({ select: () => ({ gte: () => ({ lte }) }) }),
    }, new Date('2027-01-01T12:00:00.000Z'));
    expect(calendar.getOverride('US', '2027-01-01')).toEqual({ kind: 'closed', name: 'New Year' });
  });
});
