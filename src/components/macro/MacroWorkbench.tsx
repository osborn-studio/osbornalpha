'use client';
import { MacroStateLabel } from './MacroState';
// MacroWorkbench — /macro (spec §3.1, §3.2, canvas OverviewOff): region switch, tabs 概览 · 指标 · 关联 · 方法与来源.
// The judgment slot is rendered only when the server page passes judgmentsEnabled. With the layer off, nothing on
// the page names a regime, score, margin or coverage percentage. Collection failures show the last published
// snapshot with its collection status; they never show zeros.
import { useCallback, useMemo, useState } from 'react';
import { useSnapshotTime } from './use-snapshot-time';
import { FedLiquidity } from './FedLiquidity';
import { FED_DISPLAY_IDS } from './display-series';
import { MacroTabs } from './MacroTabs';
import { PageHeader } from '@/components/research-ui/PageHeader';
import { MACRO_CATALOG } from '@/lib/macro/catalog';
import { CORRELATION_VERSION } from '@/lib/macro/correlation';
import { CYCLES_VERSION } from '@/lib/macro/cycles';
import { EVENTS_VERSION } from '@/lib/macro/events';
import type { SeriesOption } from '@/lib/macro/workbench-options';
import { CatalogCoverage } from './CatalogCoverage';
import { ChangesCard } from './ChangesCard';
import { CorrelationWorkbench } from './CorrelationWorkbench';
import { IndicatorDetail } from './IndicatorDetail';
import { IndicatorTable } from './IndicatorTable';
import { KeyIndicatorCards } from './KeyIndicatorCards';
import { MacroJudgmentSlot } from './MacroJudgmentSlot';
import { AllocationTemplateCard } from './AllocationTemplateCard';
import { SourceDrawer, type DrawerTarget } from './SourceDrawer';
import { MacroResearchFooter } from './MacroResearchFooter';
import { useMacroOverview } from './use-macro-overview';
import { useMacroT, type MacroT } from './use-macro-t';
import { changeCounts, changeLines, collectionOf, coverageOf, sourceLabel, toIndicatorView, type IndicatorView, type OverviewEnvelopeJson } from './view-model';

export type WorkbenchTab = 'overview' | 'indicators' | 'correlation' | 'methodology';

function Methodology({ env, rows, t, judgmentsEnabled, locale }: { env: OverviewEnvelopeJson | null; rows: IndicatorView[]; t: MacroT; judgmentsEnabled: boolean; locale: 'zh' | 'en' }) {
  const block = (title: string, body: string) => <section className="card-base space-y-1"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs leading-relaxed text-text-dim">{body}</p></section>;
  return (
    <div className="space-y-3">
      {block(t('methodology.availabilityTitle'), t('methodology.availabilityBody'))}
      {block(t('methodology.sourcesTitle'), t('methodology.sourcesBody'))}
      {block(t('methodology.missingTitle'), t('methodology.missingBody'))}
      <section id="data-gaps" className="card-base space-y-1">
        <h3 className="text-sm font-semibold">{t('methodology.dataGapsTitle')}</h3>
        <ul className="space-y-1 text-xs text-text-dim">
          {MACRO_CATALOG.filter(d => d.status === 'missing' || d.status === 'restricted').map(d => (
            <li key={d.id}>{d.name[locale]} · <MacroStateLabel status={d.status}>{t(`status.${d.status}`)}</MacroStateLabel> · {d.reason?.[locale]}</li>
          ))}
        </ul>
      </section>
      {block(t('methodology.revisionsTitle'), t('methodology.revisionsBody'))}
      {block(t('methodology.eventsTitle'), t('methodology.eventsBody'))}
      <section className="card-base space-y-1">
        <h3 className="text-sm font-semibold">{t('methodology.versionsTitle')}</h3>
        <ul className="font-mono text-[11px] text-text-dim">
          {env && <li>{t('methodology.catalogVersion', { v: env.catalogVersion })}</li>}
          {env && <li>{t('methodology.methodologyVersion', { v: env.methodologyVersion ?? '—' })}</li>}
          <li>{t('methodology.eventsVersion', { v: EVENTS_VERSION })}</li>
          <li>{t('methodology.cyclesVersion', { v: CYCLES_VERSION })}</li>
          <li>{t('methodology.correlationVersion', { v: CORRELATION_VERSION })}</li>
        </ul>
        {!judgmentsEnabled && <p className="text-[11px] text-text-dim">{t('methodology.judgmentsOff')}</p>}
      </section>
      <section className="card-base space-y-1">
        <h3 className="text-sm font-semibold">{t('methodology.catalogTitle')}</h3>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] text-text-dim"><th className="py-1">{t('table.name')}</th><th className="py-1">{t('table.status')}</th><th className="py-1">{t('sources.title')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.seriesId} className="border-t border-border">
              <td className="py-1">{r.name} <span className="font-mono text-[10px] text-text-dim">{r.seriesId}</span></td>
              <td className="py-1 text-text-dim"><MacroStateLabel status={r.status}>{t(`status.${r.status}`)}</MacroStateLabel>{r.reason ? `：${r.reason}` : ''}</td>
              <td className="py-1 text-text-dim">{sourceLabel(r.source, locale) ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

export function MacroWorkbench({ initialRegion, initialTab, judgmentsEnabled, options }: {
  initialRegion: 'US' | 'CN'; initialTab: WorkbenchTab; judgmentsEnabled: boolean; options: { indicators: SeriesOption[]; assets: SeriesOption[] };
  /** Retained caller compatibility; server route gates still own strategy availability. */
  strategyEnabled?: boolean;
}) {
  const { t, locale } = useMacroT();
  const [region, setRegion] = useState(initialRegion);
  const [tab, setTab] = useState(initialTab);
  const [preview, setPreview] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const state = useMacroOverview(`region=${region}`);
  const env = state.status === 'ok' ? state.data.regions[region] ?? null : null;
  const snapshotTime = useSnapshotTime(env?.snapshotId);
  const rows = useMemo(() => (env ? env.indicators.map((r) => toIndicatorView(r, locale, t)) : []), [env, locale, t]);
  const go = (r: 'US' | 'CN', tb: WorkbenchTab) => {
    setRegion(r); setTab(tb); setPreview(null); setDrawer(null);
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/\/intel\/macro$/, '/macro');
    url.searchParams.set('region', r);
    url.searchParams.set('tab', tb);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const openEvidence = (row: IndicatorView) => {
    if (row.periodEnd) setDrawer({ seriesId: row.seriesId, observationId: row.observationId, name: row.name, periodEnd: row.periodEnd, display: `${row.value}${row.unit}`, unit: row.unitKey, source: row.source });
  };
  const coll = env ? collectionOf(env) : null;

  return (
    <div className="space-y-3">
      <PageHeader title={t('page.title')} scope={t('page.subtitle')}
        freshness={env && coll ? {asOf: env.asOf, status: coll.overall} : null}
        scopeSwitch={<div role="group" aria-label={t('region.label')} className="flex overflow-hidden rounded border border-border">
          {(['US', 'CN'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={region === r} onClick={() => go(r, tab)} className={`px-3 py-1 text-xs ${region === r ? 'bg-[var(--accent-wash)] font-semibold text-accent' : 'text-text-dim'}`}>{t(`region.${r}`)}</button>
          ))}
        </div>} />

      <MacroTabs active={tab} region={region} onView={tb => go(region, tb)} />

      {state.status === 'loading' && tab !== 'correlation' && <div className="text-xs text-text-dim">{t('states.loading')}</div>}
      {state.status === 'error' && tab !== 'correlation' && <div className="card-base text-xs text-text-dim">{t('states.loadFailed', { code: state.code })}</div>}

      {tab === 'overview' && <div className="macro-overview-layout">
        <nav className="macro-local-nav" aria-label={t('tabs.overview')}>
          {judgmentsEnabled && <a href="#investment-clock">{t('judgment.widget.title')}</a>}
          {env && <><a href="#macro-updates">{t('changes.title')}</a><a href="#macro-indicators">{t('tabs.indicators')}</a><a href="#macro-sources">{t('sources.title')}</a></>}
        </nav><div className="macro-overview-main">
      {judgmentsEnabled && <MacroJudgmentSlot key={region} region={region} snapshotId={env?.snapshotId} createdAt={snapshotTime.createdAt} />}
      {!judgmentsEnabled && <AllocationTemplateCard current={null} />}
      <FedLiquidity region={region} createdAt={snapshotTime.createdAt} />

      {tab === 'overview' && env && (
        <div className="space-y-3">
          <div id="macro-updates" className="grid gap-3 lg:grid-cols-2">
            <ChangesCard counts={changeCounts(env)} lines={changeLines(env, locale, t)} t={t} />
            <CatalogCoverage coverage={coverageOf(env, locale)} collection={coll?.items ?? []} t={t} onMethodology={() => go(region, 'methodology')} />
          </div>
          <KeyIndicatorCards key={region} region={region} env={env} snapshotTime={snapshotTime} />
          <section id="macro-indicators" className="card-base space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{t('table.title')}</h2>
              <span className="text-[11px] text-text-dim">{t('table.hint')}</span>
              <span className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-text-dim">{t('table.changeKinds')}</span>
            </div>
            <IndicatorTable rows={rows} t={t} onOpenEvidence={openEvidence} onPreview={(id) => setPreview((p) => (p === id ? null : id))} previewId={preview} />
            <div className="text-[11px] text-text-dim">{t('table.neutralNote')}</div>
          </section>
          {preview && <IndicatorDetail key={preview} seriesId={preview} compact />}

        </div>
      )}
      </div></div>}
      {tab === 'indicators' && env && (
        <section className="card-base"><IndicatorTable rows={rows} t={t} onOpenEvidence={openEvidence} /></section>
      )}
      {tab === 'correlation' && <CorrelationWorkbench key={region} options={options} region={region} />}
      {tab === 'methodology' && <Methodology env={env} rows={rows} t={t} judgmentsEnabled={judgmentsEnabled} locale={locale} />}
      {tab !== 'correlation' && <MacroResearchFooter seriesIds={[...rows.map(r => r.seriesId), ...(region === 'US' && tab === 'overview' ? FED_DISPLAY_IDS : [])]} region={region} />}
      <SourceDrawer target={drawer} onClose={closeDrawer} t={t} locale={locale} />
    </div>
  );
}
