// src/components/company/tracking/WatchPanel.tsx
// Left column of the inbox (artboard Tracking): count n/200, add by ticker, import from watchlist, issuer
// filter list with unread labels (n / 99+ / n+), mute / note / remove per watch. Muted issuers show no count.
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Tag } from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  addWatch, importFromWatchlist, patchWatch, removeWatch, TrackingApiError,
  type ImportResult, type WatchCard, type WatchesResponse,
} from '@/lib/company/tracking-client';

export function useTrackingError() {
  const t = useTranslations('tracking');
  return (e: unknown, limit: number) => {
    const code = e instanceof TrackingApiError ? e.code : 'internal';
    if (code === 'watch_limit') return t('errors.watch_limit', { limit });
    if (code === 'unknown_ticker') return t('errors.unknown_ticker');
    if (code === 'no_server_watchlist') return t('import.noServerWatchlist');
    return t('errors.generic', { code });
  };
}

export function streamLabel(card: WatchCard, t: ReturnType<typeof useTranslations>) {
  if (card.hkOnly) return t('stream.hkPending');
  if (card.streams.length === 0) return t('stream.none');
  return card.streams.map((s) => t(`stream.${s.market}`)).join(' · ');
}

function WatchItem({ card, selected, onSelect, onChanged, limit }: {
  card: WatchCard; selected: boolean; onSelect: () => void; onChanged: () => void; limit: number;
}) {
  const t = useTranslations('tracking');
  const { show } = useToast();
  const errorText = useTrackingError();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(card.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const name = card.names.zh ?? card.names.en ?? card.tickers[0]?.ticker ?? card.issuerId;
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); } catch (e) { show(errorText(e, limit)); }
  };
  return (
    <li className={`rounded-md px-2 py-2 ${selected ? 'bg-bg-elevated' : ''}`} data-testid="watch-item" data-issuer-id={card.issuerId}>
      <div className="flex items-center gap-2">
        <button type="button" aria-pressed={selected} onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-[11px] text-text-dim">
            {card.muted ? `${t('watches.muted')} · ${t('watches.mutedHint')}` : streamLabel(card, t)}
          </div>
        </button>
        {card.unreadLabel !== null && (
          <Tag tone={card.unread ? 'accent' : 'neutral'} data-testid="unread-count">{card.unreadLabel}</Tag>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => run(() => patchWatch(card.issuerId, { muted: !card.muted }))}>
          {card.muted ? t('watches.unmute') : t('watches.mute')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>{t('watches.note')}</Button>
        {confirming ? (
          <Button variant="danger" size="sm" onClick={() => run(() => removeWatch(card.issuerId))}>{t('watches.confirmRemove')}</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>{t('watches.remove')}</Button>
        )}
      </div>
      {card.note && !editing && <p className="mt-1 whitespace-pre-wrap text-[12px] text-text-muted">{card.note}</p>}
      {editing && (
        <div className="mt-1 space-y-1">
          <textarea
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('watches.notePlaceholder')}
            aria-label={t('watches.note')}
            className="w-full rounded-md bg-bg-card px-2 py-1 text-[13px]"
            rows={3}
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={() => run(async () => { await patchWatch(card.issuerId, { note: note.trim() === '' ? null : note }); setEditing(false); })}>
              {t('watches.save')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setNote(card.note ?? ''); setEditing(false); }}>{t('watches.cancel')}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function WatchPanel({ data, selected, onSelect, onChanged, onImported }: {
  data: WatchesResponse; selected: string | null; onSelect: (issuerId: string | null) => void;
  onChanged: () => void; onImported: (r: ImportResult) => void;
}) {
  const t = useTranslations('tracking');
  const { show } = useToast();
  const errorText = useTrackingError();
  const [ticker, setTicker] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!ticker.trim()) return;
    setBusy(true);
    try { await addWatch({ ticker: ticker.trim() }); setTicker(''); onChanged(); }
    catch (e) { show(errorText(e, data.limit)); }
    finally { setBusy(false); }
  };
  const doImport = async () => {
    setBusy(true);
    try { onImported(await importFromWatchlist()); onChanged(); }
    catch (e) { show(errorText(e, data.limit)); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{t('watches.title')}</span>
        <span className="font-mono text-[11px] text-text-dim" data-testid="watch-count">{t('page.count', { count: data.count, limit: data.limit })}</span>
      </div>
      <div className="mb-2 flex gap-1">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          placeholder={t('watches.addPlaceholder')}
          aria-label={t('watches.add')}
          className="min-w-0 flex-1 rounded-md bg-bg-card px-2 py-1 text-[13px]"
        />
        <Button size="sm" variant="secondary" disabled={busy} onClick={add}>{t('watches.add')}</Button>
      </div>
      <Button size="sm" variant="secondary" disabled={busy} onClick={doImport} className="mb-2 w-full">{t('watches.import')}</Button>
      {data.count === 0 ? (
        <p className="text-[13px] text-text-dim">{t('watches.empty')}</p>
      ) : (
        <ul className="space-y-0.5">
          <li>
            <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selected === null ? 'bg-bg-elevated font-semibold' : 'text-text-dim'}`}>
              {t('watches.all')}
            </button>
          </li>
          {data.watches.map((c) => (
            <WatchItem key={c.issuerId} card={c} limit={data.limit} selected={selected === c.issuerId} onSelect={() => onSelect(c.issuerId)} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Card>
  );
}
