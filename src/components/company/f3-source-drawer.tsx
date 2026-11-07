'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {F3_DRAWER_FLAG} from '@/lib/company/client';
import type {BindingResult} from '@/lib/documents/by-filing';
import {DrawerShell} from './DrawerShell';
import {useCompanyFetch} from './useCompanyFetch';
import {citationCurrency,readSignedFile,selectCitation,validDetail,verifyPage} from './source-drawer-state';
import type {HashState} from './source-drawer-state';

export const F3_SOURCE_DRAWER_AVAILABLE=F3_DRAWER_FLAG;
type Detail={document:{documentId:string;issuerId:string;title:string;source:string;sourceRef:string;sourceVersion:number;sourceUrl:string|null;status:string;currentExtractionId:string|null;publishedAt:string;availableAt:string;availableDate:string};extractions:{rows:{extractionId:string;pageCount:number}[]}};
type Page={documentId:string;extractionId:string;text:string;textHash:string;pageNo:number};
type FactCitations={citations:{citationId:string;documentId:string;extractionId:string;pageNo:number}[]};
type Citation={documentId:string;snippet:string;textHash:string;extractionId:string;pageNo:number;charStart:number;charEnd:number;integrity:'ok'|'corrupt';currentExtraction:boolean};
const pageLink=(url:string,page:number)=>{try{const u=new URL(url);if(/\.pdf$/i.test(u.pathname))u.hash=`page=${page}`;return u.toString();}catch{return url;}};

export function SourceDrawerAdapter({filingId,onClose,originalUrl,factId,asOf}:{filingId:string;onClose:()=>void;originalUrl?:string|null;factId?:string|null;asOf?:string|null}){
 const t=useTranslations('company.sourceDrawer');
 const [downloadState,setDownloadState]=useState<'idle'|'login'|'failed'>('idle');
 const query=asOf?`?asOf=${encodeURIComponent(asOf)}`:'';
 const binding=useCompanyFetch<BindingResult>(`/api/documents/by-filing/${encodeURIComponent(filingId)}${query}`);
 const doc=binding.state.status==='ok'?binding.state.data.document:null;
 const detail=useCompanyFetch<Detail>(doc?`/api/documents/doc/${doc.documentId}`:null);
 const verifiedDetail=doc&&detail.state.status==='ok'&&validDetail(doc,detail.state.data.document)?detail.state.data:null;
 const linked=useCompanyFetch<FactCitations>(factId&&verifiedDetail?`/api/citations?factId=${encodeURIComponent(factId)}`:null);
 const citationChoice=doc&&linked.state.status==='ok'?selectCitation(linked.state.data.citations,doc.documentId):null;
 const citationRef=citationChoice?.status==='ok'?citationChoice.citation:null;
 const citation=useCompanyFetch<Citation>(citationRef?`/api/citations/${citationRef.citationId}`:null);
 const citationData=citation.state.status==='ok'&&citationRef&&citation.state.data.documentId===citationRef.documentId&&citation.state.data.extractionId===citationRef.extractionId&&citation.state.data.pageNo===citationRef.pageNo&&citationCurrency(citation.state.data,verifiedDetail?.document.currentExtractionId??null)!=='invalid'?citation.state.data:null;
 const pageNo=citationRef?.pageNo??1;
 const extraction=verifiedDetail?.document.currentExtractionId;
 const page=useCompanyFetch<Page>(verifiedDetail&&extraction&&(!factId||citationData)?`/api/documents/doc/${doc!.documentId}/pages/${pageNo}?extraction=${encodeURIComponent(citationData?.extractionId??extraction)}`:null);
 const pageData=page.state.status==='ok'?page.state.data:null;
 const pageKey=pageData?`${filingId}:${doc?.documentId}:${citationRef?.citationId??''}:${pageData.extractionId}:${pageData.pageNo}:${pageData.textHash}`:null;
 const [hashResult,setHashResult]=useState<{key:string;page:Page;citation:Citation|null;status:HashState}|null>(null);
 useEffect(()=>{
  if(!pageData||!pageKey)return;
  let active=true;
  void verifyPage(pageData,factId?citationData?{...citationData,citationId:citationRef!.citationId}:null:null,async text=>{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
   return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  }).then(status=>{if(active)setHashResult({key:pageKey,page:pageData,citation:citationData,status});});
  return ()=>{active=false;};
 },[pageData,pageKey,factId,citationData,citationRef]);
 const hashStatus:HashState=pageKey&&hashResult?.key===pageKey&&hashResult.page===pageData&&hashResult.citation===citationData?hashResult.status:'pending';
 const pageHashOk=!!pageData&&hashStatus==='ok';
 const chars=pageData?Array.from(pageData.text):[];
 const validCitation=!!(citationData&&citationRef&&pageData&&pageHashOk&&citationData.documentId===doc?.documentId&&citationData.extractionId===pageData.extractionId&&citationData.pageNo===pageData.pageNo);
 const missing=binding.state.status==='ok'&&binding.state.data.reason==='not_found'||binding.state.status==='error'&&binding.state.code==='filing_not_found';
 const restricted=binding.state.status==='ok'&&binding.state.data.reason==='restricted'||detail.state.status==='error'&&detail.state.httpStatus===404;
 const corrupt=!!(doc&&((detail.state.status==='ok'&&!verifiedDetail)||(citation.state.status==='ok'&&citationRef&&!citationData)||(pageData&&hashStatus==='failed')||(pageData&&(pageData.documentId!==doc.documentId||pageData.extractionId!==citationData?.extractionId&&!!factId||pageData.extractionId!==extraction&&!factId))));
 const unavailable=!!(doc&&(detail.state.status==='error'||linked.state.status==='error'||citationChoice?.status==='ambiguous'||citation.state.status==='error'||page.state.status==='error'||corrupt));
 const fallback=(missing||restricted)&&originalUrl?pageLink(originalUrl,pageNo):null;
 const download=async()=>{
  if(!verifiedDetail)return;
  try{const r=await fetch(`/api/documents/doc/${verifiedDetail.document.documentId}/file`,{cache:'no-store'});const result=await readSignedFile(r,Date.now());if(result.status==='login'){setDownloadState('login');return;}if(result.status==='failed')throw new Error('download');window.open(result.url,'_blank','noopener,noreferrer');}
  catch{setDownloadState('failed');}
 };
 return <DrawerShell label={t('title')} kicker={t('kicker')} title={verifiedDetail?.document.title??t('title')} onClose={onClose}>
  {(binding.state.status==='loading'||doc&&!verifiedDetail&&!unavailable)&&<p className="text-sm text-[var(--text-dim)]">{t('loading')}</p>}
  {binding.state.status==='error'&&!missing&&<p role="alert" className="text-sm">{t('loadFailed')}</p>}
  {(missing||restricted||binding.state.status==='ok'&&!doc)&&<p role="status" className="text-sm text-[var(--text-dim)]">{restricted?t('restricted'):binding.state.status==='ok'&&binding.state.data.reason==='ambiguous'?t('ambiguous'):t('notFound')}</p>}
  {unavailable&&!restricted&&<p role="alert" className="text-sm">{t('loadFailed')}</p>}
  {verifiedDetail&&!unavailable&&<div className="space-y-4 text-sm">
   <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
    <div className="text-xs font-medium text-[var(--accent)]">{t('document')}</div>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
     <dt>{t('source')}</dt><dd>{verifiedDetail.document.source} · {verifiedDetail.document.sourceRef}</dd>
     <dt>{t('version')}</dt><dd>{verifiedDetail.document.sourceVersion}</dd>
     <dt>{t('available')}</dt><dd>{verifiedDetail.document.availableDate}</dd>
     <dt>{t('publishedAt')}</dt><dd>{verifiedDetail.document.publishedAt}</dd><dt>{t('availableAt')}</dt><dd>{verifiedDetail.document.availableAt}</dd>
     <dt>{t('extraction')}</dt><dd>{extraction??t('pending')}</dd>
     <dt>{t('status')}</dt><dd>{verifiedDetail.document.status}</dd><dt>{t('pages')}</dt><dd>{verifiedDetail.extractions.rows.find(e=>e.extractionId===extraction)?.pageCount??t('pending')}</dd>
    </dl>
   </div>
   {pageData&&pageHashOk&&(!factId||validCitation)&&<div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
    <h3 className="mb-2 text-xs font-semibold">{t('page',{n:pageNo})}</h3>
    <p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{validCitation&&citationData?<><span>{chars.slice(0,citationData.charStart).join('')}</span><mark className="bg-[var(--accent-wash)] text-[var(--text)]">{citationData.snippet}</mark><span>{chars.slice(citationData.charEnd).join('')}</span></>:pageData.text}</p>
    <div className="mt-2 break-all text-[10px] text-[var(--text-dim)]">{t('textHash')}: {pageData.textHash}</div>
    {validCitation&&citationData&&<div className="mt-1 text-xs">{t('citationState')}: {citationData.integrity} · {t(citationCurrency(citationData,extraction??null)==='current'?'current':'superseded')}</div>}
   </div>}
   {extraction&&(page.state.status==='loading'||pageData&&hashStatus==='pending')&&<p>{t('loadingPage')}</p>}
   {factId&&citationChoice?.status==='missing'&&<p role="status" className="text-xs text-[var(--text-dim)]">{t('citationMissing')}</p>}
  </div>}
  {fallback&&<a href={fallback} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--accent)] underline">{t('external')}</a>}
  {verifiedDetail&&!unavailable&&<button type="button" onClick={()=>void download()} className="self-start text-sm text-[var(--accent)] underline">{t('download')}</button>}
  {downloadState!=='idle'&&<p role="status" className="text-xs">{downloadState==='login'?t('signIn'):t('downloadFailed')}</p>}
 </DrawerShell>;
}
