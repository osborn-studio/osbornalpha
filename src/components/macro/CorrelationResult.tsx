'use client';
// CorrelationResult — one stored analysis run (spec §3.4, §7): numbers, the rule-generated sentence, charts with table
// views (scatter → table below 640px), and the frozen-input receipt (cutoff, catalog version, inputs hash, counts).
import type { AnalysisResult, AnalysisSpec, EventResult, FrozenInputs, PairResult, RollingResult } from '@/lib/macro/correlation';
import type { AnalysisKind, Bilingual } from '@/lib/macro/types';
import { DataTableToggle } from './charts/DataTableToggle';
import { MacroLineChart } from './charts/MacroLineChart';
import { ScatterFit } from './charts/ScatterFit';
import { sparklinePoints } from './charts/chart-geometry';
import { formatInstant } from './macro-format';
import { useMacroT, type MacroT } from './use-macro-t';
import { pick, type Locale } from './view-model';

export interface RunJson {
  run_id: string; request_id: string; kind: AnalysisKind; spec: AnalysisSpec; inputs: FrozenInputs; inputs_hash: string;
  results: (AnalysisResult & { explanation: Bilingual }) | null; code_version: string; method_version: string; status: 'ok' | 'failed'; error: string | null; created_at: string;
}
const f = (v: number, d = 2) => v.toFixed(d);
const cell = 'py-1 pr-3';

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div><div className="font-mono tabular-nums">{value}</div></div>;
}

function Pairs({ res, t }: { res: PairResult; t: MacroT }) {
  const x = sparklinePoints(res.pairs.map((p) => String(p.x)), 480, 110, 4);
  const y = sparklinePoints(res.pairs.map((p) => String(p.y)), 480, 110, 4);
  return (
    <DataTableToggle
      t={t}
      narrowTable
      chart={
        <div className="space-y-3">
          <svg role="img" aria-label={`${t('correlation.result.x')} / ${t('correlation.result.y')}`} viewBox="0 0 480 110" className="h-auto w-full">
            {x && <polyline fill="none" stroke="var(--text)" strokeWidth={1.2} points={x} />}
            {y && <polyline fill="none" stroke="var(--accent)" strokeWidth={1.2} points={y} />}
          </svg>
          <div className="flex gap-4 text-[11px] text-text-dim">
            <span><span className="mr-1 inline-block h-0.5 w-3 bg-[var(--text)] align-middle" />{t('correlation.result.x')}</span>
            <span><span className="mr-1 inline-block h-0.5 w-3 bg-accent align-middle" />{t('correlation.result.y')}</span>
          </div>
          <ScatterFit pairs={res.pairs} slope={res.slope} intercept={res.intercept} label={t('correlation.result.scatterLabel')} xLabel={`${t('correlation.result.x')} (${res.x_unit})`} yLabel={`${t('correlation.result.y')} (${res.y_unit})`} />
          <div className="font-mono text-[11px] text-text-dim">{t('correlation.result.fit', { intercept: f(res.intercept, 4), slope: f(res.slope, 4) })}</div>
        </div>
      }
      table={
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell}>{t('correlation.result.t')}</th><th className={cell}>{t('correlation.result.s')}</th><th className={`${cell} text-right`}>{t('correlation.result.x')}</th><th className={`${cell} text-right`}>{t('correlation.result.y')}</th></tr></thead>
            <tbody>{res.pairs.map((p) => <tr key={p.t} className="border-t border-border"><td className={`${cell} font-mono`}>{p.t}</td><td className={`${cell} font-mono`}>{p.s}</td><td className={`${cell} text-right font-mono tabular-nums`}>{f(p.x, 4)}</td><td className={`${cell} text-right font-mono tabular-nums`}>{f(p.y, 4)}</td></tr>)}</tbody>
          </table>
        </div>
      }
    />
  );
}

function Rolling({ res, t }: { res: RollingResult; t: MacroT }) {
  return (
    <DataTableToggle
      t={t}
      chart={<MacroLineChart points={res.points.map((p) => ({ time: `${p.end}-01`, value: p.r }))} ariaLabel={t('correlation.result.rollingLabel')} height={200} />}
      table={
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell}>{t('correlation.result.windowEnd')}</th><th className={`${cell} text-right`}>{t('correlation.result.r')}</th><th className={`${cell} text-right`}>{t('correlation.result.validPairs')}</th></tr></thead>
          <tbody>{res.points.map((p) => <tr key={p.end} className="border-t border-border"><td className={`${cell} font-mono`}>{p.end}</td><td className={`${cell} text-right font-mono tabular-nums`}>{f(p.r)}</td><td className={`${cell} text-right font-mono tabular-nums`}>{p.n}</td></tr>)}</tbody>
        </table>
      }
    />
  );
}

function Events({ res, t }: { res: EventResult; t: MacroT }) {
  const u = res.y_unit === 'pct' ? '%' : ` ${res.y_unit}`;
  return (
    <div className="space-y-3">
      <div className="text-xs">{t('correlation.result.independent', { count: res.independent, candidates: res.candidates })}</div>
      {res.stats ? (
        <table className="text-xs">
          <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell} /><th className={`${cell} text-right`}>{t('correlation.result.median')}</th><th className={`${cell} text-right`}>{t('correlation.result.q1')}</th><th className={`${cell} text-right`}>{t('correlation.result.q3')}</th></tr></thead>
          <tbody>
            {(['pre', 'post'] as const).map((k) => (
              <tr key={k} className="border-t border-border">
                <td className={cell}>{t(`correlation.result.${k}`, { n: res.n_months })}</td>
                <td className={`${cell} text-right font-mono tabular-nums`}>{f(res.stats![k].median)}{u}</td>
                <td className={`${cell} text-right font-mono tabular-nums`}>{f(res.stats![k].q1)}{u}</td>
                <td className={`${cell} text-right font-mono tabular-nums`}>{f(res.stats![k].q3)}{u}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="text-xs text-text-dim">{t('correlation.result.fewEvents')}</div>}
      <div className="text-[10px] uppercase tracking-wider text-text-dim">{t('correlation.result.events')}</div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell}>{t('correlation.result.eventDate')}</th><th className={cell}>{t('correlation.result.anchor')}</th><th className={`${cell} text-right`}>{t('correlation.result.changeBp')}</th><th className={`${cell} text-right`}>{t('correlation.result.pre', { n: res.n_months })}</th><th className={`${cell} text-right`}>{t('correlation.result.post', { n: res.n_months })}</th></tr></thead>
        <tbody>{res.events.map((e) => <tr key={e.effective_date} className="border-t border-border"><td className={`${cell} font-mono`}>{e.effective_date}</td><td className={`${cell} font-mono`}>{e.anchor}</td><td className={`${cell} text-right font-mono tabular-nums`}>{e.change_bp}</td><td className={`${cell} text-right font-mono tabular-nums`}>{f(e.pre)}{u}</td><td className={`${cell} text-right font-mono tabular-nums`}>{f(e.post)}{u}</td></tr>)}</tbody>
      </table>
      {res.dropped.length > 0 && <ul className="text-[11px] text-text-dim">{res.dropped.map((d) => <li key={d.effective_date}>{t('correlation.result.dropped', { date: d.effective_date, reason: t(`correlation.result.droppedReasons.${d.reason}`) })}</li>)}</ul>}
    </div>
  );
}

function Body({ res, t, locale }: { res: AnalysisResult & { explanation: Bilingual }; t: MacroT; locale: Locale }) {
  return (
    <div className="space-y-3">
      {(res.kind === 'change' || res.kind === 'level') && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-density="data">
            <Stat label={t('correlation.result.r')} value={f(res.r)} />
            <Stat label={t('correlation.result.r2')} value={f(res.r2)} />
            <Stat label={t('correlation.result.n')} value={String(res.n)} />
            <Stat label={t('correlation.result.sample')} value={`${res.from} → ${res.to}`} />
            <Stat label={t('correlation.result.transform')} value={t(`correlation.modes.${res.kind}`)} />
            <Stat label={t('correlation.result.lag')} value={String(res.lag)} />
            <Stat label={t('correlation.result.method')} value={res.method_version} />
            <Stat label={t('correlation.result.code')} value={res.code_version.slice(0, 12)} />
          </div>
          {res.exploratory && <div className="rounded-md border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] px-3 py-2 text-xs">{t('correlation.result.exploratory')}</div>}
        </>
      )}
      <p className="text-sm">{pick(res.explanation, locale)}</p>
      {(res.kind === 'change' || res.kind === 'level') && <Pairs res={res} t={t} />}
      {res.kind === 'rolling' && <Rolling res={res} t={t} />}
      {res.kind === 'event_window' && <Events res={res} t={t} />}
    </div>
  );
}

export function CorrelationResult({ run }: { run: RunJson }) {
  const { t, locale } = useMacroT();
  return (
    <div className="card-base space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{t('correlation.result.title')}</h3>
        <span className="font-mono text-[11px] text-text-dim">{run.run_id} · {formatInstant(run.created_at)}</span>
      </div>
      {run.status === 'failed' || !run.results
        ? <div className="text-xs text-warn">{t('correlation.result.failed', { code: run.error ?? 'unknown' })}</div>
        : <Body res={run.results} t={t} locale={locale} />}
      <div className="border-t border-border pt-2 text-[11px] text-text-dim">
        <div className="mb-1 uppercase tracking-wider">{t('correlation.result.inputs')}</div>
        <div className="grid gap-1 font-mono sm:grid-cols-2">
          <span>{t('correlation.result.cutoff')} {formatInstant(run.inputs.cutoff)}</span>
          <span>{t('correlation.result.catalog')} {run.inputs.catalog_version}</span>
          <span className="break-all">{t('correlation.result.hash')} {run.inputs_hash}</span>
          <span>{t('correlation.result.observations', { ind: run.inputs.indicator.observations.length, asset: run.inputs.asset.observations.length })}</span>
        </div>
      </div>
    </div>
  );
}
