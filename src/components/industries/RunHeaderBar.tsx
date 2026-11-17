// src/components/industries/RunHeaderBar.tsx
// Run header of the list and detail pages (spec §8.2 first line; canvas "Main"): facts as of, the
// run's activation time and generation, freshness, method version.
import {useTranslations} from 'next-intl';
import type {FreshnessStatus} from '@/lib/dq/freshness';
import type {RunHeader} from '@/lib/industry/read';
import Link from 'next/link';

export function RunHeaderBar({header,extra,methodsHref}:{header:RunHeader|null;freshness:FreshnessStatus;extra?:string;methodsHref?:string}){
  const t=useTranslations('industries.header');
  return (
    <div className="card-base flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-dim" style={{marginBottom:0}}>
      {header&&<span className="inline-flex min-w-0 flex-wrap items-center gap-1.5"><span className="uppercase tracking-wide">{t('factsAsOf')}</span><span className="font-mono tabular-nums text-text">{header.factsAsOf}</span></span>}
      {header&&<span className="inline-flex min-w-0 flex-wrap items-center gap-1.5"><span className="uppercase tracking-wide">{t('run')}</span><span className="font-mono tabular-nums text-text"><span className="break-all">{header.runId}</span> · {(header.activatedAt??'').replace('T',' ').slice(0,16)}</span><span className="font-mono">{t('generation',{n:header.generation})}</span></span>}
      {header&&<span className="inline-flex min-w-0 flex-wrap items-center gap-1.5"><span className="uppercase tracking-wide">{t('method')}</span><span className="font-mono text-accent">{header.methodVersion}</span></span>}
      {methodsHref&&<Link href={methodsHref}>{t('methods')}</Link>}
      {extra&&<span className="ml-auto">{extra}</span>}
    </div>
  );
}
