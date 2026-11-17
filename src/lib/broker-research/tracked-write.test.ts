// Durable bucket-write and lease fence regression tests (P-R5-01..03, P-R6-02..04).
import {describe,expect,it,vi} from 'vitest';
import {memoryBrokerResearchDb} from './memory-db';
import {memoryBrokerStorage} from './storage';
import {deleteRegisteredPath,trackedUpload,trackedPortWrite} from './tracked-write';

async function setup(){
 const db=memoryBrokerResearchDb();const storage=memoryBrokerStorage();
 const l=await db.insertLicence({source_label:'x',licence_kind:'other',holder:'h',terms_summary:'t',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:true,snippet_max_chars:100,valid_from:'2026-01-01',valid_to:null});
 const sha='c'.repeat(64),doc='00000000-0000-4000-8000-000000000001';
 await db.insertDocument({document_id:doc,sha256:sha,storage_path:`reports/${sha}.pdf`,byte_size:1,licence_id:l.licence_id,uploaded_by:'u',original_filename:'a.pdf'});
 return {db,storage,doc,sha,path:'runs/00000000-0000-4000-8000-0000000000aa.request.json'};
}
describe('tracked bucket writes',()=>{
 it.each(['document_withdrawn','lease_lost'] as const)('preflight %s abandons without invoking upload/F3',async failure=>{
  for(const port of [false,true]){
   const {db,storage,doc,path}=await setup();
   if(failure==='document_withdrawn')await db.withdrawWithIntent(doc,'test',false,'u');
   const invoke=vi.fn(async()=>({}));const upload=vi.spyOn(storage,'upload');const lease={token:'unheld-token',ttlSeconds:300};
   const work=port?trackedPortWrite({db},{documentId:doc,prefix:path+'/',writer:'f3',lease},invoke)
    :trackedUpload({db,storage},{documentId:doc,path,writer:'extract',body:'{}',contentType:'application/json',lease});
   await expect(work).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
   expect(await db.writesFor(doc)).toMatchObject([{status:'abandoned',finished_at:null,reconciled_at:null}]);
  }
 });
 it.each(['document_withdrawn','lease_lost'] as const)('F3 post-fence %s leaves pending',async failure=>{
  const {db,doc,path}=await setup();const token='held';await db.claimLease(doc,token,300);
  const invoke=async()=>{if(failure==='document_withdrawn')await db.withdrawWithIntent(doc,'test',true,'u');else await db.fencedUpdateDocument(doc,token,{releaseLease:true});return {};};
  await expect(trackedPortWrite({db},{documentId:doc,prefix:path+'/',writer:'f3',lease:{token,ttlSeconds:300}},invoke)).rejects.toThrow();
  expect(await db.writesFor(doc)).toMatchObject([{status:'pending',finished_at:null}]);
 });
 it('registers before upload and marks done only after fenced success',async()=>{
  const {db,storage,doc,path}=await setup();const order:string[]=[];
  const reg=db.registerWrite.bind(db);db.registerWrite=async r=>{order.push('register');return reg(r);};
  const up=storage.upload.bind(storage);storage.upload=async(...a)=>{order.push('upload');return up(...a);};
  expect(await trackedUpload({db,storage},{documentId:doc,path,writer:'extract',body:'{}',contentType:'application/json'})).toBe('stored');
  expect(order).toEqual(['register','upload']);expect((await db.writesFor(doc)).map(w=>[w.path,w.status])).toEqual([[path,'done']]);
 });
 it('withdrawn document sends no bytes; lease loss during upload deletes the path',async()=>{
  const {db,storage,doc,path}=await setup();await db.withdrawWithIntent(doc,'test',false,'u');
  await expect(trackedUpload({db,storage},{documentId:doc,path,writer:'eval',body:'{}',contentType:'application/json'})).rejects.toMatchObject({code:'document_withdrawn',status:410});
  expect(storage.objects.size).toBe(0);
  const s2=await setup(),token='00000000-0000-4000-8000-0000000000bb';expect(await s2.db.claimLease(s2.doc,token,300)).toBe(true);
  const up=s2.storage.upload.bind(s2.storage);
  s2.storage.upload=async(...a)=>{const r=await up(...a);s2.db.expireLease(s2.doc);await s2.db.claimLease(s2.doc,'00000000-0000-4000-8000-0000000000cc',300);return r;};
  await expect(trackedUpload(s2,{documentId:s2.doc,path:s2.path,writer:'extract',body:'{}',contentType:'application/json',lease:{token,ttlSeconds:300}})).rejects.toMatchObject({code:'lease_lost',status:409});
  expect(s2.storage.objects.has(s2.path)).toBe(false);expect((await s2.db.writesFor(s2.doc)).map(w=>w.path)).toEqual([s2.path]);
 });
 it('failed or hung upload leaves pending inventory',async()=>{
  const {db,storage,doc,path}=await setup();storage.failNext('upload','network');
  await expect(trackedUpload({db,storage},{documentId:doc,path,writer:'summary',body:'{}',contentType:'application/json'})).rejects.toThrow();
  expect((await db.pendingWritesFor(doc)).map(w=>w.path)).toEqual([path]);
  vi.useFakeTimers();try{
   storage.upload=()=>new Promise(()=>{});
   const p=trackedUpload({db,storage},{documentId:doc,path:'runs/00000000-0000-4000-8000-0000000000dd.request.json',writer:'summary',body:'{}',contentType:'application/json'});
   const done=p.then(()=>'resolved',(e:Error)=>e.message);await vi.advanceTimersByTimeAsync(120_000);
   expect(await done).toBe('upload_liveness_timeout');expect(await db.pendingWritesFor(doc)).toHaveLength(2);
  }finally{vi.useRealTimers();}
 });
 it('deleteRegisteredPath handles prefix and object idempotently',async()=>{
  const {storage,sha}=await setup();const pre=`reports/${sha}.pages.00000000-0000-4000-8000-0000000000ee/`;
  await storage.upload(`${pre}1.png`,'a','image/png');await storage.upload(`${pre}2.png`,'b','image/png');
  expect(await deleteRegisteredPath(storage,pre)).toEqual([`${pre}1.png`,`${pre}2.png`]);
  expect(await deleteRegisteredPath(storage,pre)).toEqual([]);
 });
});
