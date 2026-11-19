import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import type {ModelOutput} from '@/lib/macro/strategy/explain-validate';
import {runValidatedExplanation,type LlmDeps} from '@/lib/macro/strategy/validated-run';
import type {AdminDeps} from '../admin-deps';
import {assemble} from '../assemble';
import {loadDraft} from '../publish';
import type {RenderedSummary} from '../types';
import {factSentences,topicFacts} from './facts';
import {summaryRunStore} from './db';
import {TOPIC_SUMMARY_PROMPTS,TOPIC_SUMMARY_PROMPT_VERSION} from './prompts/topic-summary-v1';
import {TOPIC_VALIDATOR_VERSION,validateTopicSummary} from './validate';

const versions={prompt_version:TOPIC_SUMMARY_PROMPT_VERSION,validator_version:TOPIC_VALIDATOR_VERSION};
export async function handleSummaryRequest(d:AdminDeps&{llm:LlmDeps},actor:string,i:{topicId:string;request_id:string;locale:'zh'|'en'}){
 const {topicId,locale}=i,input=await loadDraft(d,topicId),draft_hash=input.draftHash;
 const subject={topicId,draftHash:draft_hash,locale,promptVersion:versions.prompt_version,validatorVersion:versions.validator_version};
 const identity={actor,requestId:i.request_id,payloadHash:sha256Hex(canonicalJson({topicId,draft_hash,locale}))};
 // Replay uses the stored manifest. Resolve evidence only for a new request.
 const {replay}=summaryRunStore(d.db,{...subject,manifest:{}});
 return runValidatedExplanation({now:d.now,llm:d.llm,replay,async load(){
  const {snapshot}=await assemble(d,input),{facts,incomparable}=topicFacts(snapshot);
  const store=summaryRunStore(d.db,{...subject,manifest:{facts,incomparable,draft_hash}});
  if(!facts.length)return {status:409,body:{error:{code:'no_facts',message:'no_facts'}}};
  return {store,subject:()=>{
   const sentences=factSentences(facts,locale);
   const byId=new Map(sentences.map(f=>[f.fact_id,f.refs])),ids=new Set(byId.keys());
   const point=(fact_ids:string[],text:string)=>({fact_ids,text,refs:[...new Set(fact_ids.flatMap(id=>byId.get(id)!))]});
   return {versions,system:TOPIC_SUMMARY_PROMPTS[locale],user:sentences.map(f=>f.fact_id+': '+f.text).join('\n'),
    usageMeta:{topic_id:topicId},validate:raw=>validateTopicSummary(raw,ids),
    render(raw,provider):RenderedSummary{
     const {points,counterpoints}=raw as ModelOutput;
     return {...versions,...provider,facts:sentences,incomparable,points:points.map(p=>point(p.fact_ids,p.hypothesis)),counterpoints:counterpoints.map(p=>point(p.fact_ids,p.text))};
    }};
  }};
 }},identity);
}
