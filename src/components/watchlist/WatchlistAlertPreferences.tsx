'use client';

import { BellRing, ChevronDown, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatchlistAlertPreferences } from '@/lib/hooks/useWatchlistAlertPreferences';
import type { WatchlistAlertChannel, WatchlistAlertDeliveryMode } from '@/lib/watchlist/alert-delivery-preferences';

export function WatchlistAlertPreferences() {
  const t = useTranslations('market.table.drawer.alerts.preferences');
  const model = useWatchlistAlertPreferences();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<WatchlistAlertChannel[]>([]);
  const [mode, setMode] = useState<WatchlistAlertDeliveryMode>('instant');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [quiet, setQuiet] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');
  const [digestTime, setDigestTime] = useState('08:30');
  useEffect(() => {
    if (!model.preferences) return;
    setChannels(model.preferences.channels); setMode(model.preferences.mode);
    setTelegramChatId(model.preferences.telegramChatId ?? '');
    setQuiet(!!model.preferences.quietStart && !!model.preferences.quietEnd);
    setQuietStart(model.preferences.quietStart ?? '22:00'); setQuietEnd(model.preferences.quietEnd ?? '08:00');
    setDigestTime(model.preferences.digestTime);
  }, [model.preferences]);
  const toggleChannel = (channel: WatchlistAlertChannel) => setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  const valid = !channels.includes('telegram') || /^-?\d{1,20}$/.test(telegramChatId.trim());
  return <section className="mb-4 border-b border-border pb-4">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 text-left"><BellRing className="h-4 w-4 text-text-muted" aria-hidden="true" /><span className="flex-1 text-xs font-semibold text-text">{t('title')}</span><ChevronDown className={`h-4 w-4 text-text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
    {open && <div className="mt-3 space-y-3 rounded-md border border-border bg-bg-elevated p-3">
      {model.loading ? <div className="h-16 animate-pulse rounded bg-bg-card" /> : <>
        <div><div className="mb-1.5 text-[11px] font-medium text-text-muted">{t('channels')}</div><div className="flex gap-4">{(['email', 'telegram'] as const).map((channel) => <label key={channel} className="flex items-center gap-2 text-xs text-text"><input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />{t(channel)}</label>)}</div></div>
        {channels.includes('telegram') && <label className="block"><span className="mb-1 block text-[11px] text-text-muted">{t('telegramChatId')}</span><input value={telegramChatId} onChange={(event) => setTelegramChatId(event.target.value)} inputMode="numeric" className="h-8 w-full text-xs" aria-invalid={!valid} /></label>}
        <div><div className="mb-1.5 text-[11px] font-medium text-text-muted">{t('mode')}</div><div className="inline-flex rounded-md border border-border bg-bg p-0.5">{(['instant', 'digest'] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`h-7 rounded px-3 text-xs ${mode === value ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-muted'}`}>{t(value)}</button>)}</div></div>
        {mode === 'digest' && <label className="block"><span className="mb-1 block text-[11px] text-text-muted">{t('digestTime')}</span><input type="time" value={digestTime} onChange={(event) => setDigestTime(event.target.value)} className="h-8 text-xs" /></label>}
        <label className="flex items-center gap-2 text-xs text-text"><input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />{t('quiet')}</label>
        {quiet && <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[11px] text-text-muted">{t('quietStart')}</span><input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} className="h-8 w-full text-xs" /></label><label><span className="mb-1 block text-[11px] text-text-muted">{t('quietEnd')}</span><input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} className="h-8 w-full text-xs" /></label></div>}
        <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-text-muted">{model.preferences && t('timezone', { value: model.preferences.timezone })}</span><button type="button" disabled={model.saving || !valid} onClick={() => void model.save({ channels, mode, telegramChatId: telegramChatId.trim() || null, quietStart: quiet ? quietStart : null, quietEnd: quiet ? quietEnd : null, digestTime })} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" aria-hidden="true" />{model.saving ? t('saving') : t('save')}</button></div>
      </>}
      {model.error && <p className="text-[11px] text-status-bad" role="alert">{t('error')}</p>}
    </div>}
  </section>;
}
