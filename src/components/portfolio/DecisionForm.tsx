'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { postDecision } from '@/lib/hooks/usePortfolio';
import { classifyMarket } from '@/lib/utils';
import type { DecisionAction } from '@/lib/supabase/database.types';

const ACTIONS: Array<{ a: DecisionAction; label: string; variant: 'primary' | 'danger' | 'secondary' }> = [
  { a: 'buy', label: '买入', variant: 'primary' },
  { a: 'sell', label: '卖出', variant: 'danger' },
  { a: 'hold', label: '观望', variant: 'secondary' },
];

export function DecisionForm({ ticker, onDone }: { ticker: string; onDone: () => void }) {
  const [action, setAction] = useState<DecisionAction | null>(null);
  const [thesis, setThesis] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [target, setTarget] = useState('');
  const [stop, setStop] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!action) return;
    setBusy(true); setErr(null);
    try {
      await postDecision({
        ticker, market: classifyMarket(ticker), action, thesis: thesis || undefined,
        confidence, target_price: target ? Number(target) : undefined,
        stop_loss: stop ? Number(stop) : undefined, source_type: 'manual',
      });
      setAction(null); setThesis(''); setTarget(''); setStop('');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border border-[var(--border-active,var(--border))] bg-[var(--accent-wash,transparent)] p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tracking-wider text-[var(--accent)]">决策条</span>
        {ACTIONS.map(({ a, label, variant }) => (
          <Button key={a} size="sm" variant={action === a ? variant : 'ghost'} onClick={() => setAction(action === a ? null : a)}>
            {label}
          </Button>
        ))}
      </div>
      {action && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-0.5">理由
            <input value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="一句话理由"
              className="w-44 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">信心 {confidence}%
            <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-24" />
          </label>
          <label className="flex flex-col gap-0.5">目标价
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">止损
            <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? '记录中…' : '记录决策'}</Button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </div>
  );
}
