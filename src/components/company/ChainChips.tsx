'use client';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import type {IssuerIndustriesView} from '@/lib/industry/read';
import {useCompanyFetch} from './useCompanyFetch';
import {industryChip,industryUrl} from './chain-chips-model';

export function ChainChips({issuerId,market,ticker,asOf,locale,foreignPublic}:{issuerId:string|null;market:string|null;ticker:string;asOf:string|null;locale:'zh'|'en';foreignPublic:boolean}) {
  const t=useTranslations('company.chain');
  const {state,retry}=useCompanyFetch<IssuerIndustriesView>(industryUrl(issuerId,market,asOf));
  const chip=industryChip(issuerId,market,state,locale);
  const style='inline-flex min-h-11 sm:min-h-[28px] items-center gap-1.5 rounded border border-border px-2 text-xs text-text-dim';
  return <div className="flex min-w-0 flex-wrap gap-2">
    {chip.kind==='link'?<Link data-testid="chain-chip-industry" className={style} href={chip.href as never}>{t('industryLink')}<span className="font-mono tabular-nums">{chip.code}</span> {chip.name}</Link>
      :chip.kind!=='none'&&<span data-testid="chain-chip-industry" className={style}>{t('industry')}{chip.kind==='error'?' · ':null}
        {chip.kind==='loading'?<span aria-label={t('loading')}>…</span>:chip.kind==='error'?<>{t('error')}<button type="button" className="min-h-11 px-2 text-accent sm:min-h-[28px]" onClick={retry}>{t('retry')}</button></>:<StateBadge state={chip.kind}/>}
      </span>}
    {foreignPublic?<Link data-testid="chain-chip-foreign" className={style} href={`/intel/foreign-research?ticker=${encodeURIComponent(ticker)}` as never}>{t('reports')} →</Link>
      :<span data-testid="chain-chip-foreign" className={style}>{t('foreign')} <StateBadge state="notServed"/></span>}
  </div>;
}
