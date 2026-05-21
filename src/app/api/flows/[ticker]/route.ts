import { NextResponse } from 'next/server';
import {
  isTushareConfigured,
  fetchTushareHkHold,
  fetchTushareLimitList,
  fetchTushareAnnouncements,
} from '@/lib/data/sources/tushare-cached';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/flows/[ticker]
 *
 * Aggregated 资金面 + 事件面 endpoint backed by 5000-积分 Tushare data.
 * One round-trip = three Tushare calls (all cached at 6h TTL):
 *
 *   hk_hold        →  northbound holdings (5d / 20d net change)
 *   limit_list_d   →  recent limit-ups, current consecutive streak
 *   anns_d         →  recent disclosure announcements
 *
 * A-share only. Other markets return a clean "unsupported" payload so
 * the front-end can render a graceful "not available" state.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  if (!/\.(SH|SZ|BJ)$/i.test(ticker)) {
    return NextResponse.json(
      { source: 'unsupported', ticker, error: '资金面数据仅支持 A 股' },
      { status: 200 }
    );
  }

  if (!isTushareConfigured()) {
    return NextResponse.json(
      { source: 'no-token', ticker, error: 'TUSHARE_TOKEN 未配置' },
      { status: 200 }
    );
  }

  try {
    const [hkHold, limitList, anns] = await Promise.all([
      fetchTushareHkHold(ticker, 25).catch(() => []),
      fetchTushareLimitList(ticker, 30).catch(() => []),
      fetchTushareAnnouncements(ticker, 30).catch(() => []),
    ]);

    // ── 北上 signal math ──
    // Newest first. Compute delta = today.ratio − N-days-ago.ratio (in %).
    const northbound = (() => {
      if (hkHold.length === 0) {
        return { available: false, latest_ratio: null, delta_5d: null, delta_20d: null, latest_date: null };
      }
      const latest = hkHold[0];
      const fiveAgo = hkHold[Math.min(5, hkHold.length - 1)];
      const twentyAgo = hkHold[Math.min(20, hkHold.length - 1)];
      return {
        available: true,
        latest_date: latest.trade_date,
        latest_ratio: latest.ratio,                                   // %
        latest_vol: latest.vol,                                       // 股
        delta_5d:  latest.ratio - (fiveAgo?.ratio ?? latest.ratio),    // 百分点
        delta_20d: latest.ratio - (twentyAgo?.ratio ?? latest.ratio),  // 百分点
        series: hkHold.slice(0, 20).map((r) => ({
          date: r.trade_date,
          ratio: r.ratio,
          vol: r.vol,
        })),
      };
    })();

    // ── 涨跌停 signal math ──
    // limit_times = n 连板 (Tushare provides this directly when available).
    // For older rows where it's missing, infer from contiguous dates with limit='U'.
    const limits = (() => {
      if (limitList.length === 0) {
        return { current_streak: 0, last_30d_up_count: 0, latest: null, recent: [] };
      }
      const ups = limitList.filter((r) => r.limit === 'U' || !r.limit); // older rows may lack 'limit' field
      const latest = ups[0] || null;
      // If latest event is today or last trading session, streak comes from limit_times
      const currentStreak = latest?.limit_times || 0;
      return {
        current_streak: currentStreak,
        last_30d_up_count: ups.length,
        latest_date: latest?.trade_date || null,
        up_stat: latest?.up_stat || null,        // "n/m" 近 n / 近 m 涨停次数
        recent: ups.slice(0, 8).map((r) => ({
          date: r.trade_date,
          close: r.close,
          pct_chg: r.pct_chg,
          first_time: r.first_time,
          last_time: r.last_time,
          open_times: r.open_times,
          fd_amount: r.fd_amount,
          limit_times: r.limit_times,
        })),
      };
    })();

    // ── Triggers — drop-in for Sentinel ──
    // Each trigger uses the same {rule, desc, weight} shape as backtest.ts.
    const triggers: Array<{ rule: string; desc: string; weight: number }> = [];
    if (northbound.available && northbound.delta_5d !== null && northbound.delta_5d > 0.3) {
      triggers.push({
        rule: 'north_inflow_5d',
        desc: `北上 5 日加仓 +${northbound.delta_5d.toFixed(2)} pct`,
        weight: 3,
      });
    } else if (northbound.available && northbound.delta_5d !== null && northbound.delta_5d < -0.3) {
      triggers.push({
        rule: 'north_outflow_5d',
        desc: `北上 5 日减仓 ${northbound.delta_5d.toFixed(2)} pct`,
        weight: -2,
      });
    }
    if (limits.current_streak >= 3) {
      triggers.push({
        rule: `limit_streak_${limits.current_streak}b`,
        desc: `${limits.current_streak} 连板`,
        weight: Math.min(5, limits.current_streak),
      });
    } else if (limits.current_streak === 1 || limits.current_streak === 2) {
      triggers.push({
        rule: 'recent_limit_up',
        desc: '近日涨停',
        weight: 2,
      });
    }

    return NextResponse.json({
      source: 'tushare-5k',
      ticker,
      northbound,
      limits,
      announcements: anns.slice(0, 8).map((a) => ({
        date: a.ann_date,
        title: a.title,
        url: a.url || null,
      })),
      triggers,
    });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown' },
      { status: 502 }
    );
  }
}
