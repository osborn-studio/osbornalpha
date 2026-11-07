'use client';
// MacroWorkbench — /intel/macro (spec §3.1, §3.2, canvas OverviewOff): region switch, tabs 概览 · 指标 · 关联 · 方法与来源.
// The judgment slot is rendered only when the server page passes judgmentsEnabled. With the layer off, nothing on
// the page names a regime, score, margin or coverage percentage. Collection failures show the last published
// snapshot with its collection status; they never show zeros.
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CORRELATION_VERSION } from '@/lib/macro/correlation';
import { CYCLES_VERSION } from '@/lib/macro/cycles';
import { EVENTS_VERSION } from '@/lib/macro/events';
import type { SeriesOption } from '@/lib/macro/workbench-options';
import { CatalogCoverage } from './CatalogCoverage';
import { ChangesCard } from './ChangesCard';
import { CorrelationWorkbench } from './CorrelationWorkbench';
import { IndicatorDetail } from './IndicatorDetail';
import { IndicatorTable } from './IndicatorTable';
import { MacroJudgmentSlot } from './MacroJudgmentSlot';
import { SourceDrawer, type DrawerTarget } from './SourceDrawer';
import { SourceFooter } from './SourceFooter';
import { useMacroOverview } from './use-macro-overview';
import { useMacroT, type MacroT } from './use-macro-t';
import { changeCounts, changeLines, collectionOf, coverageOf, sourceLabel, sourceLabels, toIndicatorView, type IndicatorView, type OverviewEnvelopeJson } from './view-model';

export type WorkbenchTab = 'overview' | 'indicators' | 'correlation' | 'methodology';
const TABS: WorkbenchTab[] = ['overview', 'indicators', 'correlation', 'methodology'];

function Methodology({ env, rows, t, judgmentsEnabled, locale }: { env: OverviewEnvelopeJson | null; rows: IndicatorView[]; t: MacroT; judgmentsEnabled: boolean; locale: 'zh' | 'en' }) {
  const block = (title: string, body: string) => <section className="card-base space-y-1"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs leading-relaxed text-text-dim">{body}</p></section>;
  return (
    <div className="space-y-3">
      {block(t('methodology.availabilityTitle'), t('methodology.availabilityBody'))}
      {block(t('methodology.sourcesTitle'), t('methodology.sourcesBody'))}
      {block(t('methodology.missingTitle'), t('methodology.missingBody'))}
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
              <td className="py-1 text-text-dim">{t(`status.${r.status}`)}{r.reason ? `：${r.reason}` : ''}</td>
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
}) {
  const { t, locale } = useMacroT();
  const router = useRouter();
  const [region, setRegion] = useState(initialRegion);
  const [tab, setTab] = useState(initialTab);
  const [preview, setPreview] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const state = useMacroOverview(`region=${region}`);
  const env = state.status === 'ok' ? state.data.regions[region] ?? null : null;
  const rows = useMemo(() => (env ? env.indicators.map((r) => toIndicatorView(r, locale, t)) : []), [env, locale, t]);
  const go = (r: 'US' | 'CN', tb: WorkbenchTab) => {
    setRegion(r); setTab(tb); setPreview(null); setDrawer(null);
    router.replace(`/intel/macro?region=${r}&tab=${tb}`, { scroll: false });
  };
  const openEvidence = (row: IndicatorView) => {
    if (row.periodEnd) setDrawer({ seriesId: row.seriesId, observationId: row.observationId, name: row.name, periodEnd: row.periodEnd, display: `${row.value}${row.unit}`, unit: row.unitKey, source: row.source });
  };
  const coll = env ? collectionOf(env) : null;
  const tabBtn = (active: boolean) => `px-3 py-2 text-sm ${active ? 'border-b-2 border-accent font-semibold text-text' : 'text-text-dim'}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('page.title')}</h1>
          <p className="text-[11px] text-text-dim">{t('page.subtitle')}</p>
        </div>
        <div role="group" aria-label={t('region.label')} className="ml-auto flex overflow-hidden rounded border border-border">
          {(['US', 'CN'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={region === r} onClick={() => go(r, tab)} className={`px-3 py-1 text-xs ${region === r ? 'bg-[var(--accent-wash)] font-semibold text-accent' : 'text-text-dim'}`}>{t(`region.${r}`)}</button>
          ))}
        </div>
        {env && coll && (
          <span className="inline-flex items-center gap-2 rounded border border-border px-2 py-1 text-[11px] text-text-dim">
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${coll.overall === 'fresh' ? 'bg-accent' : coll.overall === 'missing' ? 'border border-text-dim' : 'bg-warn'}`} />
            <span className="font-mono">{env.asOf ? t('header.snapshot', { date: env.asOf }) : t('header.noSnapshot')}</span>
            <span>· {t('header.collection', { status: t(`collection.${coll.overall}`) })}</span>
          </span>
        )}
      </div>

      <nav aria-label={t('tabs.label')} className="flex gap-1 border-b border-border">
        {TABS.map((tb) => <button key={tb} type="button" aria-current={tab === tb ? 'page' : undefined} onClick={() => go(region, tb)} className={tabBtn(tab === tb)}>{t(`tabs.${tb}`)}</button>)}
      </nav>

      {state.status === 'loading' && tab !== 'correlation' && <div className="text-xs text-text-dim">{t('states.loading')}</div>}
      {state.status === 'error' && tab !== 'correlation' && <div className="card-base text-xs text-text-dim">{t('states.loadFailed', { code: state.code })}</div>}

      {tab === 'overview' && env && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <ChangesCard counts={changeCounts(env)} lines={changeLines(env, locale, t)} t={t} />
            <CatalogCoverage coverage={coverageOf(env, locale)} collection={coll?.items ?? []} t={t} onMethodology={() => go(region, 'methodology')} />
          </div>
          {judgmentsEnabled && <MacroJudgmentSlot region={region} snapshotId={env.snapshotId} />}
          <section className="card-base space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{t('table.title')}</h2>
              <span className="text-[11px] text-text-dim">{t('table.hint')}</span>
              <span className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-text-dim">{t('table.changeKinds')}</span>
            </div>
            <IndicatorTable rows={rows} t={t} onOpenEvidence={openEvidence} onPreview={(id) => setPreview((p) => (p === id ? null : id))} previewId={preview} />
            <div className="text-[11px] text-text-dim">{t('table.neutralNote')}</div>
          </section>
          {preview && <IndicatorDetail key={preview} seriesId={preview} compact />}
          <SourceFooter labels={sourceLabels(env.indicators, locale)} t={t} onOpen={() => { const first = rows.find((r) => r.hasEvidence); if (first) openEvidence(first); }} />
        </div>
      )}
      {tab === 'indicators' && env && (
        <section className="card-base"><IndicatorTable rows={rows} t={t} onOpenEvidence={openEvidence} /></section>
      )}
      {tab === 'correlation' && <CorrelationWorkbench key={region} options={options} region={region} />}
      {tab === 'methodology' && <Methodology env={env} rows={rows} t={t} judgmentsEnabled={judgmentsEnabled} locale={locale} />}
      <SourceDrawer target={drawer} onClose={closeDrawer} t={t} locale={locale} />
    </div>
  );
}
