'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel, Tag } from '@/components/ui';
import { fetchProfiles, refreshScores, type ProfileWithSummary } from '@/lib/hooks/useAnalyst';
import { AnalystDisclaimer } from '@/components/analyst/AnalystDisclaimer';
import { ProfileForm } from '@/components/analyst/ProfileForm';
import { RecommendationForm } from '@/components/analyst/RecommendationForm';

export default function AnalystOverviewPage() {
  const t = useTranslations('analyst');
  const [profiles, setProfiles] = useState<ProfileWithSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { profiles } = await fetchProfiles();
      setProfiles(profiles);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProfiles([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const r = await refreshScores();
      setRefreshMsg(t('scores.result', r));
      await load();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : String(e));
    } finally { setRefreshing(false); }
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-dim)]">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? t('scores.refreshing') : t('scores.refresh')}</Button>
          {refreshMsg && <span className="text-xs text-[var(--text-dim)]">{refreshMsg}</span>}
        </div>
      </header>

      {profiles === null ? (
        <p className="text-sm text-[var(--text-dim)]">{t('common.loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--down)]">{t('common.error', { message: error })}</p>
      ) : (
        <Panel title={t('profiles.title', { count: profiles.length })}>
          {profiles.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">{t('profiles.empty')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <Link key={p.id} href={`/analyst/${p.id}`} className="rounded-md border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.is_self ? t('profiles.self') : p.display_name}</span>
                    <Tag tone={p.kind === 'agent' ? 'accent' : 'neutral'}>{t(`kind.${p.kind}`)}</Tag>
                  </div>
                  <dl className="num mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-[var(--text-dim)]">{t('profiles.recommendations')}</dt><dd>{p.summary.recommendations}</dd>
                    <dt className="text-[var(--text-dim)]">{t('profiles.hitRate')}</dt><dd>{p.summary.hit_rate === null ? '--' : `${p.summary.hit_rate.toFixed(0)}% · ${t('common.n', { n: p.summary.scorable })}`}</dd>
                    <dt className="text-[var(--text-dim)]">{t('profiles.avgScore')}</dt><dd>{p.summary.avg_score === null ? '--' : p.summary.avg_score.toFixed(1)}</dd>
                    <dt className="text-[var(--text-dim)]">{t('profiles.openPositions')}</dt><dd>{p.summary.open_positions}</dd>
                  </dl>
                  <div className="mt-2 text-xs text-accent">{t('profiles.view')}</div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      )}

      {profiles && profiles.length > 0 && <RecommendationForm profiles={profiles} onCreated={load} />}
      <ProfileForm onCreated={load} />
      <AnalystDisclaimer />
    </div>
  );
}
