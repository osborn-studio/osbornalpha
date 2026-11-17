'use client';
import {useLocale,useTranslations} from 'next-intl';
import {Button,Card} from '@/components/ui';
import type {InboxRowDto,WatchCard} from '@/lib/company/tracking-client';
import {mergeInboxRows,type IssuerResult} from './inbox-degrade';
export function InboxUnavailable({code,retry}:{code:string;retry:()=>void}) {
  const t=useTranslations('tracking');
  return <Card role="alert" data-testid="inbox-unavailable" className="mb-2 space-y-2 border-[var(--danger)] text-sm"><strong className="text-[var(--danger)]">{t('availability.title')}</strong><p>{t('availability.inboxBody',{code})}</p><Button variant="secondary" size="sm" className="min-h-11 sm:min-h-0" onClick={retry}>{t('inbox.retry')}</Button></Card>;
}
export function InboxDegradedControls({partial,retry}:{partial:boolean;retry:()=>void}) {
  const t=useTranslations('tracking');
  return <div className="flex flex-wrap items-center gap-2">{partial&&<span data-testid="inbox-partial-chip" className="rounded border border-[var(--warn)] px-2 py-1 text-xs text-[var(--warn)]">{t('availability.partial')}</span>}<Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={retry}>{t('inbox.retry')}</Button></div>;
}
export function InboxCompanyStatus({watches,perIssuer}:{watches:WatchCard[];perIssuer:Map<string,IssuerResult<InboxRowDto>>}) {
  const t=useTranslations('tracking');
  const locale=useLocale()==='en'?'en':'zh';
  return <div className="mb-2 overflow-x-auto"><table data-testid="inbox-company-status" className="w-full text-left text-xs"><thead><tr>{['company','latest','status'].map(key=><th key={key} className="px-3 py-2">{t(`availability.${key}`)}</th>)}</tr></thead><tbody>{watches.filter(w=>perIssuer.has(w.issuerId)).map(w=>{
    const result=perIssuer.get(w.issuerId)!;
    const newest=result.state==='ok'?mergeInboxRows(new Map([[w.issuerId,result]]))[0]:null;
    const ticker=w.primaryTicker.US??w.primaryTicker.CN??w.tickers[0]?.ticker;
    return <tr key={w.issuerId} data-testid={result.state==='unavailable'?'inbox-unavailable-row':undefined} className={`border-t border-border ${result.state==='unavailable'?'text-text-dim':''}`}><td className="px-3 py-2">{w.names[locale]??w.names.en??w.names.zh??ticker} <span className="font-mono tabular-nums">{ticker}</span></td><td className="px-3 py-2">{newest?<>{t(`filters.${newest.kind}`)} <span className="font-mono tabular-nums">{newest.occurredOn}</span></>:'—'}</td><td className="px-3 py-2">{result.state==='unavailable'?t('availability.title'):newest?t(result.rows.some(r=>!r.read)?'inbox.unread':'inbox.read'):t('availability.empty')}</td></tr>;
  })}</tbody></table></div>;
}
