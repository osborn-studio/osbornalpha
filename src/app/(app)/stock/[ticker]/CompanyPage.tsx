// src/app/(app)/stock/[ticker]/CompanyPage.tsx
'use client';
// Company page client shell (plan 2026-11-06 Task 11; spec §5.1, §5.2, §5.7, §5.9, §5.10):
// header, stream switch, nine tabs by ?view=, asOf replay bar, special states, legacy tabs.
// Fact views: statements (Task 12), metrics / filings / overview / judgments (Task 13).
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Disclaimer } from '@/components/Disclaimer';
import { usePerspectives, useQuote } from '@/lib/hooks/useQuote';
import { JUDGMENTS_FLAG, REPLAY_UNSUPPORTED, type ViewId } from '@/lib/company/client';
import type { CompanyPageData } from '@/lib/company/page-data';
import { CompanyHeader } from '@/components/company/CompanyHeader';
import { ViewTabs } from '@/components/company/ViewTabs';
import { ReplayBar, ReplayOpener, ReplayUnsupportedBanner } from '@/components/company/ReplayBar';
import { DrawerHost } from '@/components/company/DrawerHost';
import { StatementsView } from '@/components/company/StatementsView';
import { MetricsView } from '@/components/company/MetricsView';
import { FilingsView } from '@/components/company/FilingsView';
import { OverviewView, SignalsCard } from '@/components/company/OverviewView';
import { JudgmentsView } from '@/components/company/JudgmentsView';
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
  // Admin unredacted view toggle (statements): lifted so drawers and the copied query use the grid's access mode.
  const [adminView, setAdminView] = useState(false);
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

  // ---- Task 13: final fact-view routing (spec §5.1, §5.7, §5.10). ----
  function renderFactView() {
    // F4 flag on but no issuer (quote-only security): there is no subject to ask F4 about, so show the fact-state callout, not "F4 not live".
    if (view === 'judgments' && JUDGMENTS_FLAG && !issuer) return <FactStateCallout state="no_issuer" isAdmin={isAdmin} />;
    if (view === 'judgments') return <JudgmentsView issuerId={issuer?.issuer_id ?? null} asOf={asOf} />;
    if (data.factState !== 'ok' || !data.market) {
      const callout = <FactStateCallout state={data.factState === 'ok' ? 'no_facts' : data.factState as 'no_issuer' | 'no_facts' | 'hk_pending'} isAdmin={isAdmin} />;
      return view === 'overview' ? <div className="flex flex-col gap-5">{callout}<SignalsCard /></div> : callout;
    }
    switch (view) {
      case 'statements': return <StatementsView ticker={ticker} asOf={asOf} isAdmin={isAdmin} adminView={isAdmin && adminView} onAdminView={setAdminView} highlight={highlight} />;
      case 'metrics': return <MetricsView ticker={ticker} market={data.market} asOf={asOf} />;
      case 'filings': return <FilingsView ticker={ticker} market={data.market} asOf={asOf} />;
      default: return <OverviewView ticker={ticker} market={data.market} asOf={asOf} />;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <CompanyHeader data={data} view={view} asOf={asOf} locale={locale} />
      {asOf && <ReplayBar ticker={ticker} view={view} asOf={asOf} extra={extra} />}
      <ViewTabs ticker={ticker} view={view} asOf={asOf} right={asOf ? undefined : <ReplayOpener ticker={ticker} view={view} />} />
      <DrawerHost ticker={ticker} asOf={asOf} admin={isAdmin && adminView && view === 'statements'}>
        <div>{renderBody()}</div>
      </DrawerHost>
      <Disclaimer />
    </div>
  );
}
