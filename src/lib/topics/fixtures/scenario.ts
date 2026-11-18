// Topic plan T6.7: one clock and mutable source seed for publication and replay.
import {memoryResolver} from '@/lib/evidence';
import {allFixtures} from '@/lib/evidence/fixtures';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {FACT} from '@/lib/evidence/fixtures/facts';
import {DOC} from '@/lib/evidence/fixtures/documents';
import {memorySources} from '@/lib/evidence/memory-sources';
import type {AdminDeps} from '../admin-deps';
import {memoryCandidateLookup} from '../evidence-search';
import {memoryTopicsDb} from '../memory-db';
import {emptyDraft} from '../drafts';

export const actor='00000000-0000-4000-8000-000000000001';
export const settingsBody={public_enabled:true,summary_public_enabled:false,summary_provider_note:null,licence_confirmations:{}};
export const confirmations=(keys:string[])=>Object.fromEntries(keys.map(k=>[k,{terms_url:'https://example.org/terms',confirmed_on:'2026-11-15'}]));
export async function scenario(macroOnly=false){
 const db=memoryTopicsDb(),sources=memorySources(allFixtures()),now=()=>new Date('2026-11-15T00:00:00Z');db.now(now());
 const deps:AdminDeps={db,now,resolver:memoryResolver(sources.seed),lookup:memoryCandidateLookup(sources),codeVersion:'fixture',privateIds:async()=>new Set()};
 const slug='unemployment',title={zh:'失业率',en:'Unemployment'},body=emptyDraft(title);
 const refs=[['macro_observation',OBS.unrateV1],['financial_fact',FACT.usOk],['financial_fact',FACT.cnPending],['document_citation',DOC.ok]] as const;
 body.evidence=refs.slice(0,macroOnly?1:refs.length).map(([kind,id],n)=>({ordinal:n+1,ref:{v:1,kind,id},section_key:'data'}));
 body.expected_slots=[{key:'industry',kind:'industry_metric',label:{zh:'行业指标',en:'Industry metric'},reason_code:'industry_not_published'}];
 body.sections=[{key:'data',title,note:null,items:[...body.evidence.map(({ordinal})=>({ordinal})),{expected_slot:'industry'}]}];
 const {topic_id:topicId}=await db.createTopic({slug,category:'macro',actor,body});
 return {deps,topicId,sources,slug,pub:()=>({db,now,preview:false})};
}
export const hashOf=async(d:AdminDeps,id:string)=>(await d.db.draftOf(id))!.draft_hash;
export function revisionOf(sources:ReturnType<typeof memorySources>,id:string,observation_id:string,value_text:string){
 const prior=sources.seed.macro.rows.find(r=>r.observation_id===id)!;
 return {...prior,observation_id,value_text,version:prior.version+1,available_at:'2026-11-16T00:00:00.000Z',ingested_at:'2026-11-16T00:00:00.000Z'};
}
