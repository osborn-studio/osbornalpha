import {expect,it,vi} from 'vitest';
import {bindReport,unpublishReport} from './review';
import {ADMIN_ID,memoryBrokerDeps,seedLicence,seedParsed,seedPublished} from './testing';

it('leaves draft columns unchanged when analyst evidence fails in the database',async()=>{
 const d=memoryBrokerDeps(),doc=await seedParsed(d,(await seedLicence(d.db)).licence_id),r=await d.db.ensureReport(doc.document_id,'test');
 const {fieldId}=await d.db.insertHumanField(r.report_id,{field:'title',target_key:null,occurrence:1,value_text:'Title',value_num:null,value_date:null,value_currency:null,value_unit:null,page:1,char_start:0,char_end:5,value_source_text:'Title',parse_run_id:doc.current_parse_run_id!,status:'confirmed'},ADMIN_ID);
 const [f]=await d.db.listFields(r.report_id);
 // The validation read saw an analyst field, but the write sees different evidence.
 vi.spyOn(d.db,'listFields').mockResolvedValueOnce([{...f,field:'analyst'}]);
 await expect(bindReport(d,r.report_id,{reportType:'Initiation',analyst:{fieldId,analystId:d.newId()}},ADMIN_ID)).rejects.toMatchObject({code:'analyst_field_mismatch'});
 expect((await d.db.getReport(r.report_id))!.report_type).toBeNull();
});

it('unpublishes and logs through one call, preserving publication on rejection',async()=>{
 const d=memoryBrokerDeps(),{reportId,documentId}=await seedPublished(d);
 const rpc=vi.spyOn(d.db,'unpublishLogged').mockRejectedValueOnce(new Error('offline'));
 const logs=async()=>(await d.db.listAccessLog({documentId,limit:10})).filter(x=>x.action==='unpublish');
 await expect(unpublishReport(d,reportId,'reason',ADMIN_ID)).rejects.toThrow('offline');
 expect((await d.db.getReport(reportId))!.status).toBe('published');expect(await logs()).toEqual([]);
 rpc.mockClear();await unpublishReport(d,reportId,'reason',ADMIN_ID);
 expect(rpc).toHaveBeenCalledExactlyOnceWith(reportId,ADMIN_ID,'reason');expect(await logs()).toEqual([expect.objectContaining({detail:{report_id:reportId,reason:'reason'}})]);
});
