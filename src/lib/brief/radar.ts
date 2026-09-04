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

import { classifyMarket, currencyOfMarket } from '@/lib/utils';
import type { Market } from '@/lib/supabase/database.types';
import {
  isTushareConfigured,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
  fetchTushareNorthboundTop10,
  fetchTushareLimitList,
} from '@/lib/data/sources/tushare-cached';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { buildCalendar, type CalendarEvent } from './calendar';
import type { AppLocale } from '@/lib/i18n/locale';
import { resolveQuote } from '@/lib/quotes/resolve-quote';

export type RadarLevel = 'red' | 'yellow' | 'white';

export interface RadarTrigger {
  rule: string;
  desc: string;
  weight: number;
}

export interface RadarPayload {
  ticker: string;
  name: string;
  market: Market;
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
      volume_ratio?: number | null;
      market_cap_label: string;
      source: string;
      updated_at?: string | null;
      delayed?: boolean;
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

// Localized level_label + trigger-desc + headline phrase templates.
// buildRadar()'s `locale` param defaults to 'zh' (see below), so cron
// (daily-radar) and composer.ts call sites — which never pass a locale —
// compile and behave unchanged. Only the two API routes that read
// getRequestLocale() thread a real locale through.
const RADAR_TEXT = {
  zh: {
    levelLabel: { red: '关注', yellow: '留意', white: '平静' } as Record<RadarLevel, string>,
    trigger: {
      dailyMove: (pct: number) => `单日 ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
      highTurnover: (v: number) => `换手率 ${v.toFixed(2)}%`,
      anomalousVolume: (v: number) => `量比 ${v.toFixed(2)}x`,
      highAmplitude: (v: number) => `振幅 ${v.toFixed(2)}%`,
      northTop10Count: (n: number) => `近 30 天 ${n} 次进入北上前十`,
      northTop3Today: (rank: number) => `最新北上排名第 ${rank}`,
      limitStreak: (n: number) => `${n} 连板`,
      earningsToday: '今日财报披露',
      earningsT1: '财报前夜 (T-1)',
      earningsTn: (n: number) => `财报临近 T-${n}`,
    },
    headline: {
      dailyMove: (pct: number) => `单日 ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
      earningsT1: '财报前夜 T-1',
      earningsTn: (n: number) => `财报临近 T-${n}`,
      limitStreak: (n: number) => `${n} 连板`,
      northTop10Rank: (rank: number) => `北上前十 #${rank}`,
      northTop10Count: (n: number) => `近 30 天 ${n} 次进北上前十`,
      announcements: (n: number) => `今日 ${n} 条公告`,
      calmFallback: '今日无重大事件，维持持仓',
      elevatedFallback: '信号偏离常态，留意',
    },
    markdown: {
      disclaimer: '本简报仅作决策辅助，不构成投资建议',
      priceHeader: '价格',
      marketCap: '市值',
      flowsHeaderLine: '**资金面** (A 股):',
      northPrefix: '北上',
      northCount: (n: number) => `近 30 天 **${n}** 次进入北上前十`,
      northRank: (rank: number) => `最新排名 #${rank}`,
      northAmount: (yi: number) => `累计成交 ${yi.toFixed(0)} 亿`,
      limitStreak: (n: number) => `**${n} 连板** 🔥`,
      limit30d: (n: number) => `近 30 日涨停 ${n} 次`,
      fundamentalsHeader: '基本面',
      grossMargin: '毛利率',
      dividendYield: '股息率',
      eventsHeader: '事件',
      calendarHeader: '未来 14 天日历',
      earningsLabel: '财报',
      daysAgo: (d: number) => `${d}d 前`,
      signalsHeader: '信号',
      weightLabel: '权重',
    },
  },
  en: {
    levelLabel: { red: 'Alert', yellow: 'Watch', white: 'Calm' } as Record<RadarLevel, string>,
    trigger: {
      dailyMove: (pct: number) => `Daily ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
      highTurnover: (v: number) => `Turnover ${v.toFixed(2)}%`,
      anomalousVolume: (v: number) => `Volume ratio ${v.toFixed(2)}x`,
      highAmplitude: (v: number) => `Amplitude ${v.toFixed(2)}%`,
      northTop10Count: (n: number) => `Northbound top-10 ${n}x in 30d`,
      northTop3Today: (rank: number) => `Latest northbound rank #${rank}`,
      limitStreak: (n: number) => `${n} consecutive limit-ups`,
      earningsToday: 'Earnings released today',
      earningsT1: 'Earnings eve (T-1)',
      earningsTn: (n: number) => `Earnings approaching T-${n}`,
    },
    headline: {
      dailyMove: (pct: number) => `Daily ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
      earningsT1: 'Earnings eve T-1',
      earningsTn: (n: number) => `Earnings approaching T-${n}`,
      limitStreak: (n: number) => `${n} consecutive limit-ups`,
      northTop10Rank: (rank: number) => `Northbound top-10 #${rank}`,
      northTop10Count: (n: number) => `Northbound top-10 ${n}x in 30d`,
      announcements: (n: number) => `${n} announcements today`,
      calmFallback: 'No major events today, hold steady',
      elevatedFallback: 'Signal deviates from normal — watch closely',
    },
    markdown: {
      disclaimer: 'This brief is decision support only and does not constitute investment advice',
      priceHeader: 'Price',
      marketCap: 'Mkt cap',
      flowsHeaderLine: '**Flows** (A-share):',
      northPrefix: 'Northbound',
      northCount: (n: number) => `**${n}** northbound top-10 entries in 30d`,
      northRank: (rank: number) => `latest rank #${rank}`,
      northAmount: (yi: number) => `cumulative ¥${(yi / 10).toFixed(1)}B`,
      limitStreak: (n: number) => `**${n} consecutive limit-ups** 🔥`,
      limit30d: (n: number) => `${n} limit-ups in 30d`,
      fundamentalsHeader: 'Fundamentals',
      grossMargin: 'Gross margin',
      dividendYield: 'Dividend yield',
      eventsHeader: 'Events',
      calendarHeader: 'Next 14 days',
      earningsLabel: 'Earnings',
      daysAgo: (d: number) => `${d}d ago`,
      signalsHeader: 'Signals',
      weightLabel: 'weight',
    },
  },
} satisfies Record<AppLocale, unknown>;

function lookupName(ticker: string): string {
  return MOCK_UNIVERSE.find((u) => u.t === ticker)?.n || ticker;
}

function computePriceTriggers(q: any, locale: AppLocale): RadarTrigger[] {
  const T = RADAR_TEXT[locale].trigger;
  const t: RadarTrigger[] = [];
  if (typeof q?.change_pct !== 'number') return t;
  if (Math.abs(q.change_pct) >= 5) {
    t.push({
      rule: 'large_move',
      desc: T.dailyMove(q.change_pct),
      weight: 3,
    });
  } else if (Math.abs(q.change_pct) >= 3) {
    t.push({
      rule: 'medium_move',
      desc: T.dailyMove(q.change_pct),
      weight: 2,
    });
  }
  if (q.turnover && q.turnover >= 5) {
    t.push({ rule: 'high_turnover', desc: T.highTurnover(q.turnover), weight: 2 });
  }
  if (q.volume_ratio && q.volume_ratio >= 2) {
    t.push({ rule: 'anomalous_volume', desc: T.anomalousVolume(q.volume_ratio), weight: 2 });
  }
  if (q.amplitude >= 5) {
    t.push({ rule: 'high_amplitude', desc: T.highAmplitude(q.amplitude), weight: 1 });
  }
  return t;
}

function levelFromScore(score: number, locale: AppLocale): { level: RadarLevel; label: string } {
  const labels = RADAR_TEXT[locale].levelLabel;
  if (score >= 8) return { level: 'red',    label: labels.red };
  if (score >= 4) return { level: 'yellow', label: labels.yellow };
  return { level: 'white', label: labels.white };
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

function renderMarkdown(payload: Omit<RadarPayload, 'markdown'>, locale: AppLocale): string {
  const { ticker, name, sections, triggers, headline, level_label, radar_level, as_of } = payload;
  const M = RADAR_TEXT[locale].markdown;
  const date = as_of.slice(0, 10);
  const lines: string[] = [];

  lines.push(`**${date} · ${ticker} ${name} · ${emojiForLevel(radar_level)} ${level_label}**`);
  lines.push('');
  lines.push(`**Top Call**: ${headline}`);
  lines.push('');
  lines.push(`**${M.priceHeader}**: ${fmtPrice(sections.price.value, sections.price.currency)} ${fmtPct(sections.price.change_pct)}` +
    (sections.price.pe_ttm ? ` · PE ${sections.price.pe_ttm.toFixed(1)}x` : '') +
    (sections.price.pb ? ` · PB ${sections.price.pb.toFixed(2)}` : '') +
    (sections.price.market_cap_label && sections.price.market_cap_label !== '—'
      ? ` · ${M.marketCap} ${sections.price.market_cap_label}`
      : '') +
    `  *(${sections.price.source})*`);

  if (sections.flows.available) {
    lines.push('');
    lines.push(M.flowsHeaderLine);
    if (sections.flows.north_top10_count_30d > 0) {
      const parts = [M.northCount(sections.flows.north_top10_count_30d)];
      if (sections.flows.north_latest_rank !== null) {
        parts.push(M.northRank(sections.flows.north_latest_rank));
      }
      if (sections.flows.north_total_amount_30d_yi !== null) {
        parts.push(M.northAmount(sections.flows.north_total_amount_30d_yi));
      }
      lines.push(`- 🌏 ${M.northPrefix}：${parts.join(' · ')}`);
    }
    if (sections.flows.limit_streak >= 3) {
      lines.push(`- ${M.limitStreak(sections.flows.limit_streak)}`);
    } else if (sections.flows.limit_30d_count > 0) {
      lines.push(`- ${M.limit30d(sections.flows.limit_30d_count)}`);
    }
  }

  if (sections.fundamentals.roe !== null || sections.fundamentals.dividend_yield !== null) {
    lines.push('');
    lines.push(`**${M.fundamentalsHeader}**:`);
    if (sections.fundamentals.roe !== null) lines.push(`- ROE ${sections.fundamentals.roe.toFixed(1)}%`);
    if (sections.fundamentals.gross_margin !== null) lines.push(`- ${M.grossMargin} ${sections.fundamentals.gross_margin.toFixed(1)}%`);
    if (sections.fundamentals.dividend_yield !== null) lines.push(`- ${M.dividendYield} ${sections.fundamentals.dividend_yield.toFixed(2)}%`);
  }

  if (sections.events.length > 0) {
    lines.push('');
    lines.push(`**${M.eventsHeader}**:`);
    for (const e of sections.events.slice(0, 5)) {
      lines.push(`- [${e.date.slice(0, 4)}-${e.date.slice(4, 6)}-${e.date.slice(6, 8)}] ${e.title}`);
    }
  }

  if (sections.calendar.upcoming.length > 0 || sections.calendar.next_earnings_days !== null) {
    lines.push('');
    lines.push(`**${M.calendarHeader}**:`);
    if (sections.calendar.next_earnings_days !== null && sections.calendar.next_earnings_date) {
      const d = sections.calendar.next_earnings_date;
      lines.push(`- 📊 ${M.earningsLabel}: ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} (T-${sections.calendar.next_earnings_days})`);
    }
    for (const ev of sections.calendar.upcoming.slice(0, 5)) {
      if (ev.kind === 'earnings_announce') continue; // already shown above
      const icon = ev.kind === 'dividend_ex_date' ? '💰' :
                   ev.kind === 'share_unlock' ? '🔓' :
                   ev.kind === 'earnings_guidance' ? '📈' : '·';
      const datePart = `${ev.date.slice(0, 4)}-${ev.date.slice(4, 6)}-${ev.date.slice(6, 8)}`;
      const tPart = ev.days_until >= 0 ? `T-${ev.days_until}` : M.daysAgo(Math.abs(ev.days_until));
      lines.push(`- ${icon} ${datePart} (${tPart}) ${ev.title}`);
    }
  }

  if (triggers.length > 0) {
    lines.push('');
    lines.push(`**${M.signalsHeader}**:`);
    for (const t of triggers) lines.push(`- ${t.desc} (${M.weightLabel} ${t.weight > 0 ? '+' : ''}${t.weight})`);
  }

  lines.push('');
  lines.push(`*${M.disclaimer}*`);

  return lines.join('\n');
}

function buildHeadline(payload: {
  change_pct: number | null;
  flows: RadarPayload['sections']['flows'];
  events: RadarPayload['sections']['events'];
  triggers: RadarTrigger[];
  level: RadarLevel;
  nextEarningsDays: number | null;
  locale: AppLocale;
}): string {
  const H = RADAR_TEXT[payload.locale].headline;
  const parts: string[] = [];
  if (payload.change_pct !== null) {
    parts.push(H.dailyMove(payload.change_pct));
  }
  // Earnings T- countdown takes precedence in the headline when imminent
  if (payload.nextEarningsDays !== null && payload.nextEarningsDays <= 7) {
    parts.push(
      payload.nextEarningsDays <= 1
        ? H.earningsT1
        : H.earningsTn(payload.nextEarningsDays),
    );
  }
  if (payload.flows.limit_streak >= 3) {
    parts.push(H.limitStreak(payload.flows.limit_streak));
  } else if (payload.flows.north_latest_rank !== null && payload.flows.north_latest_rank <= 3) {
    parts.push(H.northTop10Rank(payload.flows.north_latest_rank));
  } else if (payload.flows.north_top10_count_30d >= 5) {
    parts.push(H.northTop10Count(payload.flows.north_top10_count_30d));
  }
  if (payload.events.length > 0) {
    parts.push(H.announcements(payload.events.length));
  }
  if (parts.length === 0) {
    return payload.level === 'white' ? H.calmFallback : H.elevatedFallback;
  }
  return parts.join(' · ');
}

/**
 * Build the radar payload for one ticker. Throws only on catastrophic
 * failure (no quote source at all); otherwise returns a payload with
 * "暂无数据" where appropriate.
 */
export async function buildRadar(ticker: string, locale: AppLocale = 'zh'): Promise<RadarPayload> {
  const T = RADAR_TEXT[locale].trigger;
  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);

  // Layer 1: quote (cascade through 4 sources)
  const quote = (await resolveQuote(ticker)).quote;

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
  const market: Market = quote?.market || classifyMarket(ticker);
  const currency = quote?.currency || currencyOfMarket(market);

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
  if (quote) triggers.push(...computePriceTriggers(quote, locale));
  if (flowsSection.north_top10_count_30d >= 10) {
    triggers.push({
      rule: 'north_top10_frequent',
      desc: T.northTop10Count(flowsSection.north_top10_count_30d),
      weight: 3,
    });
  } else if (flowsSection.north_top10_count_30d >= 5) {
    triggers.push({
      rule: 'north_top10_recurring',
      desc: T.northTop10Count(flowsSection.north_top10_count_30d),
      weight: 2,
    });
  } else if (flowsSection.north_top10_count_30d > 0) {
    triggers.push({
      rule: 'north_top10_appeared',
      desc: T.northTop10Count(flowsSection.north_top10_count_30d),
      weight: 1,
    });
  }
  if (flowsSection.north_latest_rank !== null && flowsSection.north_latest_rank <= 3) {
    triggers.push({
      rule: 'north_top3_today',
      desc: T.northTop3Today(flowsSection.north_latest_rank),
      weight: 3,
    });
  }
  if (flowsSection.limit_streak >= 3) {
    triggers.push({
      rule: `limit_streak_${flowsSection.limit_streak}b`,
      desc: T.limitStreak(flowsSection.limit_streak),
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
        desc: du === 0 ? T.earningsToday : T.earningsT1,
        weight: 5,
      });
    } else if (du <= 7) {
      triggers.push({
        rule: 'earnings_t7',
        desc: T.earningsTn(du),
        weight: 3,
      });
    } else if (du <= 14) {
      triggers.push({
        rule: 'earnings_t14',
        desc: T.earningsTn(du),
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
  const { level, label: levelLabel } = levelFromScore(score, locale);

  const events = anns.slice(0, 5).map((a) => ({ date: a.ann_date, title: a.title, url: a.url || null }));

  const headline = buildHeadline({
    change_pct: quote?.change_pct ?? null,
    flows: flowsSection,
    events,
    triggers,
    level,
    nextEarningsDays: calendarSection.next_earnings_days,
    locale,
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
        volume_ratio: quote?.volume_ratio ?? null,
        market_cap_label: quote?.market_cap_label || '—',
        source: quote?.source || 'none',
        updated_at: quote?.updated_at ?? null,
        delayed: quote?.delayed ?? false,
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
    disclaimer: RADAR_TEXT[locale].markdown.disclaimer,
  };

  return { ...partialPayload, markdown: renderMarkdown(partialPayload, locale) };
}
