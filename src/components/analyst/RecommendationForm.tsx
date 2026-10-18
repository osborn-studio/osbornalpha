'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel } from '@/components/ui';
import { createRecommendation } from '@/lib/hooks/useAnalyst';
import { classifyMarket } from '@/lib/utils';
import type { AnalystProfile, DecisionAction, DecisionHorizon, Market } from '@/lib/supabase/database.types';

const ACTIONS: DecisionAction[] = ['buy', 'add', 'trim', 'sell', 'hold', 'pass'];
const MARKETS: Market[] = ['A', 'HK', 'US'];
const HORIZONS: Array<DecisionHorizon | ''> = ['', 'short', 'mid', 'long'];
const inputCls = 'rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm';
const num = (s: string) => (s.trim() ? Number(s) : undefined);

export function RecommendationForm({ profiles, defaultAnalystId, onCreated }: {
  profiles: AnalystProfile[];
  defaultAnalystId?: string;
  onCreated: () => void;
}) {
  const t = useTranslations('analyst');
  const [analystId, setAnalystId] = useState(defaultAnalystId ?? profiles[0]?.id ?? '');
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState<Market>('A');
  const [marketTouched, setMarketTouched] = useState(false);
  const [action, setAction] = useState<DecisionAction>('buy');
  const [referencePrice, setReferencePrice] = useState('');
  const [rationale, setRationale] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [target, setTarget] = useState('');
  const [stop, setStop] = useState('');
  const [horizon, setHorizon] = useState<DecisionHorizon | ''>('');
  const [thesisRef, setThesisRef] = useState('');
  const [recommendedAt, setRecommendedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onTicker(v: string) {
    setTicker(v);
    if (!marketTouched) {
      const m = classifyMarket(v);
      if (MARKETS.includes(m)) setMarket(m);
    }
  }

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await createRecommendation({
        analyst_id: analystId, ticker, market, action,
        reference_price: num(referencePrice), rationale: rationale || undefined, confidence,
        target_price: num(target), stop_loss: num(stop), horizon: horizon || undefined,
        thesis_ref: thesisRef || undefined, source_type: 'manual',
        // datetime-local has no zone; Date() reads it as browser-local and toISOString() emits UTC.
        recommended_at: recommendedAt ? new Date(recommendedAt).toISOString() : undefined,
      });
      setTicker(''); setReferencePrice(''); setRationale(''); setTarget(''); setStop(''); setThesisRef(''); setRecommendedAt('');
      setMsg({ ok: true, text: t('recommendationForm.saved') });
      onCreated();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  return (
    <Panel title={t('recommendationForm.title')}>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">{t('recommendationForm.analyst')}
          <select value={analystId} onChange={(e) => setAnalystId(e.target.value)} className={`${inputCls} w-36`}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.is_self ? t('profiles.self') : p.display_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.ticker')}
          <input value={ticker} onChange={(e) => onTicker(e.target.value)} placeholder={t('recommendationForm.tickerPlaceholder')} className={`${inputCls} w-36`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.market')}
          <select value={market} onChange={(e) => { setMarket(e.target.value as Market); setMarketTouched(true); }} className={`${inputCls} w-24`}>
            {MARKETS.map((m) => <option key={m} value={m}>{t(`market.${m}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.action')}
          <select value={action} onChange={(e) => setAction(e.target.value as DecisionAction)} className={`${inputCls} w-24`}>
            {ACTIONS.map((a) => <option key={a} value={a}>{t(`action.${a}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.referencePrice')}
          <input value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.confidence', { pct: confidence })}
          <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-24" />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.targetPrice')}
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" className={`${inputCls} w-20`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.stopLoss')}
          <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" className={`${inputCls} w-20`} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.horizon')}
          <select value={horizon} onChange={(e) => setHorizon(e.target.value as DecisionHorizon | '')} className={`${inputCls} w-24`}>
            {HORIZONS.map((h) => <option key={h} value={h}>{h ? t(`horizon.${h}`) : t('horizon.none')}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.thesisRef')}
          <input value={thesisRef} onChange={(e) => setThesisRef(e.target.value)} className={`${inputCls} w-40`} maxLength={200} />
        </label>
        <label className="flex flex-col gap-0.5">{t('recommendationForm.recommendedAt')}
          <input type="datetime-local" value={recommendedAt} onChange={(e) => setRecommendedAt(e.target.value)} className={`${inputCls} w-48`} />
        </label>
        <label className="flex w-full flex-col gap-0.5">{t('recommendationForm.rationale')}
          <input value={rationale} onChange={(e) => setRationale(e.target.value)} className={inputCls} maxLength={4000} />
        </label>
        <Button size="sm" onClick={submit} disabled={busy || !analystId || !ticker.trim()}>
          {busy ? t('recommendationForm.submitting') : t('recommendationForm.submit')}
        </Button>
      </div>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>{msg.text}</p>}
    </Panel>
  );
}
