import {expect,it,vi} from 'vitest';
import {runExtract} from '../extract/run';
import {EXTRACT_RESPONSE,SUMMARY_RESPONSE} from '../fixtures/pipeline';
import {recordedLlmPort} from '../ports/llm';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedLicence,seedParsed} from '../testing';
import {approveSummary,runSummary} from './run';

it('keeps the old approved summary when disclosure inputs change before approval',async()=>{
 const d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,SUMMARY_RESPONSE,SUMMARY_RESPONSE])});
 const doc=await seedParsed(d,(await seedLicence(d.db)).licence_id),{reportId}=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 const draft=()=>runSummary(d,reportId,'en',ADMIN_ID,{deadline:DEADLINE()});
 const x=await draft();await approveSummary(d,x.summaryId,ADMIN_ID);const y=await draft(),before=await d.db.listSummaries(reportId);
 vi.spyOn(d.db,'disclosureDigest').mockResolvedValueOnce('0'.repeat(64));
 await expect(approveSummary(d,y.summaryId,ADMIN_ID)).rejects.toMatchObject({code:'disclosure_inputs_changed'});
 expect(await d.db.listSummaries(reportId)).toEqual(before);
});
