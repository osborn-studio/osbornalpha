'use client';
// Valuation model (spec §5.4, §5.10, §9.1, §0 #65): never runs on mount. On mount it GETs the fact seed and
// shows the equity-bridge panel (base revenue, shares outstanding, net debt — each with its source label,
// basis note and fact links); "Run" appears only when all three are fact- or user-sourced (typing a number
// makes it `user`). Hidden in replay mode (asOf set). Warnings are codes translated under market.dcf.warnings.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BRIDGE_KEYS, bridgeFields, bridgeOverrides, canRun } from '@/lib/dcf/bridge';
import { acceptRun, inputsKey, isStale } from '@/lib/dcf/run-state';
import type { BridgeKey, DcfRunResponse, DcfSeedResponse } from '@/lib/dcf/bridge';

const VARIANT_KEYS = ['fcff', 'adjusted', 'exSbc', 'ebitda'] as const;
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—');
const BASIS_KEYS = new Set(['us_standard', 'cn_borrowings_less_monetary_funds_incl_restricted', 'shares_outstanding', 'revenue', 'revenue_operating']);
const leafValue = (a: Record<string, unknown>, leaf: string): string => {
  const m = /^revenueLines\[0\]\.(\w+)$/.exec(leaf);
  const lines = a.revenueLines as Record<string, unknown>[] | undefined;
  const v = m ? lines?.[0]?.[m[1]] : a[leaf];
  return typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 6 }) : v === undefined ? '—' : JSON.stringify(v);
};
const num = (n: number | null) => (n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 6 }));

export function DcfStudio({ ticker, asOf = null, onOpenFact }: { ticker: string; asOf?: string | null; onOpenFact?: (factId: string) => void }) {
  const t = useTranslations('market.dcf');
  const [seed, setSeed] = useState<DcfSeedResponse | null>(null);
  const [seedErr, setSeedErr] = useState('');
  const [user, setUser] = useState<Partial<Record<BridgeKey, string>>>({});
  const [data, setData] = useState<DcfRunResponse | null>(null);
  const [runKey, setRunKey] = useState<string | null>(null);
  const scope = useRef({ generation: 0, ticker, asOf: asOf ?? null });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [wacc, setWacc] = useState(0.1);
  const [terminalG, setTerminalG] = useState(0.025);
  const [forecastYears, setForecastYears] = useState(8);

  useEffect(() => {
    // a new ticker/asOf invalidates every in-flight run: its response must never land on this company
    scope.current = { generation: scope.current.generation + 1, ticker, asOf: asOf ?? null };
    setLoading(false); setErr(''); setRunKey(null);
    if (asOf) return;
    let cancelled = false;
    setSeed(null); setSeedErr(''); setData(null); setUser({});
    fetch(`/api/dcf/${encodeURIComponent(ticker)}`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as DcfSeedResponse; })
      .then((j) => { if (!cancelled) setSeed(j); })
      .catch((e) => { if (!cancelled) setSeedErr(String(e)); });
    return () => { cancelled = true; };
  }, [ticker, asOf]);

  const fields = useMemo(() => (seed ? bridgeFields(seed, user) : null), [seed, user]);

  const run = async () => {
    if (!fields || !canRun(fields)) return;
    const request = { generation: scope.current.generation + 1, ticker, asOf: asOf ?? null };
    scope.current = request;
    const key = inputsKey({ wacc, terminalG, forecastYears, user });
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/dcf/${encodeURIComponent(ticker)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overrides: { ...bridgeOverrides(fields), wacc, terminalG, forecastYears } }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as DcfRunResponse;
      if (!acceptRun(scope.current, request, j.ticker)) return;
      setData(j); setRunKey(key);
    } catch (e) { if (acceptRun(scope.current, request, request.ticker)) setErr(String(e)); }
    if (scope.current.generation === request.generation) setLoading(false);
  };

  if (asOf) return <div className="card-base text-sm text-text-dim">{t('replayHidden')}</div>;

  const stale = data !== null && runKey !== null && isStale(runKey, inputsKey({ wacc, terminalG, forecastYears, user }));
  const v = data?.status === 'ok' ? data.result?.valuation : undefined;
  const range = v?.rangePerShare;
  const factLink = (id: string, i: number) => onOpenFact
    ? <button key={id} type="button" onClick={() => onOpenFact(id)} className="text-[11px] text-accent underline">{t('factLink', { n: i + 1 })}</button>
    : <a key={id} href={`/api/facts/${encodeURIComponent(ticker)}?factIds=${id}`} target="_blank" rel="noreferrer" className="text-[11px] text-accent underline">{t('factLink', { n: i + 1 })}</a>;

  return (
    <div data-testid="dcf-studio" className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-dim">{t('modelHeading')}</div>
        {loading && <span className="text-xs text-text-dim">{t('calculating')}</span>}
      </div>
      {seedErr && <div className="card-base text-sm text-down">{seedErr}</div>}
      {!seed && !seedErr && <div className="text-xs text-text-dim">{t('loadingSeed')}</div>}

      {seed && fields && (
        <div className="card-base space-y-2">
          <div className="text-xs font-semibold text-text-dim">{t('bridgeHeading')}</div>
          <div className="text-[11px] text-text-muted">{t('unitNote', { unit: seed.meta.currencyUnit, currency: seed.meta.currency, divisor: seed.meta.divisor })}</div>
          {BRIDGE_KEYS.map((k) => {
            const f = fields[k];
            return (
              <div key={k} className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_1fr_12rem] sm:items-center">
                <div className="text-xs">{t(`bridge.${k}`)}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
                  <span>{num(f.value)}</span>
                  <span className="rounded bg-bg-elevated px-1 text-[10px] text-text-dim">{t(`source.${f.source}`)}</span>
                  {f.source === 'missing' && f.reason && <span className="text-[11px] text-text-muted">{t(`missingReason.${f.reason}`)}</span>}
                  {f.basis && <span className="text-[11px] text-text-muted">{t(`basis.${f.basis}`)}</span>}
                  {f.factIds.map(factLink)}
                </div>
                <input type="number" inputMode="decimal" aria-label={t(`bridge.${k}`)} placeholder={t('userPlaceholder', { unit: k === 'sharesDiluted' ? `÷${seed.meta.divisor}` : seed.meta.currencyUnit })}
                  value={user[k] ?? ''} onChange={(e) => setUser((u) => ({ ...u, [k]: e.target.value }))}
                  className="w-full rounded bg-bg-card px-2 py-1 text-sm" />
              </div>
            );
          })}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <label className="text-xs">{t('wacc')}
              <input type="number" step="0.005" value={wacc} onChange={(e) => setWacc(parseFloat(e.target.value))} className="mt-1 w-full rounded bg-bg-card px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">{t('terminalG')}
              <input type="number" step="0.005" value={terminalG} onChange={(e) => setTerminalG(parseFloat(e.target.value))} className="mt-1 w-full rounded bg-bg-card px-2 py-1 text-sm" />
            </label>
            <label className="text-xs">{t('forecastYears')}
              <input type="number" step="1" value={forecastYears} onChange={(e) => setForecastYears(parseInt(e.target.value, 10))} className="mt-1 w-full rounded bg-bg-card px-2 py-1 text-sm" />
            </label>
          </div>
          {canRun(fields) && (
            <button type="button" onClick={run} disabled={loading} className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">{t('run')}</button>
          )}
        </div>
      )}

      {err && <div className="card-base text-sm text-down">{err}</div>}
      {data?.status === 'unavailable' && <div className="card-base text-sm text-text-dim">{t('unavailable')}</div>}

      {stale && <div role="status" className="card-base text-sm text-down">{t('record.stale')}</div>}
      {range && (
        <div className={`card-base${stale ? ' opacity-50' : ''}`}>
          <div className="text-xs text-text-dim">{t('rangeHeading')}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-sm text-text-dim">{fmt(range.min)}</span>
            <span className="text-2xl font-bold text-accent">{fmt(range.median)}</span>
            <span className="text-sm text-text-dim">{fmt(range.max)}</span>
          </div>
        </div>
      )}
      {v && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VARIANT_KEYS.map((key) => (
            <div key={key} className="rounded-md bg-bg-card p-3 text-center">
              <div className="text-[11px] text-text-dim">{t(`variants.${key}`)}</div>
              <div className="text-lg font-bold tabular-nums">{fmt(v[key].perShare)}</div>
              <div className="text-[10px] text-text-muted">{t('terminalPct', { pct: pct(v[key].terminalPctEv) })}</div>
            </div>
          ))}
        </div>
      )}
      {data?.status === 'ok' && data.assumptions && (
        <div className={`card-base space-y-1 text-[11px]${stale ? ' opacity-50' : ''}`}>
          <div className="text-xs font-semibold text-text-dim">{t('record.heading')}</div>
          <div className="text-text-muted">{t('record.units', { unit: data.meta.currencyUnit, currency: data.meta.currency, divisor: data.meta.divisor })}</div>
          <div className="text-text-dim">{t('record.assumptions')}</div>
          {Object.entries(data.provenance).map(([leaf, src]) => (
            <div key={leaf} className="flex flex-wrap items-center gap-2 tabular-nums">
              <span className="min-w-[10rem]">{leaf}</span>
              <span>{leafValue(data.assumptions ?? {}, leaf)}</span>
              <span className="rounded bg-bg-elevated px-1 text-[10px] text-text-dim">{t(`provenance.${src}`)}</span>
              {src === 'fact' && data.factProvenance?.[leaf]?.factIds.map(factLink)}
            </div>
          ))}
          {data.factProvenance && Object.keys(data.factProvenance).length > 0 && <div className="pt-1 text-text-dim">{t('record.facts')}</div>}
          {Object.entries(data.factProvenance ?? {}).map(([leaf, p]) => (
            <div key={leaf} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[10rem]">{leaf}</span>
              <span className="text-text-muted">{BASIS_KEYS.has(p.basis) ? t(`basis.${p.basis}`) : p.basis}</span>
              <span className="text-text-muted">{t('record.period', { date: p.periodEnd })}</span>
              <span className="text-text-muted">{p.unit} ÷{p.divisor}</span>
              {p.factIds.map(factLink)}
            </div>
          ))}
        </div>
      )}
      {data?.warnings?.length ? (
        <div className="card-base text-[11px] text-text-muted">
          {data.warnings.map((w, i) => <div key={i}>{t(`warnings.${w.code}`)}</div>)}
        </div>
      ) : null}
    </div>
  );
}
