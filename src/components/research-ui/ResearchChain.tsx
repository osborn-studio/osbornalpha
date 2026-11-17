'use client';
// Shared chain below the app top bar; section pages supply availability when needed.
import {Fragment} from 'react';
import Link from 'next/link';
import type {Route} from 'next';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {chainVisible,chainItems,DEFAULT_CHAIN_AVAILABILITY,type ChainAvailability} from './chain';

export function ResearchChain({availability=DEFAULT_CHAIN_AVAILABILITY}:{availability?:ChainAvailability}) {
  const pathname=usePathname();
  const t=useTranslations('research');
  if (!chainVisible(pathname)) return null;
  const stepClass='inline-flex flex-none items-center gap-1.5 min-h-[32px] px-2.5 rounded-[4px] border text-xs';
  return <nav aria-label={t('chain.label')} data-research-chain className="flex flex-nowrap overflow-x-auto sm:flex-wrap items-center gap-1 px-5 py-2 bg-bg border-b border-border">
    <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim mr-1.5">{t('chain.label')}</span>
    {chainItems(pathname,availability).map((item,index)=><Fragment key={item.id}>
      {index>0 && <span aria-hidden="true" className="text-text-muted text-[11px]">→</span>}
      {item.href===null
        ? <span aria-disabled="true" data-chain-state="notServed" title={t('chain.notServedHint')} className={stepClass+' border-border text-text-dim'}>
          <span className="font-mono tabular-nums text-[10px] text-text-muted">{item.no}</span>{t(`chain.steps.${item.id}`)}
          <span className="rounded border border-dashed border-border px-1 text-[10px]">{t('chain.notServed')}</span>
        </span>
        : <Link href={item.href as Route} aria-current={item.state==='current'?'page':undefined} className={stepClass+(item.state==='current'?' border-[var(--border-active)] bg-[var(--accent-wash)] text-text font-semibold':' border-border text-text-dim')}>
          <span className="font-mono tabular-nums text-[10px] text-text-muted">{item.no}</span>{t(`chain.steps.${item.id}`)}
        </Link>}
    </Fragment>)}
  </nav>;
}
