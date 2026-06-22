'use client';
import { useCallback, useEffect, useState } from 'react';

interface Variant { ev: number; equity: number; perShare: number; pvExplicit: number; pvTerminal: number; terminalPctEv: number; }
interface DcfResult {
  valuation: {
    fcff: Variant; ebitda: Variant; adjusted: Variant; exSbc: Variant;
    rangePerShare: { min: number; median: number; max: number };
  };
  sensitivity: { rowLabel: string; colLabel: string; rows: number[]; cols: number[]; grid: number[][] };
}
interface DcfResponse { ticker: string; assumptions: any; result: DcfResult; warnings: string[]; }

const VARIANTS: Array<{ key: keyof DcfResult['valuation']; label: string }> = [
  { key: 'fcff', label: 'FCFF 标准' },
  { key: 'adjusted', label: '扣非' },
  { key: 'exSbc', label: '扣 SBC' },
  { key: 'ebitda', label: 'EBITDA 退出' },
];

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—');

export function DcfStudio({ ticker }: { ticker: string }) {
  const [data, setData] = useState<DcfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // editable assumptions
  const [wacc, setWacc] = useState(0.1);
  const [terminalG, setTerminalG] = useState(0.025);
  const [forecastYears, setForecastYears] = useState(8);

  const run = useCallback(async (overrides: Record<string, number>) => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/dcf/${encodeURIComponent(ticker)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: DcfResponse = await r.json();
      setData(j);
      // sync editable fields with what the engine actually used
      if (j.assumptions) {
        if (Number.isFinite(j.assumptions.wacc)) setWacc(j.assumptions.wacc);
        if (Number.isFinite(j.assumptions.terminalG)) setTerminalG(j.assumptions.terminalG);
        if (Number.isFinite(j.assumptions.forecastYears)) setForecastYears(j.assumptions.forecastYears);
      }
    } catch (e) { setErr(String(e)); }
    setLoading(false);
  }, [ticker]);

  useEffect(() => { run({}); }, [run]);

  const v = data?.result.valuation;
  const range = v?.rangePerShare;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">🧮 DCF 估值</div>
        {loading && <span className="text-xs text-text-dim">计算中…</span>}
      </div>

      {err && <div className="card-base text-sm text-down">⚠️ {err}</div>}

      {range && (
        <div className="card-base">
          <div className="text-xs text-text-dim">每股价值区间</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-sm text-text-dim">{fmt(range.min)}</span>
            <span className="text-2xl font-bold text-accent">{fmt(range.median)}</span>
            <span className="text-sm text-text-dim">{fmt(range.max)}</span>
          </div>
        </div>
      )}

      {v && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VARIANTS.map(({ key, label }) => {
            const vv = v[key] as Variant;
            return (
              <div key={key} className="rounded-md bg-bg-card p-3 text-center">
                <div className="text-[11px] text-text-dim">{label}</div>
                <div className="text-lg font-bold tabular-nums">{fmt(vv.perShare)}</div>
                <div className="text-[10px] text-text-muted">终值 {pct(vv.terminalPctEv)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editable assumptions */}
      <div className="card-base">
        <div className="mb-2 text-xs font-semibold text-text-dim">假设（可调）</div>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs">WACC
            <input type="number" step="0.005" value={wacc}
              onChange={(e) => setWacc(parseFloat(e.target.value))}
              className="mt-1 w-full rounded bg-bg-card px-2 py-1 text-sm" />
          </label>
          <label className="text-xs">永续增长 g
            <input type="number" step="0.005" value={terminalG}
              onChange={(e) => setTerminalG(parseFloat(e.target.value))}
              className="mt-1 w-full rounded bg-bg-card px-2 py-1 text-sm" />
          </label>
          <label className="text-xs">预测年数
            <input type="number" step="1" value={forecastYears}
              onChange={(e) => setForecastYears(parseInt(e.target.value, 10))}
              className="mt-1 w-full rounded bg-bg-card px-2 py-1 text-sm" />
          </label>
        </div>
        <button
          onClick={() => run({ wacc, terminalG, forecastYears })}
          disabled={loading}
          className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">
          重新计算
        </button>
      </div>

      {data?.warnings?.length ? (
        <div className="card-base text-[11px] text-text-muted">
          {data.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      ) : null}
    </div>
  );
}
