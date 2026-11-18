// Topic plan T5.4: common admin frame; the editor opts into the wider canvas.
import type {ReactNode} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
export function TopicAdminFrame({crumb,title,headerChips,wide=false,children}:{crumb:string;title:string;headerChips?:ReactNode;wide?:boolean;children:ReactNode}){
 const t=useTranslations('topicsAdmin');
 return <div data-density="data" className={`mx-auto w-full space-y-4 p-4 md:p-6 ${wide?'max-w-[1880px]':'max-w-[1400px]'}`}>
  <header className="flex flex-wrap items-center gap-3">
   <div className="space-y-1"><nav aria-label={t('frame.breadcrumb')} className="text-xs text-text-dim"><Link href="/intel/topics">{t('frame.topics')}</Link> / <Link href="/admin/topics">{t('frame.admin')}</Link> / {crumb}</nav>
    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">{title}<span className="rounded border border-border px-2 py-0.5 text-xs font-normal text-text-dim">{t('frame.adminOnly')}</span></h1>
   </div>
   <div className="ml-auto flex flex-wrap justify-end gap-2 text-xs text-text-dim">{headerChips}</div>
  </header>
  {children}
 </div>;
}
