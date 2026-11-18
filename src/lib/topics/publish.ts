// Topic plan T6.4–T6.6: disclosure receipts, public previews and version transitions.
import type {AdminDeps} from './admin-deps';
import {adminActor,enumField} from './admin-route';
import {assemble,type Assembled} from './assemble';
import {runDisclosure} from './disclosure';
import {TopicError} from './errors';
import {valueText} from './evidence-search';
import {maskSnapshot} from './masking';
import type {DossierDto} from './public-dto';
import {licenceProblems,withLicenceCheck} from './settings';
import {TopicsDbError,UNPUBLISH_REASONS,type UnpublishReason} from './types';

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
 return {receipt_id,...result};
}
export async function previewDraft(d:AdminDeps,i:{topicId:string;actor?:string}){
 const input=await load(d,i.topicId);
 const [assembled,versions]=await Promise.all([assemble(d,input),d.db.versionsOfTopic(i.topicId)]);
 const {snapshot:s,adminResolved,maskedInPublic,degraded}=assembled,{summary,evidence}=maskSnapshot(s,new Map(),'current');
 const version_no=versions.reduce((max,v)=>Math.max(max,v.version_no),0)+1;
 const dossier:DossierDto={topic:s.topic,version:{version_no,published_at:input.cutoff,cutoff:input.cutoff,is_current:true,superseded:false,unpublished_at:null,unpublish_reason:null},
  total_versions:versions.length+1,current_version_no:versions.find(v=>v.version_id===input.currentVersionId)?.version_no??null,view:'current',replay_as_of:null,
  sections:s.sections,evidence,expected_slots:s.expected_slots,entries:s.entries,summary,counts:s.counts,freshness_at_publication:s.freshness_at_publication,
  stale:false,age_days:0,drift_checked_at:null,drift_unchecked:true};
 const difference=s.evidence.map(({ordinal,resolved},n)=>({ordinal,label:resolved.display.label,
  public:{state:resolved.state,text:valueText(resolved,'zh')},admin:{text:valueText(adminResolved[n],'zh')}}));
 const masked=maskedInPublic.length;
 await d.db.recordEvent({topicId:i.topicId,actor:i.actor??await adminActor(),action:'preview',detail:{draft_hash:input.draftHash,masked}});
 return {dossier,difference,masked,degraded,counts:s.counts};
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
 return new TopicError(codes[e.code]??e.code);
}
export function withdrawalFields(body:Record<string,unknown>){
 const reason=enumField(body,'reason',UNPUBLISH_REASONS),note=body.note??null;
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
