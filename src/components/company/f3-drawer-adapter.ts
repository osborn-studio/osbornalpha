import type {SourceDrawerInput} from '@/components/research-ui';
import {companyHref} from '@/lib/company/client';
import type {EvidencePage} from './source-drawer-state';
import type {CompanyDrawerText} from './disclosure-drawer-adapter';
export type F3Detail={document:{documentId:string;issuerId:string;title:string;source:string;sourceRef:string;sourceVersion:number;sourceUrl:string|null;status:string;currentExtractionId:string|null;publishedAt:string;availableAt:string;availableDate:string};extractions:{rows:{extractionId:string;pageCount:number}[]}};
export const pageLink=(url:string,page:number)=>{try{const u=new URL(url);if(/\.pdf$/i.test(u.pathname))u.hash=`page=${page}`;return u.toString();}catch{return url;}};
export function f3DrawerInput({filingId,ticker,asOf,detail,pageNo,page,citation,citationId,restricted=false,originalUrl,text:t}:{filingId:string;ticker:string;asOf?:string|null;detail:F3Detail|null;pageNo:number;page:EvidencePage|null;citation:{snippet:string;charStart:number;charEnd:number;integrity:string;currentExtraction:boolean}|null;citationId:string|null;restricted?:boolean;originalUrl?:string|null;text:CompanyDrawerText}):SourceDrawerInput {
 const d=detail?.document;
 const identity={id:citationId??d?.documentId??filingId,label:d?.title??filingId};
 if(restricted)return {variant:'withheld',kind:'document_citation',identity,reason:{code:'restricted',text:t('restricted')}};
 const url=d?.sourceUrl??originalUrl;
 // With no document this is an empty frame only: wrapper marks it pending or failed.
 return {variant:'ok',payload:{kind:'document_citation',identity,
  source:{publisher:d?.source??'',adapter:d?`${d.sourceRef} · ${d.sourceVersion}`:'',url:url?pageLink(url,pageNo):null,locator:d?`p. ${pageNo}${citation?` · ${citation.charStart}–${citation.charEnd}`:''}`:null,evidence_sha256:page?.textHash??null},
  times:{period:d?.availableDate??'',available_at:d?.availableAt??'',ingested_at:null},
  transform:{code_version:null,mapping_version:null,method_version:null},licence:{status:'',note_key:'rightsUnknown'},attribution_key:'attribution',links:{module_href:companyHref(ticker,{view:'filings',asOf:asOf??null})}},
  extras:{title:identity.label,...(asOf?{as_of:asOf}:{}),rows:{source:d?[
   {key:'document',label:t('document'),value:d.title},{key:'page',label:t('page',{n:pageNo}),value:String(pageNo),mono:true},
   ...(citation?[{key:'snippet',label:t('snippet'),value:`“${citation.snippet}”`}]:[]),
   {key:'textHash',label:t('textHash'),value:page?.textHash??'',mono:true},{key:'visibility',label:t('visibility'),value:t('publicDocument')},
   {key:'extraction',label:t('extraction'),value:page?.extractionId??d.currentExtractionId??''},
   {key:'pages',label:t('pages'),value:String(detail?.extractions.rows.find(e=>e.extractionId===(page?.extractionId??d.currentExtractionId))?.pageCount??'')},
   {key:'status',label:t('status'),value:d.status},
   ...(citation?[{key:'citation',label:t('citationState'),value:`${citation.integrity} · ${t(citation.currentExtraction?'current':'superseded')}`}]:[]),
  ]:[],times:d?[{key:'publishedAt',label:t('publishedAt'),value:d.publishedAt}]:[]},links:url?[{label:t('external'),href:pageLink(url,pageNo),newTab:true}]:[]}};
}
