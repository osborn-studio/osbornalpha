'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel, Tag } from '@/components/ui';
import { exchangeDate } from '@/lib/scoring/forward';
import { fetchBook, fetchRecommendations, patchProfile, withdrawRecommendation, type Book, type RecommendationView } from '@/lib/hooks/useAnalyst';
import type { AnalystProfile } from '@/lib/supabase/database.types';
import { AnalystDisclaimer } from '@/components/analyst/AnalystDisclaimer';
import { BookSummaryPanel, BookTables, formatFill, pctOrDash } from '@/components/analyst/BookTables';

// Mirrors the .limit(500) in listRecommendations (lib/analyst/store.ts).
const RECS_CAP = 500;

export default function AnalystDetailPage() {
  const t = useTranslations('analyst');
  const { analystId } = useParams<{ analystId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<AnalystProfile | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [recs, setRecs] = useState<RecommendationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
    setActionError(null);
    setBusyId(id);
    try {
      await withdrawRecommendation(id, reason || undefined);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally { setBusyId(null); }
  }

  async function rename() {
    if (!profile) return;
    const name = window.prompt(t('profile.renamePrompt'), profile.display_name)?.trim();
    if (!name || name === profile.display_name) return; // cancelled or unchanged
    setActionError(null);
    try {
      const r = await patchProfile(analystId, { display_name: name });
      setProfile(r.profile);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function archive() {
    if (!window.confirm(t('profile.archiveConfirm'))) return;
    setActionError(null);
    try {
      await patchProfile(analystId, { archived: true });
      router.push('/analyst');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  const th = 'pb-1 font-normal';
  return (
    <div className="space-y-4 p-4">
      <Link href="/analyst" className="text-sm text-[var(--text-dim)] hover:text-[var(--text)]">{t('nav.back')}</Link>
      {error && <p className="text-sm text-[var(--down)]">{t('common.error', { message: error })}</p>}
      {actionError && <p className="text-sm text-[var(--down)]">{actionError}</p>}
      {!profile || !book ? (
        !error && <p className="text-sm text-[var(--text-dim)]">{t('common.loading')}</p>
      ) : (
        <>
          <header className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{profile.is_self ? t('profiles.self') : profile.display_name}</h1>
            <Tag tone={profile.kind === 'agent' ? 'accent' : 'neutral'}>{t(`kind.${profile.kind}`)}</Tag>
            {profile.note && <span className="text-sm text-[var(--text-dim)]">{profile.note}</span>}
            {/* The self profile always renders as "我" and cannot be archived, so it gets neither button. */}
            {!profile.is_self && (
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={rename}>{t('profile.rename')}</Button>
                <Button size="sm" variant="ghost" onClick={archive}>{t('profile.archive')}</Button>
              </span>
            )}
          </header>
          <BookSummaryPanel book={book} />
          <BookTables book={book} />
          <Panel title={t('timeline.title', { count: recs.length })}>
            {recs.length === RECS_CAP && <p className="mb-1 text-xs text-[var(--text-dim)]">{t('timeline.capped', { count: RECS_CAP })}</p>}
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
                      <th className={th}><span className="sr-only">{t('timeline.withdraw')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recs.map((r) => (
                      <tr key={r.id} className={`border-t border-[var(--border)] ${r.withdrawn_at ? 'opacity-50' : ''}`}>
                        <td className="py-1">{exchangeDate(r.recommended_at, r.market)}</td>
                        <td className="py-1"><Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="text-accent hover:underline">{r.ticker}</Link></td>
                        <td className="py-1">{t(`action.${r.action}`)}</td>
                        <td className="py-1">{r.reference_price === null ? '--' : formatFill(r.reference_price, r.market)}</td>
                        {/* Shows the frozen first-score fill; when the latest refresh restated it on a new price basis (qfq / split) the title carries both. */}
                        <td className="py-1" title={r.fill_price !== null && r.score?.base_close !== null && r.score?.base_close !== undefined && r.score.base_close !== r.fill_price ? `${formatFill(r.fill_price, r.market)} → ${formatFill(r.score.base_close, r.market)} (${r.score.base_date ?? ''})` : undefined}>{r.fill_price === null ? <span className="text-[var(--text-dim)]">{t('scores.pending')}</span> : formatFill(r.fill_price, r.market)}</td>
                        <td className="py-1">{r.confidence ?? '--'}</td>
                        <td className="py-1">{pctOrDash(r.score?.forward_5d_pct ?? null)}</td>
                        <td className="py-1">{pctOrDash(r.score?.forward_20d_pct ?? null)}</td>
                        <td className="py-1">{pctOrDash(r.score?.forward_60d_pct ?? null)}</td>
                        <td className="py-1">
                          {r.score?.hit === true ? <span role="img" aria-label={`${t('timeline.columns.hit')}: ${t('timeline.hitYes')}`} title={`${t('timeline.columns.hit')}: ${t('timeline.hitYes')}`} className="text-[var(--up)]">{t('timeline.hitYes')}</span>
                            : r.score?.hit === false ? <span role="img" aria-label={`${t('timeline.columns.hit')}: ${t('timeline.hitNo')}`} title={`${t('timeline.columns.hit')}: ${t('timeline.hitNo')}`} className="text-[var(--down)]">{t('timeline.hitNo')}</span>
                            : '--'}
                        </td>
                        <td className="py-1">{r.score?.score === null || r.score?.score === undefined ? '--' : r.score.score.toFixed(1)}</td>
                        <td className="py-1">
                          <span className="flex gap-1">
                            <Tag tone="neutral">{r.withdrawn_at ? t('timeline.withdrawn') : t('timeline.open')}</Tag>
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
