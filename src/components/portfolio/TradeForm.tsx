'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { postTrade } from '@/lib/hooks/usePortfolio';
import type { Decision, TradeDirection } from '@/lib/supabase/database.types';

export function TradeForm({ ticker, currentPrice, openDecision, onDone }: {
  ticker: string;
  currentPrice: number | null;
  openDecision: Decision | null;
  onDone: () => void;
}) {
  const t = useTranslations('portfolio');
  const [show, setShow] = useState(false);
  const [direction, setDirection] = useState<TradeDirection>('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [fee, setFee] = useState('');
  const [executedAt, setExecutedAt] = useState(''); // datetime-local; empty = now
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
        // datetime-local has no timezone — toISOString() pins it to the user's local clock.
        executed_at: executedAt ? new Date(executedAt).toISOString() : undefined,
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
        <span className="text-[10px] tracking-wider text-[var(--text-dim)]">{t('tradeForm.label')}</span>
        <Button size="sm" variant="secondary" onClick={() => openForm('buy')}>{t('tradeForm.buyTrade')}</Button>
        <Button size="sm" variant="secondary" onClick={() => openForm('sell')}>{t('tradeForm.sellTrade')}</Button>
        {openDecision && <span className="text-[10px] text-[var(--accent)]">{t('tradeForm.willLinkOpenDecision')}</span>}
      </div>
      {show && (
        <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
          <span className={direction === 'buy' ? 'text-up' : 'text-down'}>{direction === 'buy' ? t('direction.buy') : t('direction.sell')}</span>
          <label className="flex flex-col gap-0.5">{t('tradeForm.price')}
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">{t('tradeForm.quantity')}
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric"
              className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">{t('tradeForm.fee')}
            <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0"
              className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <label className="flex flex-col gap-0.5">{t('tradeForm.executedAt')}
            <input type="datetime-local" value={executedAt} onChange={(e) => setExecutedAt(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1" />
          </label>
          <Button size="sm" onClick={submit} disabled={busy || !price || !quantity}>{busy ? t('tradeForm.submitting') : t('tradeForm.submit')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setShow(false)}>{t('tradeForm.cancel')}</Button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </div>
  );
}
