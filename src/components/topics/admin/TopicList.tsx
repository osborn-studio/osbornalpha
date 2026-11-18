// Topic plan T5.4: admin list artboard with workflow tabs and revision data states.
'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import type {TopicSettingsRow} from '@/lib/topics/database-types';
import {TopicAdminFrame} from '@/app/(app)/admin/topics/_shared/TopicAdminFrame';
import {listModel,type AdminTopicRow,type ListStatus} from './list-model';
const statuses:ListStatus[]=['draft','published','unpublished','retired'];
export function TopicList({rows,settings}:{rows:AdminTopicRow[];settings:TopicSettingsRow}){
 const t=useTranslations('topicsAdmin'),locale=useLocale()==='zh'?'zh':'en',other=locale==='zh'?'en':'zh';
 const [status,setStatus]=useState<ListStatus>('draft'),[revisedOnly,setRevisedOnly]=useState(false);
 const model=listModel(rows,{status,revisedOnly});
 return <TopicAdminFrame crumb={t('list.title')} title={t('list.title')} headerChips={<span className="rounded border border-border px-2 py-1">{t(settings.public_enabled?'frame.publicOpen':'frame.publicClosed')}</span>}>
  <section aria-label={t('list.title')} className="rounded-lg border border-border bg-bg-card p-3">
   <div className="mb-3 flex flex-wrap items-center gap-3">
    <div role="group" aria-label={t('list.status')} className="flex flex-wrap gap-1">{statuses.map(s=><button key={s} type="button" aria-pressed={status===s} onClick={()=>setStatus(s)} className={`min-h-9 rounded border px-3 text-sm ${status===s?'border-accent bg-[var(--accent-wash)] text-accent':'border-border text-text-dim'}`}>{t(`status.${s}`)} <span className="font-mono tabular-nums">[{model.tabs[s]}]</span></button>)}</div>
    <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={revisedOnly} onChange={e=>setRevisedOnly(e.target.checked)}/>{t('list.revisedOnly')}</label>
    <Link href="/admin/topics/new" className="ml-auto inline-flex min-h-9 items-center rounded-md border border-accent bg-[var(--accent-wash)] px-3 text-sm text-accent">{t('newTopic.title')}</Link>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="text-xs text-text-dim"><tr>{['title','category','status','version','drift','origin','edit'].map(k=><th key={k} scope="col" className="px-3 py-2">{t(`list.${k==='title'?'titleColumn':k}`)}</th>)}</tr></thead>
    <tbody>{model.rows.map(r=><tr key={r.topic_id} className="border-t border-border">
     <td className="px-3 py-3">{r.title[locale]||r.title[other]||r.slug}<div className="font-mono text-xs tabular-nums text-text-muted">{r.slug}</div></td>
     <td className="px-3 py-3">{t(`category.${r.category}`)}</td>
     <td className="px-3 py-3"><span className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-xs">{t(`status.${r.status}`)}</span></td>
     <td className="px-3 py-3">{r.current_version_no===null?<span className="text-text-muted">{t('list.neverPublished')}</span>:<span className="font-mono tabular-nums">v{r.current_version_no}</span>}</td>
     <td className="px-3 py-3">{r.revised_count>0?<span className="inline-flex flex-wrap items-center gap-1"><StateBadge state="revised"/><span className="font-mono tabular-nums">{t('list.revisedCount',{n:r.revised_count})}</span></span>:'—'}</td>
     <td className="px-3 py-3">{r.origin?t('list.promoted'):'—'}</td>
     <td className="px-3 py-3"><Link className="text-accent" href={`/admin/topics/${r.topic_id}`}>{t('list.edit')}</Link></td>
    </tr>)}
    {model.rows.length===0&&<tr><td colSpan={7} className="px-3 py-5 text-text-muted">{t('list.empty')}</td></tr>}</tbody>
   </table></div>
  </section>
 </TopicAdminFrame>;
}
