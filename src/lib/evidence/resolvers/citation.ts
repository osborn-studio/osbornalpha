// Topic spec §4.1 / §5.4 citations (X17: no document withdrawal state).
import {digestOf,missing,type EvidenceResolver,type Resolved} from '../resolve';
import type {EvidenceSources} from '../sources';
export function citationResolver(sources:EvidenceSources):EvidenceResolver<'document_citation'>{
 return {kind:'document_citation',code_version:'evidence-citation/1',
  async resolve(refs,ctx){return Promise.all(refs.map(async ref=>{
   const citation=await sources.documents.citation(ref.id);if(!citation)return missing(ref,'not_found');
   if(Date.parse(citation.created_at)>Date.parse(ref.as_of))return missing(ref,'not_yet_available');
   if(citation.visibility!=='public'||citation.document.permission!=='public')return {...missing(ref,'private_document'),state:'withheld'};
   const {document}=citation,label={zh:document.title,en:document.title},identity={id:ref.id,label:label[ctx.locale]};
   const fact={template:'topic.citation',slots:{title:document.title,page:String(citation.page_no)}};
   return {...missing(ref,''),state:'ok',reason:null,display:{label,fact,period:null,available_at:citation.created_at},
    drawer:{kind:'document_citation',identity,source:{publisher:document.publisher,adapter:'document',url:document.url,locator:`p.${citation.page_no} · ${citation.snippet}`,evidence_sha256:citation.text_hash},
     times:{period:'',available_at:citation.created_at,ingested_at:null},transform:{code_version:null,mapping_version:null,method_version:null},licence:{status:'public',note_key:'documents:public'},
     attribution_key:'documents:source',links:{module_href:`/api/documents/${citation.document_id}`}},digest:digestOf(fact,identity)} satisfies Resolved;
  }));},
  async latestIdentity(ref){
   const c=await sources.documents.citation(ref.id);if(!c)return null;
   const held=c.visibility!=='public'||c.document.permission!=='public';
   return {state:held?'withheld':'ok',reason:held?'private_document':null,object_id:c.citation_id,value:null,newer_period:null};
  },
 };
}
