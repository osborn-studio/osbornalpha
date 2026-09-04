import type { Market } from '@/lib/supabase/database.types';

export interface MarketSessionWindow {
  open: number;
  close: number;
}

export interface MarketSessionSpec {
  timezone: string;
  sessions: readonly MarketSessionWindow[];
}

export interface MarketLocalTime {
  dateKey: string;
  weekday: number;
  hour: number;
  minute: number;
}

export type MarketSessionOverride =
  | { kind: 'closed'; name: string }
  | { kind: 'sessions'; name: string; sessions: readonly MarketSessionWindow[] };

export interface MarketCalendarProvider {
  getOverride(market: Market, dateKey: string): MarketSessionOverride | undefined;
}

export const MARKET_SESSION_SPECS: Record<Market, MarketSessionSpec> = {
  A: { timezone: 'Asia/Shanghai', sessions: [{ open: 570, close: 690 }, { open: 780, close: 900 }] },
  HK: { timezone: 'Asia/Hong_Kong', sessions: [{ open: 570, close: 720 }, { open: 780, close: 960 }] },
  US: { timezone: 'America/New_York', sessions: [{ open: 570, close: 960 }] },
  JP: { timezone: 'Asia/Tokyo', sessions: [{ open: 540, close: 690 }, { open: 750, close: 930 }] },
  KR: { timezone: 'Asia/Seoul', sessions: [{ open: 540, close: 930 }] },
  TW: { timezone: 'Asia/Taipei', sessions: [{ open: 540, close: 810 }] },
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function marketLocalTime(market: Market, now: Date): MarketLocalTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_SESSION_SPECS[market].timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const rawHour = Number(value('hour'));
  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: WEEKDAY_INDEX[value('weekday')] ?? 0,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(value('minute')),
  };
}

function closed(name: string): MarketSessionOverride {
  return { kind: 'closed', name };
}

function halfDay(name: string, closeMinute: number): MarketSessionOverride {
  return { kind: 'sessions', name, sessions: [{ open: 570, close: closeMinute }] };
}

function addClosures(
  target: Map<string, MarketSessionOverride>,
  market: Market,
  name: string,
  dates: readonly string[],
) {
  for (const date of dates) target.set(`${market}:${date}`, closed(name));
}

function build2026Overrides(): Map<string, MarketSessionOverride> {
  const overrides = new Map<string, MarketSessionOverride>();

  // The calendar is deliberately year-specific. Lunar holidays and emergency
  // closures must be refreshed from exchange notices, not inferred forever.
  addClosures(overrides, 'US', 'US market holiday', [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  ]);
  overrides.set('US:2026-11-27', halfDay('Day after Thanksgiving', 780));
  overrides.set('US:2026-12-24', halfDay('Christmas Eve', 780));

  addClosures(overrides, 'A', 'Mainland China market holiday', [
    '2026-01-01', '2026-01-02',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
    '2026-04-06',
    '2026-05-01', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-09-25',
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
  ]);

  addClosures(overrides, 'HK', 'Hong Kong market holiday', [
    '2026-01-01', '2026-02-17', '2026-02-18', '2026-02-19',
    '2026-04-03', '2026-04-06', '2026-04-07', '2026-05-01', '2026-05-25',
    '2026-06-19', '2026-07-01', '2026-10-01', '2026-10-19', '2026-12-25', '2026-12-28',
  ]);
  overrides.set('HK:2026-02-16', halfDay('Lunar New Year Eve', 720));
  overrides.set('HK:2026-12-24', halfDay('Christmas Eve', 720));
  overrides.set('HK:2026-12-31', halfDay('New Year Eve', 720));

  addClosures(overrides, 'JP', 'Japan market holiday', [
    '2026-01-01', '2026-01-02', '2026-01-12', '2026-02-11', '2026-02-23',
    '2026-03-20', '2026-04-29', '2026-05-04', '2026-05-05', '2026-05-06',
    '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-10-12', '2026-11-03', '2026-11-23', '2026-12-31',
  ]);

  addClosures(overrides, 'KR', 'Korea market holiday', [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02',
    '2026-05-05', '2026-05-25', '2026-06-03', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-28', '2026-10-05', '2026-10-09',
    '2026-12-25', '2026-12-31',
  ]);

  addClosures(overrides, 'TW', 'Taiwan market holiday', [
    '2026-01-01', '2026-02-12', '2026-02-13', '2026-02-16', '2026-02-17',
    '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-27', '2026-04-03',
    '2026-05-01', '2026-06-19', '2026-09-25', '2026-09-28', '2026-10-09',
    '2026-10-26', '2026-12-25',
  ]);

  return overrides;
}

const BUILT_IN_OVERRIDES = build2026Overrides();

export const builtInMarketCalendar: MarketCalendarProvider = {
  getOverride(market, dateKey) {
    return BUILT_IN_OVERRIDES.get(`${market}:${dateKey}`);
  },
};

export function createMarketCalendar(
  overrides: Readonly<Record<string, MarketSessionOverride>>,
  fallback: MarketCalendarProvider = builtInMarketCalendar,
): MarketCalendarProvider {
  return {
    getOverride(market, dateKey) {
      return overrides[`${market}:${dateKey}`] ?? fallback.getOverride(market, dateKey);
    },
  };
}
