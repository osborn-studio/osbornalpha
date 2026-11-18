// Topic plan T6.4–T6.6: disclosure receipts, public previews and version transitions.
import type {AdminDeps} from './admin-deps';
import type {TopicRow,TopicVersionRow} from './database-types';
import {assemble,type Assembled} from './assemble';
import {runDisclosure} from './disclosure';
import {TopicError} from './errors';
import {formatSlot} from '@/lib/macro/strategy/explain-render';
import type {Resolved} from '@/lib/evidence/resolve';
import {maskSnapshot} from './masking';
import type {DossierDto} from './public-dto';
import {licenceProblems,withLicenceCheck} from './settings';
import {TopicsDbError,UNPUBLISH_REASONS,type DriftRow,type TopicsDb,type UnpublishReason} from './types';

async function load(d:AdminDeps,topicId:string){
 const [topic,draft]=await Promise.all([d.db.topicById(topicId),d.db.draftOf(topicId)]);
 if(!topic)throw new TopicError('not_found');
 if(topic.status==='retired')throw new TopicError('topic_retired');
 if(!draft)throw new TopicError('not_found');
 return {topic:{slug:topic.topic_slug,category:topic.category},currentVersionId:topic.current_version_id,draft:draft.body,draftHash:draft.draft_hash,summary:null,cutoff:d.now().toISOString()};
}
async function disclose(d:AdminDeps,input:Awaited<ReturnType<typeof load>>,assembled:Assembled,actor:string){
 const [privateIds,settings]=await Promise.all([d.privateIds(actor),d.db.settings()]);
 return runDisclosure({...input,assembled,privateIds,settings,licences:new Map()});
}
export async function checkDraft(d:AdminDeps,i:{topicId:string;actor:string}){
 const input=await load(d,i.topicId),assembled=await assemble(d,input);
 const result=withLicenceCheck(await disclose(d,input,assembled,i.actor),licenceProblems(assembled.snapshot.evidence));
 const receipt_id=await d.db.recordDisclosure({...i,draftHash:input.draftHash,checks:result.checks,passed:result.passed,codeVersion:d.codeVersion??'unknown'});
 return {receipt_id,draft_hash:input.draftHash,...result};
}
// The picker formatter lives with its HTTP lookup adapter. Keep previews usable without Next.js.
function previewText(r:Resolved){
 if(r.state!=='ok'||!r.display.fact)return null;
 const {value,title,page,method}=r.display.fact.slots;
 if(value!==undefined)return typeof value==='string'?value:formatSlot(value,'zh');
 if(r.ref.kind==='document_citation'&&typeof title==='string'&&typeof page==='string')return `${title} · p.${page}`;
 return r.ref.kind==='judgment'&&typeof method==='string'?method:null;
}
export async function previewDraft(d:AdminDeps,i:{topicId:string;actor:string}){
 const input=await load(d,i.topicId);
 const [assembled,versions]=await Promise.all([assemble(d,input),d.db.versionsOfTopic(i.topicId)]);
 const {snapshot:s,adminResolved,maskedInPublic,degraded}=assembled,{summary,evidence}=maskSnapshot(s,new Map(),'current');
 const version_no=versions.reduce((max,v)=>Math.max(max,v.version_no),0)+1;
 const keys=new Set<string>();
 for(const {resolved} of s.evidence){
  const drawer=resolved.drawer;
  if(resolved.state==='ok'&&drawer&&'attribution_key' in drawer&&drawer.attribution_key?.trim())keys.add(drawer.attribution_key);
 }
 const view:DossierDto['view']='current';
 const dossier={attributions:[...keys].sort(),topic:s.topic,version:{version_no,published_at:input.cutoff,cutoff:input.cutoff,is_current:true,superseded:false,unpublished_at:null,unpublish_reason:null},
  total_versions:versions.length+1,current_version_no:versions.find(v=>v.version_id===input.currentVersionId)?.version_no??null,view,replay_as_of:null,
  sections:s.sections,evidence,expected_slots:s.expected_slots,entries:s.entries,summary,counts:s.counts,freshness_at_publication:s.freshness_at_publication,
  stale:false,age_days:0,drift_checked_at:null,drift_unchecked:true};
 const difference=s.evidence.map(({ordinal,resolved},n)=>({ordinal,label:resolved.display.label,
  public:{state:resolved.state,text:previewText(resolved)},admin:{text:previewText(adminResolved[n])}}));
 const masked=maskedInPublic.length;
 await d.db.recordEvent({topicId:i.topicId,actor:i.actor,action:'preview',detail:{draft_hash:input.draftHash,masked}});
 return {dossier:dossier satisfies DossierDto,draft_hash:input.draftHash,difference,masked,degraded,counts:s.counts};
}
export async function publishTopic(d:AdminDeps,i:{topicId:string;expectedDraftHash:string;actor:string}){
 try{
  const input=await load(d,i.topicId);
  if(input.draftHash!==i.expectedDraftHash)throw new TopicError('publish_blocked:draft_changed');
  const receipt=await d.db.latestReceipt(i.topicId,input.draftHash);
  if(!receipt?.passed)throw new TopicError('publish_blocked:disclosure_required');
  const assembled=await assemble(d,input);
  if(assembled.degraded)throw new TopicError('resolver_degraded');
  const problems=licenceProblems(assembled.snapshot.evidence);
  if(problems.length)throw new TopicError('publish_blocked:licence_unconfirmed',{problems});
  const {blocked}=await disclose(d,input,assembled,i.actor);
  if(blocked.length)throw new TopicError('publish_blocked:'+blocked.join(','));
  const version=await d.db.publish({...i,cutoff:input.cutoff,snapshotText:assembled.snapshotText,evidence:assembled.evidence,summaryId:null,receiptId:receipt.receipt_id});
  return {...version,evidence:assembled.evidence.length,counts:assembled.snapshot.counts};
 }catch(e){throw transitionError(e);}
}
function transitionError(e:unknown){
 if(!(e instanceof TopicsDbError))return e;
 const codes:Record<string,string>={not_published:'publish_blocked:not_published',invalid_note:'invalid_body:note',invalid_reason:'invalid_body:reason'};
 return Object.hasOwn(codes,e.code)?new TopicError(codes[e.code]):e;
}
export function withdrawalFields(body:Record<string,unknown>){
 const reason=UNPUBLISH_REASONS.find(value=>value===body.reason),note=body.note??null;
 if(!reason)throw new TopicError('invalid_body:reason');
 if(note!==null&&(typeof note!=='string'||note.length>200||/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{64}/i.test(note)))throw new TopicError('invalid_body:note');
 return {reason,note};
}
type Withdrawal={topicId:string;reason:UnpublishReason;note:string|null;actor:string};
export async function unpublishTopic(d:AdminDeps,i:Withdrawal){
 try{return await d.db.unpublish({...i,...withdrawalFields(i)});}catch(e){throw transitionError(e);}
}
export async function retireTopic(d:AdminDeps,i:Withdrawal){
 try{await d.db.retire({...i,...withdrawalFields(i)});return {retired:true};}catch(e){throw transitionError(e);}
}

// T6.8: project admin version history without serializing snapshots or private notes.
export function versionRows(topic:TopicRow,versions:readonly TopicVersionRow[],driftByVersion:ReadonlyMap<string,readonly DriftRow[]>){
 return [...versions].sort((a,b)=>b.version_no-a.version_no).map(v=>{
  const drift={revised:0,newer_period:0,retracted:0,now_withheld:0,unverifiable:0};
  for(const row of driftByVersion.get(v.version_id)??[])if(row.drift!=='unchanged')drift[row.drift]++;
  const status:'unpublished'|'current'|'superseded'=v.unpublished_at!==null?'unpublished':v.version_id===topic.current_version_id?'current':'superseded';
  return {version_no:v.version_no,version_id:v.version_id,published_at:v.published_at,cutoff:v.cutoff,status,unpublish_reason:v.unpublish_reason,counts:v.snapshot.counts,drift};
 });
}
export async function loadVersionRows(db:TopicsDb,topic:TopicRow){
 const versions=await db.versionsOfTopic(topic.topic_id);
 const drift=await Promise.all(versions.map(async v=>[v.version_id,await db.driftOf(v.version_id)] as const));
 return versionRows(topic,versions,new Map(drift));
}
