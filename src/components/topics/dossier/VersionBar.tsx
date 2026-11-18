// Dossier version and replay navigation (spec §7.2, A15).
'use client';
import Link from 'next/link';
import type {Route} from 'next';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import type {DossierDto,VersionMeta} from '@/lib/topics/public-dto';
import {versionBarModel} from './version-bar-model';
export function VersionBar({dto,versions,isAdmin,today}:{dto:DossierDto;versions:VersionMeta[];isAdmin:boolean;today:string}){
 const t=useTranslations('topics.version'),router=useRouter(),m=versionBarModel(dto,{isAdmin,today,versions,locale:useLocale()});
 return <div className="flex flex-wrap items-center gap-2 border-y border-border py-3 text-xs text-text-dim" data-version-bar>
  <span className="uppercase tracking-wider">{t('caption')}</span>
  {m.chips.map((chip,i)=><span key={i} className={`${i===2?'hidden sm:inline-flex ':''}rounded border border-border px-2 py-1 font-mono tabular-nums`}>{chip}</span>)}
  <label className="flex items-center gap-2"><span>{m.totalText}</span><select aria-label={m.totalText} value={dto.version.version_no} className="max-w-full rounded border border-border bg-bg-elevated p-1 font-mono tabular-nums" onChange={event=>{
   const option=m.options.find(o=>o.value===Number(event.target.value));if(option&&!option.disabled)router.push(option.href as Route);
  }}>{m.options.map(option=><option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>
  <label className="flex items-center gap-2 sm:ml-auto">{t('replay')}<input aria-label={t('replay')} type="date" max={m.maxDate} value={dto.replay_as_of??''} className="min-w-0 rounded border border-border bg-bg-elevated p-1 font-mono tabular-nums" onChange={event=>{
   const date=event.target.value;if(!date)router.push(m.baseHref as Route);else if(event.target.validity.valid&&date<=today)router.push(`${m.baseHref}?asOf=${encodeURIComponent(date)}` as Route);
  }}/></label>
  {m.adminHref&&<Link href={m.adminHref as Route} className="text-accent">{t('manage')}</Link>}
  {m.driftChip&&<div className="flex w-full flex-wrap items-center gap-2"><span data-freshness="stale" className="inline-flex items-center gap-1.5 min-h-[22px] px-2 rounded-[4px] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-warn"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warn"/>{m.driftChip.text}</span><span className="font-mono tabular-nums">{m.driftChip.checkedText}</span></div>}
 </div>;
}
