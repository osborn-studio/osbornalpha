'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getStockOrStub } from '@/lib/data/mock';
import { formatPrice, formatPct, formatChange, formatVolume, changeClass, marketLabel, stars } from '@/lib/utils';
import { KlineChart } from '@/components/KlineChart';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { DcfStudio } from '@/components/DcfStudio';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { useWatchlist } from '@/lib/hooks/useWatchlist';

type Tab = 'overview' | 'ai' | 'fundamentals' | 'news' | 'signals' | 'holdings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: '行情' },
  { id: 'ai', label: 'AI 观点' },
  { id: 'fundamentals', label: '财报' },
  { id: 'news', label: '新闻 / 研报' },
  { id: 'signals', label: 'Sentinel 信号' },
  { id: 'holdings', label: '股东持仓' },
];

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker);
  const stock = getStockOrStub(ticker);
  const [tab, setTab] = useState<Tab>('overview');
  const { show } = useToast();
  const { groups, hydrated, setGroups } = useWatchlist();
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    setInWatchlist(groups.some((g) => g.tickers.includes(ticker)));
  }, [groups, hydrated, ticker]);

  if (!stock) {
    return (
      <div className="card-base text-center">
        <h2 className="mb-2 text-lg font-bold">未找到标的 {ticker}</h2>
        <p>本 demo 仅含有限的 mock 数据。回 <Link href="/">首页</Link> 或 <Link href="/watchlist">股票池</Link></p>
      </div>
    );
  }

  function toggleWatchlist() {
    if (!stock) return;
    if (inWatchlist) {
      const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
      setGroups(next);
      setInWatchlist(false);
      show(`✓ 已移出：${ticker}`);
    } else {
      const targetId = groups.find((g) => g.id === 'opportunity')?.id || groups[0]?.id;
      if (!targetId) return;
      const next = groups.map((g) =>
        g.id === targetId ? { ...g, tickers: Array.from(new Set([...g.tickers, ticker])) } : g
      );
      setGroups(next);
      setInWatchlist(true);
      show(`✓ 已加入「${groups.find((g) => g.id === targetId)?.name || '股票池'}」`);
    }
  }

  const bullish = stock.perspectives.filter((p) => p.stance === 'bullish');
  const neutral = stock.perspectives.filter((p) => p.stance === 'neutral');
  const bearish = stock.perspectives.filter((p) => p.stance === 'bearish');
  const consensus = stock.perspectives.length === 0
    ? 0
    : stock.perspectives.reduce((sum, p) => {
        const v = p.stance === 'bullish' ? p.confidence : p.stance === 'bearish' ? -p.confidence : 0;
        return sum + v;
      }, 0) / stock.perspectives.length + 5;

  return (
    <>
      {/* Header */}
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <span className="text-2xl font-bold">{stock.name}</span>
        <span className="rounded bg-bg-card px-2 py-1 text-sm text-text-dim">
          {stock.ticker} · {marketLabel(stock.market)}
        </span>
        <button
          onClick={toggleWatchlist}
          className={`ml-auto rounded px-3.5 py-2 text-sm ${
            inWatchlist ? 'bg-bg-card text-warn' : 'bg-accent-dim text-white'
          }`}
        >
          {inWatchlist ? '⭐ 已加入' : '+ 加入股票池'}
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Link
          href={`/copilot?ticker=${encodeURIComponent(ticker)}` as any}
          className="inline-block rounded-md bg-bg-card px-3 py-1 text-xs font-semibold text-accent"
        >
          🎩 用 John 分析这只股票
        </Link>
        <Link
          href={`/copilot?method=hiphon-pm-deepdive&ticker=${encodeURIComponent(ticker)}` as any}
          className="inline-block rounded-md bg-bg-card px-3 py-1 text-xs font-semibold text-accent"
        >
          🔬 深度研究
        </Link>
      </div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-4">
        <span className="text-3xl font-bold tabular-nums">{stock.currency}{formatPrice(stock.price)}</span>
        <span className={`text-lg font-semibold tabular-nums ${changeClass(stock.change_pct)}`}>
          {formatChange(stock.change)} ({formatPct(stock.change_pct)})
        </span>
        <span className="text-[11px] text-text-muted">15min 延迟</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 md:grid-cols-6">
        <MetaCell label="开" value={formatPrice(stock.open)} />
        <MetaCell label="高" value={formatPrice(stock.high)} />
        <MetaCell label="低" value={formatPrice(stock.low)} />
        <MetaCell label="昨" value={formatPrice(stock.prev_close)} />
        <MetaCell label="成交额" value={formatVolume(stock.volume_value)} />
        <MetaCell label="振幅" value={`${stock.amplitude}%`} />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'overview' && (
        <>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">📊 K 线（日）</div>
            <KlineChart ticker={stock.ticker} basePrice={stock.price} />
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">📐 关键指标</div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <MetricCard label="PE (TTM)" value={String(stock.pe_ttm)} />
              <MetricCard label="PB" value={String(stock.pb)} />
              <MetricCard label="ROE" value={`${stock.roe}%`} />
              <MetricCard label="股息率" value={`${stock.dividend_yield}%`} />
              <MetricCard label="市值" value={stock.market_cap} />
              <MetricCard label="52 周高" value={`${stock.currency}${formatPrice(stock.high_52w)}`} />
              <MetricCard label="52 周低" value={`${stock.currency}${formatPrice(stock.low_52w)}`} />
              <MetricCard label="下次财报" value={stock.next_earnings} small />
            </div>
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">
              🎯 Sentinel 信号 · {stock.sentinel_score.toFixed(1)}/10 {stars(Math.round(stock.sentinel_score / 2))}
            </div>
            {stock.triggers.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-dim">今日无显著触发信号</div>
            ) : (
              stock.triggers.map((t, i) => (
                <div key={i} className="mb-1.5 rounded-md bg-bg-card px-3 py-2 text-sm">
                  <strong>+{t.weight}</strong> · {t.desc}{' '}
                  <span className="text-[11px] text-text-muted">({t.rule})</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'ai' && (
        <div className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">🤖 AI 委员会观点</div>
          {stock.perspectives.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-dim">
              该标的视角辩论待生成。<br />
              <button disabled className="mt-3 rounded bg-accent-dim/50 px-4 py-2 text-white opacity-50">
                🔄 刷新观点（v0.3 实装）
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 text-xs text-text-dim">
                共识：{consensus.toFixed(1)}/10 · {bullish.length} 多 / {neutral.length} 中 / {bearish.length} 空
              </div>
              {bullish.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-bullish">🟢 看多 ({bullish.length})</h3>}
              {bullish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
              {neutral.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-neutral">🟡 中性 ({neutral.length})</h3>}
              {neutral.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
              {bearish.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-bearish">🔴 看空 ({bearish.length})</h3>}
              {bearish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
            </>
          )}
        </div>
      )}

      {tab === 'fundamentals' && (
        <>
          <div className="card-base">
            <DcfStudio ticker={ticker} />
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">📅 财报日历</div>
            <div className="rounded-md bg-bg-card p-3 text-sm">
              <strong>下次发布</strong>：{stock.next_earnings}
            </div>
          </div>
          {stock.financials.years.length > 0 && (
            <div className="card-base">
              <div className="mb-3 text-sm font-semibold text-text-dim">📊 5 年财务趋势</div>
              <MiniChart label={`营业收入（${stock.currency}亿）`} values={stock.financials.revenue} labels={stock.financials.years} />
              <MiniChart label={`净利润（${stock.currency}亿）`} values={stock.financials.net_income} labels={stock.financials.years} />
              <MiniChart label="ROE（%）" values={stock.financials.roe} labels={stock.financials.years} />
            </div>
          )}
          {stock.financials.years.length > 0 && (
            <div className="card-base overflow-x-auto">
              <div className="mb-3 text-sm font-semibold text-text-dim">📄 财务摘要</div>
              <table className="w-full text-sm">
                <thead className="text-text-dim">
                  <tr>
                    <th className="py-2 text-left">指标</th>
                    {stock.financials.years.map((y) => <th key={y} className="py-2 text-right">{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border"><td className="py-2">营收</td>{stock.financials.revenue.map((v, i) => <td key={i} className="text-right tabular-nums">{v}</td>)}</tr>
                  <tr className="border-t border-border"><td className="py-2">净利</td>{stock.financials.net_income.map((v, i) => <td key={i} className="text-right tabular-nums">{v}</td>)}</tr>
                  <tr className="border-t border-border"><td className="py-2">ROE</td>{stock.financials.roe.map((v, i) => <td key={i} className="text-right tabular-nums">{v}%</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'news' && (
        <>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">📑 券商研报 ({stock.broker_reports.length})</div>
            {stock.broker_reports.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-dim">暂无近期研报</div>
            ) : (
              stock.broker_reports.map((r, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-bg-card px-3 py-2.5 text-sm">
                  <div>
                    <div className="font-semibold">{r.broker}</div>
                    <div className="text-[11px] text-text-dim">{r.date} · {r.rating}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">目标 {r.target}</div>
                    <div className={`text-[11px] ${r.target_change_pct > 0 ? 'text-up' : r.target_change_pct < 0 ? 'text-down' : ''}`}>
                      {r.target_change_pct > 0 ? '↑ +' : r.target_change_pct < 0 ? '↓ ' : '→ '}{r.target_change_pct}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">📰 新闻动态 ({stock.news.length})</div>
            {stock.news.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-dim">暂无最新新闻</div>
            ) : (
              stock.news.map((n, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
                  <span className="text-[11px] text-text-muted">{n.time}</span>
                  <span>{n.title} <span className="text-[11px] text-text-muted">· {n.source}</span></span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${n.sentiment > 0.3 ? 'bg-up/15 text-up' : n.sentiment < -0.3 ? 'bg-down/15 text-down' : 'bg-bg-card text-text-dim'}`}>
                    {n.sentiment > 0 ? '+' : ''}{n.sentiment.toFixed(1)}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'signals' && (
        <div className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">🎯 Sentinel 历史信号</div>
          <div className="py-8 text-center text-sm text-text-dim">
            <p>该标的近 90 天信号回看待开发（v1.0）。</p>
            <p className="mt-2 text-[11px]">展示：信号触发日期 + 当日 brief 节选 + 后续 N 天股价表现 + 命中率统计</p>
          </div>
        </div>
      )}

      {tab === 'holdings' && (
        <div className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">
            🏛 13F 持仓变动{stock.market === 'US' ? '' : '（仅美股可用）'}
          </div>
          <div className="py-8 text-center text-sm text-text-dim">
            <p>
              {stock.market === 'US'
                ? '关注的对冲基金（Berkshire / Bridgewater / Burry 等）13F 持仓变动数据待接入。'
                : '此标的非美股，无 13F 数据。'}
            </p>
            <p className="mt-2 text-[11px]">数据源：EDGAR 13F-HR · 季度更新</p>
          </div>
        </div>
      )}

      <Disclaimer />
    </>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-bg-card px-2.5 py-1.5">
      <div className="text-[10px] text-text-dim">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function MetricCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg bg-bg-card p-3">
      <div className="mb-1 text-[11px] text-text-dim">{label}</div>
      <div className={`font-bold tabular-nums ${small ? 'text-sm' : 'text-lg'}`}>{value}</div>
    </div>
  );
}

function MiniChart({ label, values, labels }: { label: string; values: number[]; labels: number[] }) {
  const max = Math.max(...values.map((v) => Math.abs(v)));
  return (
    <div className="mb-5">
      <div className="mb-1 text-xs text-text-dim">{label}</div>
      <div className="flex h-[60px] items-end gap-1">
        {values.map((v, i) => (
          <div
            key={i}
            className="relative flex-1 rounded-sm"
            style={{
              height: `${Math.max((Math.max(v, 0) / max) * 100, 2)}%`,
              background: v < 0 ? 'var(--down)' : 'var(--accent-dim)',
            }}
            title={`${labels[i]}: ${v}`}
          >
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-text-muted">{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
