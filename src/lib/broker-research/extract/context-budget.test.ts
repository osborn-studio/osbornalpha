import {expect,it,vi} from 'vitest';
import {EXTRACT_RESPONSE,pipelineExtraction} from '../fixtures/pipeline';
import {recordedLlmPort} from '../ports/llm';
import {ADMIN_ID,DEADLINE,T0,memoryBrokerDeps,seedLicence,seedParsed} from '../testing';
import {estimateTokens,extractCandidates,FEEDBACK_MAX_CHARS,MAX_OUTPUT_TOKENS,runExtract} from './run';
import * as schema from './schema';

const opts={deadline:DEADLINE(),now:()=>T0};
function artifact(...texts:string[]){return {...pipelineExtraction('a'.repeat(64)),pages:texts.map((text,i)=>({text,page:i+1})),page_count:texts.length};}
it('refuses an oversized page before dispatching any chunk',async()=>{
 const llm=recordedLlmPort(()=>EXTRACT_RESPONSE,{contextTokens:20_000});
 for(const pages of [artifact('a'.repeat(20_000)),artifact('short','a'.repeat(20_000))]){
  await expect(extractCandidates(llm,llm.info()!,pages,opts)).rejects.toMatchObject({code:'page_exceeds_context',requests:[],responses:[]});
  expect(llm.calls).toHaveLength(0);
 }
});
it('sends a page above the soft share alone when it fits with retry feedback',async()=>{
 const llm=recordedLlmPort(()=>EXTRACT_RESPONSE,{contextTokens:20_000});
 await extractCandidates(llm,llm.info()!,artifact('a'.repeat(8000),'short'),opts);
 expect(llm.calls).toHaveLength(2);expect(llm.calls[0].user).not.toContain('=== page 2 ===');expect(llm.calls[1].user).not.toContain('=== page 1 ===');
});
it('reserves and caps the complete retry feedback at the hard boundary',async()=>{
 const llm=recordedLlmPort(['bad',EXTRACT_RESPONSE],{contextTokens:20_000}),probe=recordedLlmPort([EXTRACT_RESPONSE]);
 await extractCandidates(probe,probe.info()!,artifact(''),opts);
 const {system,user}=probe.calls[0],length=20_000-estimateTokens(system+user)-1000-MAX_OUTPUT_TOKENS;
 vi.spyOn(schema,'validateExtraction').mockReturnValueOnce({ok:false,errors:['invalid'.repeat(2000)]});
 try{await extractCandidates(llm,llm.info()!,artifact('x'.repeat(length)),opts);}finally{vi.restoreAllMocks();}
 const feedback=llm.calls[1].user.slice(llm.calls[0].user.length);
 expect(feedback.length).toBeGreaterThan(0);expect(feedback.length).toBeLessThanOrEqual(1000);
 expect(FEEDBACK_MAX_CHARS).toBe(1000);expect(estimateTokens(llm.calls[1].system+llm.calls[1].user)+MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(20_000);
});
it('fails the extraction run and batch and releases the lease for an oversized page',async()=>{
 const llm=recordedLlmPort(()=>EXTRACT_RESPONSE,{contextTokens:1000}),d=memoryBrokerDeps({llm}),doc=await seedParsed(d,(await seedLicence(d.db)).licence_id);
 const r=await runExtract(d,doc.document_id,ADMIN_ID,opts);
 expect(r).toMatchObject({status:'failed',batchStatus:'failed',errorCode:'page_exceeds_context'});expect(llm.calls).toHaveLength(0);
 expect(await d.db.getRun(r.runId)).toMatchObject({status:'failed',detail:{error_code:'page_exceeds_context'}});
 expect(await d.db.claimLease(doc.document_id,d.newId(),300)).toBe(true);
});
