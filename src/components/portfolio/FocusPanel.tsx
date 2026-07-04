'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, Metric, Tag } from '@/components/ui';
import { KlineChart } from '@/components/KlineChart';
import { DecisionForm } from './DecisionForm';
import { TradeForm } from './TradeForm';
import { latestOpenDecision, unrealizedPnl } from '@/lib/portfolio/pnl';
import { formatPct, formatPrice } from '@/lib/utils';
import { formatDateLocale, type AppLocale } from '@/lib/i18n/locale';
import type { Decision, Position } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useQuote';

export function FocusPanel({ ticker, quote, position, decisions, onChanged }: {
  ticker: string;
  quote: LiveQuote | null;
  position: Position | null;
  decisions: Decision[];
  onChanged: () => void;
}) {
  const t = useTranslations('portfolio');
  const locale = useLocale() as AppLocale;
  const open = latestOpenDecision(decisions, ticker);
  const u = position ? unrealizedPnl(position, quote?.price ?? null) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-serif text-lg text-[var(--text)]">{quote?.name ?? ticker}</span>
          <span className="ml-2 text-xs text-[var(--text-dim)]">{ticker}</span>
        </div>
        {quote && (
          <div className="num text-base">
            <span className={quote.change_pct >= 0 ? 'text-up' : 'text-down'}>
              {formatPrice(quote.price)} {formatPct(quote.change_pct)}
            </span>
          </div>
        )}
      </div>

      {quote && <KlineChart ticker={ticker} basePrice={quote.price} />}

      <div data-density="data" className="grid grid-cols-2 gap-[var(--row-gap)] sm:grid-cols-5">
        <Metric label={t('focusPanel.positionCost')} value={position ? formatPrice(position.avg_cost) : '--'} />
        <Metric label={t('focusPanel.unrealized')} value={u ? formatPct(u.pct) : '--'} change={u?.value} />
        <Metric label={t('focusPanel.targetPrice')} value={open?.target_price ? formatPrice(open.target_price) : '--'} />
        <Metric label={t('focusPanel.stopLoss')} value={open?.stop_loss ? formatPrice(open.stop_loss) : '--'} />
        <Metric label={t('focusPanel.confidence')} value={open?.confidence != null ? `${open.confidence}%` : '--'} />
      </div>

      <DecisionForm ticker={ticker} onDone={onChanged} />
      <TradeForm ticker={ticker} currentPrice={quote?.price ?? null} openDecision={open} onDone={onChanged} />

      {open && (
        <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs text-[var(--text-dim)]">
          {t('focusPanel.openDecisionPrefix')}{formatDateLocale(open.decided_at, locale)}
          {' '}{open.action === 'buy' ? t('direction.buy') : open.action === 'sell' ? t('direction.sell') : open.action}
          {open.confidence != null && t('focusPanel.confidenceInline', { pct: open.confidence })}
          {open.thesis && t('focusPanel.thesisInline', { thesis: open.thesis })}
          {open.target_price && quote ? (
            <Tag tone={quote.price >= open.target_price ? 'up' : 'accent'} className="ml-1">
              {t('focusPanel.distanceToTarget', { pct: formatPct(((open.target_price - quote.price) / quote.price) * 100) })}
            </Tag>
          ) : null}
        </div>
      )}
    </Card>
  );
}
