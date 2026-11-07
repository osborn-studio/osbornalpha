// Pure R1–R10 rule checks and alignment with the publication blocker sets (spec §7.1–7.2).
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {BLOCKING_QUARANTINE_REASONS} from './memory-db';
import {BLOCKING_REASONS,RULES_PARAMS,evaluateRules,jaccardAtLeast,marketCurrency,ratingKey,titleTokens,type RulesInput} from './rules';
import type {FieldRow,RatingScaleRow,TargetRow} from './types';
import type {PageText} from './extract/locate';

const SHA='a'.repeat(64);
const PAGES:PageText=[{page:1,text:'Rating: Overweight; target price US$120.00'},{page:2,text:'Upside 25.0% 🚀 x'}];
let n=0;
function field(o:Partial<FieldRow>&Pick<FieldRow,'field'>):FieldRow{
 n++;
 return {field_id:`f${String(n).padStart(3,'0')}`,report_id:'r1',parse_run_id:'p1',run_id:'x1',superseded_by_run_id:null,target_key:'NWND',occurrence:1,
  page:null,char_start:null,char_end:null,value_source_text:null,extractor:'llm:m@h',extractor_confidence:0.9,status:'confirmed',corrected:null,conflict_group:null,
  detail:{},reviewed_by:null,reviewed_at:null,created_at:'2026-11-05T00:00:00Z',value_text:'',value_num:null,value_currency:null,value_unit:null,value_date:null,...o};
}
function target(o:Partial<TargetRow>={}):TargetRow{
 return {report_id:'r1',target_key:'NWND',basis:'effective',ticker_as_stated:'NWND US',security_ticker:'NWND',issuer_id:'i1',resolution:{outcome:'resolved',candidates:['NWND']},
  rating_raw:'Overweight',rating_normalized:'overweight',scale_id:'s1',target_price:'120.00',target_currency:'USD',target_horizon_months:12,
  price_at_report:'96',price_currency:'USD',price_as_of_date:'2026-11-04',upside_pct:'0.25',upside_formula_version:'upside/1',input_hash:'h',...o};
}
const scale=(o:Partial<RatingScaleRow>={}):RatingScaleRow=>({scale_id:'s1',institution_id:'inst',raw_label:'Overweight',normalized:'overweight',source_url:'https://example.invalid/scale',valid_from:'2020-01-01',valid_to:null,created_by:'u',created_at:'2020-01-01T00:00:00Z',closed_by:null,closed_at:null,...o});
const upside=(num:string|null,o:Partial<FieldRow>={})=>field({field:'upside_stated',value_text:'25.0%',value_num:num,value_unit:'pct',page:2,char_start:7,char_end:12,value_source_text:'25.0%',...o});
function input(o:Partial<RulesInput>={}):RulesInput{
 return {report:{report_id:'r1',institution_id:'inst',published_date:'2026-11-05',title_original:'Northwind: Initiate at Overweight',supersedes_report_id:null},
  documentSha256:SHA,uploadedAt:'2026-11-05T10:00:00Z',fields:[upside('0.25')],targets:[target()],ratingScales:[scale()],artifacts:new Map([['p1',PAGES]]),...o};
}
const res=(out:ReturnType<typeof evaluateRules>,rule:string,tk:string|null='NWND')=>out.results.filter(r=>r.rule===rule&&r.target_key===tk);

describe('evaluateRules — happy path',()=>{
 it('all rules pass, nothing quarantined, versioned',()=>{
  const out=evaluateRules(input({peers:[]}));
  expect(out.version).toBe('broker-rules/1');
  expect(out.results.filter(r=>!r.passed)).toEqual([]);
  expect(out.quarantines).toEqual([]);
  expect(out.unverifiedFieldIds).toEqual([]);
  expect(out.infoCodes).toEqual([]);
  expect(new Set(out.results.map(r=>r.rule))).toEqual(new Set(['span_verbatim','upside_identity','currency_market','date_order','rating_scale_unique','positive_prices','ticker_resolution','horizon_present_with_target','possible_version']));
 });
 it('blocking flags follow spec §7.1',()=>{
  const out=evaluateRules(input({peers:[],texts:[{kind:'summary',id:'s',status:'approved',checks:[{name:'summary_overlap',passed:true}]}]}));
  const flags=Object.fromEntries(out.results.map(r=>[r.rule,r.blocking]));
  expect(flags).toEqual({span_verbatim:true,upside_identity:true,currency_market:true,date_order:true,rating_scale_unique:true,positive_prices:true,ticker_resolution:true,horizon_present_with_target:false,possible_version:false,text_checks:false});
 });
 it('exports the blocking reason set and parameters',()=>{
  expect([...BLOCKING_REASONS].sort()).toEqual(['ambiguous_rating_label','currency_mismatch','date_order','nonpositive_price','ticker_issuer_conflict','unknown_rating_label','unresolved_ticker','upside_mismatch']);
  expect(RULES_PARAMS).toEqual({upsideTolerance:'0.005',versionWindowDays:7,versionJaccard:{num:4,den:5}});
 });
 it('BLOCKING_REASONS equals the SQL blocker-10 set and the memory implementation set',()=>{
  const sql=readFileSync(new URL('../../../supabase/migrations/20261119091000_broker_research_functions.sql',import.meta.url),'utf8');
  const m=/q\.reason_code in \(([^)]*)\)/.exec(sql);
  expect(m).not.toBeNull();
  expect(m![1].split(',').map(x=>x.trim().replace(/^'|'$/g,'')).sort()).toEqual([...BLOCKING_REASONS].sort());
  expect([...BLOCKING_QUARANTINE_REASONS].sort()).toEqual([...BLOCKING_REASONS].sort());
 });
 it('rating label key equals SQL lower(btrim(label))',()=>{
  expect(ratingKey('  Overweight ')).toBe('overweight');
  const sql=readFileSync(new URL('../../../supabase/migrations/20261119091000_broker_research_functions.sql',import.meta.url),'utf8');
  expect(sql).toContain('lower(btrim(s.raw_label)) = lower(btrim(v.rating_raw))');
 });
});

describe('R1 span_verbatim',()=>{
 it('B4-01: skips already unverified rows without spans but blocks confirmed rows',()=>{
  const pending=field({field:'rating',status:'unverified'}),confirmed=field({field:'rating',status:'confirmed'});
  const out=evaluateRules(input({fields:[pending,confirmed]}));
  expect(res(out,'span_verbatim')).toEqual(expect.arrayContaining([
   expect.objectContaining({passed:true,detail:expect.objectContaining({skipped:'row_unverified',field_id:pending.field_id})}),
   expect.objectContaining({passed:false,reason_code:'span_missing',detail:expect.objectContaining({field_id:confirmed.field_id})}),
  ]));
  expect(out.unverifiedFieldIds).toEqual([confirmed.field_id]);
 });
 it('uses UTF-16 offsets after an astral char',()=>{
  const f=field({field:'rating',value_text:'x',page:2,char_start:16,char_end:17,value_source_text:'x'});
  expect(PAGES[1].text.slice(16,17)).toBe('x');
  expect(res(evaluateRules(input({fields:[f]})),'span_verbatim')[0]).toMatchObject({passed:true,detail:{field_id:f.field_id}});
 });
 it('mismatch marks rows unverified, without quarantine',()=>{
  const a=field({field:'target_price',page:1,char_start:33,char_end:42,value_source_text:'US$ 120.0',status:'confirmed'});
  const b=field({field:'rating',page:1,char_start:8,char_end:18,value_source_text:'Overweight',status:'extracted'});
  const out=evaluateRules(input({fields:[a,b]}));
  expect(res(out,'span_verbatim').map(r=>[r.detail.field_id,r.passed,r.reason_code])).toEqual([[a.field_id,false,'span_mismatch'],[b.field_id,true,null]]);
  expect(out.unverifiedFieldIds).toEqual([a.field_id]);
  expect(out.quarantines.filter(q=>q.rule==='span_verbatim')).toEqual([]);
 });
 it('handles missing span/artifact/out-of-range and excludes superseded/rejected/absent rows',()=>{
  const noSpan=field({field:'rating',status:'unverified'});
  const noArt=field({field:'rating',parse_run_id:'p9',page:1,char_start:0,char_end:6,value_source_text:'Rating'});
  const range=field({field:'rating',page:1,char_start:0,char_end:999,value_source_text:'Rating'});
  const sup=field({field:'rating',superseded_by_run_id:'x2',page:1,char_start:0,char_end:1,value_source_text:'nope'});
  const rej=field({field:'rating',status:'rejected',page:1,char_start:0,char_end:1,value_source_text:'nope'});
  const abs=field({field:'target_horizon',status:'absent',value_text:'ABSENT',page:1,extractor:'human:u'});
  const out=evaluateRules(input({fields:[noSpan,noArt,range,sup,rej,abs]}));
  expect(res(out,'span_verbatim').map(r=>[r.detail.field_id,r.reason_code])).toEqual([[noSpan.field_id,null],[noArt.field_id,'artifact_unavailable'],[range.field_id,'span_mismatch']]);
  expect(out.unverifiedFieldIds).toEqual([noArt.field_id,range.field_id]);
 });
});

describe('R2 upside_identity',()=>{
 const run=(stated:string|null,t:Partial<TargetRow>={})=>evaluateRules(input({fields:stated===null?[]:[upside(stated)],targets:[target(t)]}));
 it('accepts tolerance edges and quarantines just outside',()=>{
  expect(res(run('0.25'),'upside_identity')[0]).toMatchObject({passed:true,detail:{computed:'0.25'}});
  expect(res(run('0.255'),'upside_identity')[0].passed).toBe(true);
  expect(res(run('0.245'),'upside_identity')[0].passed).toBe(true);
  const out=run('0.2551');
  expect(res(out,'upside_identity')[0]).toMatchObject({passed:false,blocking:true,reason_code:'upside_mismatch'});
  expect(out.quarantines).toEqual([{naturalKey:`${SHA}:upside_identity:NWND`,rule:'upside_identity',reasonCode:'upside_mismatch',targetKey:'NWND',payload:{target_key:'NWND',upside_stated:'0.2551',target_price:'120.00',price_at_report:'96',page:2}}]);
 });
 it('handles values a double would round',()=>{
  expect(res(run('0.1',{target_price:'0.3',price_at_report:'0.2727272727272727272727'}),'upside_identity')[0].passed).toBe(true);
  expect(res(run('0',{target_price:'12345678901234567890.12',price_at_report:'12345678901234567890.12'}),'upside_identity')[0].passed).toBe(true);
 });
 it('skips missing inputs, different currencies, and nonpositive price',()=>{
  expect(res(run(null),'upside_identity')[0].detail).toEqual({skipped:'upside_stated_missing'});
  expect(res(run('0.25',{price_at_report:null}),'upside_identity')[0].detail).toEqual({skipped:'price_missing'});
  expect(res(run('0.25',{price_currency:'HKD'}),'upside_identity')[0].detail).toEqual({skipped:'currency_differs'});
  expect(res(run('0.25',{price_at_report:'0'}),'upside_identity')[0].detail).toEqual({skipped:'nonpositive_price'});
 });
 it('prefers corrected effective values and excludes conflicted candidates',()=>{
  const corrected=upside('0.9',{status:'corrected',corrected:{value_text:'25%',value_num:'0.25'}});
  expect(res(evaluateRules(input({fields:[corrected]})),'upside_identity')[0].passed).toBe(true);
  const c1=upside('0.9',{status:'extracted',conflict_group:'g'}),c2=upside('0.25',{status:'extracted',conflict_group:'g'});
  expect(res(evaluateRules(input({fields:[c1,c2]})),'upside_identity')[0].detail).toEqual({skipped:'upside_stated_missing'});
  expect(res(evaluateRules(input({fields:[upside('0.9',{status:'extracted'})]})),'upside_identity')[0].passed).toBe(false);
 });
});

describe('R3 currency_market',()=>{
 it.each([['600519.SH','CNY'],['000858.SZ','CNY'],['430047.BJ','CNY'],['09988.HK','HKD'],['BABA','USD'],['BRK.B','USD']])('%s → %s',(t,c)=>expect(marketCurrency(t)).toBe(c));
 it('checks either currency and skips missing security ticker',()=>{
  const out=evaluateRules(input({targets:[target({security_ticker:'09988.HK',target_currency:'HKD',price_currency:'USD'})],fields:[]}));
  expect(res(out,'currency_market')[0]).toMatchObject({passed:false,reason_code:'currency_mismatch',detail:{allowed:'HKD',offending:[{price_currency:'USD'}]}});
  expect(out.quarantines.map(q=>q.naturalKey)).toContain(`${SHA}:currency_market:NWND`);
  expect(res(evaluateRules(input({targets:[target({security_ticker:null,issuer_id:null})]})),'currency_market')[0].detail).toEqual({skipped:'security_ticker_missing'});
 });
});

describe('R4 date_order',()=>{
 it('checks equality and UTC uploaded date',()=>{
  expect(evaluateRules(input({targets:[target({price_as_of_date:'2026-11-05'})]})).results.filter(r=>r.rule==='date_order').every(r=>r.passed)).toBe(true);
  expect(res(evaluateRules(input({targets:[target({price_as_of_date:'2026-11-06'})]})),'date_order')[0]).toMatchObject({passed:false,reason_code:'date_order'});
  const out=evaluateRules(input({report:{report_id:'r1',institution_id:'inst',published_date:'2026-11-06',title_original:'t',supersedes_report_id:null},uploadedAt:'2026-11-06T07:00:00+08:00',targets:[]}));
  expect(res(out,'date_order',null)[0]).toMatchObject({passed:false,detail:{uploaded_date:'2026-11-05'}});
  expect(out.quarantines.map(q=>q.naturalKey)).toEqual([`${SHA}:date_order:-`]);
 });
 it('skips missing dates and rejects invalid uploaded_at',()=>{
  const out=evaluateRules(input({report:{report_id:'r1',institution_id:'inst',published_date:null,title_original:'t',supersedes_report_id:null}}));
  expect(res(out,'date_order',null)[0].detail).toEqual({skipped:'published_date_missing'});
  expect(res(out,'date_order')[0].detail).toEqual({skipped:'date_missing'});
  expect(()=>evaluateRules(input({uploadedAt:'x'}))).toThrow('invalid_uploaded_at');
 });
});

describe('R5 rating_scale_unique',()=>{
 it('matches exactly one current case-insensitive label',()=>{
  expect(res(evaluateRules(input({targets:[target({rating_raw:' OVERWEIGHT '})]})),'rating_scale_unique')[0]).toMatchObject({passed:true,detail:{matches:['s1']}});
 });
 it('reports unknown and ambiguous labels',()=>{
  const cases:[RatingScaleRow[],string][]=[[[],'unknown_rating_label'],[[scale({institution_id:'other'})],'unknown_rating_label'],[[scale({valid_from:'2026-11-06'})],'unknown_rating_label'],[[scale({valid_to:'2026-11-05'})],'unknown_rating_label'],[[scale(),scale({scale_id:'s2',valid_from:'2021-01-01'})],'ambiguous_rating_label']];
  for(const [rows,code] of cases){const out=evaluateRules(input({ratingScales:rows}));expect(res(out,'rating_scale_unique')[0]).toMatchObject({passed:false,reason_code:code});expect(out.quarantines.find(q=>q.rule==='rating_scale_unique')).toMatchObject({reasonCode:code,payload:{rating_raw:'Overweight',published_date:'2026-11-05'}});}
  expect(res(evaluateRules(input({ratingScales:[scale({valid_to:'2026-11-06'})]})),'rating_scale_unique')[0].passed).toBe(true);
 });
 it('skips without rating or institution/date',()=>{
  expect(res(evaluateRules(input({targets:[target({rating_raw:null})]})),'rating_scale_unique')[0].detail).toEqual({skipped:'rating_missing'});
  expect(res(evaluateRules(input({report:{report_id:'r1',institution_id:null,published_date:'2026-11-05',title_original:'t',supersedes_report_id:null}})),'rating_scale_unique')[0].detail).toEqual({skipped:'institution_or_date_missing'});
 });
});

describe('R6 positive_prices',()=>{
 it('rejects zero/negative and skips absent prices',()=>{
  expect(res(evaluateRules(input({targets:[target({target_price:'0'})],fields:[]})),'positive_prices')[0]).toMatchObject({passed:false,reason_code:'nonpositive_price',detail:{offending:['target_price']}});
  expect(res(evaluateRules(input({targets:[target({price_at_report:'-0.01'})],fields:[]})),'positive_prices')[0].detail).toEqual({offending:['price_at_report']});
  expect(res(evaluateRules(input({targets:[target({target_price:'0.0001'})],fields:[]})),'positive_prices')[0].passed).toBe(true);
  expect(res(evaluateRules(input({targets:[target({target_price:null,price_at_report:null})],fields:[]})),'positive_prices')[0].detail).toEqual({skipped:'prices_missing'});
 });
});

describe('R7 possible_version',()=>{
 const peer=(o:Record<string,unknown>={})=>({report_id:'r0',institution_id:'inst',published_date:'2026-10-30',title_original:'Northwind: Initiate at Overweight',security_tickers:['NWND'],...o});
 it('detects same issuer/institution within seven days with Jaccard >= 0.8',()=>{
  const out=evaluateRules(input({peers:[peer(),peer({report_id:'r2',published_date:'2026-10-28'}),peer({report_id:'r3',institution_id:'x'}),peer({report_id:'r4',security_tickers:['OTHER']}),peer({report_id:'r5',title_original:'Completely different note'}),peer({report_id:'r1'})]}));
  expect(res(out,'possible_version',null)[0]).toMatchObject({passed:false,blocking:false,reason_code:'possible_version',detail:{peers:['r0']}});
  expect(out.quarantines.find(q=>q.rule==='possible_version')).toEqual({naturalKey:`${SHA}:possible_version:-`,rule:'possible_version',reasonCode:'possible_version',targetKey:null,payload:{peers:['r0'],published_date:'2026-11-05'}});
 });
 it('excludes superseded predecessor and skips missing peers',()=>{
  const out=evaluateRules(input({report:{report_id:'r1',institution_id:'inst',published_date:'2026-11-05',title_original:'Northwind: Initiate at Overweight',supersedes_report_id:'r0'},peers:[peer()]}));
  expect(res(out,'possible_version',null)[0].passed).toBe(true);
  expect(res(evaluateRules(input()),'possible_version',null)[0].detail).toEqual({skipped:'peers_not_supplied'});
 });
 it('tokenizes Han individually and uses exact integer Jaccard',()=>{
  expect(titleTokens('贵州茅台: Initiate at OW')).toEqual(new Set(['贵','州','茅','台','initiate','at','ow']));
  expect(jaccardAtLeast(new Set(['a','b','c','d']),new Set(['a','b','c','d','e']),4,5)).toBe(true);
  expect(jaccardAtLeast(new Set(['a','b','c']),new Set(['a','b','c','d']),4,5)).toBe(false);
  expect(jaccardAtLeast(new Set(),new Set(),4,5)).toBe(false);
 });
});

describe('R8 text_checks',()=>{
 it('reports first failed stored check without blocking or quarantine',()=>{
  const out=evaluateRules(input({texts:[{kind:'snippet',id:'n1',status:'draft',checks:[{name:'disclosure',passed:true},{name:'restricted_value',passed:false}]}]}));
  expect(res(out,'text_checks',null)[0]).toMatchObject({passed:false,blocking:false,reason_code:'restricted_value',detail:{kind:'snippet',id:'n1'}});
  expect(out.quarantines.filter(q=>q.rule==='text_checks')).toEqual([]);
 });
});

describe('R9 ticker_resolution',()=>{
 it('blocks unresolved and conflicted tickers with bounded quarantine payloads',()=>{
  const out=evaluateRules(input({targets:[target({target_key:'ZZZZ',issuer_id:null,security_ticker:null,resolution:{outcome:'unresolved',candidates:['ZZZZ']}}),target({target_key:'XYZ.A',issuer_id:null,security_ticker:null,resolution:{outcome:'conflict',candidates:['XYZ.A','XYZ']}})],fields:[]}));
  expect(res(out,'ticker_resolution','ZZZZ')[0]).toMatchObject({passed:false,blocking:true,reason_code:'unresolved_ticker'});
  expect(res(out,'ticker_resolution','XYZ.A')[0].reason_code).toBe('ticker_issuer_conflict');
  expect(out.quarantines.filter(q=>q.rule==='ticker_resolution').map(q=>[q.naturalKey,q.reasonCode,q.payload.candidates])).toEqual([[`${SHA}:ticker_resolution:XYZ.A`,'ticker_issuer_conflict',['XYZ.A','XYZ']],[`${SHA}:ticker_resolution:ZZZZ`,'unresolved_ticker',['ZZZZ']]]);
 });
});

describe('R10 horizon_present_with_target',()=>{
 it('emits information code without quarantine',()=>{
  const out=evaluateRules(input({targets:[target({target_horizon_months:null})]}));
  expect(res(out,'horizon_present_with_target')[0]).toMatchObject({passed:false,blocking:false,reason_code:'horizon_missing'});
  expect(out.infoCodes).toEqual(['rule_warning_summary']);
  expect(out.quarantines.filter(q=>q.rule==='horizon_present_with_target')).toEqual([]);
 });
 it('accepts an absent horizon row and skips without a target price',()=>{
  const abs=field({field:'target_horizon',status:'absent',value_text:'ABSENT',page:1,extractor:'human:u'});
  expect(res(evaluateRules(input({targets:[target({target_horizon_months:null})],fields:[abs]})),'horizon_present_with_target')[0].passed).toBe(true);
  expect(res(evaluateRules(input({targets:[target({target_price:null,target_horizon_months:null})]})),'horizon_present_with_target')[0].detail).toEqual({skipped:'no_target_price'});
 });
});
