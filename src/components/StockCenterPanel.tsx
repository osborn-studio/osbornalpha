'use client';

import { useState } from 'react';
import { getStockOrStub } from '@/lib/data/mock';
import {
  useQuote, useFinancials, useHolders, usePerspectives,
  type YearlyFinancial, type HolderRow, type PerspectiveRow,
} from '@/lib/hooks/useQuote';
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
  { id: 'holdings', label: '股东' },
];

export function StockCenterPanel({ ticker }: { ticker: string }) {
  const [tab, setTab] = useState<Tab>('overview');
  const mockStock = getStockOrStub(ticker);
  // Auto-refresh quote every 30s
  const { data: live, loading, error } = useQuote(ticker, { refreshIntervalMs: 30_000 });

  const stock = mergeStockData(ticker, mockStock, live);
  if (!stock) {
    return (
      <div className="card-base text-center text-sm">
        {loading ? '⏳ 加载中...' : `未找到标的 ${ticker}`}
      </div>
    );
  }

  const hasLive = !!live;
  const sourceLabel = live?.source || (mockStock?.price ? 'mock' : 'none');

  return (
    <div className="space-y-2">
      <div className="card-base !mb-0 !rounded-b-none !py-2.5">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-base font-bold">{stock.name}</span>
          <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] text-text-dim">
            {stock.ticker} · {marketLabel(stock.market)}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-text-muted">
            {loading && <span title="刷新中">⏳</span>}
            {hasLive ? (
              <span title={`数据来自 ${sourceLabel} · 每 30s 自动刷新`}>
                ● 实时 {live!.delayed ? '(15min 延迟)' : ''}
              </span>
            ) : error ? (
              <span className="text-warn" title={error}>⚠ {error}</span>
            ) : (
              <span>· {sourceLabel}</span>
            )}
          </span>
        </div>
        {stock.price > 0 ? (
          <>
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
          </>
        ) : loading ? (
          <div className="py-2 text-sm text-text-dim">⏳ 拉取实时报价...</div>
        ) : (
          <div className="py-2 text-sm text-warn">⚠ 暂无报价数据</div>
        )}
      </div>

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

      <div className="card-base !mt-0 !rounded-t-none">
        {tab === 'overview' && <OverviewTab stock={stock} live={live} />}
        {tab === 'ai' && <AITab ticker={ticker} />}
        {tab === 'fundamentals' && <FundamentalsTab ticker={ticker} />}
        {tab === 'news' && <NewsTab stock={stock} />}
        {tab === 'signals' && <SignalsTab stock={stock} />}
        {tab === 'holdings' && <HoldingsTab ticker={ticker} market={stock.market} />}
      </div>
    </div>
  );
}

// ─── Overview Tab ───
function OverviewTab({ stock, live }: { stock: MergedStock; live: any }) {
  return (
    <>
      <KlineChart ticker={stock.ticker} basePrice={stock.price || 100} />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="PE TTM" value={stock.pe_ttm ? stock.pe_ttm.toFixed(2) : '—'} />
        <MetricCard label="PB" value={stock.pb ? stock.pb.toFixed(2) : '—'} />
        <MetricCard label="ROE" value={stock.roe ? `${stock.roe.toFixed(2)}%` : '—'} />
        <MetricCard label="股息率" value={stock.dividend_yield ? `${stock.dividend_yield.toFixed(2)}%` : '—'} />
        <MetricCard label="市值" value={stock.market_cap_label || stock.market_cap || '—'} />
        <MetricCard label="换手率" value={stock.turnover ? `${stock.turnover.toFixed(2)}%` : '—'} />
        <MetricCard label="量比" value={stock.volume_ratio ? stock.volume_ratio.toFixed(2) : '—'} />
        <MetricCard label="下次财报" value={stock.next_earnings || '—'} small />
      </div>
      {live && live.supplemented && live.supplemented.length > 0 && (
        <div className="mt-2 text-[10px] text-text-muted">
          ✨ Tushare 增强字段：{live.supplemented.join(', ')}
        </div>
      )}
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-semibold text-text-dim">
          🎯 Sentinel · {stock.sentinel_score.toFixed(1)}/10 {stars(Math.round(stock.sentinel_score / 2))}
        </div>
        {stock.triggers.length === 0 ? (
          <div className="text-xs text-text-muted">今日无显著触发信号（待 v0.3 信号引擎接入）</div>
        ) : (
          stock.triggers.map((t: any, i: number) => (
            <div key={i} className="mb-1 rounded bg-bg-card px-2 py-1 text-[11px]">
              <strong>+{t.weight}</strong> · {t.desc}{' '}
              <span className="text-[10px] text-text-muted">({t.rule})</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── AI Tab ───
function AITab({ ticker }: { ticker: string }) {
  const { perspectives, source, meta, loading, error, refetch } = usePerspectives(ticker, true);

  if (loading && perspectives.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-text-dim">
        ⏳ AI 委员会开会中…<br />
        <span className="text-[11px] text-text-muted">
          9 位投资大师并发推理 · 约需 10-25 秒
        </span>
      </div>
    );
  }

  if (error || perspectives.length === 0) {
    const noKey = error?.toLowerCase().includes('no llm provider');
    return (
      <div className="py-10 text-center text-sm text-text-dim">
        {noKey ? (
          <>
            🔑 LLM 未配置 — 推荐 DeepSeek（OpenAI 兼容，便宜 8-10×）<br />
            <span className="text-[11px] text-text-muted">
              在 Vercel 添加 DEEPSEEK_API_KEY 后自动启用 9 位 AI 委员视角辩论
            </span>
            <pre className="mx-auto mt-3 inline-block rounded bg-bg-card p-2 text-left text-[10px]">
              vercel env add DEEPSEEK_API_KEY production{'\n'}vercel --prod
            </pre>
            <div className="mt-2 text-[10px] text-text-muted">
              或设 ANTHROPIC_API_KEY 用 Claude；同时设两个时 LLM_PROVIDER=deepseek|anthropic 可锁定
            </div>
          </>
        ) : (
          <>⚠ {error || '未生成视角'}</>
        )}
      </div>
    );
  }

  const bullish = perspectives.filter((p) => p.stance === 'bullish');
  const neutral = perspectives.filter((p) => p.stance === 'neutral');
  const bearish = perspectives.filter((p) => p.stance === 'bearish');

  const consensusScore =
    perspectives.length === 0
      ? 0
      : perspectives.reduce((sum, p) => {
          const v = p.stance === 'bullish' ? p.confidence : p.stance === 'bearish' ? -p.confidence : 0;
          return sum + v;
        }, 0) / perspectives.length + 5;

  return (
    <>
      <div className="mb-3 flex items-center justify-between text-xs text-text-dim">
        <span>
          共识：<strong>{consensusScore.toFixed(1)}/10</strong> ·
          {bullish.length} 多 / {neutral.length} 中 / {bearish.length} 空
        </span>
        <button
          onClick={refetch}
          className="rounded border border-border bg-bg-card px-2 py-0.5 text-[10px] text-text-dim hover:text-text"
          disabled={loading}
        >
          {loading ? '⏳ 刷新中' : '🔄 重跑'}
        </button>
      </div>
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
      {meta && (
        <div className="mt-4 rounded bg-bg-card px-2 py-1.5 text-[10px] text-text-muted">
          {meta.personas_succeeded}/{meta.personas_attempted} 视角成功 ·
          耗时 {(meta.duration_ms / 1000).toFixed(1)}s ·
          tokens {meta.tokens.input}↑/{meta.tokens.output}↓ ·
          成本 ${meta.est_cost_usd} ·
          来源 {source}
        </div>
      )}
    </>
  );
}

// ─── Fundamentals Tab ───
function FundamentalsTab({ ticker }: { ticker: string }) {
  const { yearly, latest_indicator, source, loading, error } = useFinancials(ticker);
  const isA = /\.(SH|SZ|BJ)$/i.test(ticker);

  if (!isA) {
    return (
      <div className="py-6 text-center text-sm text-text-dim">
        Tushare 财报数据仅覆盖 A 股<br />
        <span className="text-[11px] text-text-muted">美股财报建议接 EDGAR (10-K/10-Q)，港股接 HKEX</span>
      </div>
    );
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-text-dim">⏳ 加载财报数据...</div>;
  }

  if (error || yearly.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-text-dim">
        {error || '暂无财报数据'}
        {source === 'no-token' && (
          <div className="mt-2 text-[11px] text-text-muted">
            添加 TUSHARE_TOKEN 到 Vercel env vars 后会自动启用
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 text-[11px] text-text-muted">数据源：Tushare Pro · 单位：亿元</div>

      <table className="w-full text-xs">
        <thead className="text-text-dim">
          <tr>
            <th className="py-1 text-left">指标</th>
            {yearly.map((y) => <th key={y.year} className="py-1 text-right tabular-nums">{y.year}</th>)}
          </tr>
        </thead>
        <tbody>
          <FinRow label="营收" rows={yearly} field="revenue_yi" />
          <FinRow label="净利" rows={yearly} field="net_income_yi" />
          <FinRow label="EPS" rows={yearly} field="eps_basic" decimals={2} unit="" />
          <FinRow label="总资产" rows={yearly} field="total_assets_yi" />
          <FinRow label="总负债" rows={yearly} field="total_liab_yi" />
          <FinRow label="所有者权益" rows={yearly} field="equity_yi" />
          <FinRow label="经营现金流" rows={yearly} field="op_cashflow_yi" />
          <FinRow label="自由现金流" rows={yearly} field="free_cashflow_yi" />
        </tbody>
      </table>

      {latest_indicator && (
        <div className="mt-4 rounded bg-bg-card p-3 text-xs">
          <div className="mb-1 font-semibold text-text-dim">最新一期财务指标 · {latest_indicator.end_date}</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            <span>ROE: <strong className="tabular-nums">{latest_indicator.roe?.toFixed(2)}%</strong></span>
            <span>毛利率: <strong className="tabular-nums">{latest_indicator.gross_margin?.toFixed(2)}%</strong></span>
            <span>净利率: <strong className="tabular-nums">{latest_indicator.net_margin?.toFixed(2)}%</strong></span>
            <span>流动比率: <strong className="tabular-nums">{latest_indicator.current_ratio?.toFixed(2)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

function FinRow({ label, rows, field, decimals = 0, unit = '亿' }: {
  label: string; rows: YearlyFinancial[]; field: keyof YearlyFinancial; decimals?: number; unit?: string;
}) {
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2 text-text-dim">{label}</td>
      {rows.map((r) => {
        const v = r[field] as number | null;
        return (
          <td key={r.year} className="text-right tabular-nums">
            {v != null ? v.toFixed(decimals) + unit : '—'}
          </td>
        );
      })}
    </tr>
  );
}

// ─── News Tab ───
function NewsTab({ stock }: { stock: MergedStock }) {
  return (
    <>
      <div className="mb-2 text-[11px] font-semibold text-text-dim">📑 券商研报 ({stock.broker_reports.length})</div>
      {stock.broker_reports.length === 0 ? (
        <div className="mb-3 text-xs text-text-muted">
          暂无近期研报<br />
          <span className="text-[10px]">研报数据源待接入（雪球公开 / 巨潮资讯 / EDGAR 8-K）</span>
        </div>
      ) : (
        stock.broker_reports.map((r: any, i: number) => (
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
      <div className="mb-2 mt-3 text-[11px] font-semibold text-text-dim">📰 新闻 ({stock.news.length})</div>
      {stock.news.length === 0 ? (
        <div className="text-xs text-text-muted">暂无新闻（数据源待接入）</div>
      ) : (
        stock.news.map((n: any, i: number) => (
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
  );
}

// ─── Signals Tab ───
function SignalsTab({ stock }: { stock: MergedStock }) {
  return (
    <div className="py-6 text-center text-sm text-text-dim">
      该标的近 90 天 Sentinel 信号回看待开发<br />
      <span className="text-[10px] text-text-muted">
        将基于历史 brief + 后续 N 天股价表现自动 backtest
      </span>
    </div>
  );
}

// ─── Holdings Tab ───
function HoldingsTab({ ticker, market }: { ticker: string; market: string }) {
  const { top10, floats, reporting_period, source, loading, error } = useHolders(ticker);

  if (market !== 'A') {
    return (
      <div className="py-6 text-center text-sm text-text-dim">
        {market === 'US' ? (
          <>美股 13F 持仓数据待接入（EDGAR 13F-HR）<br /><span className="text-[10px] text-text-muted">已计划在 v1.2 接入 Berkshire / Bridgewater / Burry 等基金</span></>
        ) : (
          <>港股股东数据待接入（HKEX CCASS）</>
        )}
      </div>
    );
  }

  if (loading) return <div className="py-10 text-center text-sm text-text-dim">⏳ 加载股东数据...</div>;

  if ((top10.length === 0 && floats.length === 0) || error) {
    return (
      <div className="py-6 text-center text-sm text-text-dim">
        {error || '暂无股东数据'}
        {source === 'no-token' && (
          <div className="mt-2 text-[11px] text-text-muted">
            添加 TUSHARE_TOKEN 启用
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {reporting_period && (
        <div className="mb-3 text-[11px] text-text-muted">
          报告期：{reporting_period} · 数据源：Tushare Pro
        </div>
      )}

      <div className="mb-4">
        <div className="mb-2 text-[11px] font-semibold text-text-dim">🏛 十大股东</div>
        <HoldersTable rows={top10} />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold text-text-dim">📊 十大流通股东</div>
        <HoldersTable rows={floats} />
      </div>
    </>
  );
}

function HoldersTable({ rows }: { rows: HolderRow[] }) {
  if (rows.length === 0) return <div className="text-xs text-text-muted">无数据</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-text-dim">
          <tr>
            <th className="w-6 py-1 text-left">#</th>
            <th className="py-1 text-left">股东名称</th>
            <th className="py-1 text-right">持股数 (万股)</th>
            <th className="py-1 text-right">占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.holder_name + i} className="border-t border-border">
              <td className="py-1 text-text-muted">{i + 1}</td>
              <td className="py-1 pr-2">{r.holder_name}</td>
              <td className="py-1 text-right tabular-nums">{(r.hold_amount / 1e4).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="py-1 text-right tabular-nums font-semibold">{r.hold_ratio?.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helpers ───
interface MergedStock {
  ticker: string;
  name: string;
  market: string;
  currency: string;
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume_value: number;
  amplitude: number;
  market_cap: string;
  market_cap_label?: string;
  pe_ttm: number | null;
  pb: number | null;
  roe: number | null;
  dividend_yield: number | null;
  turnover?: number | null;
  volume_ratio?: number | null;
  next_earnings: string;
  sentinel_score: number;
  triggers: any[];
  perspectives: any[];
  news: any[];
  broker_reports: any[];
  financials: { years: number[]; revenue: number[]; net_income: number[]; roe: number[] };
}

function mergeStockData(ticker: string, mock: any, live: any): MergedStock | null {
  if (!live && !mock) return null;
  const base = mock || {
    ticker, name: ticker, market: 'A', currency: '¥',
    price: 0, change: 0, change_pct: 0, open: 0, high: 0, low: 0, prev_close: 0,
    volume_value: 0, amplitude: 0, market_cap: '—',
    pe_ttm: 0, pb: 0, roe: 0, dividend_yield: 0,
    high_52w: 0, low_52w: 0, next_earnings: '—',
    sentinel_score: 0, triggers: [], perspectives: [], news: [], broker_reports: [],
    financials: { years: [], revenue: [], net_income: [], roe: [] },
  };
  if (!live) return base;
  return {
    ...base,
    ticker: live.ticker,
    name: live.name || base.name,
    market: live.market || base.market,
    currency: live.currency || base.currency,
    price: live.price,
    change: live.change,
    change_pct: live.change_pct,
    open: live.open,
    high: live.high,
    low: live.low,
    prev_close: live.prev_close,
    volume_value: live.amount,
    amplitude: live.amplitude,
    market_cap: live.market_cap_label || base.market_cap,
    market_cap_label: live.market_cap_label,
    pe_ttm: live.pe_ttm ?? base.pe_ttm,
    pb: live.pb ?? base.pb,
    roe: live.roe ?? base.roe,
    dividend_yield: live.dividend_yield ?? base.dividend_yield,
    turnover: live.turnover,
    volume_ratio: live.volume_ratio,
  };
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
