import type {ReactNode} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui/StateBadge';
import type {HubState} from './hub-model';

interface HubCardProps {
 id:string; no:string; title:string; titleEn:string; state:HubState;
 href:string; enterLabel:string; children:ReactNode; testId?:string; linkTestId?:string;
}

export function HubCard({id,no,title,titleEn,state,href,enterLabel,children,testId,linkTestId}:HubCardProps){
 const t=useTranslations('intel.hub');
 return <section data-entry={id} data-hub-state={state} data-testid={testId}
  aria-disabled={state==='notServed'||undefined} aria-busy={state==='loading'}
  className="card-base flex min-w-0 flex-col gap-3 break-words">
  <header className="flex flex-wrap items-baseline gap-2">
   <span className="font-mono tabular-nums text-xs text-text-dim">{no}</span>
   <h2 className="min-w-0 flex-1 text-sm font-semibold">{title} <span className="text-xs font-normal text-text-dim">{titleEn}</span></h2>
   {state==='notServed'&&<StateBadge state="notServed"/>}
   {state==='loading'&&<span className="text-xs text-text-dim">{t('loading')}</span>}
  </header>
  {state==='open'&&<>
   <div className="min-w-0 space-y-1 text-xs text-text-dim">{children}</div>
   <Link href={href} data-testid={linkTestId} className="mt-auto self-start text-xs text-accent">{enterLabel}</Link>
  </>}
 </section>;
}
