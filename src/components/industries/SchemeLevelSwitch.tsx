// src/components/industries/SchemeLevelSwitch.tsx
// Selectors as links (canvas "Entry" scheme & level switch): every choice is a search-param URL, so
// pages stay server-rendered and shareable. LinkMenu is a <details> dropdown, LinkSegment a segmented
// control; SchemeLevelSwitch combines the scheme menu with the SW level segment (hidden for SIC,
// which is single-level).
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {hrefWith} from './hrefs';
import type {Search} from './hrefs';

export interface LinkOption{value:string;label:string;href:string;disabled?:boolean}

export function LinkMenu({label,current,options}:{label:string;current:string;options:LinkOption[]}){
  const active=options.find(o=>o.value===current);
  return (
    <details className="relative">
      <summary className="flex min-h-[36px] cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-bg-card px-3 text-sm hover:border-accent">
        <span className="text-xs text-text-dim">{label}</span>
        <span>{active?.label??current}</span>
        <span aria-hidden="true" className="text-text-dim">▾</span>
      </summary>
      <div className="absolute z-20 mt-1 flex min-w-[220px] flex-col rounded-lg border border-border bg-bg-elevated p-1.5 shadow-[var(--shadow)]">
        {options.map(o=>o.disabled
          ?<span key={o.value} className="rounded px-2.5 py-1.5 text-sm text-text-dim">{o.label}</span>
          :<Link key={o.value} href={o.href} aria-current={o.value===current?'true':undefined}
            className={`rounded px-2.5 py-1.5 text-sm hover:bg-[var(--accent-wash)] hover:no-underline ${o.value===current?'bg-[var(--accent-wash)] text-accent':'text-text'}`}>{o.label}</Link>)}
      </div>
    </details>
  );
}

export function LinkSegment({label,current,options}:{label:string;current:string;options:LinkOption[]}){
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-border p-0.5 text-sm">
      {options.map(o=>o.disabled
        ?<span key={o.value} className="min-h-[32px] px-3 py-1 text-text-dim">{o.label}</span>
        :<Link key={o.value} href={o.href} aria-current={o.value===current?'true':undefined}
          className={`flex min-h-[32px] items-center rounded px-3 hover:no-underline ${o.value===current?'bg-[var(--accent-wash)] font-semibold text-accent':'text-text-dim hover:text-text'}`}>{o.label}</Link>)}
    </div>
  );
}

export function SchemeLevelSwitch({path,search,scheme,level}:{path:string;search:Search;scheme:'sw2021'|'sic';level:number}){
  const t=useTranslations('industries');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LinkMenu label={t('controls.scheme')} current={scheme} options={[
        {value:'sw2021',label:t('schemes.sw2021Market'),href:hrefWith(path,search,{scheme:'sw2021',level:undefined})},
        {value:'sic',label:t('schemes.sicMarket'),href:hrefWith(path,search,{scheme:'sic',level:undefined,metric:undefined,duration:undefined,view:undefined})},
      ]} />
      {scheme==='sw2021'&&(
        <LinkSegment label={t('controls.level')} current={String(level)} options={['1','2','3'].map(l=>({value:l,label:t(`levels.${l}`),href:hrefWith(path,search,{level:l==='1'?undefined:l})}))} />
      )}
    </div>
  );
}
