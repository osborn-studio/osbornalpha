'use client';

import { useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import { portfolioMarketValueByCurrency, unrealizedPnl } from '@/lib/portfolio/pnl';
import { classifyMarket, cn, formatPct, formatPrice, formatSignedPrice } from '@/lib/utils';
import type { Position } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useQuote';

const MARKET_GROUPS = [
  { market: 'US', currency: 'USD', symbol: '$', flag: '🇺🇸', labelKey: 'usMarketValue' },
  { market: 'HK', currency: 'HKD', symbol: 'HK$', flag: '🇭🇰', labelKey: 'hkMarketValue' },
  { market: 'A', currency: 'CNY', symbol: '¥', flag: '🇨🇳', labelKey: 'aShareMarketValue' },
] as const;

export function PositionsRail({ positions, quotes, watchTickers, focus, onFocus }: {
  positions: Position[];
  quotes: Record<string, LiveQuote | null>;
  watchTickers: string[];
  focus: string | null;
  onFocus: (t: string) => void;
}) {
  const t = useTranslations('portfolio');
  const prices = Object.fromEntries(Object.entries(quotes).map(([tk, q]) => [tk, q?.price ?? null]));
  const marketValues = portfolioMarketValueByCurrency(positions, prices);
  const open = positions.filter((p) => p.shares > 0 && !p.closed_at);
  const held = new Set(open.map((p) => p.ticker));

  return (
    <div className="space-y-3">
      <Panel title={t('positionsRail.positionsTitle', { count: open.length })}>
        <div className="space-y-3">
          {MARKET_GROUPS.map((group) => {
            const groupPositions = open.filter((position) => classifyMarket(position.ticker) === group.market);
            if (!groupPositions.length) return null;
            const bucket = marketValues[group.currency];
            const positionPnls = groupPositions.map((position) => unrealizedPnl(position, quotes[position.ticker]?.price));
            const pnlComplete = positionPnls.every(Boolean);
            const groupPnl = positionPnls.reduce((sum, pnl) => sum + (pnl?.value ?? 0), 0);
            return (
              <section key={group.market} className="overflow-hidden rounded border border-[var(--border)] bg-[var(--bg)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-2">
                  <div>
                    <div className="text-xs font-medium text-[var(--text)]">
                      <span className="mr-1.5">{group.flag}</span>
                      {t(`positionsRail.${group.labelKey}`)}
                      <span className="ml-1 text-[var(--text-dim)]">({group.currency === 'CNY' ? 'RMB' : group.currency})</span>
                    </div>
                    <div className="num mt-0.5 text-sm font-semibold text-[var(--text)]">
                      {bucket.complete ? formatPrice(bucket.value, group.symbol) : '--'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--text-muted)]">{t('positionsRail.unrealizedPnl')}</div>
                    <div className={cn('num text-xs font-medium', pnlComplete ? pnlClass(groupPnl) : 'text-[var(--text-dim)]')}>
                      {pnlComplete ? formatSignedPrice(groupPnl, group.symbol) : '--'}
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {groupPositions.map((position) => {
                    const quote = quotes[position.ticker];
                    const pnl = unrealizedPnl(position, quote?.price);
                    const marketValue = quote ? quote.price * position.shares : null;
                    return (
                      <button
                        key={position.ticker}
                        onClick={() => onFocus(position.ticker)}
                        className={cn(
                          'w-full px-2.5 py-2 text-left hover:bg-[var(--bg-card)]',
                          focus === position.ticker && 'border-l-2 border-[var(--accent)] bg-[var(--bg-card)]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-[var(--text)]">{quote?.name ?? position.ticker}</div>
                            <div className="num mt-0.5 text-[10px] text-[var(--text-muted)]">{position.ticker}</div>
                          </div>
                          <div className={cn('text-right', pnl ? pnlClass(pnl.value) : 'text-[var(--text-dim)]')}>
                            <div className="num text-xs font-medium">{pnl ? formatSignedPrice(pnl.value, group.symbol) : '--'}</div>
                            <div className="num text-[10px]">{pnl ? formatPct(pnl.pct) : '--'}</div>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                          <PositionDatum label={t('focusPanel.holdingQuantity')} value={position.shares.toLocaleString()} />
                          <PositionDatum label={t('focusPanel.totalMarketValue')} value={marketValue != null ? formatPrice(marketValue, group.symbol) : '--'} />
                          <PositionDatum
                            label={`${t('focusPanel.currentPrice')} / ${t('focusPanel.averagePrice')}`}
                            value={`${quote ? formatPrice(quote.price) : '--'} / ${formatPrice(position.avg_cost)}`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!open.length && <p className="text-xs text-[var(--text-dim)]">{t('positionsRail.emptyPositions')}</p>}
        </div>
      </Panel>

      <Panel title={t('positionsRail.watchlistTitle')}>
        <div className="space-y-1">
          {watchTickers.filter((tk) => !held.has(tk)).slice(0, 20).map((tk) => {
            const q = quotes[tk];
            return (
              <button key={tk} onClick={() => onFocus(tk)}
                className={cn('num flex w-full items-center justify-between px-2 py-1 text-left text-xs rounded',
                  focus === tk ? 'bg-[var(--bg-card)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]')}>
                <span>{q?.name ?? tk}</span>
                {q && <span className={q.change_pct >= 0 ? 'text-up' : 'text-down'}>{formatPct(q.change_pct)}</span>}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function PositionDatum({ label, value }: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[var(--text-muted)]">{label}</div>
      <div className="num mt-0.5 truncate text-[var(--text-dim)]">{value}</div>
    </div>
  );
}

function pnlClass(value: number) {
  return value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-[var(--text)]';
}
