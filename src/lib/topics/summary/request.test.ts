import {URL as NodeURL} from 'node:url';
import {expect,it,vi} from 'vitest';
import {TOPIC_SUMMARY_PROMPTS} from './prompts/topic-summary-v1';
import {actor,scenario} from '../fixtures/scenario';
import {checkDraft} from '../publish';
import type {LlmDeps} from '@/lib/macro/strategy/validated-run';

async function setup(hypothesis='Demand may adjust.'){
 const {deps,topicId}=await scenario();
 const call=vi.fn(async(_system:string,_user:string)=>({content:JSON.stringify({points:[{hypothesis,fact_ids:['ev:1','ev:2']}],counterpoints:[]}),accounting:null}));
 const llm:LlmDeps={call,resolve:async()=>({model:'model',provider:'fixture',byo:true}),checkQuota:async()=>null,
  begin:async()=>{},finalizePayload:status=>({status}),finalize:async()=>{}};
 const {handleSummaryRequest}=await import('./request');
 const input={topicId,request_id:crypto.randomUUID(),locale:'en' as const};
 return {deps,topicId,call,run:(locale:'zh'|'en'=input.locale)=>handleSummaryRequest({...deps,llm},actor,{...input,locale})};
}
it('sends the exact localized system prompt with a bundler asset URL',async()=>{
 class URL extends NodeURL{
  constructor(path:string,base:string){super(path.endsWith('.md')?'https://localhost/_next/static/prompt.md':path,base);}
 }
 vi.resetModules();
 vi.stubGlobal('URL',URL);
 try{
  for(const locale of ['zh','en'] as const){
   const {run,call}=await setup();
   expect(await run(locale)).toMatchObject({status:200});
   expect(call.mock.calls[0][0]).toBe(TOPIC_SUMMARY_PROMPTS[locale]);
  }
 }finally{vi.unstubAllGlobals();vi.resetModules();}
});
it('sends only public fact lines, freezes citations and replays one model call',async()=>{
 const {call,run,deps,topicId}=await setup();
 const response=await run();
 expect(response).toMatchObject({status:200,body:{state:'accepted',summary:{status:'generated'}}});
 const [summary]=await deps.db.summariesOf(topicId,(await deps.db.draftOf(topicId))!.draft_hash);
 const {facts,points}=summary.rendered;
 expect(facts.map(f=>f.fact_id)).toEqual(['ev:1','ev:2','ev:4']);
 expect(points[0].refs).toEqual([1,2]);
 expect(call.mock.calls[0][1]).toBe(facts.map(f=>f.fact_id+': '+f.text).join('\n'));
 expect(call.mock.calls[0][1]).not.toContain('987654321.12');
 const resolve=vi.spyOn(deps.resolver,'resolve');
 expect(await run()).toEqual(response);expect(resolve).not.toHaveBeenCalled();expect(call).toHaveBeenCalledTimes(1);
 await deps.db.approveSummary({summaryId:summary.summary_id,actor,decision:'approve'});
 const draft=(await deps.db.draftOf(topicId))!;
 draft.body.dek.en='Edited';
 await deps.db.saveDraft({topicId,actor,expectedRevision:draft.revision,body:draft.body});
 expect((await checkDraft(deps,{topicId,actor})).blocked).toContain('summary_mismatch');
});
it('returns a matched fragment for a rejected sentence',async()=>{
 const {run}=await setup('Demand may change by 3.');
 expect(await run()).toMatchObject({status:200,body:{state:'rejected',failure_codes:['numeral'],validation:{failures:[{match:'3'}]}}});
});
it('returns no_facts without calling a provider',async()=>{
 const {run,call,deps,topicId}=await setup();
 const draft=(await deps.db.draftOf(topicId))!;
 draft.body.evidence=[];draft.body.sections=[];
 await deps.db.saveDraft({topicId,actor,expectedRevision:draft.revision,body:draft.body});
 expect(await run()).toMatchObject({status:409,body:{error:{code:'no_facts'}}});
 expect(call).not.toHaveBeenCalled();
});
