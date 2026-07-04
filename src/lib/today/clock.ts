/**
 * Multi-market trading-hours clock (A/HK/US) — pure functions, no I/O.
 *
 * Drives the /today page's market clock strip. All 判定 based on each
 * exchange's local wall-clock time (IANA tz via Intl), so it is correct
 * whether the process runs in UTC (Vercel) or CST (local dev), and US
 * DST transitions are handled automatically.
 *
 * Known simplification: does NOT account for market holidays (春节/国庆/
 * Thanksgiving etc.) — a holiday will be reported as a normal weekday
 * phase. Acceptable for current scope; a holiday calendar can be layered
 * on later (tracked debt, now ×3 markets).
 *
 * G3 extension point: 'JP' | 'KR' | 'TW' only need a MARKET_SESSIONS row.
 */

// phaseKey disambiguates the two 'open' sub-phases (morning session vs
// afternoon session) that share `phase: 'open'` but have different label
// templates ("到午休" vs "到收盘"). Single-session markets (US) use the
// plain 'open' key. UI code should render off `phaseKey` + `minutes` via
// t('phase.' + phaseKey, { minutes }); `label` is kept additively for
// back-compat with any existing zh-only call sites.
export type MarketPhaseKey = 'pre' | 'open' | 'openMorning' | 'lunch' | 'openAfternoon' | 'closed' | 'weekend';

export interface MarketPhase {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  label: string; // e.g. '盘前 · A股开盘还有 48 分钟'
  phaseKey: MarketPhaseKey;
  minutes?: number; // minutes remaining to the next transition (absent for closed/weekend)
}

export type ClockMarket = 'A' | 'HK' | 'US'; // G3: 'JP' | 'KR' | 'TW' 只加表行

interface MarketSessionSpec {
  tz: string; // IANA timezone, judged via Intl (US DST automatically correct)
  sessions: Array<{ open: number; close: number }>; // 当地分钟数；2 段=有午休
}

const MARKET_SESSIONS: Record<ClockMarket, MarketSessionSpec> = {
  A:  { tz: 'Asia/Shanghai',    sessions: [{ open: 570, close: 690 }, { open: 780, close: 900 }] }, // 09:30–11:30, 13:00–15:00
  HK: { tz: 'Asia/Hong_Kong',   sessions: [{ open: 570, close: 720 }, { open: 780, close: 960 }] }, // 09:30–12:00, 13:00–16:00
  US: { tz: 'America/New_York', sessions: [{ open: 570, close: 960 }] },                            // 09:30–16:00 单段
};

export interface MarketPhaseV2 {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  phaseKey: MarketPhaseKey;
  minutes?: number;
}

interface ZoneParts {
  weekday: number; // 0=Sun .. 6=Sat
  hour: number;
  minute: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function toZoneParts(now: Date, tz: string): ZoneParts {
  // en-US short format gives us: "Mon, 06/29/2026, 09:30:00" style pieces via
  // formatToParts, which is more robust to parse than a locale string.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const weekdayStr = get('weekday');
  // hour12:false can still yield "24" for midnight in some environments; normalize.
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));

  return { weekday: WEEKDAY_INDEX[weekdayStr] ?? 0, hour, minute };
}

export function marketPhase(market: ClockMarket, now: Date): MarketPhaseV2 {
  const spec = MARKET_SESSIONS[market];
  const { weekday, hour, minute } = toZoneParts(now, spec.tz);
  // Weekend is judged in the MARKET's local weekday (北京周六清晨 = 纽约周五晚,
  // US must be open/closed there — the core cross-date trap).
  if (weekday === 0 || weekday === 6) return { phase: 'weekend', phaseKey: 'weekend' };
  const m = hour * 60 + minute;
  const [s1, s2] = spec.sessions;
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

export function marketOfTicker(ticker: string): ClockMarket {
  if (/\.(SH|SZ|BJ)$/i.test(ticker)) return 'A';
  if (/\.HK$/i.test(ticker)) return 'HK';
  return 'US';
}

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
    weekend: () => '周末休市',
  };
  return { ...p, label: labels[p.phaseKey](p.minutes) };
}
