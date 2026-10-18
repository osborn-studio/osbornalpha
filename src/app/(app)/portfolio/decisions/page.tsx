'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, Button, Tag } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import type { AdoptedRecommendation } from '@/lib/portfolio/store';
import type { Decision, DecisionStatus } from '@/lib/supabase/database.types';

function SubNav({ current }: { current: 'cockpit' | 'decisions' | 'positions' | 'review' }) {
  const t = useTranslations('portfolio');
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: 'cockpit', href: '/portfolio', label: t('nav.cockpit') },
    { key: 'decisions', href: '/portfolio/decisions', label: t('nav.decisions') },
    { key: 'positions', href: '/portfolio/positions', label: t('nav.positions') },
    { key: 'review', href: '/portfolio/review', label: t('nav.review') },
  ];
  return (
    <nav className="flex items-center gap-3 text-sm">
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-[var(--text-dim)]">·</span>}
          <Link
            href={item.href}
            className={item.key === current ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export default function DecisionsPage() {
  const t = useTranslations('portfolio');

  const ACTION_LABEL: Record<Decision['action'], string> = {
    buy: t('action.buy'), sell: t('action.sell'), trim: t('action.trim'),
    add: t('action.add'), hold: t('action.hold'), pass: t('action.pass'),
  };

  const STATUS_LABEL: Record<DecisionStatus, string> = {
    open: t('decisionStatus.open'), executed: t('decisionStatus.executed'),
    expired: t('decisionStatus.expired'), cancelled: t('decisionStatus.cancelled'),
  };

  const STATUS_TONE: Record<DecisionStatus, 'accent' | 'up' | 'neutral' | 'down'> = {
    open: 'accent', executed: 'up', expired: 'neutral', cancelled: 'down',
  };

  const FILTERS: Array<{ key: DecisionStatus | 'all'; label: string }> = [
    { key: 'all', label: t('decisions.filterAll') },
    { key: 'open', label: 'open' },
    { key: 'executed', label: 'executed' },
    { key: 'expired', label: 'expired' },
    { key: 'cancelled', label: 'cancelled' },
  ];

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionStatus | 'all'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Adopted recommendations (analyst + withdrawn flag), served alongside the decisions.
  const [adopted, setAdopted] = useState(() => new Map<string, AdoptedRecommendation>());

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/decisions');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `http ${res.status}`);
      setDecisions(json.decisions ?? []);
      setAdopted(new Map<string, AdoptedRecommendation>(((json.adopted_recommendations ?? []) as AdoptedRecommendation[]).map((r) => [r.id, r])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const filtered = useMemo(
    () => (filter === 'all' ? decisions : decisions.filter((d) => d.status === filter)),
    [decisions, filter],
  );

  const cancel = async (id: string) => {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/decisions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `http ${res.status}`);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancellingId(null);
    }
  };

  const adoptedTag = (recommendationId: string) => {
    const rec = adopted.get(recommendationId);
    const label = rec?.withdrawn ? t('decisions.adoptedWithdrawn') : rec?.analyst_name ? t('decisions.adoptedFrom', { name: rec.analyst_name }) : t('decisions.adopted');
    return (
      <Link href={rec ? `/analyst/${encodeURIComponent(rec.analyst_id)}` : '/analyst'} className="hover:underline">
        <Tag tone={rec?.withdrawn ? 'down' : 'up'}>{label}</Tag>
      </Link>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <SubNav current="decisions" />

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'primary' : 'secondary'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-dim)]">{t('decisions.loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--down)]">{error}</p>
      ) : filtered.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">{t('decisions.empty')}</p>
        </Panel>
      ) : (
        <Panel title={t('decisions.title', { count: filtered.length })}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className="pb-1 font-normal">{t('decisions.columns.date')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.ticker')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.action')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.thesis')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.confidence')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.targetPrice')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.stopLoss')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.status')}</th>
                <th className="pb-1 font-normal">{t('decisions.columns.source')}</th>
                <th className="pb-1 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-[var(--border)]">
                  <td className="py-1">{d.decided_at.slice(0, 10)}</td>
                  <td className="py-1"><Link href={`/stock/${encodeURIComponent(d.ticker)}`} className="text-accent hover:underline">{d.ticker}</Link></td>
                  <td className="py-1">{ACTION_LABEL[d.action]}</td>
                  <td className="max-w-[240px] truncate py-1 text-left" title={d.thesis ?? undefined}>{d.thesis ?? '--'}</td>
                  <td className="py-1">{d.confidence ?? '--'}</td>
                  <td className="py-1">{d.target_price !== null ? formatPrice(d.target_price) : '--'}</td>
                  <td className="py-1">{d.stop_loss !== null ? formatPrice(d.stop_loss) : '--'}</td>
                  <td className="py-1"><Tag tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Tag></td>
                  <td className="py-1">
                    {d.recommendation_id ? (
                      adoptedTag(d.recommendation_id)
                    ) : (
                      <span className="text-[var(--text-dim)]">{t('decisions.sourceSelf')}</span>
                    )}
                  </td>
                  <td className="py-1">
                    {d.status === 'open' && (
                      <Button size="sm" variant="danger" disabled={cancellingId === d.id} onClick={() => cancel(d.id)}>
                        {t('decisions.cancel')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
