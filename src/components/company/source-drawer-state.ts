import type {BindingDocument} from '@/lib/documents/by-filing';

export type DrawerDetail=BindingDocument&{status:string};
export type CitationRef={citationId:string;documentId:string;extractionId:string;pageNo:number};
export type CitationEvidence=CitationRef&{textHash:string;snippet:string;charStart:number;charEnd:number;integrity:string};
export type EvidencePage={documentId:string;extractionId:string;pageNo:number;text:string;textHash:string};
export type HashState='pending'|'ok'|'failed';
export function citationCurrency(citation:{extractionId:string;currentExtraction:boolean},currentExtractionId:string|null):'current'|'superseded'|'invalid'{
 const current=citation.extractionId===currentExtractionId;
 return current!==citation.currentExtraction?'invalid':current?'current':'superseded';
}
export async function readSignedFile(response:Response,now:number):Promise<{status:'ok';url:string}|{status:'login'}|{status:'failed'}>{
 if(response.status===401)return {status:'login'};
 if(!response.ok)return {status:'failed'};
 try{
  const body=await response.json() as {url?:unknown;expiresAt?:unknown};
  if(typeof body.url!=='string'||typeof body.expiresAt!=='string'||!Number.isFinite(Date.parse(body.expiresAt))||Date.parse(body.expiresAt)<=now)return {status:'failed'};
  const url=new URL(body.url);
  if(url.protocol!=='https:'&&url.protocol!=='http:')return {status:'failed'};
  return {status:'ok',url:body.url};
 }catch{return {status:'failed'};}
}

export function validDetail(binding:BindingDocument,detail:DrawerDetail):boolean{
 return detail.documentId===binding.documentId&&detail.issuerId===binding.issuerId&&detail.source===binding.source&&
  detail.sourceRef===binding.sourceRef&&detail.sourceVersion===binding.sourceVersion&&detail.availableDate===binding.availableDate&&
  detail.currentExtractionId===binding.currentExtractionId&&['stored','extracted','no_text_layer'].includes(detail.status);
}
export function selectCitation(citations:CitationRef[],documentId:string):{status:'ok';citation:CitationRef}|{status:'missing'|'ambiguous'}{
 const matches=citations.filter(c=>c.documentId===documentId);
 return matches.length===0?{status:'missing'}:matches.length>1?{status:'ambiguous'}:{status:'ok',citation:matches[0]};
}
export async function verifyPage(page:EvidencePage,citation:CitationEvidence|null,digest:(text:string)=>Promise<string>):Promise<HashState>{
 try{
  const actual=await digest(page.text);
  if(actual!==page.textHash)return 'failed';
  if(!citation)return 'ok';
  const chars=Array.from(page.text);
  return actual===citation.textHash&&citation.integrity==='ok'&&citation.documentId===page.documentId&&
   citation.extractionId===page.extractionId&&citation.pageNo===page.pageNo&&citation.charStart>=0&&
   citation.charEnd<=chars.length&&citation.charStart<citation.charEnd&&
   chars.slice(citation.charStart,citation.charEnd).join('')===citation.snippet?'ok':'failed';
 }catch{return 'failed';}
}
