'use client';
// Filing source drawer: every displayed excerpt comes from an F3 page or verified citation route.
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {F3_DRAWER_FLAG} from '@/lib/company/client';
import type {BindingResult} from '@/lib/documents/by-filing';
import {DrawerShell} from './DrawerShell';
import {useCompanyFetch} from './useCompanyFetch';

export const F3_SOURCE_DRAWER_AVAILABLE=F3_DRAWER_FLAG;

type Detail={document:{title:string;sourceUrl:string|null;status:string;currentExtractionId:string|null;publishedAt:string;availableAt:string};extractions:{rows:{extractionId:string;pageCount:number}[]}};
type Page={text:string;textHash:string;pageNo:number};
type FactCitations={citations:{citationId:string;documentId:string;pageNo:number}[]};
type Citation={snippet:string;textHash:string;extractionId:string;pageNo:number;charStart:number;charEnd:number;integrity:'ok'|'corrupt';currentExtraction:boolean};

export function SourceDrawerAdapter({filingId,onClose,originalUrl,factId}:{filingId:string;onClose:()=>void;originalUrl?:string|null;factId?:string|null}){
 const t=useTranslations('company.sourceDrawer');
 const [downloadState,setDownloadState]=useState<'idle'|'login'|'failed'>('idle');
 const binding=useCompanyFetch<BindingResult>(`/api/documents/by-filing/${encodeURIComponent(filingId)}`);
 const doc=binding.state.status==='ok'?binding.state.data.document:null;
 const detail=useCompanyFetch<Detail>(doc?`/api/documents/doc/${doc.documentId}`:null);
 const linked=useCompanyFetch<FactCitations>(factId?`/api/citations?factId=${encodeURIComponent(factId)}`:null);
 const citationRef=linked.state.status==='ok'?linked.state.data.citations.find(c=>c.documentId===doc?.documentId):null;
 const citation=useCompanyFetch<Citation>(citationRef?`/api/citations/${citationRef.citationId}`:null);
 const pageNo=citationRef?.pageNo??1;
 const citedExtraction=citation.state.status==='ok'?citation.state.data.extractionId:null;
 const page=useCompanyFetch<Page>(doc?.currentExtraction?`/api/documents/doc/${doc.documentId}/pages/${pageNo}${citedExtraction?`?extraction=${encodeURIComponent(citedExtraction)}`:''}`:null);
 const reason=binding.state.status==='ok'?binding.state.data.reason:binding.state.status==='error'&&binding.state.httpStatus===404?'restricted':null;
 const restricted=reason==='restricted'||detail.state.status==='error'&&detail.state.httpStatus===404||page.state.status==='error'&&page.state.httpStatus===404;
 const sourceLink=detail.state.status==='ok'?detail.state.data.document.sourceUrl:originalUrl;
 const originalLink=sourceLink&&/\.pdf(?:\?|$)/i.test(sourceLink)?`${sourceLink}#page=${pageNo}`:sourceLink;
 const download=async()=>{
  if(!doc)return;
  try{const r=await fetch(`/api/documents/doc/${doc.documentId}/file`,{cache:'no-store'});if(r.status===401){setDownloadState('login');return;}if(!r.ok)throw new Error('download');const body=await r.json() as {url:string};window.open(body.url,'_blank','noopener,noreferrer');}
  catch{setDownloadState('failed');}
 };
 return <DrawerShell label={t('title')} kicker={t('kicker')} title={detail.state.status==='ok'?detail.state.data.document.title:t('title')} onClose={onClose}>
  {binding.state.status==='loading'&&<p className="text-sm text-[var(--text-dim)]">{t('loading')}</p>}
  {binding.state.status==='error'&&binding.state.httpStatus!==404&&<p role="alert" className="text-sm">{t('loadFailed')}</p>}
  {(!doc||restricted)&&binding.state.status!=='loading'&&<p role="status" className="text-sm text-[var(--text-dim)]">{restricted?t('restricted'):reason==='ambiguous'?t('ambiguous'):t('notFound')}</p>}
  {doc&&!restricted&&<div className="space-y-4 text-sm">
   <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
    <div className="text-xs font-medium text-[var(--accent)]">{t('document')}</div>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
     <dt>{t('source')}</dt><dd>{doc.source} · {doc.sourceRef}</dd>
     <dt>{t('version')}</dt><dd>{doc.sourceVersion}</dd>
     <dt>{t('available')}</dt><dd>{doc.availableDate}</dd>
     {detail.state.status==='ok'&&<><dt>{t('publishedAt')}</dt><dd>{detail.state.data.document.publishedAt}</dd><dt>{t('availableAt')}</dt><dd>{detail.state.data.document.availableAt}</dd></>}
     <dt>{t('extraction')}</dt><dd>{doc.currentExtraction?doc.currentExtraction:t('pending')}</dd>
     <dt>{t('integrity')}</dt><dd>{citation.state.status==='ok'?citation.state.data.integrity:doc.integrity}</dd>
     {detail.state.status==='ok'&&<><dt>{t('status')}</dt><dd>{detail.state.data.document.status}</dd><dt>{t('pages')}</dt><dd>{detail.state.data.extractions.rows.find(e=>e.extractionId===doc.currentExtraction)?.pageCount??t('pending')}</dd></>}
    </dl>
   </div>
   {page.state.status==='ok'&&<div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
    <h3 className="mb-2 text-xs font-semibold">{t('page',{n:pageNo})}</h3>
    <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{citation.state.status==='ok'&&citation.state.data.integrity==='ok'?<><span>{Array.from(page.state.data.text).slice(0,citation.state.data.charStart).join('')}</span><mark className="bg-[var(--accent-wash)] text-[var(--text)]">{citation.state.data.snippet}</mark><span>{Array.from(page.state.data.text).slice(citation.state.data.charEnd).join('')}</span></>:page.state.data.text}</p>
    <div className="mt-2 break-all text-[10px] text-[var(--text-dim)]">{t('textHash')}: {page.state.data.textHash}</div>
    {citation.state.status==='ok'&&<div className="mt-1 text-xs">{t('citationState')}: {citation.state.data.integrity} · {citation.state.data.currentExtraction?t('current'):t('superseded')}</div>}
   </div>}
   {doc.currentExtraction&&page.state.status==='loading'&&<p>{t('loadingPage')}</p>}
   {factId&&linked.state.status==='ok'&&!citationRef&&<p role="status" className="text-xs text-[var(--text-dim)]">{t('citationMissing')}</p>}
   {citation.state.status==='error'&&<p role="alert" className="text-xs">{t('citationMissing')}</p>}
  </div>}
  {originalLink&&<a href={originalLink} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--accent)] underline">{t('external')}</a>}
  {doc&&<button type="button" onClick={()=>void download()} className="self-start text-sm text-[var(--accent)] underline">{t('download')}</button>}
  {downloadState!=='idle'&&<p role="status" className="text-xs">{downloadState==='login'?t('signIn'):t('downloadFailed')}</p>}
 </DrawerShell>;
}
