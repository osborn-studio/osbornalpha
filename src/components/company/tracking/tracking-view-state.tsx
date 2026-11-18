'use client';
import Link from 'next/link';
import type {ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {Button,Card} from '@/components/ui';
import {StateBadge} from '@/components/research-ui';
import {companyHref} from '@/lib/company/client';
import type {WithheldCounts} from '@/lib/company/types';
export function trackingViewState({error,loading,rowCount}:{error:string|null;loading:boolean;rowCount:number}):'loading'|'unavailable'|'empty'|'ok' {
  return error?'unavailable':loading&&rowCount===0?'loading':rowCount===0?'empty':'ok';
}
export function TrackingContent({error,loading,rowCount,ticker,asOf,retry,withheld,children}:{error:string|null;loading:boolean;rowCount:number;ticker:string;asOf:string|null;retry:()=>void;withheld?:WithheldCounts|null;children:ReactNode}) {
  const t=useTranslations('tracking');
  const state=trackingViewState({error,loading,rowCount});
  if(state==='unavailable')return <Card role="alert" data-tracking-state={state} className="space-y-2 border-[var(--danger)] text-sm">
    <strong className="text-[var(--danger)]">{t('availability.title')}</strong><p>{t('availability.companyBody',{code:error!})}</p>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" className="min-h-11 sm:min-h-0" onClick={retry}>{t('inbox.retry')}</Button><Link className="inline-flex min-h-11 items-center text-accent sm:min-h-0" href={companyHref(ticker,{view:'filings',asOf}) as never}>{t('availability.filings')}</Link></div>
  </Card>;
  return <div data-tracking-state={state} className="space-y-2">
    {withheld&&(withheld.citationPending>0||withheld.evidenceIncomplete>0)&&<p data-testid="tracking-withheld" className="flex flex-wrap items-center gap-1.5 text-xs text-text-dim"><StateBadge state="withheld"/>{t('availability.withheld',{n:withheld.citationPending+withheld.evidenceIncomplete,pending:withheld.citationPending,incomplete:withheld.evidenceIncomplete})}</p>}
    {state==='empty'?<Card className="text-sm text-text-dim">{t('availability.empty')}</Card>:state==='ok'?children:null}
  </div>;
}
