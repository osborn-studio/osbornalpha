// src/components/company/tracking/InboxEventRow.tsx
// One folded inbox group (spec §7.3): issuer, kind tag, "updated" when payload_changed_at > first_seen_at,
// same-day fold count, available date, summary, deep link to the company page. Unread = brass dot.
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tag } from '@/components/ui';
import { isUpdated } from '@/lib/company/inbox';
import type { PublicEvent } from '@/lib/company/event-dto';
import type { WatchCard } from '@/lib/company/tracking-client';
import { EventSummaryText } from './EventSummaryText';

export type DisplayEvent = PublicEvent & { read: boolean };

export function companyHref(event: Pick<PublicEvent, 'kind' | 'occurredOn' | 'market'>, ticker: string | null) {
  if (!ticker) return null;
  const base = `/stock/${encodeURIComponent(ticker)}`;
  return event.kind === 'filing_published' ? `${base}?view=filings` : `${base}?view=statements&asOf=${event.occurredOn}`;
}

export function InboxEventRow({
  head, rest, card, showIssuer = true,
}: { head: DisplayEvent; rest: DisplayEvent[]; card?: WatchCard; showIssuer?: boolean }) {
  const t = useTranslations('tracking');
  const [open, setOpen] = useState(false);
  const all = [head, ...rest];
  const unread = all.some((e) => !e.read);
  const ticker = card?.primaryTicker[head.market] ?? null;
  const href = companyHref(head, ticker);
  const name = card ? (card.names.zh ?? card.names.en ?? ticker ?? head.issuerId) : (ticker ?? '');
  const kinds = [...new Set(all.map((e) => e.kind))];
  return (
    <li className="border-b border-border px-3 py-2.5 last:border-b-0" data-testid="inbox-row" data-event-id={head.eventId} data-read={!unread}>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span
          role="img"
          aria-label={unread ? t('inbox.unread') : t('inbox.read')}
          className={`inline-block h-1.5 w-1.5 rounded-full ${unread ? 'bg-accent' : 'bg-text-dim/40'}`}
        />
        {showIssuer && <span className={unread ? 'font-semibold' : 'text-text-dim'}>{name}</span>}
        {kinds.map((k) => <Tag key={k} tone="neutral">{t(`filters.${k}`)}</Tag>)}
        {all.some((e) => isUpdated(e)) && <Tag tone="accent">{t('inbox.updated')}</Tag>}
        {rest.length > 0 && <span className="text-[11px] text-text-dim">{t('inbox.folded', { count: rest.length })}</span>}
        <span className="ml-auto font-mono text-[11px] text-text-dim">{t('inbox.available', { date: head.occurredOn })}</span>
      </div>
      <div className="mt-1 flex items-start justify-between gap-3 text-[13px] text-text-muted">
        <EventSummaryText event={head} />
        {href && (
          <Link href={href as never} className="inline-flex min-h-11 shrink-0 items-center text-xs text-accent sm:min-h-0">
            {head.kind === 'filing_published' ? t('inbox.toFilings') : t('inbox.toStatements')}
          </Link>
        )}
      </div>
      {rest.length > 0 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 inline-flex min-h-11 items-center text-xs text-text-dim hover:text-text sm:min-h-0">
          {open ? t('inbox.collapse') : t('inbox.expand', { count: rest.length })}
        </button>
      )}
      {open && (
        <ul className="mt-1 space-y-1 border-l border-border pl-3 text-[13px] text-text-muted">
          {rest.map((e) => (
            <li key={e.eventId} data-testid="inbox-folded-row">
              <Tag tone="neutral">{t(`filters.${e.kind}`)}</Tag> <EventSummaryText event={e} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
