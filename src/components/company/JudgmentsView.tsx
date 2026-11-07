'use client';
// Judgments view (plan 2026-11-06 Task 13; spec §5.10, §10.4; canvas States): flag off → empty state;
// on → F4 read with view/asOf contract, fail closed on any mismatch.
import { useTranslations } from 'next-intl';
import { JUDGMENTS_FLAG } from '@/lib/company/client';
import { checkJudgmentsResponse, companyJudgmentCard, judgmentsUrl } from '@/lib/company/judgments';
import { useCompanyFetch } from './useCompanyFetch';
import { Callout, ErrorCard, LoadingGrid } from './StateCallout';
import { JudgmentCard } from '@/components/judgments/JudgmentCard';

export function JudgmentsView({ issuerId, asOf }: { issuerId: string | null; asOf: string | null }) {
  const t = useTranslations('company.judgments');
  const enabled = JUDGMENTS_FLAG && issuerId !== null;
  const { state, retry } = useCompanyFetch<unknown>(enabled ? judgmentsUrl(issuerId, asOf) : null);
  if (!enabled) return <Callout><strong className="text-[var(--text)]">{t('emptyTitle')}</strong> {t('empty')}</Callout>;
  if (state.status === 'loading' || state.status === 'idle') return <LoadingGrid />;
  if (state.status === 'error') return <ErrorCard message={t('loadFailed', { code: state.code })} onRetry={retry} />;
  const checked = checkJudgmentsResponse(state.data, asOf);
  if (!checked.ok) return <ErrorCard message={asOf ? t('replayFailed') : t('loadFailed', { code: checked.reason })} onRetry={retry} />;
  if (checked.cards.length === 0) return <Callout>{t('none')}</Callout>;
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{checked.cards.map((c) => <JudgmentCard key={c.judgment_id} card={companyJudgmentCard(c)} />)}</div>;
}
