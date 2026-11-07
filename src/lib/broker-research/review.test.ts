// Review, evidence, disclosure and publication service tests (spec §6.3/§4.11).
import {beforeEach,describe,expect,it} from 'vitest';
import {runExtract} from './extract/run';
import {PAGES} from './fixtures/pipeline';
import {runParse} from './parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {toTyped} from './extract/typed';
import {addField,bindReport,fieldAction,markAbsent,publishBlockersOf,publishReport,recheckDisclosure,reviewAction,reviewData,setOverride,unpublishReport} from './review';
import type {FieldRow} from './types';
async function extracted(d:MemoryDeps){const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});const r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});return {doc,reportId:r.reportId};}
const span=(text:string,page=1)=>{const s=PAGES[page-1].indexOf(text);if(s<0)throw new Error(text);return {page,charStart:s,charEnd:s+text.length};};
const byField=(fs:FieldRow[],f:string)=>fs.find(x=>x.field===f&&x.superseded_by_run_id===null&&x.status!=='rejected')!;
describe('review services',()=>{
 let d:MemoryDeps;beforeEach(()=>{d=memoryBrokerDeps();});
 it('confirms unverified evidence only with a verbatim framed span',async()=>{
  const {reportId}=await extracted(d),tp=byField(await d.db.listFields(reportId),'target_price');
  await expect(fieldAction(d,reportId,tp.field_id,'confirm',{},ADMIN_ID)).rejects.toMatchObject({code:'span_required',status:400});
  await expect(fieldAction(d,reportId,tp.field_id,'confirm',{...span('120.00'),charStart:span('120.00').charStart-1},ADMIN_ID)).rejects.toMatchObject({code:'span_not_verbatim'});
  expect((await publishBlockersOf(d,reportId)).blockers).toContain('field_pending:target_price');
  const r=await fieldAction(d,reportId,tp.field_id,'confirm',span('120.00'),ADMIN_ID);
  expect(r.rules.receiptId).toBeTruthy();expect(byField(await d.db.listFields(reportId),'target_price')).toMatchObject({status:'confirmed',value_source_text:'120.00',detail:{framed:true}});
 });
 it('corrects typed values and rejects incompatible explicit components',async()=>{
  const {reportId}=await extracted(d),tp=byField(await d.db.listFields(reportId),'target_price');
  await expect(fieldAction(d,reportId,tp.field_id,'correct',{valueText:'US$120.00',valueUnit:'pct',...span('US$120.00')},ADMIN_ID)).rejects.toMatchObject({code:'invalid_correction:valueUnit'});
  await fieldAction(d,reportId,tp.field_id,'correct',{valueText:'120.00',...span('120.00')},ADMIN_ID);
  expect(byField(await d.db.listFields(reportId),'target_price')).toMatchObject({status:'corrected',corrected:{value_text:'120.00',value_num:toTyped('target_price','120.00').value.value_num,value_unit:'price'}});
 });
 it('adds verbatim human evidence and explicit absence',async()=>{
  const {reportId}=await extracted(d);
  await expect(addField(d,reportId,{field:'sector',targetKey:null,occurrence:1,valueText:'Robotics',...span('ZZ Robotics')},ADMIN_ID)).rejects.toMatchObject({code:'span_not_verbatim'});
  expect((await addField(d,reportId,{field:'sector',targetKey:null,occurrence:1,valueText:'ZZ Robotics',...span('ZZ Robotics')},ADMIN_ID)).fieldId).toBeTruthy();
  await expect(markAbsent(d,reportId,{field:'wacc',targetKey:null,page:1},ADMIN_ID)).rejects.toMatchObject({code:'invalid_parameter:field'});
  const a=await markAbsent(d,reportId,{field:'analyst',targetKey:null,page:1},ADMIN_ID);
  expect((await d.db.listFields(reportId)).find(f=>f.field_id===a.fieldId)).toMatchObject({status:'absent',value_text:'ABSENT',extractor:`human:${ADMIN_ID}`});
 });
 it('binds metadata, materializes and records title disclosure results',async()=>{
  const {reportId}=await extracted(d);const inst=await d.db.upsertInstitution({name_en:'Synthetic Broker Research Ltd',name_zh:null,aliases:[],kind:'broker',rating_disclosure_url:null});
  const b=await bindReport(d,reportId,{institutionId:inst,scope:'single_issuer',titlePublic:'Initiation'},ADMIN_ID);
  expect(b.rules.results.filter(r=>r.rule==='disclosure').map(r=>[r.detail.surface,r.blocking,r.passed])).toEqual([['title_original',false,true],['title_public',false,true]]);
  expect((await d.db.getReport(reportId))!).toMatchObject({institution_id:inst,scope:'single_issuer',title_public:'Initiation',title_public_by:ADMIN_ID});
  await expect(bindReport(d,reportId,{scope:'galaxy'},ADMIN_ID)).rejects.toMatchObject({code:'invalid_parameter:scope'});
  expect((await setOverride(d,reportId,{targetKey:'ZZBR',securityTicker:'ZZBR',note:null},ADMIN_ID)).receipt.targets).toBeGreaterThanOrEqual(1);
 });
 it('rechecks disclosure after licence change and reports a restricted title',async()=>{
  const {doc,reportId}=await extracted(d);await d.db.updateLicence(doc.licence_id,{allows_public_target_price:false});
  expect((await d.db.getReport(reportId))!.disclosure_ok).toBe(false);
  expect(await recheckDisclosure(d,reportId,ADMIN_ID)).toEqual({restored:true,failures:[]});
  await bindReport(d,reportId,{titlePublic:'Target 120.00 by mid-2027'},ADMIN_ID);await d.db.updateLicence(doc.licence_id,{terms_summary:'changed again'});
  const out=await recheckDisclosure(d,reportId,ADMIN_ID);expect(out.restored).toBe(false);expect(out.failures).toContain('restricted_value_in_text:title_public');
 });
 it('blocks a percent suffixed restricted price in a public title',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db,{patch:{allows_public_target_price:false}})).licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});const {reportId}=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  await bindReport(d,reportId,{titlePublic:'Upgrade: 120% of fair value'},ADMIN_ID);expect((await publishBlockersOf(d,reportId)).blockers).toContain('restricted_value_in_text:title_public');
 });
 it('returns private review payload and a log request',async()=>{
  const {reportId}=await extracted(d),{payload,log}=await reviewData(d,reportId);
  expect(Object.keys(payload).sort()).toEqual(['analysts','blockers','document','fields','institutions','licence','quarantine','report','reportAnalysts','runs','snippets','summaries','targets']);
  expect(payload.runs.map(r=>r.kind).sort()).toEqual(['extract','parse']);expect(log.action).toBe('text_viewed');
 });
 it('requires readiness for approval, delegates publication blockers, and refuses unpublish of draft',async()=>{
  const {reportId}=await extracted(d);await expect(reviewAction(d,reportId,'approve',ADMIN_ID)).rejects.toMatchObject({code:'review_not_ready',status:409});
  await reviewAction(d,reportId,'start',ADMIN_ID);expect((await d.db.getReport(reportId))!.review_status).toBe('in_review');
  await expect(publishReport(d,reportId,ADMIN_ID)).rejects.toMatchObject({code:'publish_blocked'});
  await expect(unpublishReport(d,reportId,'x',ADMIN_ID)).rejects.toBeTruthy();
 });
});
