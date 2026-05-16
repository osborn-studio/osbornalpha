'use client';

import { useState } from 'react';
import { getStockOrStub } from '@/lib/data/mock';
import { formatPrice, formatPct, formatChange, formatVolume, changeClass, marketLabel, stars } from '@/lib/utils';
import { KlineChart } from './KlineChart';
import { PerspectiveCard } from './PerspectiveCard';

type Tab = 'overview' | 'ai' | 'fundamentals' | 'news' | 'signals' | 'holdings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: '行情' },
  { id: 'ai', label: 'AI 观点' },
  { id: 'fundamentals', label: '财报' },
  { id: 'news', label: '新闻/研报' },
  { id: 'signals', label: 'Sentinel' },
  { id: 'holdings', label: '13F' },
];

export function StockCenterPanel({ ticker }: { ticker: string }) {
  const stock = getStockOrStub(ticker);
  const [tab, setTab] = useState<Tab>('overview');

  if (!stock) {
    return <div className="card-base text-center text-sm">未找到标的 {ticker}</div>;
  }

  const bullish = stock.perspectives.filter((p) => p.stance === 'bullish');
  const neutral = stock.perspectives.filter((p) => p.stance === 'neutral');
  const bearish = stock.perspectives.filter((p) => p.stance === 'bearish');

  return (
    <div className="space-y-2">
      {/* Sticky header */}
      <div className="card-base !mb-0 !rounded-b-none !py-2.5">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-base font-bold">{stock.name}</span>
          <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] text-text-dim">
            {stock.ticker} · {marketLabel(stock.market)}
          </span>
          <span className="ml-auto text-[10px] text-text-muted">15min 延迟</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tabular-nums">{stock.currency}{formatPrice(stock.price)}</span>
          <span className={`font-semibold tabular-nums ${changeClass(stock.change_pct)}`}>
            {formatChange(stock.change)} ({formatPct(stock.change_pct)})
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-6">
          <MetaCell label="开" value={formatPrice(stock.open)} />
          <MetaCell label="高" value={formatPrice(stock.high)} />
          <MetaCell label="低" value={formatPrice(stock.low)} />
          <MetaCell label="昨" value={formatPrice(stock.prev_close)} />
          <MetaCell label="额" value={formatVolume(stock.volume_value)} />
          <MetaCell label="振" value={`${stock.amplitude}%`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="card-base !mb-0 !rounded-none !border-t-0 !py-1.5">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded px-2.5 py-1 text-[12px] transition ${
                tab === t.id ? 'bg-accent-dim text-white' : 'text-text-dim hover:bg-bg-card'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="card-base !mt-0 !rounded-t-none">
        {tab === 'overview' && (
          <>
            <KlineChart ticker={stock.ticker} basePrice={stock.price} />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="PE TTM" value={String(stock.pe_ttm)} />
              <MetricCard label="PB" value={String(stock.pb)} />
              <MetricCard label="ROE" value={`${stock.roe}%`} />
              <MetricCard label="股息率" value={`${stock.dividend_yield}%`} />
              <MetricCard label="市值" value={stock.market_cap} />
              <MetricCard label="52W 高" value={`${stock.currency}${formatPrice(stock.high_52w)}`} />
              <MetricCard label="52W 低" value={`${stock.currency}${formatPrice(stock.low_52w)}`} />
              <MetricCard label="下次财报" value={stock.next_earnings} small />
            </div>
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold text-text-dim">
                🎯 Sentinel · {stock.sentinel_score.toFixed(1)}/10 {stars(Math.round(stock.sentinel_score / 2))}
              </div>
              {stock.triggers.length === 0 ? (
                <div className="text-xs text-text-muted">今日无显著触发信号</div>
              ) : (
                stock.triggers.map((t, i) => (
                  <div key={i} className="mb-1 rounded bg-bg-card px-2 py-1 text-[11px]">
                    <strong>+{t.weight}</strong> · {t.desc}{' '}
                    <span className="text-[10px] text-text-muted">({t.rule})</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'ai' && (
          <>
            {stock.perspectives.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-dim">
                视角辩论待生成（v0.3 实装）
              </div>
            ) : (
              <>
                {bullish.length > 0 && (
                  <>
                    <h3 className="mb-2 text-xs font-semibold text-bullish">🟢 看多 ({bullish.length})</h3>
                    {bullish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
                  </>
                )}
                {neutral.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-3 text-xs font-semibold text-neutral">🟡 中性 ({neutral.length})</h3>
                    {neutral.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
                  </>
                )}
                {bearish.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-3 text-xs font-semibold text-bearish">🔴 看空 ({bearish.length})</h3>
                    {bearish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === 'fundamentals' && stock.financials.years.length > 0 && (
          <div className="overflow-x-auto">
            <div className="mb-3 rounded bg-bg-card p-2 text-xs">
              <strong>下次发布</strong>：{stock.next_earnings}
            </div>
            <table className="w-full text-xs">
              <thead className="text-text-dim">
                <tr>
                  <th className="py-1 text-left">指标</th>
                  {stock.financials.years.map((y) => (
                    <th key={y} className="py-1 text-right">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-1">营收</td>
                  {stock.financials.revenue.map((v, i) => <td key={i} className="text-right tabular-nums">{v}</td>)}
                </tr>
                <tr className="border-t border-border">
                  <td className="py-1">净利</td>
                  {stock.financials.net_income.map((v, i) => <td key={i} className="text-right tabular-nums">{v}</td>)}
                </tr>
                <tr className="border-t border-border">
                  <td className="py-1">ROE</td>
                  {stock.financials.roe.map((v, i) => <td key={i} className="text-right tabular-nums">{v}%</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tab === 'news' && (
          <>
            <div className="mb-2 text-[11px] font-semibold text-text-dim">
              📑 券商研报 ({stock.broker_reports.length})
            </div>
            {stock.broker_reports.length === 0 ? (
              <div className="mb-3 text-xs text-text-muted">暂无近期研报</div>
            ) : (
              stock.broker_reports.map((r, i) => (
                <div key={i} className="mb-1.5 grid grid-cols-[1fr_auto] gap-2 rounded bg-bg-card px-2 py-1.5 text-[11px]">
                  <div>
                    <strong>{r.broker}</strong>{' '}
                    <span className="text-text-muted">· {r.date} · {r.rating}</span>
                  </div>
                  <div className="text-right">
                    {r.target}{' '}
                    <span className={r.target_change_pct > 0 ? 'text-up' : r.target_change_pct < 0 ? 'text-down' : ''}>
                      ({r.target_change_pct > 0 ? '+' : ''}{r.target_change_pct}%)
                    </span>
                  </div>
                </div>
              ))
            )}
            <div className="mb-2 mt-3 text-[11px] font-semibold text-text-dim">
              📰 新闻 ({stock.news.length})
            </div>
            {stock.news.length === 0 ? (
              <div className="text-xs text-text-muted">暂无新闻</div>
            ) : (
              stock.news.map((n, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-2 border-b border-border px-1 py-1 text-[11px] last:border-b-0">
                  <span className="text-[10px] text-text-muted">{n.time}</span>
                  <span>{n.title} <span className="text-[10px] text-text-muted">· {n.source}</span></span>
                  <span className={`rounded px-1 text-[10px] ${n.sentiment > 0.3 ? 'bg-up/15 text-up' : n.sentiment < -0.3 ? 'bg-down/15 text-down' : 'text-text-dim'}`}>
                    {n.sentiment > 0 ? '+' : ''}{n.sentiment.toFixed(1)}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'signals' && (
          <div className="py-6 text-center text-sm text-text-dim">
            该标的近 90 天信号回看待开发（v1.0）。
          </div>
        )}

        {tab === 'holdings' && (
          <div className="py-6 text-center text-sm text-text-dim">
            {stock.market === 'US'
              ? '13F 持仓变动数据待接入（EDGAR）'
              : '此标的非美股，无 13F 数据'}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded bg-bg-card p-2">
      <div className="text-[10px] text-text-dim">{label}</div>
      <div className={`font-bold tabular-nums ${small ? 'text-xs' : 'text-sm'}`}>{value}</div>
    </div>
  );
}
