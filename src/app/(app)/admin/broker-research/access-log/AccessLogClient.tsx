// src/app/(app)/admin/broker-research/access-log/AccessLogClient.tsx
'use client';
// Access log (spec §4.10; AccessLog artboard): append-only, newest first, filters by admin and action
// (client side over the loaded 500 rows), document filter via ?document=, CSV export. No IP is stored.
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {AccessLogView} from '../_shared/admin-fetch';
import {fmtInstant,shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,CARD_FLUSH,CHIP,EN,H1,INPUT,TD,TH} from '@/app/(app)/intel/foreign-research/components/ui';

import {toCsv} from './access-log-csv';

export function AccessLogClient({rows,documentId}:{rows:AccessLogView[];documentId:string|null}){
 const t=useTranslations('foreign-research.admin.accessLog');
 const locale=useLocale();
 const [user,setUser]=useState('');const [action,setAction]=useState('');
 const users=useMemo(()=>[...new Set(rows.map(r=>r.user_id))].sort(),[rows]);
 const actions=useMemo(()=>[...new Set(rows.map(r=>r.action))].sort(),[rows]);
 const shown=rows.filter(r=>(!user||r.user_id===user)&&(!action||r.action===action));
 function exportCsv(){
  const url=URL.createObjectURL(new Blob([toCsv(shown)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`broker-research-access-log-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
 }
 return (
  <div className="flex flex-col gap-4">
   <h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
   <p className="max-w-[72ch] text-xs text-text-dim">{t('intro')}</p>
   <div className="flex flex-wrap items-center gap-3">
    <select aria-label={t('filters.user')} className={`${INPUT} w-56`} value={user} onChange={e=>setUser(e.target.value)}><option value="">{t('filters.user')} · {t('filters.all')}</option>{users.map(u=><option key={u} value={u}>{shortId(u)}</option>)}</select>
    <select aria-label={t('filters.action')} className={`${INPUT} w-56`} value={action} onChange={e=>setAction(e.target.value)}><option value="">{t('filters.action')} · {t('filters.all')}</option>{actions.map(a=><option key={a} value={a}>{a}</option>)}</select>
    {documentId?<Link href="/admin/broker-research/access-log" className={CHIP}>{t('filters.document',{id:shortId(documentId)})} ×</Link>:null}
    <button type="button" className={`${BTN} ml-auto`} onClick={exportCsv} disabled={shown.length===0}>{t('export')}</button>
   </div>
   <section className={`${CARD_FLUSH} overflow-x-auto`}>
    <table className="w-full min-w-[760px] text-sm">
     <thead className="border-b border-border"><tr>{(['at','user','action','object','detail'] as const).map(c=><th key={c} scope="col" className={`${TH} ${c==='at'?'pl-4':''}`}>{t(`columns.${c}`)}</th>)}</tr></thead>
     <tbody className="divide-y divide-border">{shown.map(r=>(
      <tr key={r.id}>
       <td className={`${TD} whitespace-nowrap pl-4 font-mono text-text-dim`}>{fmtInstant(r.created_at,locale)}</td>
       <td className={`${TD} font-mono text-xs`} title={r.user_id}>{shortId(r.user_id)}</td>
       <td className={TD}><span className={CHIP}>{r.action}</span></td>
       <td className={`${TD} font-mono text-xs`}>{r.document_id?<Link href={`/admin/broker-research/documents/${r.document_id}`}>{shortId(r.document_id)}</Link>:'—'}</td>
       <td className={`${TD} max-w-[24rem] break-all pr-4 font-mono text-[11px] text-text-dim`}>{JSON.stringify(r.detail??{})}</td>
      </tr>))}</tbody>
    </table>
    {shown.length===0?<p className="px-4 py-3 text-xs text-text-muted">{t('empty')}</p>:null}
   </section>
  </div>
 );
}
