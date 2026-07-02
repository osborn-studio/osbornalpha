'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { postTrade } from '@/lib/hooks/usePortfolio';
import type { Decision, TradeDirection } from '@/lib/supabase/database.types';

export function TradeForm({ ticker, currentPrice, openDecision, onDone }: {
  ticker: string;
  currentPrice: number | null;
  openDecision: Decision | null;
  onDone: () => void;
}) {
  const [show, setShow] = useState(false);
  const [direction, setDirection] = useState<TradeDirection>('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openForm(d: TradeDirection) {
    setDirection(d);
    if (!price && currentPrice) setPrice(String(currentPrice));
    setShow(true);
  }

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await postTrade({
        ticker, direction, price: Number(price), quantity: Number(quantity),
        fee: fee ? Number(fee) : 0,
        decision_id: openDecision?.id,
      });
      setShow(false); setQuantity(''); setFee('');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tracking-wider text-[var(--text-dim)]">成交录入</span>
        <Button size="sm" variant="secondary" onClick={() => openForm('buy')}>买入成交</Button>
        <Button size="sm" variant="secondary" onClick={() => openForm('sell')}>卖出成交</Button>
        {openDecision && <span className="text-[10px] text-[var(--accent)]">将关联未平决策</span>}
      </div>
      {show && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
          <span className={direction === 'buy' ? 'text-up' : 'text-down'}>{direction === 'buy' ? '买入' : '卖出'}</span>
          <label className="flex flex-col gap-0.5">价格
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">数量
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric"
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">费用
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <Button size="sm" onClick={submit} disabled={busy || !price || !quantity}>{busy ? '提交中…' : '确认成交'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setShow(false)}>取消</Button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </div>
  );
}
