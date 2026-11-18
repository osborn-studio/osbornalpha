// Topic storage over service RPCs and session views (spec §4.9).
// Module-owned transport types keep the shared Database hashing closure unchanged.
import type {SupabaseClient} from '@supabase/supabase-js';
import {canonicalJson} from '@/lib/evidence/hash';
import {TopicsDbError,type TopicsDb} from './types';
import type {TopicDraftRow,TopicEvidenceDriftRow,TopicPromotionRow,TopicRow,TopicVersionRow} from './database-types';
type Row=Record<string,unknown>;
export interface TopicRead{table:string;columns?:string[];public?:boolean;match?:Row;order:string[];desc?:boolean;limit?:number;live?:boolean;after?:{version_id:string;ordinal:number}|null}
export interface TopicsTransport{read<T>(q:TopicRead):Promise<T[]>;rpc<T>(name:string,args:Row):Promise<T>}
export function topicDbError(e:unknown):TopicsDbError{
 if(e instanceof TopicsDbError)return e;
 const message=e&&typeof e==='object'&&'message' in e?String(e.message):String(e);
 return new TopicsDbError(message.split(' ')[0]);
}
const timestamps=new Set(['created_at','updated_at','retired_at','published_at','unpublished_at','cutoff','as_of','checked_at','drift_checked_at','decided_at','claimed_at','finished_at','approved_at']);
const numbers=new Set(['id','revision','version_no','ordinal','current_version_no','draft_revision','current_version_no','revised_count']);
export function topicRow<T>(raw:Row):T{
 const row={...raw};
 for(const [key,value] of Object.entries(row))if(value!==null&&value!==undefined){
  if(timestamps.has(key))row[key]=(value instanceof Date?value:new Date(String(value))).toISOString();
  else if(numbers.has(key))row[key]=Number(value);
 }
 delete row.topic_versions;
 return row as T;
}
/** Common port mapping; transports own authorization, filtering and pagination. */
export function topicsAdapter(t:TopicsTransport):TopicsDb{
 const read=<T>(table:string,match:Row={},order=['topic_id'],extra:Partial<TopicRead>={})=>t.read<T>({table,match,order,...extra});
 const one=async<T>(table:string,match:Row,order:string[],extra:Partial<TopicRead>={})=>(await read<T>(table,match,order,{...extra,limit:1}))[0]??null;
 return {
  createTopic:i=>t.rpc('topic_create',{p_slug:i.slug,p_category:i.category,p_body_text:canonicalJson(i.body),p_actor:i.actor}),
  topicById:id=>one('topics',{topic_id:id},['topic_id']),
  async adminTopics(){
   const [topics,drafts,versions,drifts,promotions]=await Promise.all([
    read<TopicRow>('topics'),read<TopicDraftRow>('topic_drafts'),read<TopicVersionRow>('topic_versions',{},['version_id']),read<TopicEvidenceDriftRow>('topic_evidence_drift',{},['version_id','ordinal']),read<TopicPromotionRow>('topic_promotions',{},['promotion_id']),
   ]);
   return topics.map(t=>{const d=drafts.find(d=>d.topic_id===t.topic_id);return {...t,title:d?.body.title??{zh:'',en:''},draft_revision:d?.revision??0,current_version_no:versions.find(v=>v.version_id===t.current_version_id)?.version_no??null,revised_count:drifts.filter(d=>d.version_id===t.current_version_id&&d.drift==='revised').length,promoted:promotions.some(p=>p.topic_id===t.topic_id)};});
  },
  draftOf:id=>one('topic_drafts',{topic_id:id},['draft_id']),
  saveDraft:i=>t.rpc('topic_save_draft',{p_topic_id:i.topicId,p_expected_revision:i.expectedRevision,p_body_text:canonicalJson(i.body),p_actor:i.actor}),
  recordDisclosure:i=>t.rpc('topic_record_disclosure',{p_topic_id:i.topicId,p_draft_hash:i.draftHash,p_checks:i.checks,p_passed:i.passed,p_code_version:i.codeVersion,p_actor:i.actor}),
  receiptById:id=>one('topic_disclosure_receipts',{receipt_id:id},['receipt_id']),
  latestReceipt:(id,hash)=>one('topic_disclosure_receipts',{topic_id:id,draft_hash:hash},['created_at','receipt_id'],{desc:true}),
  publish:i=>t.rpc('topic_publish',{p_topic_id:i.topicId,p_expected_draft_hash:i.expectedDraftHash,p_snapshot_text:i.snapshotText,p_evidence:i.evidence,p_summary_id:i.summaryId,p_receipt_id:i.receiptId,p_cutoff:i.cutoff,p_actor:i.actor}),
  unpublish:i=>t.rpc('topic_unpublish',{p_topic_id:i.topicId,p_reason:i.reason,p_note:i.note,p_actor:i.actor}),
  async retire(i){await t.rpc('topic_retire',{p_topic_id:i.topicId,p_reason:i.reason,p_note:i.note,p_actor:i.actor});},
  async settings(){const row=await one<Awaited<ReturnType<TopicsDb['settings']>>>('topic_settings',{id:1},['id']);if(!row)throw new TopicsDbError('not_found');return row;},
  setPublicEnabled:i=>t.rpc('topic_set_public_enabled',{p_public_enabled:i.publicEnabled,p_summary_public_enabled:i.summaryPublicEnabled,p_summary_provider_note:i.summaryProviderNote,p_licence_confirmations:i.licenceConfirmations,p_actor:i.actor}),
  versionById:id=>one('topic_versions',{version_id:id},['version_id']),
  versionsOfTopic:id=>read('topic_versions',{topic_id:id},['version_no']),
  liveVersionRefs:()=>read('topic_versions',{unpublished_at:null},['version_id'],{columns:['topic_id','version_id','version_no']}),
  liveEvidence:(after,limit)=>read('topic_version_evidence',{},['version_id','ordinal'],{live:true,after,limit}),
  async upsertDrift(rows,checkedAt,complete,cursor){return Number(await t.rpc('topic_upsert_drift',{p_rows:rows,p_checked_at:checkedAt,p_complete:complete,p_cursor:cursor}));},
  async recordEvent(i){await t.rpc('topic_record_event',{p_topic_id:i.topicId,p_actor:i.actor,p_action:i.action,p_detail:i.detail});},
  driftOf:id=>read('topic_evidence_drift',{version_id:id},['ordinal']),
  auditOf:id=>read('topic_audit_log',{topic_id:id},['id']),
  async publicOpen(){return (await read('topics_open_v',{},[],{public:true,limit:1})).length>0;},
  publicTopics:()=>read('topics_public_v',{},['topic_slug'],{public:true}),
  publicTopicBySlug:slug=>one('topics_public_v',{topic_slug:slug},['topic_slug'],{public:true}),
  publicVersions:id=>read('topic_versions_public_v',{topic_id:id},['version_no'],{public:true}),
  publicDrift:id=>read('topic_evidence_drift_public_v',{version_id:id},['ordinal'],{public:true}),
 };
}
export function supabaseTopicsDb({admin,session}:{admin?:SupabaseClient;session?:SupabaseClient}):TopicsDb{
 return topicsAdapter({
  async rpc<T>(name:string,args:Row):Promise<T>{
   if(!admin)throw new TopicsDbError('client_unavailable');
   const {data,error}=await admin.rpc(name,args);if(error)throw topicDbError(error);
   return data!==null&&typeof data==='object'&&!Array.isArray(data)?topicRow<T>(data as Row):data as T;
  },
  async read<T>(r:TopicRead):Promise<T[]>{
   const client=r.public?session:admin;if(!client)throw new TopicsDbError('client_unavailable');
   const out:T[]=[];
   // Continue until an empty page: a hosted row cap may be below the requested range.
   while(r.limit===undefined||out.length<r.limit){
    let q=client.from(r.table).select(r.live?'*,topic_versions!inner(unpublished_at)':r.columns?.join(',')??'*');
    for(const [key,value] of Object.entries(r.match??{}))q=value===null?q.is(key,null):q.eq(key,value);
    if(r.live)q=q.is('topic_versions.unpublished_at',null);
    if(r.after){
     if(!/^[0-9a-f-]{36}$/.test(r.after.version_id)||!Number.isInteger(r.after.ordinal))throw new TopicsDbError('invalid_parameter:cursor');
     q=q.or(`version_id.gt.${r.after.version_id},and(version_id.eq.${r.after.version_id},ordinal.gt.${r.after.ordinal})`);
    }
    for(const key of r.order)q=q.order(key,{ascending:!r.desc});
    const size=Math.min(1000,(r.limit??Infinity)-out.length);
    const {data,error}=await q.range(out.length,out.length+size-1);if(error)throw topicDbError(error);
    if(!data?.length)break;out.push(...data.map(row=>topicRow<T>(row as unknown as Row)));
   }
   return out;
  },
 });
}
