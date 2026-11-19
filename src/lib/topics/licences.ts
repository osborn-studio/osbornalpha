import type {TopicSourceLicenceRow} from './database-types';
import {EXCERPT_CAPS,httpsUrl,validDate} from './excerpts';
import {TopicError} from './errors';
export type LicenceFields=Omit<TopicSourceLicenceRow,'licence_id'|'decided_by'|'decided_at'>;
export function licenceForm(body:Record<string,unknown>):LicenceFields{
 const bad=(key:string):never=>{throw new TopicError('invalid_body:'+key);};
 const text=(key:string)=>{const v=body[key];return typeof v==='string'&&v.trim()?v.trim():bad(key);};
 const source_title=text('source_title'),publisher=text('publisher');
 if([...source_title].length>200)bad('source_title');
 if([...publisher].length>200)bad('publisher');
 const source_url=text('source_url'),terms_url=text('terms_url'),terms_read_at=text('terms_read_at'),terms_clause=text('terms_clause');
 if(!httpsUrl(source_url))bad('source_url');
 if(!httpsUrl(terms_url))bad('terms_url');
 if(!validDate(terms_read_at))bad('terms_read_at');
 if([...terms_clause].length>200)bad('terms_clause');
 const p=body.permits as Record<string,unknown>|null;
 if(typeof p?.display_excerpt!=='boolean'||typeof p?.link_required!=='boolean')return bad('permits');
 const {status}=body;if(status!=='pending'&&status!=='approved'&&status!=='revoked')return bad('status');
 return {source_title,publisher,source_url,terms_url,terms_read_at,terms_clause,status,note:typeof body.note==='string'?body.note:null,
  permits:{display_excerpt:p.display_excerpt,link_required:p.link_required,attribution_required:true,full_text:false,max_chars_zh:EXCERPT_CAPS.zhChars,max_words_en:EXCERPT_CAPS.enWords,max_fragments:EXCERPT_CAPS.fragments}};
}
