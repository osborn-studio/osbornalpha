// Topic public dependency wiring and service preview projection (spec §6).
import type {SupabaseClient} from '@supabase/supabase-js';
import {getServerSupabase} from '@/lib/supabase/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTopicsDb} from './db';
import type {TopicsDb} from './types';
import type {PublicTopicRow} from './database-types';
export interface PublicDeps{db:Pick<TopicsDb,'publicOpen'|'publicTopics'|'publicTopicBySlug'|'publicVersions'|'publicDrift'>;now():Date;preview:boolean}
export async function publicDeps():Promise<PublicDeps>{
 return {db:supabaseTopicsDb({session:await getServerSupabase() as unknown as SupabaseClient}),now:()=>new Date(),preview:false};
}
export function previewDeps():PublicDeps{
 const db=supabaseTopicsDb({admin:getAdminSupabase()});
 const publicTopics=async():Promise<PublicTopicRow[]>=>{
  const [topics,settings]=await Promise.all([db.adminTopics(),db.settings()]);
  return Promise.all(topics.filter(t=>t.status!=='draft').map(async t=>{
   const versions=await db.versionsOfTopic(t.topic_id);
   const v=versions.find(v=>v.version_id===t.current_version_id&&v.unpublished_at===null);
   return {topic_id:t.topic_id,topic_slug:t.topic_slug,category:t.category,status:t.status,retired_reason:t.retired_reason,
    current_version_id:v?.version_id??null,version_no:v?.version_no??null,published_at:v?.published_at??null,cutoff:v?.cutoff??null,
    title_zh:v?.snapshot.topic.title.zh??null,title_en:v?.snapshot.topic.title.en??null,dek_zh:v?.snapshot.topic.dek.zh??null,dek_en:v?.snapshot.topic.dek.en??null,
    evidence_counts:v?.snapshot.counts??null,drift_checked_at:settings.drift_checked_at};
  }));
 };
 return {preview:true,now:()=>new Date(),db:{
  publicOpen:async()=>true,publicTopics,
  publicTopicBySlug:async slug=>(await publicTopics()).find(t=>t.topic_slug===slug)??null,
  async publicVersions(id){
   const topic=(await db.adminTopics()).find(t=>t.topic_id===id&&t.status!=='draft');if(!topic)return [];
   return (await db.versionsOfTopic(id)).map(v=>({version_id:v.version_id,topic_id:id,topic_slug:topic.topic_slug,version_no:v.version_no,
    cutoff:v.cutoff,published_at:v.published_at,supersedes_version_id:v.supersedes_version_id,unpublished_at:v.unpublished_at,
    unpublish_reason:v.unpublish_reason,snapshot_hash:v.snapshot_hash,snapshot:v.unpublished_at===null?v.snapshot:null}));
  },
  async publicDrift(id){
   for(const topic of (await db.adminTopics()).filter(t=>t.status!=='draft')){
    if((await db.versionsOfTopic(topic.topic_id)).some(v=>v.version_id===id&&v.unpublished_at===null)){
     return (await db.driftOf(id)).map(row=>{
      // All adapters return the base row timestamp, though the port types only DriftRow.
      if(!('checked_at' in row)||typeof row.checked_at!=='string')throw new Error('drift_checked_at_missing');
      return {...row,checked_at:row.checked_at};
     });
    }
   }
   return [];
  },
 }};
}
