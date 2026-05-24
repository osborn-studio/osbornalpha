/**
 * Per-stock morning note ("每股雷达") — server-side composer.
 *
 * Drives the /radar tab and /api/radar/[ticker] endpoint. Distinct from
 * `composer.ts` which produces one market-wide morning note across the
 * full watchlist. Per the `stock-daily-radar` SKILL.md spec (format
 * adapted from Anthropic equity-research morning-note).
 *
 * Composition (no LLM call — instant + zero token cost):
 *   1. Quote (4-source cascade)
 *   2. Tushare supplements (A-share only; daily_basic + fina_indicator)
 *   3. Flows (5k 积分: hk_hold + limit_list_d + anns_d)
 *   4. Trigger math → radar level + headline
 *   5. Markdown render in morning-note format
 */

import { fetchEastmoneyQuote, type EastmoneyQuote } from '@/lib/data/sources/eastmoney';
import { fetchSinaQuote } from '@/lib/data/sources/sina';
import { fetchTencentQuote } from '@/lib/data/sources/tencent';
import {
  isTushareConfigured,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
  fetchTushareNorthboundTop10,
  fetchTushareLimitList,
} from '@/lib/data/sources/tushare-cached';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { buildCalendar, type CalendarEvent } from './calendar';

export type RadarLevel = 'red' | 'yellow' | 'white';

export interface RadarTrigger {
  rule: string;
  desc: string;
  weight: number;
}

export interface RadarPayload {
  ticker: string;
  name: string;
  market: 'A' | 'HK' | 'US';
  currency: string;
  as_of: string;                // ISO timestamp
  radar_level: RadarLevel;
  level_label: string;          // 关注 / 留意 / 平静
  score: number;
  headline: string;
  sections: {
    price: {
      value: number | null;
      change_pct: number | null;
      currency: string;
      pe_ttm: number | null;
      pb: number | null;
      market_cap_label: string;
      source: string;
    };
    flows: {
      available: boolean;
      // Northbound activity (沪深股通十大成交股 hits)
      north_top10_count_30d: number;       // # of days in past 30 the ticker was in top-10
      north_latest_rank: number | null;    // rank on most recent appearance (1-10)
      north_latest_date: string | null;
      north_latest_amount_yi: number | null;  // 亿元
      north_total_amount_30d_yi: number | null;
      // Limits
      limit_streak: number;
      limit_30d_count: number;
    };
    events: Array<{ date: string; title: string; url: string | null }>;
    calendar: {
      next_earnings_days: number | null;     // days until next earnings (null if unknown / > horizon)
      next_earnings_date: string | null;     // YYYYMMDD
      upcoming: Array<{
        kind: CalendarEvent['kind'];
        date: string;
        days_until: number;
        title: string;
      }>;
    };
    fundamentals: {
      roe: number | null;
      gross_margin: number | null;
      net_margin: number | null;
      dividend_yield: number | null;
    };
  };
  triggers: RadarTrigger[];
  markdown: string;
  disclaimer: string;
}

const DISCLAIMER = '本简报仅作决策辅助，不构成投资建议';

function lookupName(ticker: string): string {
  return MOCK_UNIVERSE.find((u) => u.t === ticker)?.n || ticker;
}

/** Same cascade as /api/quote/batch but inline for one ticker. */
async function resolveQuote(ticker: string): Promise<any | null> {
  const em = await fetchEastmoneyQuote(ticker).catch(() => null);
  if (em) return em;
  const sina = await fetchSinaQuote(ticker).catch(() => null);
  if (sina) return sina;
  const tencent = await fetchTencentQuote(ticker).catch(() => null);
  if (tencent) return tencent;
  return null;
}

function computePriceTriggers(q: any): RadarTrigger[] {
  const t: RadarTrigger[] = [];
  if (typeof q?.change_pct !== 'number') return t;
  if (Math.abs(q.change_pct) >= 5) {
    t.push({
      rule: 'large_move',
      desc: `单日 ${q.change_pct > 0 ? '+' : ''}${q.change_pct.toFixed(2)}%`,
      weight: 3,
    });
  } else if (Math.abs(q.change_pct) >= 3) {
    t.push({
      rule: 'medium_move',
      desc: `单日 ${q.change_pct > 0 ? '+' : ''}${q.change_pct.toFixed(2)}%`,
      weight: 2,
    });
  }
  if (q.turnover && q.turnover >= 5) {
    t.push({ rule: 'high_turnover', desc: `换手率 ${q.turnover.toFixed(2)}%`, weight: 2 });
  }
  if (q.volume_ratio && q.volume_ratio >= 2) {
    t.push({ rule: 'anomalous_volume', desc: `量比 ${q.volume_ratio.toFixed(2)}x`, weight: 2 });
  }
  if (q.amplitude >= 5) {
    t.push({ rule: 'high_amplitude', desc: `振幅 ${q.amplitude.toFixed(2)}%`, weight: 1 });
  }
  return t;
}

function levelFromScore(score: number): { level: RadarLevel; label: string } {
  if (score >= 8) return { level: 'red',    label: '关注' };
  if (score >= 4) return { level: 'yellow', label: '留意' };
  return { level: 'white', label: '平静' };
}

function emojiForLevel(l: RadarLevel): string {
  return l === 'red' ? '🔴' : l === 'yellow' ? '🟡' : '⚪️';
}

function todayCST(): string {
  const now = new Date();
  // 北京时间 = UTC + 8
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

function fmtPrice(p: number | null, currency: string): string {
  if (p === null || !isFinite(p)) return '—';
  return `${currency}${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(p: number | null, signed = true): string {
  if (p === null || !isFinite(p)) return '—';
  const sign = signed && p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function renderMarkdown(payload: Omit<RadarPayload, 'markdown'>): string {
  const { ticker, name, sections, triggers, headline, level_label, radar_level, as_of } = payload;
  const date = as_of.slice(0, 10);
  const lines: string[] = [];

  lines.push(`**${date} · ${ticker} ${name} · ${emojiForLevel(radar_level)} ${level_label}**`);
  lines.push('');
  lines.push(`**Top Call**: ${headline}`);
  lines.push('');
  lines.push(`**价格**: ${fmtPrice(sections.price.value, sections.price.currency)} ${fmtPct(sections.price.change_pct)}` +
    (sections.price.pe_ttm ? ` · PE ${sections.price.pe_ttm.toFixed(1)}x` : '') +
    (sections.price.pb ? ` · PB ${sections.price.pb.toFixed(2)}` : '') +
    (sections.price.market_cap_label && sections.price.market_cap_label !== '—'
      ? ` · 市值 ${sections.price.market_cap_label}`
      : '') +
    `  *(${sections.price.source})*`);

  if (sections.flows.available) {
    lines.push('');
    lines.push('**资金面** (A 股):');
    if (sections.flows.north_top10_count_30d > 0) {
      const parts = [`近 30 天 **${sections.flows.north_top10_count_30d}** 次进入北上前十`];
      if (sections.flows.north_latest_rank !== null) {
        parts.push(`最新排名 #${sections.flows.north_latest_rank}`);
      }
      if (sections.flows.north_total_amount_30d_yi !== null) {
        parts.push(`累计成交 ${sections.flows.north_total_amount_30d_yi.toFixed(0)} 亿`);
      }
      lines.push(`- 🌏 北上：${parts.join(' · ')}`);
    }
    if (sections.flows.limit_streak >= 3) {
      lines.push(`- **${sections.flows.limit_streak} 连板** 🔥`);
    } else if (sections.flows.limit_30d_count > 0) {
      lines.push(`- 近 30 日涨停 ${sections.flows.limit_30d_count} 次`);
    }
  }

  if (sections.fundamentals.roe !== null || sections.fundamentals.dividend_yield !== null) {
    lines.push('');
    lines.push('**基本面**:');
    if (sections.fundamentals.roe !== null) lines.push(`- ROE ${sections.fundamentals.roe.toFixed(1)}%`);
    if (sections.fundamentals.gross_margin !== null) lines.push(`- 毛利率 ${sections.fundamentals.gross_margin.toFixed(1)}%`);
    if (sections.fundamentals.dividend_yield !== null) lines.push(`- 股息率 ${sections.fundamentals.dividend_yield.toFixed(2)}%`);
  }

  if (sections.events.length > 0) {
    lines.push('');
    lines.push('**事件**:');
    for (const e of sections.events.slice(0, 5)) {
      lines.push(`- [${e.date.slice(0, 4)}-${e.date.slice(4, 6)}-${e.date.slice(6, 8)}] ${e.title}`);
    }
  }

  if (sections.calendar.upcoming.length > 0 || sections.calendar.next_earnings_days !== null) {
    lines.push('');
    lines.push('**未来 14 天日历**:');
    if (sections.calendar.next_earnings_days !== null && sections.calendar.next_earnings_date) {
      const d = sections.calendar.next_earnings_date;
      lines.push(`- 📊 财报: ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} (T-${sections.calendar.next_earnings_days})`);
    }
    for (const ev of sections.calendar.upcoming.slice(0, 5)) {
      if (ev.kind === 'earnings_announce') continue; // already shown above
      const icon = ev.kind === 'dividend_ex_date' ? '💰' :
                   ev.kind === 'share_unlock' ? '🔓' :
                   ev.kind === 'earnings_guidance' ? '📈' : '·';
      const datePart = `${ev.date.slice(0, 4)}-${ev.date.slice(4, 6)}-${ev.date.slice(6, 8)}`;
      const tPart = ev.days_until >= 0 ? `T-${ev.days_until}` : `${Math.abs(ev.days_until)}d 前`;
      lines.push(`- ${icon} ${datePart} (${tPart}) ${ev.title}`);
    }
  }

  if (triggers.length > 0) {
    lines.push('');
    lines.push('**信号**:');
    for (const t of triggers) lines.push(`- ${t.desc} (权重 ${t.weight > 0 ? '+' : ''}${t.weight})`);
  }

  lines.push('');
  lines.push(`*${DISCLAIMER}*`);

  return lines.join('\n');
}

function buildHeadline(payload: {
  change_pct: number | null;
  flows: RadarPayload['sections']['flows'];
  events: RadarPayload['sections']['events'];
  triggers: RadarTrigger[];
  level: RadarLevel;
  nextEarningsDays: number | null;
}): string {
  const parts: string[] = [];
  if (payload.change_pct !== null) {
    parts.push(`单日 ${payload.change_pct > 0 ? '+' : ''}${payload.change_pct.toFixed(2)}%`);
  }
  // Earnings T- countdown takes precedence in the headline when imminent
  if (payload.nextEarningsDays !== null && payload.nextEarningsDays <= 7) {
    parts.push(
      payload.nextEarningsDays <= 1
        ? '财报前夜 T-1'
        : `财报临近 T-${payload.nextEarningsDays}`,
    );
  }
  if (payload.flows.limit_streak >= 3) {
    parts.push(`${payload.flows.limit_streak} 连板`);
  } else if (payload.flows.north_latest_rank !== null && payload.flows.north_latest_rank <= 3) {
    parts.push(`北上前十 #${payload.flows.north_latest_rank}`);
  } else if (payload.flows.north_top10_count_30d >= 5) {
    parts.push(`近 30 天 ${payload.flows.north_top10_count_30d} 次进北上前十`);
  }
  if (payload.events.length > 0) {
    parts.push(`今日 ${payload.events.length} 条公告`);
  }
  if (parts.length === 0) {
    return payload.level === 'white'
      ? '今日无重大事件，维持持仓'
      : '信号偏离常态，留意';
  }
  return parts.join(' · ');
}

/**
 * Build the radar payload for one ticker. Throws only on catastrophic
 * failure (no quote source at all); otherwise returns a payload with
 * "暂无数据" where appropriate.
 */
export async function buildRadar(ticker: string): Promise<RadarPayload> {
  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);

  // Layer 1: quote (cascade through 4 sources)
  const quote = await resolveQuote(ticker);

  // Layer 2: A-share supplements (anns_d skipped — needs > 5000 积分)
  const [dailyBasic, finaInd, northTop10, limitList, calendar] = await Promise.all([
    isA && isTushareConfigured() ? fetchTushareDailyBasic(ticker).catch(() => null) : Promise.resolve(null),
    isA && isTushareConfigured() ? fetchTushareFinaIndicator(ticker).catch(() => null) : Promise.resolve(null),
    isA && isTushareConfigured() ? fetchTushareNorthboundTop10(ticker, 30).catch(() => []) : Promise.resolve([]),
    isA && isTushareConfigured() ? fetchTushareLimitList(ticker, 30).catch(() => []) : Promise.resolve([]),
    isA && isTushareConfigured() ? buildCalendar(ticker, 14).catch(() => null) : Promise.resolve(null),
  ]);
  const anns: any[] = [];  // anns_d skipped (needs higher tier)

  // Resolve display fields
  const name = quote?.name || lookupName(ticker);
  const market: 'A' | 'HK' | 'US' = quote?.market || (isA ? 'A' : ticker.includes('.HK') ? 'HK' : 'US');
  const currency = quote?.currency || (market === 'A' ? '¥' : market === 'HK' ? 'HK$' : '$');

  // Flows math
  const latestNorth = northTop10[0];
  const totalAmt = northTop10.reduce((s: number, r: any) => s + (r.amount || 0), 0);
  const flowsSection: RadarPayload['sections']['flows'] = {
    available: northTop10.length > 0 || limitList.length > 0,
    north_top10_count_30d: northTop10.length,
    north_latest_rank: latestNorth?.rank ?? null,
    north_latest_date: latestNorth?.trade_date ?? null,
    north_latest_amount_yi: latestNorth?.amount ? latestNorth.amount / 1e8 : null,
    north_total_amount_30d_yi: northTop10.length > 0 ? totalAmt / 1e8 : null,
    limit_streak: limitList[0]?.limit_times || 0,
    limit_30d_count: limitList.filter((r) => r.limit === 'U' || !r.limit).length,
  };

  // Triggers
  const triggers: RadarTrigger[] = [];
  if (quote) triggers.push(...computePriceTriggers(quote));
  if (flowsSection.north_top10_count_30d >= 10) {
    triggers.push({
      rule: 'north_top10_frequent',
      desc: `近 30 天 ${flowsSection.north_top10_count_30d} 次进入北上前十`,
      weight: 3,
    });
  } else if (flowsSection.north_top10_count_30d >= 5) {
    triggers.push({
      rule: 'north_top10_recurring',
      desc: `近 30 天 ${flowsSection.north_top10_count_30d} 次进入北上前十`,
      weight: 2,
    });
  } else if (flowsSection.north_top10_count_30d > 0) {
    triggers.push({
      rule: 'north_top10_appeared',
      desc: `近 30 天 ${flowsSection.north_top10_count_30d} 次进入北上前十`,
      weight: 1,
    });
  }
  if (flowsSection.north_latest_rank !== null && flowsSection.north_latest_rank <= 3) {
    triggers.push({
      rule: 'north_top3_today',
      desc: `最新北上排名第 ${flowsSection.north_latest_rank}`,
      weight: 3,
    });
  }
  if (flowsSection.limit_streak >= 3) {
    triggers.push({
      rule: `limit_streak_${flowsSection.limit_streak}b`,
      desc: `${flowsSection.limit_streak} 连板`,
      weight: Math.min(5, flowsSection.limit_streak),
    });
  }

  // ── Calendar triggers (event-driven catalysts) ─────────────────────────
  const calendarSection: RadarPayload['sections']['calendar'] = {
    next_earnings_days: calendar?.next_earnings?.days_until ?? null,
    next_earnings_date: calendar?.next_earnings?.date ?? null,
    upcoming: (calendar?.events || []).slice(0, 8).map((e) => ({
      kind: e.kind,
      date: e.date,
      days_until: e.days_until,
      title: e.title,
    })),
  };

  if (calendar?.next_earnings && calendar.next_earnings.days_until >= 0) {
    const du = calendar.next_earnings.days_until;
    if (du <= 1) {
      triggers.push({
        rule: 'earnings_t1',
        desc: du === 0 ? '今日财报披露' : '财报前夜 (T-1)',
        weight: 5,
      });
    } else if (du <= 7) {
      triggers.push({
        rule: 'earnings_t7',
        desc: `财报临近 T-${du}`,
        weight: 3,
      });
    } else if (du <= 14) {
      triggers.push({
        rule: 'earnings_t14',
        desc: `财报临近 T-${du}`,
        weight: 1,
      });
    }
  }
  for (const ev of calendar?.events || []) {
    if (ev.kind === 'dividend_ex_date' && ev.days_until >= 0 && ev.days_until <= 3) {
      triggers.push({
        rule: 'dividend_ex_imminent',
        desc: ev.title,
        weight: 2,
      });
    } else if (ev.kind === 'share_unlock' && ev.days_until <= 7) {
      // Unlocks are risk-off — negative weight (be careful)
      triggers.push({
        rule: 'share_unlock_imminent',
        desc: ev.title,
        weight: -2,
      });
    } else if (ev.kind === 'earnings_guidance' && ev.days_until >= -7) {
      // Recent guidance (good or bad) is informational; weight by type
      const type = String(ev.details?.type || '');
      const positiveTypes = new Set(['预增', '扭亏', '略增', '续盈']);
      const negativeTypes = new Set(['预减', '预亏', '略减', '续亏']);
      let w = 1;
      if (positiveTypes.has(type)) w = 2;
      else if (negativeTypes.has(type)) w = -2;
      triggers.push({
        rule: 'guidance_recent',
        desc: ev.title,
        weight: w,
      });
    }
  }

  const score = triggers.reduce((s, t) => s + t.weight, 0);
  const { level, label: levelLabel } = levelFromScore(score);

  const events = anns.slice(0, 5).map((a) => ({ date: a.ann_date, title: a.title, url: a.url || null }));

  const headline = buildHeadline({
    change_pct: quote?.change_pct ?? null,
    flows: flowsSection,
    events,
    triggers,
    level,
    nextEarningsDays: calendarSection.next_earnings_days,
  });

  const partialPayload: Omit<RadarPayload, 'markdown'> = {
    ticker,
    name,
    market,
    currency,
    as_of: new Date().toISOString(),
    radar_level: level,
    level_label: levelLabel,
    score,
    headline,
    sections: {
      price: {
        value: quote?.price ?? null,
        change_pct: quote?.change_pct ?? null,
        currency,
        pe_ttm: dailyBasic?.pe_ttm ?? quote?.pe_ttm ?? null,
        pb: dailyBasic?.pb ?? quote?.pb ?? null,
        market_cap_label: quote?.market_cap_label || '—',
        source: quote?.source || 'none',
      },
      flows: flowsSection,
      events,
      calendar: calendarSection,
      fundamentals: {
        roe: finaInd?.roe ?? null,
        gross_margin: finaInd?.grossprofit_margin ?? null,
        net_margin: finaInd?.netprofit_margin ?? null,
        dividend_yield: dailyBasic?.dv_ratio ?? null,
      },
    },
    triggers,
    disclaimer: DISCLAIMER,
  };

  return { ...partialPayload, markdown: renderMarkdown(partialPayload) };
}
