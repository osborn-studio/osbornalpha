// src/lib/broker-research/admin-read.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {countMappingUpdates,isLicenceConfirmed,loadLicences,loadOverview,worstField} from './admin-read';
import type {AdminReadDeps} from './admin-read';
import type {BrokerResearchDb,LicenceRow,RatingScaleRow} from './types';

const lic=(o:Partial<LicenceRow>={}):LicenceRow=>({licence_id:'L1',version:2,source_label:'Synthetic',licence_kind:'other',holder:'h',terms_summary:'t',evidence_path:null,allows_llm_processing:true,allows_public_metadata:true,allows_public_snippets:true,allows_public_summary:true,allows_public_target_price:false,snippet_max_chars:80,valid_from:'2026-01-01',valid_to:null,confirmed_by:'u',confirmed_at:'2026-02-01T00:00:00Z',confirmed_version:2,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-02-01T00:00:00Z',...o});
const settings={public_enabled:false,approved_gold_corpus_hash:'G',approved_gold_corpus_by:null,approved_gold_corpus_at:null,updated_by:null,updated_at:'2026-01-01T00:00:00Z'};
async function seed(){
 const tables=memoryTableClient();
 const doc=(id:string,status:string,pending=false,licence='L1')=>tables.insert('broker_report_documents',{document_id:id,status,promotion_pending:pending,licence_id:licence,uploaded_at:`2026-10-0${id.length}T00:00:00Z`,original_filename:`${id}.pdf`,sha256:id});
 await doc('d1','uploaded');await doc('d2','uploaded',true);await doc('d3','parse_failed');await doc('d4','parsed');await doc('d5','parsed');await doc('d6','withdrawn');
 const rep=(id:string,d:string,status:string,review:string,o:Record<string,unknown>={})=>tables.insert('broker_research_reports',{report_id:id,document_id:d,status,review_status:review,disclosure_ok:true,...o});
 await rep('r5','d5','draft','in_review');await rep('r7','d7','draft','approved');await rep('r8','d8','published','approved',{institution_id:'I',current_publication_id:'P',published_date:'2026-06-01'});
 await tables.insert('broker_outbox',{event_id:'e1',status:'failed'});await tables.insert('broker_outbox',{event_id:'e2',status:'pending'});
 await tables.insert('broker_eval_receipts',{receipt_id:'g1',corpus_kind:'gold',corpus_hash:'G',passed:true,n_docs:30,ran_at:'2026-10-01T00:00:00Z',per_field:{rating:{tp:9,fp:0,fn:1,precision:1,recall:0.9},wacc:{tp:0,fp:0,fn:0,precision:null,recall:null}},precision_min:1,recall_min:0.9,extractor_version:'x',model_id:'m',registry_hash:'r',prompt_version:'p',schema_version:'s',code_version:'c'});
 await tables.insert('broker_report_snippets',{snippet_id:'s1',report_id:'r8',status:'approved',approved_by:'u'});
 await tables.insert('broker_report_snippets',{snippet_id:'s2',report_id:'r5',status:'draft',approved_by:'u',draft_reason:'licence_version'});
 return tables;
}
function db(o:Partial<BrokerResearchDb>={}):BrokerResearchDb{
 return {getSettings:vi.fn().mockResolvedValue(settings),listLicences:vi.fn().mockResolvedValue([lic(),lic({licence_id:'L2',version:3,confirmed_version:2})]),reviewQueue:vi.fn().mockResolvedValue([]),
  getPublication:vi.fn().mockResolvedValue({publication_id:'P',published_at:'2026-06-02T00:00:00Z'}),listRatingScales:vi.fn().mockResolvedValue([]),listTargets:vi.fn().mockResolvedValue([]),...o} as unknown as BrokerResearchDb;
}
const deps=async(o:Partial<BrokerResearchDb>={}):Promise<AdminReadDeps>=>({db:db(o),tables:await seed(),now:()=>new Date('2026-11-06T00:00:00Z')});

describe('licence predicate',()=>{
 it('needs confirmation of the current version inside the validity window',()=>{
  expect(isLicenceConfirmed(lic(),'2026-11-06')).toBe(true);
  expect(isLicenceConfirmed(lic({confirmed_version:1}),'2026-11-06')).toBe(false);
  expect(isLicenceConfirmed(lic({valid_to:'2026-10-01'}),'2026-11-06')).toBe(false);
  expect(isLicenceConfirmed(lic({confirmed_at:null}),'2026-11-06')).toBe(false);
 });
});

describe('loadOverview',()=>{
 it('counts each state once and reads gates without touching the switch',async()=>{
  const o=await loadOverview(await deps());
  expect(o.counts).toEqual({toParse:2,toExtract:1,toReview:1,toPublish:1,published:1,withdrawn:1});
  expect(o.gates.d1).toEqual({ok:true,confirmed:1,total:2});
  expect(o.gates.gold.ok).toBe(true);expect(o.gold?.worst).toEqual({field:'rating',metric:'recall',value:0.9});
  expect(o.attention).toEqual({mappingUpdates:0,outboxFailed:1,licencesPending:1});
  expect(o.settings.public_enabled).toBe(false);
 });
 it('gold gate fails on corpus mismatch or n < 30',async()=>{
  const o=await loadOverview(await deps({getSettings:vi.fn().mockResolvedValue({...settings,approved_gold_corpus_hash:'OTHER'})}));
  expect(o.gates.gold.ok).toBe(false);expect(o.gold?.corpusMatches).toBe(false);
 });
});

describe('countMappingUpdates',()=>{
 it('counts a published report whose raw label got a newer covering scale row',async()=>{
  const scale:RatingScaleRow={scale_id:'new',institution_id:'I',raw_label:'BUY',normalized:'buy',source_url:'u',valid_from:'2026-01-01',valid_to:null,created_by:'u',created_at:'2026-07-01T00:00:00Z',closed_by:null,closed_at:null};
  const d=await deps({listRatingScales:vi.fn().mockResolvedValue([scale]),listTargets:vi.fn().mockResolvedValue([{rating_raw:'Buy',scale_id:'old'}])});
  const reports=await d.tables.select('broker_research_reports',{});
  expect(await countMappingUpdates(d,reports)).toBe(1);
  const d2=await deps({listRatingScales:vi.fn().mockResolvedValue([{...scale,created_at:'2026-05-01T00:00:00Z'}]),listTargets:vi.fn().mockResolvedValue([{rating_raw:'Buy',scale_id:'old'}])});
  expect(await countMappingUpdates(d2,reports)).toBe(0);
 });
 it('worstField ignores uncovered metrics',()=>{expect(worstField({a:{tp:0,fp:0,fn:0,precision:null,recall:null}})).toBeNull();});
});

describe('loadLicences',()=>{
 it('reports per-licence impact counts',async()=>{
  const d=await deps();
  await d.tables.insert('broker_report_documents',{document_id:'d7',status:'parsed',licence_id:'L1',promotion_pending:false});
  await d.tables.insert('broker_report_documents',{document_id:'d8',status:'parsed',licence_id:'L1',promotion_pending:false});
  const [l1,l2]=await loadLicences(d);
  expect(l1).toMatchObject({confirmed:true,pending:false,documents:8,publishedReports:1,approvedSnippets:1,revertedTexts:1});
  expect(l2).toMatchObject({confirmed:false,pending:true,documents:0});
 });
});

it('counts reverted texts using draft_reason, including rows without an approver',async()=>{
 const d=await deps();
 await d.tables.insert('broker_report_snippets',{snippet_id:'s3',report_id:'r5',status:'draft',approved_by:null,draft_reason:'licence_version'});
 await d.tables.insert('broker_report_snippets',{snippet_id:'s4',report_id:'r5',status:'draft',approved_by:'u',draft_reason:null});
 expect((await loadLicences(d))[0].revertedTexts).toBe(2);
 await d.tables.update('broker_report_snippets',{snippet_id:'s4'},{approved_by:null});
 expect((await loadLicences(d))[0].revertedTexts).toBe(2);
});

it('uses only the latest gold receipt and requires 30 documents, a pass and approval',async()=>{
 const d=await deps();
 await d.tables.insert('broker_eval_receipts',{receipt_id:'synthetic',corpus_kind:'synthetic',ran_at:'2026-11-06',passed:true,n_docs:100,corpus_hash:'G'});
 expect((await loadOverview(d)).gates.gold.ok).toBe(true);
 await d.tables.update('broker_eval_receipts',{receipt_id:'g1'},{n_docs:29});
 expect((await loadOverview(d)).gates.gold.ok).toBe(false);
 await d.tables.update('broker_eval_receipts',{receipt_id:'g1'},{n_docs:30,passed:false});
 expect((await loadOverview(d)).gates.gold.ok).toBe(false);
 await d.tables.update('broker_eval_receipts',{receipt_id:'g1'},{passed:true});
 const unapproved={...d,db:db({getSettings:vi.fn().mockResolvedValue({...settings,approved_gold_corpus_hash:null})})};
 expect((await loadOverview(unapproved)).gates.gold.ok).toBe(false);
 await d.tables.insert('broker_eval_receipts',{receipt_id:'new',corpus_kind:'gold',ran_at:'2026-11-05',passed:false,n_docs:30,corpus_hash:'G'});
 expect((await loadOverview(d)).gold?.receiptId).toBe('new');
 expect((await loadOverview(d)).gates.gold.ok).toBe(false);
});
