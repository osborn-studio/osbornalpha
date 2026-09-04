/**
 * Multi-market trading-hours clock (A/HK/US) — pure functions, no I/O.
 *
 * Drives the /today page's market clock strip. All 判定 based on each
 * exchange's local wall-clock time (IANA tz via Intl), so it is correct
 * whether the process runs in UTC (Vercel) or CST (local dev), and US
 * DST transitions are handled automatically.
 *
 * G3: JP/KR/TW added — Market union from database.types is the single
 * market type; marketOfTicker re-exports classifyMarket (utils.ts).
 */

import type { Market } from '@/lib/supabase/database.types';
import {
  MARKET_SESSION_SPECS,
  builtInMarketCalendar,
  marketLocalTime,
  type MarketCalendarProvider,
} from '@/lib/market/calendar';

// phaseKey disambiguates the two 'open' sub-phases (morning session vs
// afternoon session) that share `phase: 'open'` but have different label
// templates ("到午休" vs "到收盘"). Single-session markets (US) use the
// plain 'open' key. UI code should render off `phaseKey` + `minutes` via
// t('phase.' + phaseKey, { minutes }); `label` is kept additively for
// back-compat with any existing zh-only call sites.
export type MarketPhaseKey = 'pre' | 'open' | 'openMorning' | 'lunch' | 'openAfternoon' | 'closed' | 'holiday' | 'weekend';

export interface MarketPhase {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  label: string; // e.g. '盘前 · A股开盘还有 48 分钟'
  phaseKey: MarketPhaseKey;
  minutes?: number; // minutes remaining to the next transition (absent for closed/weekend)
}

export interface MarketPhaseV2 {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  phaseKey: MarketPhaseKey;
  minutes?: number;
}

export function marketPhase(
  market: Market,
  now: Date,
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): MarketPhaseV2 {
  const spec = MARKET_SESSION_SPECS[market];
  const { dateKey, weekday, hour, minute } = marketLocalTime(market, now);
  const override = calendar.getOverride(market, dateKey);
  if (override?.kind === 'closed') return { phase: 'closed', phaseKey: 'holiday' };
  // Weekend is judged in the MARKET's local weekday (北京周六清晨 = 纽约周五晚,
  // US must be open/closed there — the core cross-date trap).
  if (weekday === 0 || weekday === 6) return { phase: 'weekend', phaseKey: 'weekend' };
  const m = hour * 60 + minute;
  const [s1, s2] = override?.kind === 'sessions' ? override.sessions : spec.sessions;
  if (m < s1.open) return { phase: 'pre', phaseKey: 'pre', minutes: s1.open - m };
  if (m < s1.close) {
    return s2
      ? { phase: 'open', phaseKey: 'openMorning', minutes: s1.close - m }
      : { phase: 'open', phaseKey: 'open', minutes: s1.close - m };
  }
  if (s2 && m < s2.open) return { phase: 'lunch', phaseKey: 'lunch', minutes: s2.open - m };
  if (s2 && m < s2.close) return { phase: 'open', phaseKey: 'openAfternoon', minutes: s2.close - m };
  return { phase: 'closed', phaseKey: 'closed' };
}

// Single source of truth lives in utils.ts; re-exported under the legacy name.
export { classifyMarket as marketOfTicker } from '@/lib/utils';

// Thin wrapper preserving the legacy A-share API (return type / zh labels
// byte-compatible with the pre-G2 implementation and its 8 tests).
export function aShareMarketPhase(now: Date): MarketPhase {
  const p = marketPhase('A', now);
  const labels: Record<MarketPhaseKey, (n?: number) => string> = {
    pre: (n) => `盘前 · A股开盘还有 ${n} 分钟`,
    openMorning: (n) => `盘中 · 午休还有 ${n} 分钟`,
    lunch: (n) => `午休 · 下午开盘还有 ${n} 分钟`,
    openAfternoon: (n) => `盘中 · 收盘还有 ${n} 分钟`,
    open: () => '盘中', // unreachable for A (two sessions ⇒ openMorning); kept for exhaustiveness over MarketPhaseKey
    closed: () => '已收盘',
    holiday: () => '节假日休市',
    weekend: () => '周末休市',
  };
  return { ...p, label: labels[p.phaseKey](p.minutes) };
}
