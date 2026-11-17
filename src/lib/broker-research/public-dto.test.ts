// src/lib/broker-research/public-dto.test.ts
import {describe,expect,it} from 'vitest';
import {dec,toPublicHistoryRow,toPublicInstitution,toPublicReport,toPublicReportDetail} from './public-dto';
import type {PublicReportBundle,PublicReportDetail} from './types';

const RID='11111111-1111-4111-8111-111111111111',IID='22222222-2222-4222-8222-222222222222',PID='33333333-3333-4333-8333-333333333333';
function bundle(over:{report?:Record<string,unknown>;target?:Record<string,unknown>}={}):PublicReportBundle{
 return {
  report:{report_id:RID,revision:2,scope:'single_issuer',institution_id:IID,title:'Synthetic title',title_is_rewritten:false,title_zh:'合成标题',title_en:null,title_is_translation:true,
   published_date:'2026-10-01',price_as_of_date:'2026-09-30',report_type:'company',sector_as_stated:'Consumer',primary_target_key:'600000.SH',available_at:'2026-10-02T01:00:00+00:00',
   code_version:'abc1234',published_at:'2026-10-03T00:00:00+00:00',supersedes_report_id:null,page_count:12,snippet_max_chars:40,target_price_public:true,summary_public:true,
   rules_version:'broker-rules/1',title_model_id:'model-t',...over.report},
  targets:[{report_id:RID,publication_id:PID,target_key:'600000.SH',ticker_as_stated:'600000 CH',security_ticker:'600000.SH',issuer_id:'iss-1',rating_raw:'Overweight',rating_normalized:'overweight',scale_id:'sc-1',
   target_price:'12.50',target_currency:'CNY',target_horizon_months:12,upside_pct:'0.25',target_price_public:true,price_at_report:10,price_currency:'CNY',price_as_of_date:'2026-09-30',upside_formula_version:'upside/1',...over.target}],
  hasSummary:{zh:true,en:false},snippetCount:1,
  institution:{institution_id:IID,name_en:'Synthetic Securities',name_zh:'合成证券',aliases:['SynSec',3],kind:'broker',rating_disclosure_url:'javascript:alert(1)'},
 };
}
function detail(over:{report?:Record<string,unknown>;target?:Record<string,unknown>}={}):PublicReportDetail{
 return {...bundle(over),
  citations:[
   {report_id:RID,field_id:'f1',target_key:'600000.SH',field:'target_price',occurrence:1,page:1,value_text:'12.50',value_num:'12.50',value_currency:'CNY',value_unit:'price',value_date:null,status:'confirmed',extractor_kind:'llm'},
   {report_id:RID,field_id:'f2',target_key:'600000.SH',field:'rating',occurrence:1,page:1,value_text:'Overweight',value_num:null,value_currency:null,value_unit:null,value_date:null,status:'corrected',extractor_kind:'llm'},
   {report_id:RID,target_key:null,field:'not_a_field',occurrence:1,page:1,value_text:'x',status:'confirmed',extractor_kind:'llm'},
  ],
  snippets:[
   {snippet_id:'s1',report_id:RID,target_key:'600000.SH',purpose:'rating',page:2,text:'a'.repeat(40),field_id:'f1'},
   {snippet_id:'s2',report_id:RID,target_key:null,purpose:'risk',page:3,text:'b'.repeat(41),field_id:null},
  ],
  summaries:[{summary_id:'m1',report_id:RID,lang:'zh',kind:'independent_summary',model_id:'model-x',registry_hash:'reg-SECRET',prompt_version:'independent-summary/1',input_hash:'in-SECRET',summary_md:'摘要正文',generated_at:'2026-10-02T02:00:00+00:00',
   grounding_assertions:[{sentence_idx:0,target_key:'600000.SH',field:'target_price',value:'12.50',unit:'price'},{sentence_idx:'x'}]}],
  analysts:[{report_id:RID,analyst_id:'a1',display_name:'Analyst One',institution_id:IID,role:'lead'}],
 };
}

describe('dec',()=>{
 it('keeps decimal strings, prints numbers, rejects exponent and junk',()=>{
  expect(dec('1980.00')).toBe('1980.00');expect(dec(1980)).toBe('1980');expect(dec(-0.5)).toBe('-0.5');
  expect(dec(1e21)).toBeNull();expect(dec('1e3')).toBeNull();expect(dec('12,5')).toBeNull();expect(dec(null)).toBeNull();expect(dec(Number.NaN)).toBeNull();
 });
});

describe('toPublicReport',()=>{
 it('emits exactly the whitelisted keys',()=>{
  const r=toPublicReport(bundle())!;
  expect(Object.keys(r).sort()).toEqual(['availableAt','codeVersion','hasSummary','institution','primaryTargetKey','publishedDate','reportId','reportType','revision','rulesVersion','scope','sectorAsStated','snippetCount','targetPricePublic','targets','title']);
  expect(Object.keys(r.targets[0]).sort()).toEqual(['currency','issuerId','priceAtReport','publicationId','rating','securityTicker','target','targetKey','tickerAsStated','upsideFormulaVersion','upsidePct']);
  expect(r.targets[0]).toMatchObject({currency:'CNY',target:{price:'12.50',currency:'CNY',horizonMonths:12},priceAtReport:{value:'10',currency:'CNY',asOf:'2026-09-30'},upsidePct:'0.25',rating:{raw:'Overweight',normalized:'overweight',scaleId:'sc-1'}});   // upsidePct stays a FRACTION (0.25 = 25 %)
  expect(r.title).toEqual({text:'Synthetic title',isRewritten:false,zh:'合成标题',en:null,isTranslation:true,modelId:'model-t'});
  expect(r.rulesVersion).toBe('broker-rules/1');
  expect(r.institution).toEqual({id:IID,nameEn:'Synthetic Securities',nameZh:'合成证券'});
 });
 it('never carries private columns that reach a bundle by mistake',()=>{
  const b=bundle({report:{storage_path:'reports/SECRET.pdf',sha256:'SHA-SECRET',lease_token:'LEASE-SECRET',effective_hash:'EFF-SECRET'},target:{resolution:{candidates:['RES-SECRET']},input_hash:'IH-SECRET'}});
  const json=JSON.stringify(toPublicReport(b));
  for(const s of ['SECRET','storage_path','sha256','lease_token','effective_hash','resolution','input_hash'])expect(json).not.toContain(s);
 });
 it('drops target-price values when the licence does not allow them, even if a value leaks into the row',()=>{
  for(const over of [{report:{target_price_public:false}},{target:{target_price_public:false}}]){
   const r=toPublicReport(bundle(over))!;
   expect(r.targets[0].target).toBeNull();expect(r.targets[0].upsidePct).toBeNull();
   expect(JSON.stringify(r)).not.toContain('12.50');expect(JSON.stringify(r)).not.toContain('0.25');
  }
  expect(toPublicReport(bundle({report:{target_price_public:false}}))!.targetPricePublic).toBe(false);
 });
 it('maps unknown enum values to null and rejects rows without id or title',()=>{
  const r=toPublicReport(bundle({report:{scope:'weird'},target:{rating_normalized:'strong_buy'}}))!;
  expect(r.scope).toBeNull();expect(r.targets[0].rating.normalized).toBeNull();
  expect(toPublicReport(bundle({report:{report_id:null}}))).toBeNull();
  expect(toPublicReport(bundle({report:{title:''}}))).toBeNull();
 });
});

describe('toPublicReportDetail',()=>{
 it('whitelists citations, snippets, summaries and analysts',()=>{
  const d=toPublicReportDetail(detail())!;
  expect(d.citations).toHaveLength(2);
  expect(Object.keys(d.citations[0]).sort()).toEqual(['extractorKind','field','fieldId','occurrence','page','status','targetKey','valueCurrency','valueDate','valueNum','valueText','valueUnit']);
  expect(d.snippets.map(s=>[s.snippetId,s.fieldId])).toEqual([['s1','f1']]);   // 41 > N=40 is dropped; snippet ↔ citation by fieldId
  expect(d.summaries.zh).toEqual({summaryId:'m1',lang:'zh',label:'independent_summary',modelId:'model-x',promptVersion:'independent-summary/1',generatedAt:'2026-10-02T02:00:00+00:00',markdown:'摘要正文',
   groundingAssertions:[{sentenceIdx:0,targetKey:'600000.SH',field:'target_price',value:'12.50',unit:'price'}]});   // malformed assertion dropped; no field_id
  expect(d.summaries.en).toBeNull();
  expect(d.analysts).toEqual([{analystId:'a1',displayName:'Analyst One',role:'lead'}]);
  expect(d.licence).toEqual({snippetMaxChars:40,targetPricePublic:true,summaryPublic:true});
  expect(d.settlement).toBeNull();
  const json=JSON.stringify(d);
  for(const s of ['reg-SECRET','in-SECRET','field_id','registry_hash','input_hash'])expect(json).not.toContain(s);
 });
 it('drops target-price citations and fails closed on unknown N or summary flag',()=>{
  const d=toPublicReportDetail(detail({report:{target_price_public:false,snippet_max_chars:null,summary_public:false}}))!;
  expect(d.citations.map(c=>c.field)).toEqual(['rating']);
  expect(d.snippets).toEqual([]);expect(d.summaries).toEqual({zh:null,en:null});
  expect(d.hasSummary).toEqual({zh:false,en:false});
 });
});

describe('toPublicInstitution / toPublicHistoryRow',()=>{
 it('filters aliases and non-http disclosure urls',()=>{
  expect(toPublicInstitution(bundle().institution)).toEqual({id:IID,nameEn:'Synthetic Securities',nameZh:'合成证券',aliases:['SynSec'],kind:'broker',ratingDisclosureUrl:null,reportCount:0,lastPublishedDate:null,lastAvailableAt:null});
  expect(toPublicInstitution({institution_id:IID,name_en:'X',report_count:3,last_published_date:'2026-10-01',last_available_at:'2026-10-02T00:00:00+00:00'})).toMatchObject({reportCount:3,lastPublishedDate:'2026-10-01',lastAvailableAt:'2026-10-02T00:00:00+00:00'});
  expect(toPublicInstitution({institution_id:IID})).toBeNull();
 });
 it('history keeps the documented columns only',()=>{
  const h=toPublicHistoryRow({report_id:RID,prev_report_id:null,institution_id:IID,security_ticker:'600000.SH',issuer_id:'iss-1',published_date:'2026-10-01',prev_published_date:null,rating_normalized:'buy',prev_rating_normalized:null,scale_id:'sc',prev_scale_id:null,target_price:12.5,prev_target_price:null,target_currency:'CNY',upside_formula_version:'upside/1',prev_upside_formula_version:null,code_version:'c',prev_code_version:null,available_at:'2026-10-02T00:00:00+00:00',prev_available_at:null,input_hash:'IH-SECRET'})!;
  expect(h.targetPrice).toBe('12.5');expect(JSON.stringify(h)).not.toContain('SECRET');
  expect(Object.keys(h)).toHaveLength(20);
 });
});
