// src/lib/broker-research/preview.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {previewPageData} from './preview';
import type {AdminReadDeps} from './admin-document';
import type {BrokerResearchDb,FieldRow} from './types';

const RID='11111111-1111-4111-8111-111111111111';
const field=(o:Partial<FieldRow>):FieldRow=>({field_id:'f',report_id:RID,parse_run_id:'pr',run_id:'run',superseded_by_run_id:null,target_key:'600000.SH',field:'target_price',occurrence:1,page:1,char_start:0,char_end:4,value_source_text:'SPAN-SECRET',
 extractor:'llm:m@r',extractor_confidence:null,status:'confirmed',corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:'',value_text:'12.34',value_num:'12.34',value_currency:'CNY',value_unit:'price',value_date:null,...o});
function deps(o:{tp?:boolean;n?:number;titlePublic?:string|null}={}){
 const tables=memoryTableClient();
 const db={
  getReport:vi.fn().mockResolvedValue({report_id:RID,document_id:'d',revision:1,scope:'single_issuer',institution_id:'I',title_original:'Original',title_lang:'en',title_zh:null,title_en:null,title_run_id:null,title_public:o.titlePublic??null,
   published_date:'2026-10-01',price_as_of_date:null,report_type:null,sector_as_stated:null,primary_target_key:'600000.SH',status:'draft',review_status:'in_review',current_publication_id:null,supersedes_report_id:null,code_version:'c'}),
  getDocument:vi.fn().mockResolvedValue({document_id:'d',licence_id:'L',status:'parsed',uploaded_at:'2026-10-02T00:00:00Z',page_count:9}),
  getLicence:vi.fn().mockResolvedValue({licence_id:'L',allows_public_metadata:true,allows_public_target_price:o.tp??false,allows_public_snippets:true,allows_public_summary:true,snippet_max_chars:o.n??10}),
  listTargets:vi.fn().mockResolvedValue([{report_id:RID,target_key:'600000.SH',ticker_as_stated:'600000',security_ticker:'600000.SH',issuer_id:'iss',rating_raw:'Buy',rating_normalized:'buy',scale_id:'s',target_price:'12.34',target_currency:'CNY',target_horizon_months:12,price_at_report:'9',price_currency:'CNY',price_as_of_date:null,upside_pct:'0.3711',upside_formula_version:'upside/1'}]),
  listFields:vi.fn().mockResolvedValue([
   field({field_id:'f1'}),
   field({field_id:'f2',field:'rating',value_text:'Hold',value_num:null,value_currency:null,value_unit:null,status:'corrected',corrected:{value_text:'Buy'}}),
   field({field_id:'f3',field:'analyst',target_key:null,value_text:'Hidden Person',value_num:null,value_currency:null,value_unit:null,extractor:'human:u'}),
   field({field_id:'f4',field:'title',target_key:null,value_text:'Original',value_num:null,value_currency:null,value_unit:null}),
   field({field_id:'f5',field:'wacc',status:'extracted',value_text:'8%',value_num:'0.08',value_unit:'pct'}),
   field({field_id:'f6',field:'terminal_growth',superseded_by_run_id:'new',value_num:'0.02',value_unit:'pct'}),
  ]),
  listSnippets:vi.fn().mockResolvedValue([{snippet_id:'s1',report_id:RID,target_key:null,purpose:'risk',page:2,text:'short',status:'approved'},{snippet_id:'s2',report_id:RID,target_key:null,purpose:'risk',page:2,text:'far too long text',status:'approved'},{snippet_id:'s3',report_id:RID,target_key:null,purpose:'risk',page:2,text:'draft',status:'draft'}]),
  listSummaries:vi.fn().mockResolvedValue([{summary_id:'m1',report_id:RID,lang:'zh',kind:'independent_summary',run_id:'sr',summary_md:'正文',status:'approved',generated_at:'2026-10-03T00:00:00Z',numeric_grounding:{version:'grounding/1',passed:true,failures:[],assertions:[{sentence_idx:0,target_key:'600000.SH',field:'target_price',value:'12.34',unit:'price',field_id:'f1'}]}},{summary_id:'m2',report_id:RID,lang:'en',kind:'independent_summary',run_id:'sr',summary_md:'draft',status:'draft',generated_at:''}]),
  listInstitutions:vi.fn().mockResolvedValue([{institution_id:'I',name_en:'Synthetic Securities',name_zh:null,aliases:[],kind:null,rating_disclosure_url:null}]),
  listAnalysts:vi.fn().mockResolvedValue([{analyst_id:'a1',institution_id:'I',display_name:'Hidden Person',name_variants:[],public_display:false}]),
  listReportAnalysts:vi.fn().mockResolvedValue([{report_id:RID,analyst_id:'a1',role:'lead',field_id:'f3'}]),
  getRun:vi.fn().mockResolvedValue({run_id:'sr',model_id:'model-x',prompt_version:'independent-summary/1'}),
 } as unknown as BrokerResearchDb;
 return {deps:{db,tables,now:()=>new Date('2026-11-06T00:00:00Z')} as AdminReadDeps,tables};
}

describe('previewPageData',()=>{
 it('applies the public-view rules to service-role rows and goes through the same DTO',async()=>{
  const {deps:d}=deps();
  const p=await previewPageData(d,RID);
  if(p.kind!=='ok')throw new Error(p.kind);
  const r=p.data.report,json=JSON.stringify(p);
  expect(r.targetPricePublic).toBe(false);expect(r.targets[0].target).toBeNull();expect(json).not.toContain('12.34');expect(json).not.toContain('0.3711');
  expect(r.citations.map(c=>`${c.field}:${c.valueText}`).sort()).toEqual(['rating:Buy','title:Original']);   // corrected value; analyst hidden; candidate and superseded rows excluded
  expect(r.snippets.map(s=>s.snippetId)).toEqual(['s1']);expect(r.summaries.zh?.modelId).toBe('model-x');expect(r.summaries.en).toBeNull();
  expect(r.summaries.zh?.groundingAssertions).toEqual([]);   // target-price assertion hidden: licence does not allow target prices
  expect(r.citations.find(c=>c.field==='rating')?.fieldId).toBe('f2');
  expect(r.analysts).toEqual([]);expect(json).not.toContain('SPAN-SECRET');
  expect(p.meta).toEqual({status:'draft',reviewStatus:'in_review',metadataPublic:true});
  expect(p.data.history).toEqual([]);expect(p.data.spread).toEqual([]);
 });
 it('rewritten title suppresses the title citation; target shows when the licence allows',async()=>{
  const p=await previewPageData(deps({tp:true,titlePublic:'Rewritten'}).deps,RID);
  if(p.kind!=='ok')throw new Error(p.kind);
  expect(p.data.report.title).toMatchObject({text:'Rewritten',isRewritten:true});
  expect(p.data.report.citations.map(c=>c.field).sort()).toEqual(['rating','target_price']);
  expect(p.data.report.targets[0].target).toEqual({price:'12.34',currency:'CNY',horizonMonths:12});
  expect(p.data.report.summaries.zh?.groundingAssertions).toEqual([{sentenceIdx:0,targetKey:'600000.SH',field:'target_price',value:'12.34',unit:'price'}]);
 });
 it('not found / incomplete',async()=>{
  const {deps:d}=deps();(d.db.getReport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
  expect((await previewPageData(d,RID)).kind).toBe('not_found');
  const {deps:d2}=deps();(d2.db.getReport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({report_id:RID,document_id:'d',title_original:null,title_public:null,status:'draft',review_status:'pending'});
  expect((await previewPageData(d2,RID)).kind).toBe('incomplete');
 });
});

// Regression: pages must not serialize raw run detail through the unlogged document loader.
it('document read model keeps raw detail out of the page props',async()=>{
 const {loadDocumentPage}=await import('./admin-document');
 const {deps:d}=deps();
 d.db.reportByDocument=vi.fn().mockResolvedValue(null);
 d.db.purgeSteps=vi.fn().mockResolvedValue([]);
 d.db.listRuns=vi.fn().mockResolvedValue([{run_id:'run',started_at:'2026-01-01',detail:{error_code:'failed',response:'RAW-MODEL-SECRET',text:'PAGE-SECRET'}}]);
 const p=await loadDocumentPage(d,'d');
 expect(JSON.stringify(p)).not.toContain('RAW-MODEL-SECRET');
 expect(JSON.stringify(p)).not.toContain('PAGE-SECRET');
 expect(p?.runs[0].detail).toEqual({error_code:'failed'});
});
