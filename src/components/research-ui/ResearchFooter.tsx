// Shared provenance footer; section pages provide publishers, relays and a methods route.
import Link from 'next/link';
import type {Route} from 'next';
import {useTranslations} from 'next-intl';
export interface ResearchSource {publisher:string;relay?:string|null}
export interface ResearchFooterProps {sources:readonly ResearchSource[];methodsHref?:string}
export function ResearchFooter({sources,methodsHref}:ResearchFooterProps) {
  const t=useTranslations('research');
  const chips=[...new Set(sources.map(({publisher,relay})=>relay?t('footer.via',{publisher,relay}):publisher))];
  return <footer data-research-footer className="flex flex-col gap-2">
    {chips.length>0 && <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-md border border-border bg-bg-elevated text-[11px] text-text-dim">
      <span className="text-[10px] font-medium uppercase tracking-[0.05em]">{t('footer.sources')}</span>
      {chips.map(chip=><span key={chip} className="rounded border border-border px-1.5 py-0.5">{chip}</span>)}
      {methodsHref && <Link className="ml-auto text-accent" href={methodsHref as Route}>{t('footer.methods')}</Link>}
    </div>}
    <p className="text-[11px] text-text-muted">{t('footer.disclaimer')}</p>
  </footer>;
}
