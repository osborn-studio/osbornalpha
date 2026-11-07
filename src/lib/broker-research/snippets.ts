// Server-sliced private snippets and current-input disclosure approval (spec §4.7).
import {checkDisclosure} from './disclosure';
import {bad,conflict,gone,notFound} from './errors';
import {SNIPPET_HARD_MAX} from './licences';
import {artifactLoader} from './parse';
import {disclosureInputOf} from './rules-run';
import type {BrokerDeps} from './deps';
import type {SnippetPurpose,SnippetRow} from './types';
export const PURPOSES:readonly SnippetPurpose[]=['rating','target','thesis','risk','method','other'];
export interface SnippetInput{purpose:SnippetPurpose;targetKey:string|null;fieldId:string|null;page:number;charStart:number;charEnd:number;text?:string}
type SDeps=Pick<BrokerDeps,'db'|'storage'>;
async function inputs(deps:SDeps,reportId:string){const report=await deps.db.getReport(reportId);if(!report)throw notFound('report_not_found');const doc=await deps.db.getDocument(report.document_id);if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw gone();const licence=await deps.db.getLicence(doc.licence_id);if(!licence)throw notFound('licence_not_found');return {report,doc,licence,disclosure:await disclosureInputOf(deps,report)};}
export async function createSnippet(deps:SDeps,reportId:string,i:SnippetInput,by:string):Promise<{snippetId:string;passed:boolean}>{
 if(!PURPOSES.includes(i.purpose))throw bad('invalid_parameter:purpose');const {report,doc,licence,disclosure}=await inputs(deps,reportId);
 if(report.status==='published')throw conflict('published_immutable');if(!doc.current_parse_run_id)throw conflict('document_not_parsed');
 const a=await artifactLoader(deps)(doc.current_parse_run_id),page=a.pages.find(p=>p.page===i.page);if(!page)throw bad('snippet_page');
 if(!Number.isSafeInteger(i.charStart)||!Number.isSafeInteger(i.charEnd)||i.charStart<0||i.charEnd<=i.charStart)throw bad('snippet_span');
 if(i.charEnd>page.text.length)throw bad('snippet_cross_page');
 if(i.charEnd-i.charStart>Math.min(licence.snippet_max_chars,SNIPPET_HARD_MAX))throw bad('snippet_too_long',{max:Math.min(licence.snippet_max_chars,SNIPPET_HARD_MAX)});
 const text=page.text.slice(i.charStart,i.charEnd);if(i.text!==undefined&&i.text!==text)throw bad('snippet_not_verbatim');const check=checkDisclosure(text,disclosure);
 const snippetId=await deps.db.insertSnippet({report_id:reportId,target_key:i.targetKey,purpose:i.purpose,parse_run_id:doc.current_parse_run_id,page:i.page,char_start:i.charStart,char_end:i.charEnd,text,field_id:i.fieldId,disclosure_check:check,created_by:by});return {snippetId,passed:check.passed};
}
async function snippetById(deps:SDeps,id:string):Promise<SnippetRow>{const s=await deps.db.getSnippet(id);if(!s)throw notFound('snippet_not_found');return s;}
export async function approveSnippet(deps:SDeps,id:string,by:string):Promise<void>{const s=await snippetById(deps,id);if(s.status!=='draft'||s.text===null)throw conflict('snippet_not_draft');const digest=await deps.db.disclosureDigest(s.report_id),{licence,disclosure}=await inputs(deps,s.report_id);if(s.text.length>Math.min(licence.snippet_max_chars,SNIPPET_HARD_MAX))throw conflict('snippet_too_long');const check={...checkDisclosure(s.text,disclosure),db_digest:digest};if(!check.passed){await deps.db.setSnippetStatus(id,{status:'rejected',disclosure_check:check});throw conflict(check.hits.some(h=>h.kind==='restricted_name')?'restricted_name':'restricted_value');}await deps.db.setSnippetStatus(id,{status:'approved',disclosure_check:check,approved_by:by});}
export async function rejectSnippet(deps:SDeps,id:string,_by:string):Promise<void>{await snippetById(deps,id);await deps.db.setSnippetStatus(id,{status:'rejected',approved_by:null});}
