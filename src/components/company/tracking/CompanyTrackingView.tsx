// src/components/company/tracking/CompanyTrackingView.tsx
// Company page "跟踪" view (spec §5.10 tracking row, §7.3): watched → inbox?issuerId= (muted included, with
// read state and "mark read"); not watched → public events (no read state); asOf → public events computed
// for the replay date, read actions disabled ("回放模式不记录已读"). A dual-market issuer shows and marks only
// the selected market stream (plan audit S2).
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { foldSameIssuerDay } from '@/lib/company/inbox';
import type { Market } from '@/lib/company/types';
import { fetchCompanyEvents, fetchInbox, isWatching, markRowsRead, TrackingApiError, type WatchCard } from '@/lib/company/tracking-client';
import { LoadGenerations, guardedLoad } from './guarded-load';
import { InboxEventRow, type DisplayEvent } from './InboxEventRow';
import { markPageFlow, marketRows, shouldApply } from './mark-scope';
import { TrackButton } from './TrackButton';
import { subscribeWatchChanged } from './watch-sync';

export interface CompanyTrackingViewProps { issuerId: string; ticker: string; market: Market; asOf: string | null }

export function CompanyTrackingView({ issuerId, ticker, market, asOf }: CompanyTrackingViewProps) {
  const t = useTranslations('tracking');
  const { show } = useToast();
  const replay = asOf !== null;
  const [watching, setWatching] = useState<boolean | null>(null);
  const [rows, setRows] = useState<DisplayEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gens] = useState(() => new LoadGenerations());   // 计划第 3 轮审计 R7: request generations

  const [recheck, setRecheck] = useState(0);
  // The header / inline TrackButton announce a successful add; re-check membership (→ watching flips → scope resets → the selected market's inbox reloads).
  useEffect(() => subscribeWatchChanged(issuerId, () => setRecheck((n) => n + 1)), [issuerId]);
  useEffect(() => {
    let live = true;
    isWatching(issuerId).then((w) => { if (live) setWatching(w); }).catch(() => { if (live) setWatching(false); });
    return () => { live = false; };
  }, [issuerId, recheck]);
  useEffect(() => { setWatching(null); }, [issuerId]);   // a new issuer must not reuse the previous issuer's watch state

  // 计划第 3 轮审计 R7: a scope change invalidates every in-flight load and clears the previous scope's rows;
  // declared before the load effect so it runs first. Cleanup (unmount / next scope) invalidates as well.
  useEffect(() => {
    gens.invalidate();
    setRows([]); setCursor(null); setError(null); setLoading(false);
    return () => { gens.invalidate(); };
  }, [gens, issuerId, ticker, market, asOf, watching]);

  const load = useCallback((from: string | null): Promise<void> => {
    if (watching === null) return Promise.resolve();
    return guardedLoad<DisplayEvent>(gens, from, async (c) => {
      if (!replay && watching) {
        const r = await fetchInbox({ issuerId, cursor: c, limit: 50 });
        return { rows: marketRows(r.rows, market), nextCursor: r.nextCursor };   // inbox filters by issuer only; keep the selected stream. The cursor is preserved even when the filtered page is empty.
      }
      const r = await fetchCompanyEvents(ticker, { asOf, cursor: c, limit: 50 });
      return { rows: marketRows(r.rows, market).map((e) => ({ ...e, read: true })), nextCursor: r.nextCursor };   // no read state outside the inbox
    }, {
      setLoading,
      page: (f, r) => { setRows((prev) => (f ? [...prev, ...r.rows] : r.rows)); setCursor(r.nextCursor); setError(null); },
      fail: setError,
    }, (e) => (e instanceof TrackingApiError ? e.code : 'internal'));
  }, [gens, watching, replay, issuerId, ticker, asOf, market]);
  useEffect(() => { void load(null); }, [load]);

  const groups = useMemo(() => foldSameIssuerDay(rows), [rows]);
  const card = useMemo<WatchCard>(() => ({
    issuerId, names: { zh: null, en: null }, tickers: [], primaryTicker: { [market]: ticker }, streams: [], hkOnly: false,
    note: null, muted: false, createdAt: '', updatedAt: '', unread: null, unreadLabel: null,
  }), [issuerId, market, ticker]);
  const canMark = !replay && watching === true && rows.some((r) => !r.read);

  return (
    <div className="space-y-2" data-testid="company-tracking">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-dim">
        {replay ? <span data-testid="replay-no-read">{t('company.replayNoRead')} · {t('company.live')}</span>
          : watching === false ? <><span>{t('company.notWatching')}</span><TrackButton issuerId={issuerId} /></> : null}
        <Button
          variant="secondary" size="sm" className="ml-auto min-h-11 sm:min-h-0" disabled={!canMark}
          title={replay ? t('company.replayNoRead') : undefined}
          onClick={async () => {
            const g = gens.peek();   // 计划第 3 轮审计 R7: no write into a scope that changed meanwhile
            try {
              const r = await markPageFlow({ rows, unreadOnly: false, generation: () => gens.peek(), submit: markRowsRead });
              if (r.kind === 'applied') setRows(r.apply);
            } catch (e) { if (shouldApply(g, gens.peek())) show(t('errors.generic', { code: e instanceof TrackingApiError ? e.code : 'internal' })); }
          }}
        >
          {t('company.markRead')}
        </Button>
      </div>
      {error && <Card className="text-[13px]" role="alert">{t('inbox.error', { code: error })} <Button variant="ghost" size="sm" onClick={() => load(null)}>{t('inbox.retry')}</Button></Card>}
      {!error && rows.length === 0 && !loading && <Card className="text-[13px] text-text-dim">{t('inbox.empty')}</Card>}
      {rows.length > 0 && (
        <Card className="p-0">
          <ul>{groups.map((g) => <InboxEventRow key={g.key} head={g.head} rest={g.rest} card={card} showIssuer={false} />)}</ul>
        </Card>
      )}
      <div className="text-center">
        {loading && <span className="text-xs text-text-dim">{t('inbox.loading')}</span>}
        {!loading && cursor && <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={() => load(cursor)}>{t('inbox.loadMore')}</Button>}
      </div>
    </div>
  );
}
