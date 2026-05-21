import { NextResponse } from 'next/server';
import {
  isTushareConfigured,
  fetchTushareNorthboundTop10,
  fetchTushareLimitList,
} from '@/lib/data/sources/tushare-cached';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/flows/[ticker]
 *
 * Aggregated 资金面 endpoint backed by 5000-积分 Tushare data. Each request
 * fans out to two Tushare endpoints (both cached at 6h TTL):
 *
 *   hsgt_top10      →  northbound top-10 appearances per day (rank + amount)
 *   limit_list_d    →  涨跌停 history (n 连板, fd_amount, open_times)
 *
 * Note: `anns_d` (公告) requires a tier ABOVE 5000 积分 — silently skipped.
 *
 * Earlier versions used `hk_hold` for "northbound holdings" — that endpoint
 * is actually SOUTHBOUND (港股通: mainland holds HK stocks). Replaced with
 * `hsgt_top10` which is the genuine northbound (HK → A-share) daily series.
 *
 * A-share only. Other markets return a clean "unsupported" payload so the
 * front-end can render a graceful "not available" state.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const url = new URL(req.url);
  const debug = url.searchParams.get('debug') === '1';

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

  const _errors: Record<string, string> = {};
  const wrap = <T>(key: string, p: Promise<T[]>): Promise<T[]> =>
    p.catch((e: any) => {
      if (debug) _errors[key] = e?.message || String(e);
      return [];
    });

  try {
    const [northTop10, limitList] = await Promise.all([
      wrap('hsgt_top10', fetchTushareNorthboundTop10(ticker, 30)),
      wrap('limit_list_d', fetchTushareLimitList(ticker, 30)),
    ]);

    // ── 北上 signal math ──
    // northTop10[0] = most recent appearance in top-10. `rank` ∈ [1, 10].
    // Signal strength = how often + how recently the ticker hits top 10.
    const northbound = (() => {
      if (northTop10.length === 0) {
        return {
          available: false,
          appearance_count_30d: 0,
          latest_rank: null,
          latest_date: null,
          latest_amount_yi: null,
          total_amount_30d_yi: null,
          recent: [],
        };
      }
      const totalAmt = northTop10.reduce((s, r) => s + (r.amount || 0), 0);
      return {
        available: true,
        appearance_count_30d: northTop10.length,
        latest_rank: northTop10[0].rank,
        latest_date: northTop10[0].trade_date,
        latest_amount_yi: northTop10[0].amount ? northTop10[0].amount / 1e8 : null,
        total_amount_30d_yi: totalAmt / 1e8,
        recent: northTop10.slice(0, 10).map((r) => ({
          date: r.trade_date,
          rank: r.rank,
          amount_yi: r.amount ? r.amount / 1e8 : null,
          net_amount_yi: r.net_amount != null ? r.net_amount / 1e8 : null,
          change_pct: r.change,
        })),
      };
    })();

    // ── 涨跌停 signal math ──
    const limits = (() => {
      if (limitList.length === 0) {
        return { current_streak: 0, last_30d_up_count: 0, latest_date: null, recent: [] };
      }
      const ups = limitList.filter((r) => r.limit === 'U' || !r.limit);
      const latest = ups[0] || null;
      const currentStreak = latest?.limit_times || 0;
      return {
        current_streak: currentStreak,
        last_30d_up_count: ups.length,
        latest_date: latest?.trade_date || null,
        up_stat: latest?.up_stat || null,
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
    const triggers: Array<{ rule: string; desc: string; weight: number }> = [];
    if (northbound.available) {
      const n = northbound.appearance_count_30d;
      // Always emit a chip when the ticker appears at all (low-weight context)
      if (n >= 10) {
        triggers.push({
          rule: 'north_top10_frequent',
          desc: `近 30 天 ${n} 次进入北上前十`,
          weight: 3,
        });
      } else if (n >= 5) {
        triggers.push({
          rule: 'north_top10_recurring',
          desc: `近 30 天 ${n} 次进入北上前十`,
          weight: 2,
        });
      } else {
        triggers.push({
          rule: 'north_top10_appeared',
          desc: `近 30 天 ${n} 次进入北上前十`,
          weight: 1,
        });
      }
      if (northbound.latest_rank !== null && northbound.latest_rank <= 3) {
        triggers.push({
          rule: 'north_top3_today',
          desc: `最新北上排名第 ${northbound.latest_rank}`,
          weight: 3,
        });
      }
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
      // anns_d skipped — requires > 5000 积分; placeholder for UI consistency
      announcements: [],
      triggers,
      ...(debug && {
        _debug: {
          ts_code_passed: ticker,
          row_counts: { hsgt_top10: northTop10.length, limit_list_d: limitList.length },
          errors: Object.keys(_errors).length > 0 ? _errors : null,
          note: 'anns_d (公告) needs higher than 5000 积分 and is intentionally skipped.',
        },
      }),
    });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown' },
      { status: 502 }
    );
  }
}
