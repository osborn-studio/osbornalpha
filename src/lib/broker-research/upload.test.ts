// Resumable upload, promotion recovery, cleanup, and signed read service tests (spec §6.1, §8.2).
import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {brokerPaths} from './storage';
import {ADMIN_ID,OTHER_ADMIN,memoryCoreDeps,seedLicence,sha256,syntheticPdf} from './testing';
import type {MemoryCore} from './testing';
import {INTENT_TTL_MS,commitIntent,createIntent,orphanCleanup,signedReadUrl} from './upload';
import type {LicenceRow} from './types';

const pdf=syntheticPdf('upload');
const input=(l:LicenceRow,bytes=pdf)=>({sha256:sha256(bytes),byte_size:bytes.byteLength,licence_id:l.licence_id,original_filename:'r.pdf'});
describe('upload state machine',()=>{
 let d:MemoryCore,l:LicenceRow;
 beforeEach(async()=>{d=memoryCoreDeps();l=await seedLicence(d.db);});
 const upload=async(bytes=pdf)=>{const i=await createIntent(d,input(l,bytes),ADMIN_ID);expect(d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,bytes)).toBe('stored');return i;};

 it('happy path: intent → direct upload → commit; retry returns the same document; one object, one log row',async()=>{
  const i=await upload();const c=await commitIntent(d,i.intentId,ADMIN_ID);
  expect(c).toEqual({documentId:i.intentId,status:'committed'});
  expect(await commitIntent(d,i.intentId,ADMIN_ID)).toEqual(c);
  expect(await d.db.getDocument(c.documentId)).toMatchObject({status:'uploaded',promotion_pending:false,storage_path:brokerPaths.report(sha256(pdf))});
  expect([...d.storage.objects.keys()]).toEqual([brokerPaths.report(sha256(pdf))]);
  expect((await d.db.listAccessLog({limit:10})).map(r=>r.action)).toEqual(['upload']);
 });
 it('second upload of the same bytes is 409 duplicate_document with the id',async()=>{
  const c=await commitIntent(d,(await upload()).intentId,ADMIN_ID);
  await expect(createIntent(d,input(l),ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document',status:409,extra:{documentId:c.documentId}});
 });
 it('rejects an intent document reference until the document row exists',async()=>{
  const missing=randomUUID();
  await expect(d.db.insertIntent({intent_id:missing,sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id:l.licence_id,original_filename:'r.pdf',created_by:ADMIN_ID,expires_at:new Date(Date.now()+INTENT_TTL_MS).toISOString(),status:'open',staging_path:brokerPaths.staging(missing),document_id:missing})).rejects.toMatchObject({code:'constraint_violation',detail:'broker_report_upload_intents_document_id_fkey'});
  const i=await upload();
  await d.db.transitionIntent(i.intentId,'open','validating');
  await d.db.transitionIntent(i.intentId,'validating','validated');
  await expect(d.db.transitionIntent(i.intentId,'validated','promoting',{document_id:i.intentId})).rejects.toMatchObject({code:'constraint_violation',detail:'broker_report_upload_intents_document_id_fkey'});
  expect((await d.db.getIntent(i.intentId))!.status).toBe('validated');
 });
 it('a race: two intents for the same bytes, loser abandoned and staging removed',async()=>{
  const a=await upload(),b=await upload();const ca=await commitIntent(d,a.intentId,ADMIN_ID);
  await expect(commitIntent(d,b.intentId,ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document',extra:{documentId:ca.documentId}});
  expect(await d.storage.exists(brokerPaths.staging(b.intentId))).toBe(false);
  await expect(commitIntent(d,b.intentId,ADMIN_ID)).rejects.toMatchObject({code:'duplicate_document'});
  expect(await d.db.getIntent(b.intentId)).toMatchObject({status:'abandoned'});
 });
 it.each([
  ['sha_mismatch',(b:Uint8Array)=>{const x=new Uint8Array(b);x[x.length-1]^=1;return x;}],
  ['size_mismatch',(b:Uint8Array)=>new Uint8Array([...b,10])],
  ['not_pdf',()=>new TextEncoder().encode('hello')],
 ])('422 %s deletes staging and abandons intent',async(code,mutate)=>{
  const bytes=code==='not_pdf'?new TextEncoder().encode('hello'):pdf;
  const i=await createIntent(d,input(l,bytes),ADMIN_ID);
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,mutate(bytes));
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code,status:422});
  expect(await d.storage.exists(brokerPaths.staging(i.intentId))).toBe(false);
  expect(await d.db.getIntent(i.intentId)).toMatchObject({status:'abandoned',error_code:code});
 });
 it('commit before browser upload returns to open and can retry',async()=>{
  const i=await createIntent(d,input(l),ADMIN_ID);
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'intent_not_uploaded',status:409});
  expect((await d.db.getIntent(i.intentId))!.status).toBe('open');
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,pdf);
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
 });
 it('another admin, expiry, and fresh concurrent validation are rejected',async()=>{
  const i=await upload();
  await expect(commitIntent(d,i.intentId,OTHER_ADMIN)).rejects.toMatchObject({code:'intent_mismatch',status:409});
  expect(await d.db.transitionIntent(i.intentId,'open','validating')).toBe(true);
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'intent_busy'});
  d.advance(61_000);expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
  const j=await upload(syntheticPdf('late'));d.advance(INTENT_TTL_MS+1);
  await expect(commitIntent(d,j.intentId,ADMIN_ID)).rejects.toMatchObject({code:'intent_mismatch',extra:{reason:'expired'}});
  expect((await d.db.getIntent(j.intentId))!.status).toBe('expired');
 });
 it('crash after promoting resumes on retry',async()=>{
  const i=await upload();d.storage.failNext('move','crash');
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'storage_failed'});
  expect((await d.db.getIntent(i.intentId))!.status).toBe('promoting');
  expect((await d.db.getDocument(i.intentId))!.promotion_pending).toBe(true);
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
 });
 it('crash after move counts as promoted',async()=>{
  const i=await upload();await d.db.transitionIntent(i.intentId,'open','validating');await d.db.transitionIntent(i.intentId,'validating','validated');
  await d.db.insertDocument({document_id:i.intentId,sha256:sha256(pdf),storage_path:brokerPaths.report(sha256(pdf)),byte_size:pdf.byteLength,licence_id:l.licence_id,uploaded_by:ADMIN_ID,original_filename:'r.pdf'});
  await d.db.transitionIntent(i.intentId,'validated','promoting',{document_id:i.intentId});
  await d.storage.move(brokerPaths.staging(i.intentId),brokerPaths.report(sha256(pdf)));
  expect((await commitIntent(d,i.intentId,ADMIN_ID)).status).toBe('committed');
  expect((await d.db.getDocument(i.intentId))!.promotion_pending).toBe(false);
 });
 it('promotion_lost withdraws document; replacement restores the same id',async()=>{
  const i=await upload();await d.db.transitionIntent(i.intentId,'open','validating');await d.db.transitionIntent(i.intentId,'validating','validated');
  await d.storage.remove([brokerPaths.staging(i.intentId)]);
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'promotion_lost',status:500});
  expect(await d.db.getDocument(i.intentId)).toMatchObject({status:'withdrawn',withdrawn_reason:'promotion_lost'});
  await expect(signedReadUrl(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({status:410});
  const r=await createIntent(d,input(l),ADMIN_ID);expect(r.replacesDocumentId).toBe(i.intentId);
  d.storage.putSigned(brokerPaths.staging(r.intentId),r.token,pdf);
  expect(await commitIntent(d,r.intentId,ADMIN_ID)).toEqual({documentId:i.intentId,status:'committed'});
  expect(await d.db.getDocument(i.intentId)).toMatchObject({status:'uploaded',withdrawn_at:null,withdrawn_reason:null,promotion_pending:false});
 });
 it('createIntent rejects unknown licences and oversize files',async()=>{
  await expect(createIntent(d,{...input(l),licence_id:'00000000-0000-4000-8000-0000000000ff'},ADMIN_ID)).rejects.toMatchObject({code:'licence_not_found',status:404});
  await expect(createIntent(d,{...input(l),byte_size:52428801},ADMIN_ID)).rejects.toMatchObject({code:'file_too_large',status:413});
 });
 it('licence confirmation is required before intent and again before commit',async()=>{
  const i=await upload();
  await d.db.updateLicence(l.licence_id,{terms_summary:'Changed terms awaiting confirmation'});
  await expect(createIntent(d,input(l,syntheticPdf('new')),ADMIN_ID)).rejects.toMatchObject({code:'licence_unconfirmed',status:409});
  await expect(commitIntent(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'licence_unconfirmed',status:409});
  expect((await d.db.getIntent(i.intentId))!.status).toBe('open');
 });
 it('orphanCleanup removes only expired or abandoned staging objects',async()=>{
  const keep=await upload(syntheticPdf('keep')),old=await upload(syntheticPdf('old'));
  const done=await upload(syntheticPdf('done'));await commitIntent(d,done.intentId,ADMIN_ID);
  d.advance(INTENT_TTL_MS+1);const fresh=await upload(syntheticPdf('fresh'));
  const r=await orphanCleanup(d,ADMIN_ID);
  expect(r.removed.sort()).toEqual([brokerPaths.staging(keep.intentId),brokerPaths.staging(old.intentId)].sort());
  expect(await d.storage.exists(brokerPaths.staging(fresh.intentId))).toBe(true);
  expect(await d.storage.exists(brokerPaths.report(sha256(syntheticPdf('done'))))).toBe(true);
  expect((await d.db.listAccessLog({limit:10})).some(x=>x.action==='orphan_cleanup')).toBe(true);
 });
 it('signedReadUrl requires an accessible document and returns a log row',async()=>{
  await expect(signedReadUrl(d,'00000000-0000-4000-8000-0000000000ff',ADMIN_ID)).rejects.toMatchObject({status:404});
  const i=await upload();d.storage.failNext('move','crash');await commitIntent(d,i.intentId,ADMIN_ID).catch(()=>undefined);
  await expect(signedReadUrl(d,i.intentId,ADMIN_ID)).rejects.toMatchObject({code:'promotion_pending',status:409});
  await commitIntent(d,i.intentId,ADMIN_ID);
  const s=await signedReadUrl(d,i.intentId,ADMIN_ID);
  expect(s.payload).toMatchObject({expiresIn:600});expect(s.log).toMatchObject({action:'signed_url_issued',document_id:i.intentId});
 });
});
