import {expect,it,vi} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {requireResearchUser} from '@/lib/research/store';
import {actor,scenario} from './fixtures/scenario';
import {emptyDraft} from './drafts';
import {checkDraft} from './publish';
vi.mock('@/lib/research/store',()=>({requireResearchUser:vi.fn()}));
const thesisId='00000000-0000-4000-8000-000000000abc';
const source={title:'Liquidity',body:'Liquidity changed by 3',supporting_evidence_ids:['private-source'],invalidation_conditions:[],watch_metrics:{secret:true},
 pillars:[{},{}],catalysts:[],kill_condition_revisions:null,company_ids:['private-company'],theme_ids:[],last_assessment:'private-assessment'};
const input={thesisId,slug:'liquidity',category:'macro' as const,actor};
it('A11 copies two fields and records only their hash, field names and counts',async()=>{
 const {promoteThesis,sessionThesisReader}=await import('./promote');
 const {deps}=await scenario();
 const select=vi.fn((columns:string)=>({eq:(field:string,id:string)=>({maybeSingle:async()=>{
  expect([field,id]).toEqual(['id',thesisId]);
  return {data:Object.fromEntries(columns.split(',').map(k=>[k,source[k as keyof typeof source]])),error:null};
 }})}));
 vi.mocked(requireResearchUser).mockResolvedValue({userId:actor,supabase:{from:()=>({select})}});
 const result=await promoteThesis({...deps,thesis:await sessionThesisReader(actor)},input);
 const title={zh:source.title,en:source.title},body={zh:source.body,en:source.body};
 expect((await deps.db.draftOf(result.topic_id))?.body).toEqual({...emptyDraft(title),entries:[{key:'from-thesis',entry_type:'owner_note',body}],
  blocks_provenance:{title:'from_thesis','entry.from-thesis':'from_thesis'}});
 const counts={supporting_evidence_ids:1,invalidation_conditions:0,watch_metrics:1,pillars:2,catalysts:0,kill_condition_revisions:0,company_ids:1,theme_ids:0,
  last_assessment:null,status:null,next_review_at:null};
 expect(result.stripped).toEqual(Object.entries(counts).map(([field,count])=>({field,count})));
 const row=await deps.db.promotionOf(result.topic_id);
 expect(row).toMatchObject({source_id:thesisId,promotion_id:result.promotion_id,source_content_hash:sha256Hex(canonicalJson({title:source.title,body:source.body})),
  copied:{fields:['title','body'],at:deps.now().toISOString()},stripped:result.stripped});
 expect(JSON.stringify([row,await deps.db.auditOf(result.topic_id)])).not.toMatch(/private-source|private-company|private-assessment|Liquidity|secret/);
 expect((await checkDraft(deps,{topicId:result.topic_id,actor})).blocked).toEqual(expect.arrayContaining(['unreviewed_private_block','numeral_in_owner_text']));
});
it.each(['copy','counts'])('creates nothing when %s is unreadable',async missing=>{
 const {promoteThesis}=await import('./promote');
 const {deps}=await scenario(),before=await deps.db.adminTopics();
 await expect(promoteThesis({...deps,thesis:{copy:async()=>missing==='copy'?null:source,counts:async()=>null}},input)).rejects.toMatchObject({code:'not_found',status:404});
 expect(await deps.db.adminTopics()).toEqual(before);
});
