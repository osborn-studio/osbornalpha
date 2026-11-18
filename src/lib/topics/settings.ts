// Topic plan T6.6 / spec §10: public evidence rights and owner confirmations.
import type {EvidenceKind} from '@/lib/evidence/ref';
import type {AdminDeps} from './admin-deps';
import type {runDisclosure} from './disclosure';
import {TopicError} from './errors';
import {TopicsDbError,type SnapshotEvidence,type TopicsDb} from './types';

export const PUBLIC_LICENCE_STATUSES:readonly string[]=['public_domain','official_open','public'];
type LicenceProblem={ordinal:number;kind:EvidenceKind;problem:'no_attribution'|'licence_unconfirmed'|'no_drawer'};
export function licenceProblems(evidence:readonly SnapshotEvidence[]):LicenceProblem[]{
 const problems:LicenceProblem[]=[];
 for(const {ordinal,ref,resolved} of evidence){
  if(resolved.state!=='ok')continue;
  const {drawer}=resolved,kind=ref.kind;
  if(!drawer||!('source' in drawer)||!drawer.source){problems.push({ordinal,kind,problem:'no_drawer'});continue;}
  if(typeof drawer.attribution_key!=='string'||!drawer.attribution_key.trim())problems.push({ordinal,kind,problem:'no_attribution'});
  if(!PUBLIC_LICENCE_STATUSES.includes(drawer.licence?.status))problems.push({ordinal,kind,problem:'licence_unconfirmed'});
 }
 return problems;
}
type DisclosureResult=ReturnType<typeof runDisclosure>;
export function withLicenceCheck(result:DisclosureResult,problems:readonly LicenceProblem[]):DisclosureResult{
 if(!problems.length)return result;
 const checks=result.checks.map(c=>c.key==='evidence_audience'?{...c,result:'block' as const,
  codes:[...new Set([...c.codes,'licence_unconfirmed'])],detail:{...c.detail,licence:problems}}:c);
 const blocked=[...new Set(checks.filter(c=>c.result==='block').flatMap(c=>c.codes))];
 return {...result,checks,blocked,passed:blocked.length===0};
}
export async function requiredAttributions(db:TopicsDb){
 const keys=new Set<string>(),problems:(LicenceProblem&{slug:string})[]=[];
 for(const topic of await db.adminTopics()){
  if(topic.status!=='published')continue;
  const version=(await db.versionsOfTopic(topic.topic_id)).find(v=>v.version_id===topic.current_version_id);
  if(!version)throw new TopicError('not_found');
  const evidence=version.snapshot.evidence;
  problems.push(...licenceProblems(evidence).map(p=>({...p,slug:topic.topic_slug})));
  for(const {resolved} of evidence){
   const drawer=resolved.drawer;
   if(resolved.state==='ok'&&drawer&&'attribution_key' in drawer&&typeof drawer.attribution_key==='string'&&drawer.attribution_key.trim())keys.add(drawer.attribution_key);
  }
 }
 return {required:[...keys].sort(),problems};
}
type Confirmations=Parameters<TopicsDb['setPublicEnabled']>[0]['licenceConfirmations'];
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function parseConfirmations(value:unknown,today:string):Confirmations{
 const invalid=new TopicError('invalid_body:licence_confirmations');
 if(!object(value))throw invalid;
 return Object.fromEntries(Object.entries(value).map(([key,entry])=>{
  if(!key.trim()||key.length>80||!object(entry))throw invalid;
  const {terms_url,confirmed_on}=entry;
  if(typeof terms_url!=='string'||terms_url.length>500||!URL.canParse(terms_url)||new URL(terms_url).protocol!=='https:')throw invalid;
  if(typeof confirmed_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(confirmed_on)||confirmed_on>today)throw invalid;
  const date=new Date(confirmed_on+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==confirmed_on)throw invalid;
  return [key,{terms_url,confirmed_on}];
 }));
}
async function checkConfirmations(db:TopicsDb,confirmations:Confirmations){
 const {required,problems}=await requiredAttributions(db);
 if(problems.length)throw new TopicError('licence_confirmation_missing',{missing:[],problems});
 const missing=required.filter(key=>!Object.hasOwn(confirmations,key));
 if(missing.length)throw new TopicError('licence_confirmation_missing',{missing});
}
export async function setPublicEnabled(d:AdminDeps,body:Record<string,unknown>,actor:string){
 const {public_enabled,summary_public_enabled,summary_provider_note}=body;
 if(typeof public_enabled!=='boolean')throw new TopicError('invalid_body:public_enabled');
 if(typeof summary_public_enabled!=='boolean')throw new TopicError('invalid_body:summary_public_enabled');
 if(summary_provider_note!=null&&(typeof summary_provider_note!=='string'||summary_provider_note.length>500))throw new TopicError('invalid_body:summary_provider_note');
 const note=summary_provider_note?.trim()||null;
 if(summary_public_enabled&&!note)throw new TopicError('invalid_body:summary_provider_note');
 const confirmations=parseConfirmations(body.licence_confirmations===undefined?{}:body.licence_confirmations,d.now().toISOString().slice(0,10));
 if(public_enabled)await checkConfirmations(d.db,confirmations);
 try{
  return await d.db.setPublicEnabled({publicEnabled:public_enabled,summaryPublicEnabled:summary_public_enabled,summaryProviderNote:note,licenceConfirmations:confirmations,actor});
 }catch(e){
  if(e instanceof TopicsDbError&&e.code==='licence_confirmation_missing'){
   // A publication can change between our read and the SQL recheck.
   await checkConfirmations(d.db,confirmations);throw new TopicError(e.code,{missing:[]});
  }
  throw e;
 }
}
