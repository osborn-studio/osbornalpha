/**
 * Forward-looking event calendar for an A-share — combines:
 *
 *   disclosure_date  → expected earnings announce date (pre_date / actual_date)
 *   forecast         → 业绩预告 (if issued for the upcoming quarter)
 *   dividend         → ex-dividend date (the actionable one for the holder)
 *   share_float      → 限售解禁 schedule
 *
 * Used by:
 *   - /api/calendar/[ticker]              single-stock JSON for /radar detail
 *   - /api/calendar/batch                  watchlist fan-out for "catalyst" tab
 *   - buildRadar() in radar.ts             surfaces earnings_imminent triggers
 *
 * Returns events sorted by date ascending (soonest first), each with an
 * `days_until` integer so the UI/Markdown can highlight "T-3" style.
 */

import {
  isTushareConfigured,
  fetchTushareDisclosureDate,
  fetchTushareForecast,
  fetchTushareDividend,
  fetchTushareShareFloat,
} from '@/lib/data/sources/tushare-cached';

export type CalendarEventKind =
  | 'earnings_announce'   // 财报披露日
  | 'earnings_guidance'   // 业绩预告
  | 'dividend_ex_date'    // 除权除息日
  | 'dividend_record'     // 股权登记日
  | 'share_unlock';       // 限售解禁

export interface CalendarEvent {
  kind: CalendarEventKind;
  /** YYYYMMDD */
  date: string;
  /** Negative = past, 0 = today, positive = future trading sessions away. */
  days_until: number;
  title: string;
  /** Free-form context (numbers, types, etc) for the UI to render. */
  details: Record<string, unknown>;
}

export interface CalendarPayload {
  ticker: string;
  /** ISO date in BJ time */
  as_of: string;
  /** Window we scanned */
  horizon_days: number;
  events: CalendarEvent[];
  /** Convenience: just the earliest qualifying earnings date in horizon. */
  next_earnings: { date: string; days_until: number; source: 'actual' | 'pre' | 'modify' } | null;
}

function bjToday(): Date {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function bjTodayYmd(): string {
  return bjToday().toISOString().slice(0, 10).replace(/-/g, '');
}

function daysBetween(ymdFrom: string, ymdTo: string): number {
  // ymd = YYYYMMDD
  const toDate = (s: string) =>
    new Date(Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
    ));
  const ms = toDate(ymdTo).getTime() - toDate(ymdFrom).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Pick the most informative date for a disclosure row. */
function pickDisclosureDate(d: {
  actual_date?: string | null;
  pre_date?: string | null;
  modify_date?: string | null;
}): { date: string; source: 'actual' | 'pre' | 'modify' } | null {
  if (d.actual_date) return { date: d.actual_date, source: 'actual' };
  if (d.modify_date) return { date: d.modify_date, source: 'modify' };
  if (d.pre_date) return { date: d.pre_date, source: 'pre' };
  return null;
}

export async function buildCalendar(ticker: string, horizonDays = 14): Promise<CalendarPayload> {
  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);
  const today = bjTodayYmd();
  const horizonEnd = (() => {
    const t = bjToday();
    const end = new Date(t.getTime() + horizonDays * 24 * 60 * 60 * 1000);
    return end.toISOString().slice(0, 10).replace(/-/g, '');
  })();

  if (!isA || !isTushareConfigured()) {
    return {
      ticker,
      as_of: new Date().toISOString(),
      horizon_days: horizonDays,
      events: [],
      next_earnings: null,
    };
  }

  // Pull in parallel (all cached at DAY TTL)
  const [disclosures, forecasts, dividends, unlocks] = await Promise.all([
    fetchTushareDisclosureDate(ticker).catch(() => []),
    fetchTushareForecast(ticker, 180).catch(() => []),
    fetchTushareDividend(ticker).catch(() => []),
    fetchTushareShareFloat(ticker, horizonDays + 30).catch(() => []),
  ]);

  const events: CalendarEvent[] = [];

  // ── Earnings announcements ──
  let nextEarnings: CalendarPayload['next_earnings'] = null;
  for (const d of disclosures) {
    const picked = pickDisclosureDate(d);
    if (!picked) continue;
    const du = daysBetween(today, picked.date);
    if (du > horizonDays) continue;       // beyond horizon
    if (du < -7) continue;                 // way in the past
    events.push({
      kind: 'earnings_announce',
      date: picked.date,
      days_until: du,
      title: du >= 0
        ? `财报披露 T${du === 0 ? '' : '-' + du}（${d.end_date.slice(0, 4)}Q${Math.ceil(Number(d.end_date.slice(4, 6)) / 3)}）`
        : `财报已披露 (${picked.date})`,
      details: { reporting_period: d.end_date, date_source: picked.source, raw: d },
    });
    if (du >= 0 && (!nextEarnings || du < nextEarnings.days_until)) {
      nextEarnings = { date: picked.date, days_until: du, source: picked.source };
    }
  }

  // ── Earnings guidance (forecast) — flag only if recent (last 30d) ──
  for (const f of forecasts) {
    const du = daysBetween(today, f.ann_date);
    if (du < -30 || du > 7) continue;
    const range = f.p_change_min !== null && f.p_change_max !== null
      ? `${f.p_change_min}% ~ ${f.p_change_max}%`
      : null;
    events.push({
      kind: 'earnings_guidance',
      date: f.ann_date,
      days_until: du,
      title: `业绩预告 ${f.type || ''}${range ? ` · 同比 ${range}` : ''}`.trim(),
      details: { type: f.type, p_change_min: f.p_change_min, p_change_max: f.p_change_max, summary: f.summary },
    });
  }

  // ── Dividend ex-dates ──
  for (const d of dividends) {
    if (!d.ex_date) continue;
    const du = daysBetween(today, d.ex_date);
    if (du < -3 || du > horizonDays) continue;
    events.push({
      kind: 'dividend_ex_date',
      date: d.ex_date,
      days_until: du,
      title: `除权除息日${d.cash_div ? ` · 派现 ¥${d.cash_div}/股` : ''}${d.stk_div ? ` · 送转 ${d.stk_div}` : ''}`,
      details: { cash_div: d.cash_div, stk_div: d.stk_div, record_date: d.record_date, div_proc: d.div_proc },
    });
  }

  // ── Share unlocks ──
  for (const u of unlocks) {
    const du = daysBetween(today, u.float_date);
    if (du < 0 || du > horizonDays) continue;
    const ratioStr = u.float_ratio !== null && u.float_ratio !== undefined ? ` (${u.float_ratio.toFixed(2)}% 流通)` : '';
    events.push({
      kind: 'share_unlock',
      date: u.float_date,
      days_until: du,
      title: `限售解禁 ${u.float_share.toFixed(0)} 万股${ratioStr}`,
      details: { float_share: u.float_share, float_ratio: u.float_ratio, holder_name: u.holder_name, share_type: u.share_type },
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    ticker,
    as_of: new Date().toISOString(),
    horizon_days: horizonDays,
    events,
    next_earnings: nextEarnings,
  };
}
