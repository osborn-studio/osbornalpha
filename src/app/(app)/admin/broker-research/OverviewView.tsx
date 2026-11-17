// src/app/(app)/admin/broker-research/OverviewView.tsx
'use client';
// Overview body: public switch + three gates (display only; enabling is the owner's FR-6 step via the
// runbook, so "Enable" stays disabled; "Disable" is offered while on), six count cards, gold receipt,
// recent batches, open quarantine, needs-attention list, review queue and recent documents as entries.
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import type {OverviewData} from './_shared/admin-fetch';
import {fmtInstant,shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,CARD,CHIP,EN,H1,TD,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {BTN_PRIMARY,CHIP_ACCENT,CHIP_WARN,ERROR_BAR,H3} from './_shared/admin-fetch';
import {adminJson,baseCode} from './_shared/admin-fetch';

export function OverviewView({data}:{data:OverviewData}){
 const t=useTranslations('foreign-research.admin.overview');
 const te=useTranslations('foreign-research.admin.errors');
 const locale=useLocale();const router=useRouter();
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const on=data.settings.public_enabled;
 async function disablePublic(){
  setBusy(true);setError(null);
  const r=await adminJson('POST','/settings/public',{enabled:false});
  setBusy(false);
  if(r.ok)router.refresh();else setError(te.has(baseCode(r.code))?te(baseCode(r.code)):te('generic',{code:r.code}));
 }
 const gates=[
  {key:'d1',ok:data.gates.d1.ok,detail:t('gates.d1Detail',{confirmed:data.gates.d1.confirmed,total:data.gates.d1.total})},
  {key:'storage',ok:false,detail:t('gates.storageDetail')},
  {key:'gold',ok:data.gates.gold.ok,detail:data.gold?t('gates.goldDetail',{date:(data.gold.ranAt??'').slice(0,10),n:data.gold.nDocs,passed:String(data.gold.passed)}):t('gates.goldMissing')},
 ];
 const counts=(['toParse','toExtract','toReview','toPublish','published','withdrawn'] as const);
 return (
  <div className="flex flex-col gap-5">
   <h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
   {error?<div role="alert" className={ERROR_BAR}>{error}</div>:null}
   <section className={`${CARD} flex flex-wrap items-start gap-6`} aria-label={t('switch.title')}>
    <div className="flex min-w-[260px] flex-1 flex-col gap-2">
     <div className="flex items-center gap-2"><span className={H3}>{t('switch.title')}</span><span className={on?CHIP_ACCENT:CHIP}>{on?t('switch.on'):t('switch.off')}</span></div>
     <p className="text-xs text-text-dim">{t('switch.body')}</p>
     {on?<button type="button" className={`${BTN} self-start`} disabled={busy} onClick={disablePublic}>{t('switch.disable')}</button>:<button type="button" className={`${BTN_PRIMARY} self-start`} disabled>{t('switch.enable')}</button>}
     <span className={TINY}>{t('switch.ownerOnly')}</span>
    </div>
    <ol className="flex min-w-[300px] flex-1 flex-col gap-2.5">
     {gates.map((g,i)=><li key={g.key} className="flex items-start gap-2.5"><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${g.ok?'border-[var(--border-active)] text-accent':'border-border text-text-dim'}`}>{g.ok?'✓':i+1}</span>
      <div><div className={H3}>{t(`gates.${g.key}`)}<span className="sr-only">{g.ok?t('gates.ok'):t('gates.notOk')}</span></div><div className="text-xs text-text-dim">{g.detail}</div></div></li>)}
    </ol>
   </section>
   <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label={t('counts.title')}>
    {counts.map(k=><div key={k} className={`${CARD} ${k==='toReview'&&data.counts[k]>0?'border-[var(--border-active)]':''}`}><div className="text-[11px] text-text-dim">{t(`counts.${k}`)}</div><div className={`font-mono text-2xl tabular-nums ${k==='toReview'&&data.counts[k]>0?'text-accent':''}`}>{data.counts[k]}</div></div>)}
   </section>
   <div className="grid gap-5 lg:grid-cols-2">
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('gold.title')}</div>
     {data.gold?<dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-text-dim">{t('gold.tuple')}</dt><dd className="break-all font-mono">{[data.gold.tuple.extractorVersion,data.gold.tuple.modelId,data.gold.tuple.registryHash,data.gold.tuple.promptVersion,data.gold.tuple.schemaVersion].map(v=>v??'—').join(' · ')}</dd>
      <dt className="text-text-dim">{t('gold.minima')}</dt><dd className="font-mono">n={data.gold.nDocs} · precision {data.gold.precisionMin??'—'} · recall {data.gold.recallMin??'—'}</dd>
      <dt className="text-text-dim">{t('gold.worst')}</dt><dd className="font-mono">{data.gold.worst?`${data.gold.worst.field} · ${data.gold.worst.metric} ${data.gold.worst.value}`:'—'}</dd>
      <dt className="text-text-dim">passed</dt><dd><span className={data.gold.passed?CHIP_ACCENT:CHIP_WARN}>{String(data.gold.passed)}</span>{data.gold.corpusMatches?null:<span className={`${CHIP_WARN} ml-1.5`}>{t('gold.corpusMismatch')}</span>}</dd>
      <dt className="text-text-dim">{t('gold.code')}</dt><dd className="font-mono">{data.gold.codeVersion??'—'}</dd>
     </dl>:<p className="text-xs text-text-muted">{t('gold.none')}</p>}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('batches.title')}</div>
     {data.batches.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.batches.map(b=><tr key={String(b.batch_id)}><td className={`${TD} font-mono text-text-dim`}>{fmtInstant(String(b.started_at??''),locale)}</td><td className={`${TD} ${TINY}`}>{String(b.producer??'—')}</td><td className={TD}><span className={b.status==='success'?CHIP:CHIP_WARN}>{String(b.status??'—')}</span></td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
    <section className={CARD}>
     <div className="mb-2.5 flex items-center gap-2"><span className={H3}>{t('quarantine.title')}</span><span className={`${data.quarantine.total?CHIP_WARN:CHIP} font-mono`}>{data.quarantine.total}</span><Link href="/admin/dq" className="ml-auto text-xs">{t('quarantine.link')}</Link></div>
     {data.quarantine.rows.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.quarantine.rows.map(q=><tr key={String(q.id)}><td className={`${TD} ${TINY}`}>{String(q.reason_code??'—')}</td><td className={`${TD} break-all font-mono text-text-dim`}>{String(q.natural_key??'—')}</td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('attention.title')}</div>
     {([['mappingUpdates',null],['outboxFailed',null],['licencesPending','/admin/broker-research/licences']] as const).map(([k,href])=>(
      <div key={k} className="flex items-center justify-between py-1.5 text-xs text-text-dim"><span>{t(`attention.${k}`)}</span>
       {href?<Link href={href} className={`${data.attention[k]?CHIP_WARN:CHIP} font-mono hover:no-underline`}>{data.attention[k]}</Link>:<span className={`${data.attention[k]?CHIP_WARN:CHIP} font-mono`}>{data.attention[k]}</span>}</div>))}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('queue.title')}</div>
     {data.reviewQueue.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.reviewQueue.map(r=><tr key={r.report_id}><td className={TD}><Link href={`/admin/broker-research/review/${r.report_id}`} className="font-mono">{shortId(r.report_id)}</Link></td><td className={TD}>{r.title_original??t('queue.untitled')}</td><td className={TD}><span className={CHIP}>{r.review_status}</span></td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
    <section className={CARD}>
     <div className={`${H3} mb-2.5`}>{t('documents.title')}</div>
     {data.recentDocuments.length?<table className="w-full text-xs"><tbody className="divide-y divide-border">{data.recentDocuments.map(d=><tr key={String(d.document_id)}><td className={TD}><Link href={`/admin/broker-research/documents/${String(d.document_id)}`}>{String(d.original_filename??shortId(String(d.document_id)))}</Link></td><td className={`${TD} font-mono text-text-dim`}>{fmtInstant(String(d.uploaded_at??''),locale)}</td><td className={TD}><span className={CHIP}>{String(d.status??'—')}</span></td></tr>)}</tbody></table>:<p className="text-xs text-text-muted">{t('empty')}</p>}
    </section>
   </div>
  </div>
 );
}
