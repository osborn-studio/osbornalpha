// Private thesis projection and explicit promotion (spec §4.7, X9).
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import type {ResearchSupabase} from '@/lib/research/store';
import {emptyDraft,parseDraftBody} from './drafts';
import {TopicError} from './errors';
import {researchSession} from './private-ids';
import type {Category,TopicsDb} from './types';

export const PROMOTION_COPY_COLUMNS='title,body';
export const PROMOTION_COUNT_COLUMNS='supporting_evidence_ids,invalidation_conditions,watch_metrics,pillars,catalysts,kill_condition_revisions,company_ids,theme_ids';
export const STRIPPED_SCALARS=['last_assessment','status','next_review_at'] as const;
export interface ThesisReader{
 copy(thesisId:string):Promise<{title:string;body:string}|null>;
 counts(thesisId:string):Promise<Record<string,number>|null>;
}
export function thesisReader(supabase:ResearchSupabase):ThesisReader{
 return {
  async copy(id){
   try{
    const {data,error}=await supabase.from('research_theses').select(PROMOTION_COPY_COLUMNS).eq('id',id).maybeSingle();
    if(error)throw new Error();
    return data?{title:data.title,body:data.body}:null;
   }catch{throw new Error('private_read_failed');}
  },
  async counts(id){
   try{
    const {data,error}=await supabase.from('research_theses').select(PROMOTION_COUNT_COLUMNS).eq('id',id).maybeSingle();
    if(error)throw new Error();
    if(!data)return null;
    return Object.fromEntries(PROMOTION_COUNT_COLUMNS.split(',').map(field=>{
     const v=data[field];
     return [field,Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:0];
    }));
   }catch{throw new Error('private_read_failed');}
  },
 };
}
export async function sessionThesisReader(actor:string):Promise<ThesisReader>{
 return thesisReader(await researchSession(actor));
}
export async function promoteThesis(d:{db:TopicsDb;thesis:ThesisReader;now():Date},i:{thesisId:string;slug:string;category:Category;actor:string}){
 const source=await d.thesis.copy(i.thesisId);
 if(!source)throw new TopicError('not_found');
 const counts=await d.thesis.counts(i.thesisId);
 if(!counts)throw new TopicError('not_found');
 const stripped:{field:string;count:number|null}[]=PROMOTION_COUNT_COLUMNS.split(',').map(field=>{
  const count=counts[field];
  if(!Number.isSafeInteger(count)||count<0)throw new Error('private_read_failed');
  return {field,count};
 });
 stripped.push(...STRIPPED_SCALARS.map(field=>({field,count:null})));
 const {title,body}=source;
 const draft=parseDraftBody({...emptyDraft({zh:title,en:title}),entries:[{key:'from-thesis',entry_type:'owner_note',body:{zh:body,en:body}}],
  blocks_provenance:{'entry.from-thesis':'from_thesis',title:'from_thesis'}});
 const sourceContentHash=sha256Hex(canonicalJson({title,body})),at=d.now().toISOString();
 const {topic_id}=await d.db.createTopic({slug:i.slug,category:i.category,body:draft,actor:i.actor});
 const promotion_id=await d.db.recordPromotion({topicId:topic_id,sourceId:i.thesisId,sourceContentHash,copied:{fields:['title','body'],at},stripped,actor:i.actor});
 return {topic_id,promotion_id,stripped};
}
