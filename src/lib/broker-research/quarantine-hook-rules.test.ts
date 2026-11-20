import {expect,it,vi} from 'vitest';
import {emptyCounts} from '../dq/batches';
import {afterRulesForItem} from './quarantine-hook-rules';
import {resolveBrokerItem} from './quarantine-hook';
import {ADMIN_ID,memoryBrokerDeps,seedLicence,seedDocument} from './testing';
async function setup(){const d=memoryBrokerDeps(),doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);return {d,doc,key:doc.sha256+':reason:-',batch:async()=>(await d.tables.select('ingest_batches',{producer:'broker-research-review'}))[0]};}
it('records invalid natural keys on a finished batch',async()=>{
 const {d,doc,batch}=await setup();expect(await afterRulesForItem(d,doc.sha256)).toBe('failed');
 expect(await batch()).toMatchObject({status:'failed',finished_at:expect.any(String),errors:[{code:'rules_error',message:'invalid_natural_key'}]});
});
it('passes skipped through resolution for a document without a report',async()=>{
 const {d,key,batch}=await setup();vi.spyOn(d.db,'quarantineResolve').mockResolvedValue('resolved');
 expect(await resolveBrokerItem(d,{id:d.newId(),natural_key:key},{status:'resolved_accept',by:ADMIN_ID,payload:{}})).toEqual({outcome:'resolved',rules:'skipped'});
 expect(await batch()).toMatchObject({status:'success',counts:emptyCounts(),errors:[]});
});
it('skips a published report',async()=>{
 const {d,doc,key,batch}=await setup(),report=await d.db.ensureReport(doc.document_id,d.codeVersion);
 vi.spyOn(d.db,'reportByDocument').mockResolvedValue({...report,status:'published'});
 expect(await afterRulesForItem(d,key)).toBe('skipped');expect(await batch()).toMatchObject({status:'success',counts:emptyCounts(),errors:[]});
});
it('records a stale receipt when the report changes during rules',async()=>{
 const {d,doc,key,batch}=await setup(),report=await d.db.ensureReport(doc.document_id,d.codeVersion),insert=d.db.insertRuleReceipt;
 vi.spyOn(d.db,'insertRuleReceipt').mockImplementationOnce(async row=>{const id=await insert(row);await d.db.updateReportDraft(report.report_id,{scope:'sector'});await d.db.materialize(report.report_id);return id;});
 expect(await afterRulesForItem(d,key)).toBe('failed');expect(await batch()).toMatchObject({status:'failed',errors:[{code:'rules_error',message:'receipt_stale'}]});
});
it('records the error on the finished batch when applyRules throws',async()=>{
 const {d,doc,key,batch}=await setup();await d.db.ensureReport(doc.document_id,d.codeVersion);
 vi.spyOn(d.db,'insertRuleReceipt').mockRejectedValueOnce(new Error('boom'));
 expect(await afterRulesForItem(d,key)).toBe('failed');expect(await batch()).toMatchObject({status:'failed',finished_at:expect.any(String),errors:[{code:'rules_error',message:'boom'}]});
});
it('finishes a batch for a current receipt',async()=>{
 const {d,doc,key,batch}=await setup();await d.db.ensureReport(doc.document_id,d.codeVersion);
 expect(await afterRulesForItem(d,key)).toBe('ok');expect(await batch()).toMatchObject({finished_at:expect.any(String)});
});
it('finishes the batch even when document lookup throws',async()=>{
 const {d,key,batch}=await setup();vi.spyOn(d.db,'findDocumentBySha').mockRejectedValueOnce(new Error('lookup failed'));
 expect(await afterRulesForItem(d,key)).toBe('failed');expect(await batch()).toMatchObject({status:'failed',errors:[expect.objectContaining({code:'rules_error'})]});
});
