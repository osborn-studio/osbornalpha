'use client';

import { useTranslations } from 'next-intl';
import { Panel, Tag } from '@/components/ui';
import { useSignals } from '@/lib/hooks/useSignals';
import type { Decision } from '@/lib/supabase/database.types';

export function SignalsRail({ ticker, openDecisions, onFocus }: {
  ticker: string | null;
  openDecisions: Decision[];
  onFocus: (t: string) => void;
}) {
  const t = useTranslations('portfolio');
  const { events, stats, loading } = useSignals(ticker);

  return (
    <div className="space-y-3">
      <Panel title={ticker ? t('signalsRail.signalsTitleWithTicker', { ticker }) : t('signalsRail.signalsTitle')}>
        {loading && <p className="text-xs text-[var(--text-dim)]">{t('signalsRail.loading')}</p>}
        {!loading && !events.length && <p className="text-xs text-[var(--text-dim)]">{t('signalsRail.noRecentSignals')}</p>}
        <div className="space-y-1 text-xs">
          {events.slice(0, 6).map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="num shrink-0 text-[var(--text-dim)]">{e.date.slice(5)}</span>
              <span className="truncate">{e.triggers.map((tr) => tr.desc).join(' · ')}</span>
              <Tag tone={e.bias === 'bull' ? 'up' : e.bias === 'bear' ? 'down' : 'neutral'}>
                {e.bias === 'bull' ? t('signalsRail.biasBull') : e.bias === 'bear' ? t('signalsRail.biasBear') : t('signalsRail.biasNeutral')}
              </Tag>
            </div>
          ))}
        </div>
        {stats && (
          <p className="mt-2 border-t border-[var(--border)] pt-1.5 text-[10px] text-[var(--text-dim)]">
            {t('signalsRail.hitRateSummary', {
              hitRate: (stats.hit_rate_5d * 100).toFixed(0),
              avgForward5d: stats.avg_forward_5d_pct.toFixed(1),
            })}
          </p>
        )}
      </Panel>

      <Panel title={t('signalsRail.openDecisionsTitle', { count: openDecisions.length })}>
        <div className="space-y-1 text-xs">
          {openDecisions.slice(0, 8).map((d) => (
            <button key={d.id} onClick={() => onFocus(d.ticker)}
              className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-[var(--bg-card)]">
              <span className="num">{d.ticker}</span>
              <Tag tone={d.action === 'buy' || d.action === 'add' ? 'up' : d.action === 'sell' || d.action === 'trim' ? 'down' : 'neutral'}>
                {d.action}
              </Tag>
            </button>
          ))}
          {!openDecisions.length && <p className="text-[var(--text-dim)]">{t('signalsRail.noOpenDecisions')}</p>}
        </div>
      </Panel>

      <p className="text-center text-[10px] text-[var(--text-dim)]">{t('signalsRail.copilotHint')}</p>
    </div>
  );
}
