'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel, Tag } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { fetchBook, fetchRecommendations, withdrawRecommendation, type Book, type RecommendationView } from '@/lib/hooks/useAnalyst';
import type { AnalystProfile } from '@/lib/supabase/database.types';
import { AnalystDisclaimer } from '@/components/analyst/AnalystDisclaimer';
import { BookSummaryPanel, BookTables } from '@/components/analyst/BookTables';

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

export default function AnalystDetailPage() {
  const t = useTranslations('analyst');
  const { analystId } = useParams<{ analystId: string }>();
  const [profile, setProfile] = useState<AnalystProfile | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [recs, setRecs] = useState<RecommendationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([fetchBook(analystId), fetchRecommendations({ analyst: analystId })]);
      setProfile(b.profile); setBook(b.book); setRecs(r.recommendations); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [analystId]);

  useEffect(() => { load(); }, [load]);

  async function withdraw(id: string) {
    const reason = window.prompt(t('timeline.withdrawPrompt'));
    if (reason === null) return; // cancelled
    setBusyId(id);
    try {
      await withdrawRecommendation(id, reason || undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  const th = 'pb-1 font-normal';
  return (
    <div className="space-y-4 p-4">
      <Link href="/analyst" className="text-sm text-[var(--text-dim)] hover:text-[var(--text)]">{t('nav.back')}</Link>
      {error && <p className="text-sm text-[var(--down)]">{t('common.error', { message: error })}</p>}
      {!profile || !book ? (
        !error && <p className="text-sm text-[var(--text-dim)]">{t('common.loading')}</p>
      ) : (
        <>
          <header className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{profile.is_self ? t('profiles.self') : profile.display_name}</h1>
            <Tag tone={profile.kind === 'agent' ? 'accent' : 'neutral'}>{t(`kind.${profile.kind}`)}</Tag>
            {profile.note && <span className="text-sm text-[var(--text-dim)]">{profile.note}</span>}
          </header>
          <BookSummaryPanel book={book} />
          <BookTables book={book} />
          <Panel title={t('timeline.title', { count: recs.length })}>
            {recs.length === 0 ? (
              <p className="text-sm text-[var(--text-dim)]">{t('timeline.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="num w-full text-left text-xs">
                <thead>
                  <tr className="text-[var(--text-dim)]">
                    <th className={th}>{t('timeline.columns.date')}</th>
                    <th className={th}>{t('timeline.columns.ticker')}</th>
                    <th className={th}>{t('timeline.columns.action')}</th>
                    <th className={th}>{t('timeline.columns.referencePrice')}</th>
                    <th className={th}>{t('timeline.columns.fillPrice')}</th>
                    <th className={th}>{t('timeline.columns.confidence')}</th>
                    <th className={th}>{t('timeline.columns.d5')}</th>
                    <th className={th}>{t('timeline.columns.d20')}</th>
                    <th className={th}>{t('timeline.columns.d60')}</th>
                    <th className={th}>{t('timeline.columns.hit')}</th>
                    <th className={th}>{t('timeline.columns.score')}</th>
                    <th className={th}>{t('timeline.columns.status')}</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.id} className={`border-t border-[var(--border)] ${r.withdrawn_at ? 'opacity-50' : ''}`}>
                      <td className="py-1">{r.recommended_at.slice(0, 10)}</td>
                      <td className="py-1"><Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="text-accent hover:underline">{r.ticker}</Link></td>
                      <td className="py-1">{t(`action.${r.action}`)}</td>
                      <td className="py-1">{r.reference_price === null ? '--' : formatPrice(r.reference_price)}</td>
                      <td className="py-1">{r.fill_price === null ? <span className="text-[var(--text-dim)]">{t('scores.pending')}</span> : formatPrice(r.fill_price)}</td>
                      <td className="py-1">{r.confidence ?? '--'}</td>
                      <td className="py-1">{pct(r.score?.forward_5d_pct)}</td>
                      <td className="py-1">{pct(r.score?.forward_20d_pct)}</td>
                      <td className="py-1">{pct(r.score?.forward_60d_pct)}</td>
                      <td className="py-1">
                        {r.score?.hit === true ? <span aria-label={`${t('timeline.columns.hit')}: ${t('timeline.hitYes')}`} className="text-[var(--up)]">{t('timeline.hitYes')}</span>
                          : r.score?.hit === false ? <span aria-label={`${t('timeline.columns.hit')}: ${t('timeline.hitNo')}`} className="text-[var(--down)]">{t('timeline.hitNo')}</span>
                          : '--'}
                      </td>
                      <td className="py-1">{r.score?.score === null || r.score?.score === undefined ? '--' : r.score.score.toFixed(1)}</td>
                      <td className="py-1">
                        <span className="flex gap-1">
                          <Tag tone={r.withdrawn_at ? 'down' : 'neutral'}>{r.withdrawn_at ? t('timeline.withdrawn') : t('timeline.open')}</Tag>
                          {r.adopted_by.length > 0 && <Tag tone="up">{t('timeline.adopted')}</Tag>}
                        </span>
                      </td>
                      <td className="py-1">
                        {!r.withdrawn_at && (
                          <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => withdraw(r.id)}>
                            {busyId === r.id ? t('timeline.withdrawing') : t('timeline.withdraw')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Panel>
        </>
      )}
      <AnalystDisclaimer />
    </div>
  );
}
