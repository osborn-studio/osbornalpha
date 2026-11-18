// In-memory topic function rules and public projections (spec §4.2–§4.9).
import {randomUUID} from 'node:crypto';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {CATEGORIES,UNPUBLISH_REASONS,TopicsDbError,type TopicsDb,type TopicSnapshot} from './types';
import type {PublicTopicRow,TopicAuditRow,TopicDisclosureReceiptRow,TopicDraftRow,TopicEvidenceDriftRow,TopicRow,TopicSettingsRow,TopicVersionEvidenceRow,TopicVersionRow} from './database-types';
const copy=<T>(x:T):T=>structuredClone(x);
const fail=(code:string):never=>{throw new TopicsDbError(code);};
export function memoryTopicsDb():TopicsDb&{setPublicFlag(on:boolean):void;now(d:Date):void}{
 let clock:Date|null=null;const now=()=> (clock??new Date()).toISOString();
 const topics:TopicRow[]=[],drafts:TopicDraftRow[]=[],versions:TopicVersionRow[]=[],evidence:TopicVersionEvidenceRow[]=[],receipts:TopicDisclosureReceiptRow[]=[],audits:TopicAuditRow[]=[],drifts:TopicEvidenceDriftRow[]=[];
 const settings:TopicSettingsRow={id:1,public_enabled:false,summary_public_enabled:false,summary_provider_note:null,drift_checked_at:null,drift_cursor:null,updated_by:null,updated_at:now()};
 const actor=(a:string)=>{if(a==null)fail('invalid_actor');};
 const topic=(id:string)=>topics.find(t=>t.topic_id===id)??fail('not_found');
 const audit=(id:string|null,a:string,action:TopicAuditRow['action'],detail:Record<string,unknown>)=>{audits.push({id:audits.length+1,topic_id:id,actor:a,action,detail:copy(detail),created_at:now()});};
 const note=(s:string|null)=>{if(s!==null&&(s.length>200||/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)||/[0-9a-f]{64}/.test(s)))fail('invalid_note');};
 const reason=(r:string)=>{if(!UNPUBLISH_REASONS.includes(r as typeof UNPUBLISH_REASONS[number]))fail('invalid_reason');};
 const publicTopics=():PublicTopicRow[]=>settings.public_enabled?topics.filter(t=>t.status!=='draft').map(t=>{
  const v=versions.find(v=>v.version_id===t.current_version_id&&v.unpublished_at===null);
  return {topic_id:t.topic_id,topic_slug:t.topic_slug,category:t.category,status:t.status,retired_reason:t.retired_reason,current_version_id:v?.version_id??null,version_no:v?.version_no??null,published_at:v?.published_at??null,cutoff:v?.cutoff??null,title_zh:v?.snapshot.topic.title.zh??null,title_en:v?.snapshot.topic.title.en??null,dek_zh:v?.snapshot.topic.dek.zh??null,dek_en:v?.snapshot.topic.dek.en??null,evidence_counts:v?.snapshot.counts??null,drift_checked_at:settings.drift_checked_at};
 }):[];
 return {
  setPublicFlag(on){settings.public_enabled=on;},now(d){clock=new Date(d);},
  async createTopic(i){
   actor(i.actor);
   if(topics.some(t=>t.topic_slug===i.slug))fail('slug_taken');
   if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(i.slug)||i.slug.length<3||i.slug.length>64)fail('topics_slug_shape');
   if(!CATEGORIES.includes(i.category))fail('topics_category');
   const topic_id=randomUUID(),body_text=canonicalJson(i.body),draft_hash=sha256Hex(body_text);
   topics.push({topic_id,topic_slug:i.slug,category:i.category,status:'draft',current_version_id:null,retired_at:null,retired_reason:null,created_by:i.actor,created_at:now()});
   drafts.push({draft_id:randomUUID(),topic_id,revision:1,body:JSON.parse(body_text),body_text,draft_hash,updated_by:i.actor,updated_at:now()});
   audit(topic_id,i.actor,'create',{revision:1,draft_hash});return {topic_id,revision:1,draft_hash};
  },
  async topicById(id){return copy(topics.find(t=>t.topic_id===id)??null);},
  async adminTopics(){return copy(topics.map(t=>{const d=drafts.find(d=>d.topic_id===t.topic_id)!;return {...t,title:d.body.title,draft_revision:d.revision,current_version_no:versions.find(v=>v.version_id===t.current_version_id)?.version_no??null,revised_count:drifts.filter(d=>d.version_id===t.current_version_id&&d.drift==='revised').length,promoted:false};}));},
  async draftOf(id){return copy(drafts.find(d=>d.topic_id===id)??null);},
  async saveDraft(i){
   actor(i.actor);if(topic(i.topicId).status==='retired')fail('topic_retired');
   const d=drafts.find(d=>d.topic_id===i.topicId)??fail('not_found');if(d.revision!==i.expectedRevision)fail('revision_conflict');
   const body_text=canonicalJson(i.body),draft_hash=sha256Hex(body_text);
   Object.assign(d,{revision:d.revision+1,body:JSON.parse(body_text),body_text,draft_hash,updated_by:i.actor,updated_at:now()});
   audit(i.topicId,i.actor,'draft_save',{revision:d.revision,draft_hash});return {revision:d.revision,draft_hash};
  },
  async recordDisclosure(i){
   actor(i.actor);topic(i.topicId);const receipt_id=randomUUID();
   receipts.push({receipt_id,topic_id:i.topicId,draft_hash:i.draftHash,checks:copy(i.checks),passed:i.passed,code_version:i.codeVersion,actor:i.actor,created_at:now()});
   audit(i.topicId,i.actor,'disclosure_check',{receipt_id,passed:i.passed,blocked:i.checks.filter(c=>c.result==='block').flatMap(c=>c.codes)});return receipt_id;
  },
  async receiptById(id){return copy(receipts.find(r=>r.receipt_id===id)??null);},
  async latestReceipt(id,hash){return copy(receipts.filter(r=>r.topic_id===id&&r.draft_hash===hash).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.receipt_id.localeCompare(a.receipt_id))[0]??null);},
  async publish(i){
   actor(i.actor);const t=topic(i.topicId);if(t.status==='retired')fail('topic_retired');
   const d=drafts.find(d=>d.topic_id===i.topicId);if(d?.draft_hash!==i.expectedDraftHash)fail('publish_blocked:draft_changed');
   const r=receipts.find(r=>r.receipt_id===i.receiptId);if(!r||r.topic_id!==i.topicId||!r.passed||r.draft_hash!==d?.draft_hash)fail('publish_blocked:disclosure_receipt');
   if(i.snapshotText.includes('"admin_only"'))fail('publish_blocked:admin_projection');
   const snapshot=JSON.parse(i.snapshotText) as TopicSnapshot;
   if(snapshot.evidence.some(e=>e.resolved.state!=='ok'&&e.resolved.display?.fact!=null))fail('publish_blocked:restricted_value');
   if(snapshot.evidence.length!==i.evidence.length||snapshot.evidence.some((e,n)=>e.ref_hash!==i.evidence[n].ref_hash||e.ordinal!==i.evidence[n].ordinal||e.resolved.state!==i.evidence[n].state))fail('publish_blocked:evidence_mismatch');
   if(i.evidence.some(e=>Date.parse(e.as_of)>Date.parse(i.cutoff)))fail('publish_blocked:as_of_after_cutoff');
   if(i.summaryId!==null){if(!settings.summary_public_enabled)fail('publish_blocked:summary_provider_unconfirmed');fail('publish_blocked:summary_mismatch');}
   const ordinals=new Set<number>(),hashes=new Set<string>();
   for(const e of i.evidence){
    if(!Number.isInteger(e.ordinal)||e.ordinal<1||ordinals.has(e.ordinal)||hashes.has(e.ref_hash))fail('evidence_constraint');
    if(!/^[0-9a-f]{64}$/.test(e.ref_hash)||(e.state==='ok')!==(e.digest!==null)||(e.digest!==null&&!/^[0-9a-f]{64}$/.test(e.digest)))fail('evidence_constraint');
    ordinals.add(e.ordinal);hashes.add(e.ref_hash);
   }
   const cutoff=new Date(i.cutoff).toISOString(),version_id=randomUUID(),version_no=Math.max(0,...versions.filter(v=>v.topic_id===i.topicId).map(v=>v.version_no))+1;
   const rows=i.evidence.map(e=>({...copy(e),version_id,as_of:new Date(e.as_of).toISOString()}));
   versions.push({version_id,topic_id:i.topicId,version_no,contract_version:'evidence-ref/1',cutoff,snapshot,snapshot_text:i.snapshotText,snapshot_hash:sha256Hex(i.snapshotText),summary_id:i.summaryId,disclosure_receipt_id:i.receiptId,promotion_id:null,published_at:now(),published_by:i.actor,supersedes_version_id:t.current_version_id,unpublished_at:null,unpublish_reason:null});
   evidence.push(...rows);t.current_version_id=version_id;t.status='published';
   audit(i.topicId,i.actor,'publish',{version_no,evidence:rows.length,receipt_id:i.receiptId});return {version_id,version_no};
  },
  async unpublish(i){
   actor(i.actor);note(i.note);const t=topic(i.topicId);if(!t.current_version_id)fail('not_published');reason(i.reason);
   const v=versions.find(v=>v.version_id===t.current_version_id)!;if(v.unpublished_at!==null)fail('append_only:topic_versions');
   v.unpublished_at=now();v.unpublish_reason=i.reason;
   const prev=versions.filter(v=>v.topic_id===i.topicId&&v.unpublished_at===null).sort((a,b)=>b.version_no-a.version_no)[0];
   t.current_version_id=prev?.version_id??null;if(!prev&&t.status!=='retired')t.status='unpublished';
   audit(i.topicId,i.actor,'unpublish',{version_no:v.version_no,reason:i.reason,note:i.note});return {current_version_no:prev?.version_no??null};
  },
  async retire(i){actor(i.actor);note(i.note);const t=topic(i.topicId);if(t.status==='retired')fail('topic_retired');reason(i.reason);t.status='retired';t.retired_at=now();t.retired_reason=i.reason;audit(i.topicId,i.actor,'retire',{reason:i.reason,note:i.note});},
  async settings(){return copy(settings);},
  async setPublicEnabled(i){
   actor(i.actor);
   if(i.publicEnabled)for(const t of topics.filter(t=>t.status==='published')){
    const v=versions.find(v=>v.version_id===t.current_version_id)!;
    for(const e of v.snapshot.evidence.filter(e=>e.resolved.state==='ok')){
     const drawer=e.resolved.drawer;const key=drawer&&'attribution_key' in drawer?drawer.attribution_key:null;
     const c=key?i.licenceConfirmations[key]:null;if(!c?.terms_url.trim()||!c?.confirmed_on.trim())fail('licence_confirmation_missing');
    }
   }
   if(i.summaryProviderNote!==null&&(i.summaryProviderNote.length<1||i.summaryProviderNote.length>500))fail('topic_settings_note');
   if(i.summaryPublicEnabled&&i.summaryProviderNote===null)fail('topic_settings_summary_note');
   Object.assign(settings,{public_enabled:i.publicEnabled,summary_public_enabled:i.summaryPublicEnabled,summary_provider_note:i.summaryProviderNote,updated_by:i.actor,updated_at:now()});
   audit(null,i.actor,'settings_change',{public_enabled:i.publicEnabled,summary_public_enabled:i.summaryPublicEnabled,summary_provider_note:i.summaryProviderNote,licence_confirmations:i.licenceConfirmations});return copy(settings);
  },
  async versionsOfTopic(id){return copy(versions.filter(v=>v.topic_id===id).sort((a,b)=>a.version_no-b.version_no));},
  async liveEvidence(after,limit){return copy(evidence.filter(e=>versions.some(v=>v.version_id===e.version_id&&v.unpublished_at===null)&&(!after||e.version_id>after.version_id||(e.version_id===after.version_id&&e.ordinal>after.ordinal))).sort((a,b)=>a.version_id.localeCompare(b.version_id)||a.ordinal-b.ordinal).slice(0,limit));},
  async upsertDrift(rows,checkedAt,complete,cursor){
   const checked_at=new Date(checkedAt).toISOString();
   for(const r of rows)if(!evidence.some(e=>e.version_id===r.version_id&&e.ordinal===r.ordinal))fail('drift_evidence_missing');
   for(const r of rows){const old=drifts.find(d=>d.version_id===r.version_id&&d.ordinal===r.ordinal);if(old)Object.assign(old,copy(r),{checked_at});else drifts.push({...copy(r),checked_at});}
   if(complete){settings.drift_checked_at=checked_at;settings.drift_cursor=null;}else settings.drift_cursor=copy(cursor);return rows.length;
  },
  async recordEvent(i){actor(i.actor);if(!['preview','replay_verify'].includes(i.action))fail('invalid_action');audit(i.topicId,i.actor,i.action,i.detail);},
  async driftOf(id){return copy(drifts.filter(d=>d.version_id===id).sort((a,b)=>a.ordinal-b.ordinal));},
  async auditOf(id){return copy(audits.filter(a=>a.topic_id===id));},
  async publicOpen(){return settings.public_enabled;},
  async publicTopics(){return copy(publicTopics());},
  async publicTopicBySlug(slug){return copy(publicTopics().find(t=>t.topic_slug===slug)??null);},
  async publicVersions(id){return settings.public_enabled?copy(versions.filter(v=>v.topic_id===id).sort((a,b)=>a.version_no-b.version_no).map(v=>({version_id:v.version_id,topic_id:v.topic_id,topic_slug:topic(id).topic_slug,version_no:v.version_no,cutoff:v.cutoff,published_at:v.published_at,supersedes_version_id:v.supersedes_version_id,unpublished_at:v.unpublished_at,unpublish_reason:v.unpublish_reason,snapshot_hash:v.snapshot_hash,snapshot:v.unpublished_at===null?v.snapshot:null}))):[];},
  async publicDrift(id){return settings.public_enabled&&versions.some(v=>v.version_id===id&&v.unpublished_at===null)?copy(drifts.filter(d=>d.version_id===id).sort((a,b)=>a.ordinal-b.ordinal)):[];},
 };
}
