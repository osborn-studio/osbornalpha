/**
 * A-share (沪深) market-hours clock — pure function, no I/O.
 *
 * Drives the /today page's "盘前时钟" line. All判定 based on Asia/Shanghai
 * wall-clock time regardless of server TZ, extracted via Intl so it is
 * correct whether the process runs in UTC (Vercel) or CST (local dev).
 *
 * Known simplification: does NOT account for A-share holidays (春节/国庆
 * etc.) — a holiday will be reported as a normal weekday phase. Acceptable
 * for P3 scope; a holiday calendar can be layered on later (tracked debt).
 */

export interface MarketPhase {
  phase: 'pre' | 'open' | 'lunch' | 'closed' | 'weekend';
  label: string; // e.g. '盘前 · A股开盘还有 48 分钟'
}

interface BeijingParts {
  weekday: number; // 0=Sun .. 6=Sat
  hour: number;
  minute: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function toBeijingParts(now: Date): BeijingParts {
  // en-US short format gives us: "Mon, 06/29/2026, 09:30:00" style pieces via
  // formatToParts, which is more robust to parse than a locale string.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
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

export function aShareMarketPhase(now: Date): MarketPhase {
  const { weekday, hour, minute } = toBeijingParts(now);
  const minutesOfDay = hour * 60 + minute;

  if (weekday === 0 || weekday === 6) {
    return { phase: 'weekend', label: '周末休市' };
  }

  const OPEN_AM = 9 * 60 + 30;   // 09:30
  const LUNCH_START = 11 * 60 + 30; // 11:30
  const LUNCH_END = 13 * 60;    // 13:00
  const CLOSE = 15 * 60;        // 15:00

  if (minutesOfDay < OPEN_AM) {
    const mins = OPEN_AM - minutesOfDay;
    return { phase: 'pre', label: `盘前 · A股开盘还有 ${mins} 分钟` };
  }

  if (minutesOfDay < LUNCH_START) {
    const mins = LUNCH_START - minutesOfDay;
    return { phase: 'open', label: `盘中 · 午休还有 ${mins} 分钟` };
  }

  if (minutesOfDay < LUNCH_END) {
    const mins = LUNCH_END - minutesOfDay;
    return { phase: 'lunch', label: `午休 · 下午开盘还有 ${mins} 分钟` };
  }

  if (minutesOfDay < CLOSE) {
    const mins = CLOSE - minutesOfDay;
    return { phase: 'open', label: `盘中 · 收盘还有 ${mins} 分钟` };
  }

  return { phase: 'closed', label: '已收盘' };
}
