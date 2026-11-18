// Topic directory card (spec §7.1, D9–D10).
import Link from 'next/link';
import type {Route} from 'next';
import {useLocale,useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import type {DirectoryItem} from '@/lib/topics/public-dto';
import {cardModel} from './directory-model';
export function TopicCard({item}:{item:DirectoryItem}){
 const t=useTranslations('topics.directory'),m=cardModel(item,useLocale());
 return <Link href={m.href as Route} data-topic-card className="min-w-0 rounded-md border border-border bg-bg-elevated p-4 space-y-3 hover:border-accent focus-visible:outline-accent break-words">
  <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim"><span className="border border-border rounded px-1.5">{t(`categories.${item.category}`)}</span><span className="font-mono tabular-nums">{m.versionLine}</span></div>
  <h2 className="text-base font-semibold text-text">{m.title}</h2><p className="text-sm text-text-dim">{m.dek}</p>
  <div className="flex flex-wrap gap-2 items-center text-xs text-text-dim"><span>{t('evidence')}</span>{m.counts.map(({state,n})=>state==='ok'||state==='unsupported'?
   <span key={state} className="border border-border rounded px-1.5">{t(state)} <span className="font-mono tabular-nums">{n}</span></span>:
   <StateBadge key={state} state={state==='not_served'?'notServed':state} detail={String(n)}/>)}</div>
  <div className="flex flex-wrap gap-2 text-xs text-text-dim">{m.badges.map(b=><span key={b.kind} className="rounded border border-border px-1.5 py-0.5 font-mono tabular-nums">{b.kind==='revised'?t('revisedBadge',{n:b.n}):t(b.kind==='stale'?'staleBadge':'mostlyWithheld')}</span>)}</div>
 </Link>;
}
