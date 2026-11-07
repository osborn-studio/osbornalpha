'use client';
// Public citation provenance drawer; no original text or private spans (spec §9.3).
import {useEffect,useRef} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import type {PublicCitationDto,PublicSnippetDto} from '@/lib/broker-research/public-dto';
import {fmtInstant,provenanceKey,shortId} from './format';
import {CHIP,TAG,TINY} from './ui';
export interface DrawerSubject{label:string;targetKey:string|null;value:string;citation:PublicCitationDto|null;snippets:PublicSnippetDto[];judgment:boolean}
export function SourceDrawer({subject,availableAt,codeVersion,rulesVersion,publicationId,onClose}:{subject:DrawerSubject|null;availableAt:string|null;codeVersion:string|null;rulesVersion:string|null;publicationId:string|null;onClose:()=>void}){
 const t=useTranslations('foreign-research.public.drawer'),tp=useTranslations('foreign-research.public.provenance'),locale=useLocale(),closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!subject)return;closeRef.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[subject,onClose]);
 if(!subject)return null;const c=subject.citation;
 const rows:[[string,string],[string,string],[string,string],[string,string],[string,string],[string,string]]=[
  [t('page'),c?.page?t('pageValue',{page:c.page}):'—'],[t('method'),c?tp(provenanceKey(c)):'—'],[t('availableAt'),fmtInstant(availableAt,locale)],
  [t('codeVersion'),codeVersion??'—'],[t('rulesVersion'),rulesVersion??'—'],[t('publication'),shortId(publicationId)]];
 return <div className="fixed inset-0 z-50"><button type="button" aria-label={t('close')} className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]" onClick={onClose}/>
  <aside role="dialog" aria-modal="true" aria-label={t('title',{field:subject.label})} className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-lg border border-border bg-bg-elevated p-4 pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:rounded-none">
   <div className="flex justify-between"><h2 className="font-semibold">{subject.label}</h2><button ref={closeRef} type="button" onClick={onClose}>{t('close')}</button></div>
   <p className="font-mono text-xl">{subject.value}</p>{subject.judgment?<span className={TAG}>{t('judgment')}</span>:null}
   <p className={CHIP}>{t('privateLibrary')}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-xs">{rows.map(([k,v])=><div key={k} className="contents"><dt className="text-text-dim">{k}</dt><dd>{v}</dd></div>)}</dl>
   {subject.snippets.length?<div className="mt-4"><h3 className={TINY}>{t('snippet')}</h3>{subject.snippets.map(s=><blockquote key={s.snippetId} className="my-2 border border-border p-2 text-sm">“{s.text}” · p.{s.page??'—'}</blockquote>)}</div>:null}
  </aside></div>;
}
