// src/app/(app)/stock/[ticker]/CompanyPage.tsx
'use client';
// Company page client shell (plan 2026-11-06 Task 11; spec §5.1, §5.2, §5.7, §5.9, §5.10):
// header, stream switch, nine tabs by ?view=, asOf replay bar, special states, legacy tabs.
// Fact views are wired in Tasks 12/13 by replacing renderFactView only.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Disclaimer } from '@/components/Disclaimer';
import { Card } from '@/components/ui';
import { usePerspectives, useQuote } from '@/lib/hooks/useQuote';
import { REPLAY_UNSUPPORTED, type ViewId } from '@/lib/company/client';
import type { CompanyPageData } from '@/lib/company/page-data';
import { CompanyHeader } from '@/components/company/CompanyHeader';
import { ViewTabs } from '@/components/company/ViewTabs';
import { ReplayBar, ReplayOpener, ReplayUnsupportedBanner } from '@/components/company/ReplayBar';
import { ErrorCard, FactStateCallout } from '@/components/company/StateCallout';
import { CompanyTrackingView } from '@/components/company/tracking/CompanyTrackingView';
import { AiView } from './legacy/AiView';
import { SignalsView } from './legacy/SignalsView';
import { HoldingsView } from './legacy/HoldingsView';

export interface CompanyPageProps {
  data: CompanyPageData; view: ViewId; asOf: string | null; highlight: string | null; isAdmin: boolean; locale: 'zh' | 'en';
}

export function CompanyPage(props: CompanyPageProps) {
  const { data } = props;
  const ts = useTranslations('market.stock');
  const t = useTranslations('company.states');
  // Unknown vs "quote but no issuer" (spec §5.7) needs the quote endpoint only when resolve found nothing.
  const quote = useQuote(data.issuer || data.errorCode ? null : data.ticker);

  if (data.errorCode) {
    return <ErrorCard message={data.errorCode === 'ambiguous_ticker' ? t('ambiguous') : t('internal')} onRetry={() => window.location.reload()} />;
  }
  if (!data.issuer) {
    if (quote.loading) return <div className="card-base py-10 text-center text-sm text-text-dim">{ts('loadingQuote', { ticker: data.ticker })}</div>;
    if (!quote.data) {
      const key = quote.notFound ? 'notFound' : 'unavailable';
      return (
        <div className="card-base text-center">
          <h2 className="mb-2 text-lg font-bold">{ts(`${key}.title`, { ticker: data.ticker })}</h2>
          <p>{ts(`${key}.bodyPrefix`)}<Link href="/">{ts('notFound.home')}</Link>{ts('notFound.or')}<Link href="/watchlist">{ts('notFound.watchlist')}</Link></p>
        </div>
      );
    }
  }
  return <CompanyShell {...props} />;
}

function CompanyShell({ data, view, asOf, highlight, isAdmin, locale }: CompanyPageProps) {
  const ticker = data.publicTicker ?? data.ticker;
  // Lifted here (button-triggered, quota-costing) so leaving and returning to the AI tab keeps results and in-flight runs.
  const pers = usePerspectives(ticker);
  const issuer = data.issuer;
  const extra = view === 'statements' && highlight ? { highlight } : undefined;

  function renderBody() {
    if (REPLAY_UNSUPPORTED.has(view)) {
      const body = view === 'ai' ? <AiView pers={pers} /> : view === 'signals' ? <SignalsView /> : <HoldingsView ticker={ticker} />;
      return <>{asOf && <ReplayUnsupportedBanner ticker={ticker} view={view} />}{body}</>;
    }
    if (view === 'tracking') {
      if (issuer && data.market) return <CompanyTrackingView issuerId={issuer.issuer_id} ticker={ticker} market={data.market} asOf={asOf} />;
      return <FactStateCallout state={issuer ? (data.factState === 'ok' ? 'no_facts' : data.factState as 'no_issuer' | 'no_facts' | 'hk_pending') : 'no_issuer'} isAdmin={isAdmin} />;
    }
    return renderFactView();
  }

  // ---- Task 11: placeholder; Task 12 and Task 13 replace this whole function. ----
  function renderFactView() {
    if (view !== 'judgments' && data.factState !== 'ok') return <FactStateCallout state={data.factState as 'no_issuer' | 'no_facts' | 'hk_pending'} isAdmin={isAdmin} />;
    return <PendingView />;
  }

  return (
    <div className="flex flex-col gap-4">
      <CompanyHeader data={data} view={view} asOf={asOf} locale={locale} />
      {asOf && <ReplayBar ticker={ticker} view={view} asOf={asOf} extra={extra} />}
      <ViewTabs ticker={ticker} view={view} asOf={asOf} right={asOf ? undefined : <ReplayOpener ticker={ticker} view={view} />} />
      <div>{renderBody()}</div>
      <Disclaimer />
    </div>
  );
}

function PendingView() {
  const t = useTranslations('company.states');
  return <Card className="text-sm text-[var(--text-dim)]">{t('viewPending')}</Card>;
}
