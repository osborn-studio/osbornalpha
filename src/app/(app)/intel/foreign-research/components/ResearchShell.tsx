'use client';
import type {ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {PageHeader,ResearchFooter,MarkTag} from '@/components/research-ui';
/** Module copy alongside the foundation's standard provenance and disclaimer. */
export function ForeignHeader({title,controls}:{title:string;controls?:ReactNode}){
 const t=useTranslations('foreign-research.public.foundation');
 return <><PageHeader title={title} scope={t('scope')} scopeSwitch={controls} freshness={null} legend={false}/>
 <div className="flex flex-wrap gap-2"><MarkTag kind="fact"/><InstitutionMark/></div></>;
}
export function InstitutionMark({institution}:{institution?:string}){
 const t=useTranslations('foreign-research.public.foundation');
 return institution?<MarkTag kind="judgment" institution={institution}/>:<span data-mark="judgment" className="inline-flex rounded border border-[var(--border-active)] bg-[var(--accent-wash)] px-[7px] text-[10px] text-accent">{t('judgment')}</span>;
}
export function ForeignFooter(){
 const t=useTranslations('foreign-research.public.foundation');
 return <div className="space-y-2"><ResearchFooter sources={[{publisher:t('source')}]}/><p className="text-[11px] text-text-muted">{t('ownership')}</p></div>;
}
