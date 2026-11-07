// src/components/company/tracking/TrackingInbox.tsx
// /watchlist/tracking body (spec §6.2, §7.3; artboards Tracking, M-Tracking): watch panel, kind filter,
// unread-only, "mark this page read" (the unread ids shown, per issuer, ≤500 per request), first-seen
// sections (today / earlier), same-issuer same-day fold, keyset "load more". No email/push; no expected
// disclosure dates (decision G).
'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { EVENT_KINDS, type EventKind } from '@/lib/company/types';
import { firstSeenSection, foldSameIssuerDay, INBOX_DEFAULT_LIMIT, localDayOf } from '@/lib/company/inbox';
import {
  fetchInbox, fetchWatches, markRowsRead, TrackingApiError,
  type ImportResult, type InboxRowDto, type WatchesResponse,
} from '@/lib/company/tracking-client';
import { ImportResultPanel } from './ImportResultPanel';
import { InboxEventRow } from './InboxEventRow';
import { markPageFlow, scopeKey, scopeReady, shouldApply } from './mark-scope';
import { WatchPanel, useTrackingError } from './WatchPanel';

type KindFilter = 'all' | EventKind;
const codeOf = (e: unknown) => (e instanceof TrackingApiError ? e.code : 'internal');
const chip = (on: boolean) => `shrink-0 rounded border px-2 py-1.5 text-xs ${on ? 'border-accent text-accent' : 'border-border text-text-dim'}`;

export function TrackingInbox() {
  const t = useTranslations('tracking');
  const { show } = useToast();
  const errorText = useTrackingError();
  const [watches, setWatches] = useState<WatchesResponse | null>(null);
  const [issuer, setIssuer] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [rows, setRows] = useState<InboxRowDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const seq = useRef(0);
  // "Today" and same-day folds use the viewer's LOCAL calendar day (not UTC), so a first-seen late evening stays with that evening.
  const today = localDayOf(new Date().toISOString());
  const scope = scopeKey({ issuer, kind, unreadOnly });
  const ready = scopeReady(loadedScope, scope);

  const loadWatches = useCallback(async () => {
    try { setWatches(await fetchWatches()); } catch (e) { setError(codeOf(e)); }
  }, []);
  const loadInbox = useCallback(async (from: string | null) => {
    const my = ++seq.current;
    setLoading(true);
    if (from === null) { setRows([]); setCursor(null); setLoadedScope(null); }   // rows and cursor belong to exactly one scope; a failed switch leaves them empty
    try {
      const r = await fetchInbox({ cursor: from, limit: INBOX_DEFAULT_LIMIT, kinds: kind === 'all' ? undefined : [kind], unreadOnly, issuerId: issuer });
      if (my !== seq.current) return;
      setRows((prev) => (from ? [...prev, ...r.rows] : r.rows));
      setCursor(r.nextCursor);
      setError(null);
      if (from === null) setLoadedScope(scopeKey({ issuer, kind, unreadOnly }));
    } catch (e) {
      if (my === seq.current) setError(codeOf(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [kind, unreadOnly, issuer]);

  useEffect(() => { void loadWatches(); }, [loadWatches]);
  useEffect(() => { void loadInbox(null); }, [loadInbox]);
  // A removed watch can no longer be the selected issuer filter (the inbox would answer 404 watch_not_found).
  useEffect(() => {
    if (issuer !== null && watches && !watches.watches.some((w) => w.issuerId === issuer)) setIssuer(null);
  }, [issuer, watches]);

  const refreshAll = useCallback(() => { void loadWatches(); void loadInbox(null); }, [loadWatches, loadInbox]);
  const cards = useMemo(() => new Map((watches?.watches ?? []).map((c) => [c.issuerId, c])), [watches]);
  const groups = useMemo(() => foldSameIssuerDay(rows, localDayOf), [rows]);
  const hasUnread = ready && rows.some((r) => !r.read);

  // plan audit S3: a delayed response only touches the ids it submitted, and only in the scope that submitted them.
  const markPage = async () => {
    const generation = seq.current;
    try {
      const r = await markPageFlow({ rows, unreadOnly, generation: () => seq.current, submit: markRowsRead });
      void loadWatches();
      if (r.kind === 'stale') return;
      setRows(r.apply);
      show(t('inbox.markedRead', { count: r.n }));
    } catch (e) { if (shouldApply(generation, seq.current)) show(errorText(e, watches?.limit ?? null)); }
  };

  let lastSection: string | null = null;
  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {t('page.title')} {watches && <span className="ml-1 font-mono text-[11px] font-normal text-text-dim sm:hidden">{t('page.count', { count: watches.count, limit: watches.limit })}</span>}
          </h1>
          <p className="text-[11px] text-text-dim">{t('page.subtitle')}</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1 text-sm">
          <Link href="/watchlist" className="inline-flex min-h-11 items-center rounded px-3 py-1 text-text-dim sm:min-h-0">{t('page.kanban')}</Link>
          <span aria-current="page" className="inline-flex min-h-11 items-center rounded sm:min-h-0 bg-[color-mix(in_srgb,var(--accent-dim)_20%,transparent)] px-3 py-1 font-semibold text-accent">{t('page.tracking')}</span>
        </div>
      </div>

      {importResult && <ImportResultPanel result={importResult} onDismiss={() => setImportResult(null)} />}

      {/* mobile: issuer chips + manage toggle (M-Tracking) */}
      {watches && (
        <div className="mb-2 sm:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="issuer-chips">
            <button type="button" aria-pressed={issuer === null} onClick={() => setIssuer(null)} className={`min-h-11 ${chip(issuer === null)}`}>
              {t('watches.all')}
            </button>
            {watches.watches.map((c) => (
              <button key={c.issuerId} type="button" aria-pressed={issuer === c.issuerId} onClick={() => setIssuer(c.issuerId)} className={`min-h-11 ${chip(issuer === c.issuerId)}`}>
                {c.names.zh ?? c.names.en ?? c.tickers[0]?.ticker} {c.unreadLabel ?? ''}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="min-h-11" aria-expanded={manageOpen} onClick={() => setManageOpen(!manageOpen)}>{t('watches.manage')}</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[280px_1fr]">
        <div className={manageOpen ? '' : 'hidden sm:block'}>
          {watches && (
            <WatchPanel data={watches} selected={issuer} onSelect={setIssuer} onChanged={refreshAll} onImported={setImportResult} />
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 overflow-x-auto rounded-md border border-border p-1 text-xs">
              {(['all', ...EVENT_KINDS] as KindFilter[]).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  className={`min-h-11 whitespace-nowrap sm:min-h-0 rounded px-2 py-1 ${kind === k ? 'bg-[color-mix(in_srgb,var(--accent-dim)_20%,transparent)] font-semibold text-accent' : 'text-text-dim'}`}>
                  {t(`filters.${k}`)}
                </button>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-1 text-xs text-text-dim sm:min-h-0">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              {t('filters.unreadOnly')}
            </label>
            <Button variant="secondary" size="sm" className="ml-auto min-h-11 sm:min-h-0" disabled={!hasUnread || loading} onClick={markPage}>
              {t('filters.markPageRead')}
            </Button>
          </div>

          {error && (
            <Card className="mb-2 text-[13px]" role="alert">
              {t('inbox.error', { code: error })}{' '}
              <Button variant="ghost" size="sm" onClick={refreshAll}>{t('inbox.retry')}</Button>
            </Card>
          )}

          {watches?.count === 0 ? (
            <Card className="text-[13px] text-text-dim">{t('watches.empty')}</Card>
          ) : rows.length === 0 && !loading ? (
            <Card className="text-[13px] text-text-dim">
              {unreadOnly ? (
                <>{t('inbox.noUnread')} <Button variant="ghost" size="sm" onClick={() => setUnreadOnly(false)}>{t('inbox.showAll')}</Button></>
              ) : t('inbox.empty')}
            </Card>
          ) : (
            <Card className="p-0">
              <ul data-testid="inbox-list">
                {groups.map((g) => {
                  const section = firstSeenSection(g.head.firstSeenAt, today, localDayOf);
                  const header = section !== lastSection
                    ? <li key={`s-${g.key}`} className="bg-bg-elevated px-3 py-1 text-[11px] text-text-dim">{section === 'today' ? t('inbox.today') : t('inbox.earlier')}</li>
                    : null;
                  lastSection = section;
                  return (
                    <Fragment key={g.key}>
                      {header}
                      <InboxEventRow head={g.head} rest={g.rest} card={cards.get(g.head.issuerId)} />
                    </Fragment>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="mt-2 text-center">
            {loading && <span className="text-xs text-text-dim">{t('inbox.loading')}</span>}
            {!loading && cursor && ready && <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={() => loadInbox(cursor)}>{t('inbox.loadMore')}</Button>}
          </div>
        </div>
      </div>
    </>
  );
}
