import {expect,it,vi} from 'vitest';
import {runExtract} from './extract/run';
import {EXTRACT_RESPONSE,SUMMARY_RESPONSE,TITLE_RESPONSE} from './fixtures/pipeline';
import {recordedLlmPort} from './ports/llm';
import {fieldAction,publishReport} from './review';
import {approveSummary,runSummary,translateTitle} from './summary/run';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedLicence,seedParsed} from './testing';
const opts={deadline:DEADLINE()};
async function parsed(answer=EXTRACT_RESPONSE){
 const d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,answer])}),doc=await seedParsed(d,(await seedLicence(d.db)).licence_id);
 return {d,id:doc.document_id,extract:()=>runExtract(d,doc.document_id,ADMIN_ID,opts)};
}
it('keeps candidates ineffective after rules fail and supersedes them on re-extraction',async()=>{
 const {d,id,extract}=await parsed();vi.spyOn(d.db,'insertRuleReceipt').mockRejectedValueOnce(new Error('receipt unavailable'));
 await expect(extract()).rejects.toThrow('receipt unavailable');
 const run=(await d.db.listRuns(id)).find(r=>r.kind==='extract')!,report=(await d.db.ensureReport(id,d.codeVersion)).report_id;
 expect(run.status).toBe('failed');const candidates=await d.db.listFields(report);
 expect(candidates.length).toBeGreaterThan(0);expect(candidates.every(f=>['extracted','unverified'].includes(f.status))).toBe(true);
 expect(await d.db.publishBlockers(report)).toContain('rules_stale');
 const next=await extract();expect(next.status).toBe('succeeded');
 const all=await d.db.listFields(report,{includeSuperseded:true});for(const f of candidates)expect(all.find(x=>x.field_id===f.field_id)?.superseded_by_run_id).toBe(next.runId);
});
it('blocks missing scope after lease takeover following candidate commit',async()=>{
 const {d,id,extract}=await parsed(),commit=d.db.extractCommit;
 vi.spyOn(d.db,'extractCommit').mockImplementationOnce(async(...args)=>{const r=await commit(...args);d.advance(600_000);expect(await d.db.claimLease(id,d.newId(),300)).toBe(true);return r;});
 const r=await extract();expect(r.errorCode).toBe('lease_lost');expect((await d.db.getReport(r.reportId))!.scope).toBeNull();
 expect(await d.db.publishBlockers(r.reportId)).toContain('report_incomplete:scope');
});
it('blocks a translated title after materialization fails',async()=>{
 const {d,extract}=await parsed(TITLE_RESPONSE),{reportId}=await extract();
 const before=await d.db.publishBlockers(reportId);
 vi.spyOn(d.db,'materialize').mockRejectedValueOnce(new Error('materialization unavailable'));
 await expect(translateTitle(d,reportId,ADMIN_ID,opts)).rejects.toThrow('materialization unavailable');
 expect((await d.db.getReport(reportId))!.title_zh).toBe(JSON.parse(TITLE_RESPONSE).zh);
 const added=(await d.db.publishBlockers(reportId)).filter(b=>!before.includes(b));
 expect(added).toEqual(expect.arrayContaining([expect.stringMatching(/^(materialize_stale$|rules_stale$|restricted_value_in_text:title_)/)]));
});
it('refuses summary approval when a confirmed field moves the digest',async()=>{
 const {d,extract}=await parsed(SUMMARY_RESPONSE),{reportId}=await extract(),s=await runSummary(d,reportId,'zh',ADMIN_ID,opts);
 const field=(await d.db.listFields(reportId)).find(f=>f.field==='title')!;
 await fieldAction(d,reportId,field.field_id,'confirm',{},ADMIN_ID);
 expect((await d.db.getSummary(s.summaryId))!.input_hash).not.toBe((await d.db.getReport(reportId))!.summary_input_digest);
 await expect(approveSummary(d,s.summaryId,ADMIN_ID)).rejects.toMatchObject({code:'summary_stale'});
});
it('refreshes the rules receipt at publish after field review outlives a rules failure',async()=>{
 const {d,extract}=await parsed(),{reportId}=await extract(),field=(await d.db.listFields(reportId)).find(f=>f.field==='title')!;
 const receipt=vi.spyOn(d.db,'insertRuleReceipt').mockRejectedValueOnce(new Error('receipt unavailable'));
 await expect(fieldAction(d,reportId,field.field_id,'confirm',{},ADMIN_ID)).rejects.toThrow('receipt unavailable');
 expect((await d.db.listFields(reportId)).find(f=>f.field_id===field.field_id)?.status).toBe('confirmed');
 expect(await d.db.publishBlockers(reportId)).toContain('rules_stale');
 const materialize=vi.spyOn(d.db,'materialize');await publishReport(d,reportId,ADMIN_ID).catch(()=>{});
 expect(materialize).toHaveBeenCalledWith(reportId);expect(receipt.mock.calls[1][0].input_hash).toBe((await d.db.getReport(reportId))!.rules_input_hash);
 await expect(receipt.mock.results[1].value).resolves.toEqual(expect.any(String));
});
