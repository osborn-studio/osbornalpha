import {expect,it,vi} from 'vitest';
import {runParse} from './parse';
import type {F3Artifact} from './ports/f3';
import {ADMIN_ID,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
it('times out an unresponsive port and releases the lease with its remote write pending',async()=>{
 const extractDocument=vi.fn(()=>new Promise<F3Artifact>(()=>{})),d=memoryBrokerDeps({f3:{available:()=>true,extractDocument}});
 const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
 const result=await runParse(d,doc.document_id,ADMIN_ID,{deadline:new Date(+d.now()+50)});
 expect(result).toMatchObject({status:'failed',batchStatus:'failed',errorCode:'f3_timeout'});expect(extractDocument).toHaveBeenCalledOnce();
 expect(await d.db.getRun(result.runId)).toMatchObject({status:'failed',detail:{error_code:'f3_timeout'}});
 expect(await d.db.claimLease(doc.document_id,d.newId(),300)).toBe(true);
 expect(await d.db.pendingWritesFor(doc.document_id)).toEqual([expect.objectContaining({writer:'f3',status:'pending'})]);
},1500);
it('refuses to dispatch after the F3 deadline',async()=>{
 const d=memoryBrokerDeps(),doc=await seedDocument(d,(await seedLicence(d.db)).licence_id),port=vi.spyOn(d.f3,'extractDocument');
 expect(await runParse(d,doc.document_id,ADMIN_ID,{deadline:new Date(+d.now()-1)})).toMatchObject({status:'failed',errorCode:'f3_timeout'});
 expect(port).not.toHaveBeenCalled();
});
