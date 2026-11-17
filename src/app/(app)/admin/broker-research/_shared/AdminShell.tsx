// src/app/(app)/admin/broker-research/_shared/AdminShell.tsx
'use client';
// Admin frame (AdminOverview artboard): "admin" tag, title, side nav at ≥ lg, wrapping row below.
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';
import type {ReactNode} from 'react';
import {CHIP_ACCENT} from './admin-fetch';

const NAV=[['overview','/admin/broker-research'],['upload','/admin/broker-research/upload'],['licences','/admin/broker-research/licences'],['accessLog','/admin/broker-research/access-log'],['institutions','/admin/broker-research/institutions']] as const;
export function AdminShell({children,crumb}:{children:ReactNode;crumb?:string}){
 const t=useTranslations('foreign-research.admin.shell');
 const path=usePathname();
 return (
  <div data-density="data" className="mx-auto flex max-w-[1400px] flex-col gap-4">
   <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3"><span className={CHIP_ACCENT}>admin</span><Link href="/admin/broker-research" className="text-xs text-text-dim">{t('title')}</Link>{crumb?<span className="text-[11px] text-text-muted">/ {crumb}</span>:null}</div>
   <div className="flex flex-col gap-5 lg:flex-row">
    <nav aria-label={t('nav')} className="flex flex-wrap gap-1 lg:w-52 lg:shrink-0 lg:flex-col">
     {NAV.map(([k,href])=>{const on=k==='overview'?path===href:path.startsWith(href);return (
      <Link key={k} href={href} aria-current={on?'page':undefined} className={`rounded-md px-3 py-2 text-xs hover:no-underline ${on?'bg-[var(--accent-wash)] text-accent':'text-text-dim hover:text-text'}`}>{t(`nav_${k}`)}</Link>);})}
    </nav>
    <main className="min-w-0 flex-1">{children}</main>
   </div>
  </div>
 );
}
