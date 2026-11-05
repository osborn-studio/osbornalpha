// src/lib/facts/providers/tushare-statements.test.ts
import {createHash} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {TushareError,type TushareRaw} from '../../data/sources/tushare';
import {FACT_CONCEPTS,tushareFieldsFor} from '../concepts';
import {decodeColumns,scanJsonNumbers} from '../json-numbers';
import {TUSHARE_APIS,TUSHARE_NUMBER_SCHEMA,addDecimals,coverageSummary,fetchTushareStatements,fieldsFor,isTushareQuotaMessage,parseTushareStatements,resetTusharePacing} from './tushare-statements';
import {loadTushareFixtures,tushareFixtureDir} from './tushare-fixtures';
import {snapshotOf} from './shared';

const budget=(ms=300_000):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});
const raw=(items:unknown[][],hasMore:boolean,fields='ts_code,end_date'):TushareRaw=>{const text=JSON.stringify({request_id:'r',code:0,msg:null,data:{fields:fields.split(','),items,has_more:hasMore}});return {bytes:new TextEncoder().encode(text),sha256:createHash('sha256').update(text).digest('hex'),httpStatus:200,requestId:'r',code:0,msg:'',fields:fields.split(','),items,hasMore};};

describe('fieldsFor / addDecimals / quota detection',()=>{
 it('derives the field list from the catalogue (common fields first; cashflow adds is_calc)',()=>{
  expect(fieldsFor('income').split(',').slice(0,8)).toEqual(['ts_code','ann_date','f_ann_date','end_date','report_type','comp_type','end_type','update_flag']);
  expect(fieldsFor('income')).toContain('sell_exp');expect(fieldsFor('income')).toContain('admin_exp');expect(fieldsFor('income')).toContain('fin_exp_int_exp');
  expect(fieldsFor('cashflow').split(',')).toContain('is_calc');expect(fieldsFor('balancesheet')).toContain('total_share');expect(fieldsFor('balancesheet')).toContain('money_cap');
  expect(fieldsFor('balancesheet')).not.toContain('is_calc');
  for(const api of TUSHARE_APIS)for(const f of tushareFieldsFor(api))expect(fieldsFor(api).split(',')).toContain(f);
 });
 it('adds decimals exactly',()=>{
  expect(addDecimals('4649000000','9729000000')).toBe('14378000000');
  expect(addDecimals('0.1','0.2')).toBe('0.3');expect(addDecimals('-0.5','0.5')).toBe('0');expect(addDecimals('12345678901234567890','1')).toBe('12345678901234567891');
 });
 it('recognises quota / rate-limit messages',()=>{
  expect(isTushareQuotaMessage('抱歉，您每分钟最多访问该接口50次')).toBe(true);
  expect(isTushareQuotaMessage('抱歉，您没有访问该接口的权限，权限的具体详情访问...积分')).toBe(true);
  expect(isTushareQuotaMessage('参数错误')).toBe(false);
 });
});

describe('lossless value columns (single source: tushareFieldsFor)',()=>{
 it('the decimal schema lists every value column of every api, and decodeColumns returns exact decimal strings for each',()=>{
  for(const api of TUSHARE_APIS){
   const cols=tushareFieldsFor(api);
   expect(cols.length).toBeGreaterThan(0);
   for(const f of cols)expect(TUSHARE_NUMBER_SCHEMA.decimal).toContain(f);
   const text=`{"data":{"fields":${JSON.stringify(['ts_code','report_type',...cols])},"items":[${JSON.stringify('x')==='"x"'?`["600519.SH",1,${cols.map(()=>'12345678901234567890.125').join(',')}]`:''}]}}`;
   const tree=scanJsonNumbers(text) as {data:{fields:string[];items:unknown[][]}};
   const [row]=decodeColumns(tree.data.fields,tree.data.items,TUSHARE_NUMBER_SCHEMA);
   expect(row.report_type).toBe(1);
   for(const f of cols)expect(row[f]).toBe('12345678901234567890.125');
  }
 });
 it('parses every mapped concept of every api to the exact decimal (sums included), no double rounding',()=>{
  for(const api of TUSHARE_APIS){
   const cols=tushareFieldsFor(api);
   const fields=fieldsFor(api).split(',');
   const lit='12345678901234567890.125';
   const row=fields.map(f=>f==='ts_code'?'"600519.SH"':f==='end_date'?'"20231231"':f==='ann_date'||f==='f_ann_date'?'"20240403"':f==='report_type'?'1':f==='is_calc'?'0':cols.includes(f)?lit:'1');
   const text=`{"request_id":"r","code":0,"msg":null,"data":{"fields":${JSON.stringify(fields)},"items":[[${row.join(',')}]],"has_more":false}}`;
   const r=parseTushareStatements([snapshotOf(new TextEncoder().encode(text),{source:'tushare',api,params:{report_type:'1'},page:1})],{sinceYear:2014});
   const mapped=FACT_CONCEPTS.filter(c=>c.tushare?.api===api);
   expect(r.candidates.map(c=>c.concept).sort()).toEqual(mapped.map(c=>c.id).sort());
   for(const c of r.candidates){const def=mapped.find(m=>m.id===c.concept)!;expect(c.value).toBe('sum' in def.tushare!?'24691357802469135780.25':'12345678901234567890.125');}
  }
 });
});

describe('fetchTushareStatements',()=>{
 beforeEach(()=>{resetTusharePacing();});
 it('calls 3 apis × report types 1/4/5 with start_date, pages by limit/offset until has_more is false or a short page, one snapshot per page',async()=>{
  // typed like tushareCallRaw: the options argument is optional there, so the mock takes it with a default (round-1 #5)
  const call=vi.fn(async(api:string,params:Record<string,unknown>,_f:string,o:{limit?:number;offset?:number}={})=>{
   if(api==='income'&&params.report_type==='1')return o.offset===0?raw([['600519.SH','20231231'],['600519.SH','20230930']],true):raw([['600519.SH','20230630']],false);
   return raw([],false);
  });
  const snaps=await fetchTushareStatements('600519.SH',2014,budget(),{call,pageSize:2,sleep:async()=>{}});
  expect(call).toHaveBeenCalledTimes(10);
  expect(call.mock.calls.map(c=>`${c[0]}:${(c[1] as {report_type:string}).report_type}`).slice(0,3)).toEqual(['income:1','income:1','income:4']);
  for(const c of call.mock.calls)expect(c[1]).toMatchObject({ts_code:'600519.SH',start_date:'20140101'});
  const income1=snaps.filter(s=>s.meta.api==='income'&&(s.meta.params as {report_type:string}).report_type==='1');
  expect(income1.map(s=>[s.meta.page,s.meta.has_more,(s.meta.params as {offset:number}).offset])).toEqual([[1,true,0],[2,false,2]]);
  expect(snaps).toHaveLength(10);
  for(const s of snaps){expect(s.meta.source).toBe('tushare');expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(s.meta)).not.toContain('token');}
 });
 it('maps quota messages and HTTP 429 to quota_exhausted, other API errors to tushare_unavailable, and stops on budget',async()=>{
  const quota=async()=>({...raw([],false),code:40203,msg:'抱歉，您每天最多访问该接口10次'});
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:quota,sleep:async()=>{}})).rejects.toMatchObject({code:'quota_exhausted'});
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>{throw new TushareError(429,'HTTP 429');},sleep:async()=>{}})).rejects.toMatchObject({code:'quota_exhausted'});
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>({...raw([],false),code:2002,msg:'参数错误'}),sleep:async()=>{}})).rejects.toMatchObject({code:'tushare_unavailable'});
  const noCall=vi.fn();
  await expect(fetchTushareStatements('600519.SH',2014,budget(10_000),{call:noCall})).rejects.toMatchObject({code:'tushare_unavailable'});
  expect(noCall).not.toHaveBeenCalled();
  await expect(fetchTushareStatements('AAPL',2014,budget(),{call:noCall})).rejects.toMatchObject({code:'parse_error'});
 });
 it('thrown messages are fixed tokens: neither the Tushare msg nor an error text of the transport reaches them',async()=>{
  const e1=await fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>({...raw([],false),code:2002,msg:'SECRET-MSG 参数错误'}),sleep:async()=>{}}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(e1.message).toBe('tushare_unavailable: api_code_2002');
  const e2=await fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>({...raw([],false),code:40203,msg:'SECRET-MSG 每分钟最多访问'}),sleep:async()=>{}}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(e2.message).toBe('quota_exhausted: api_code_40203');
  const e3=await fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>{throw new TushareError(500,'HTTP 500 SECRET-BODY');},sleep:async()=>{}}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(e3.message).toBe('tushare_unavailable: request_failed_500');
  const e4=await fetchTushareStatements('600519.SH',2014,budget(),{call:async()=>{throw new Error('SECRET-BODY');},sleep:async()=>{}}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(e4.message).toBe('tushare_unavailable: request_failed_x');
 });
 it('stops when upstream ignores offset and repeats the same page',async()=>{
  const page=raw([['600519.SH','20231231'],['600519.SH','20230930']],true);
  const call=vi.fn(async()=>page);
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call,pageSize:2,sleep:async()=>{}})).rejects.toMatchObject({code:'tushare_unavailable',message:'tushare_unavailable: paging_not_advancing'});
  expect(call).toHaveBeenCalledTimes(2);
 });
});

describe('parseTushareStatements (600519.SH fixtures)',()=>{
 const {synthetic}=tushareFixtureDir('600519.SH');
 const r=parseTushareStatements(loadTushareFixtures('600519.SH'),{sinceYear:2014});
 const find=(concept:string,ref:string)=>r.candidates.find(c=>c.concept===concept&&c.filingRef===ref);
 it('builds YTD duration candidates with CNY units, Jan-1 period_start and the source_ref filing key',()=>{
  const fy23=r.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-12-31'&&c.filingRef.split(':')[2]==='1');
  expect(fy23).toHaveLength(1);
  expect(fy23[0]).toMatchObject({periodStart:'2023-01-01',duration:'12M',unit:'CNY',statement:'IS',sourceConcept:'income.total_revenue',consolidation:'consolidated'});
  expect(fy23[0].filingRef).toMatch(/^600519\.SH:20231231:1:\d{8}$/);
  if(synthetic)expect(fy23[0]).toMatchObject({value:'150560000000.12',filingRef:'600519.SH:20231231:1:20240403'});
  const f=r.filings.find(x=>x.sourceRef===fy23[0].filingRef)!;
  expect(f).toMatchObject({market:'CN',source:'tushare',origin:'sse',formType:'annual',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',url:null});
  expect(f.availableDate).toBe(`${f.sourceRef.slice(-8,-4)}-${f.sourceRef.slice(-4,-2)}-${f.sourceRef.slice(-2)}`);
 });
 it('sums sga_expense exactly, types eps as CNY/share and total_share as INSTANT shares, maps money_cap to monetary_funds, skips null fields and is_calc=1 rows',()=>{
  // FY2023 explicitly: filings sort by availableDate then sourceRef, so the first annual type-1 filing is
  // FY2022 (same announcement date), whose BS/CF rows the fixture does not carry (round-1 #17b).
  const annual=r.filings.find(x=>x.formType==='annual'&&x.fiscalYear===2023&&x.sourceRef.split(':')[2]==='1')!.sourceRef;
  const sga=find('sga_expense',annual)!;
  expect(sga.sourceConcept).toBe('income.sell_exp+admin_exp');
  if(synthetic)expect(sga.value).toBe('14378000000');
  expect(find('eps_basic',annual)).toMatchObject({unit:'CNY/share',duration:'12M'});
  expect(find('shares_outstanding',annual)).toMatchObject({unit:'shares',duration:'INSTANT',periodStart:null,statement:'BS'});
  expect(find('monetary_funds',annual)).toMatchObject({unit:'CNY',duration:'INSTANT',sourceConcept:'balancesheet.money_cap'});
  expect(r.candidates.some(c=>c.concept==='cash')).toBe(false);
  expect(find('operating_cash_flow',annual)).toMatchObject({statement:'CF',duration:'12M'});
  if(synthetic){expect(r.skipped).toContainEqual({reason:'is_calc',n:1});expect(r.skipped).toContainEqual(expect.objectContaining({reason:'null:short_term_borrowings'}));}
 });
 it('gross-margin inputs: cost_of_revenue (oper_cost) sits next to revenue_operating (营业收入), not total revenue',()=>{
  const annual=r.filings.find(x=>x.formType==='annual'&&x.fiscalYear===2023&&x.sourceRef.split(':')[2]==='1')!.sourceRef;
  expect(find('cost_of_revenue',annual)).toMatchObject({sourceConcept:'income.oper_cost'});
  expect(find('revenue_operating',annual)).toMatchObject({sourceConcept:'income.revenue'});
 });
 it('report types map to form types (4 → restatement), a type-5 row and its type-1 counterpart form a revision pair with different available dates',()=>{
  expect(r.filings.filter(x=>x.sourceRef.split(':')[2]==='4').every(x=>x.formType==='restatement')).toBe(true);
  const pairs=r.candidates.filter(a=>a.filingRef.split(':')[2]==='5').map(a=>[a,r.candidates.find(b=>b.filingRef.split(':')[2]==='1'&&b.concept===a.concept&&b.periodStart===a.periodStart&&b.periodEnd===a.periodEnd&&b.unit===a.unit)] as const).filter(([,b])=>b&&b.value!==undefined);
  expect(pairs.length).toBeGreaterThan(0);
  const [a,b]=pairs.find(([x,y])=>x.value!==y!.value)!;
  const avail=(ref:string)=>r.filings.find(f=>f.sourceRef===ref)!.availableDate;
  expect(avail(a.filingRef)<avail(b!.filingRef)).toBe(true);
  if(synthetic){expect(a).toMatchObject({concept:'revenue',value:'127554000000'});expect(b).toMatchObject({value:'127554000001'});expect(avail(a.filingRef)).toBe('2023-03-31');expect(avail(b!.filingRef)).toBe('2024-04-03');}
 });
 it('same filing + same key with different values (update_flag 0/1) → ambiguous; equal values stay single; missing ann dates → missingAvailableDate',()=>{
  if(!synthetic)return;   // 真实夹具是否含此形态未知；Step 10 记录核对结果
  expect(r.ambiguous).toHaveLength(1);
  expect(r.ambiguous[0].key).toBe('600519.SH:20240630:1:20240803|revenue|2024-01-01|2024-06-30|CNY');
  expect(r.ambiguous[0].candidates.map(c=>c.value)).toEqual(['83000000000','83400000000']);
  expect(r.candidates.filter(c=>c.filingRef==='600519.SH:20240630:1:20240803'&&c.concept==='revenue')).toEqual([]);
  expect(find('revenue_operating','600519.SH:20240630:1:20240803')).toMatchObject({value:'81900000000'});
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({ts_code:'600519.SH',end_date:'20230331',report_type:4,api:'income'})]);
 });
 it('parked rows carry row-level evidence: locator on ambiguous candidates, lossless values + snapshot sha256 + locator on rows without a date',()=>{
  if(!synthetic)return;
  for(const c of r.ambiguous[0].candidates)expect((c as {locator?:string}).locator).toMatch(/^income:rt1:p1\[end_date=20240630,ann=20240803,update_flag=[01],row=\d\]$/);
  const m=r.missingAvailableDate[0];
  expect(m).toMatchObject({page:1,row:1,snapshot_sha256:expect.stringMatching(/^[0-9a-f]{64}$/),locator:'income:rt4:p1[end_date=20230331,ann=,update_flag=0,row=1]'});
  expect((m.values as Record<string,string>).total_revenue).toBe('39400000000');
  expect((m.values as Record<string,string>).basic_eps).toBe('16.55');
  expect(Object.keys(m.values as object)).not.toContain('rd_exp');   // null columns are absent, not zero
 });
 it('every value is canonical, raw hashes are per row, oddDuration is empty, and the coverage summary counts distinct end dates per (api, report_type, year)',()=>{
  for(const c of r.candidates){expect(c.value).toMatch(/^-?(0|[1-9]\d*)(\.\d*[1-9])?$/);expect(c.rawHash).toMatch(/^[0-9a-f]{64}$/);}
  // row-level evidence (spec §4.7): facts of one source row share a raw_hash; different rows never collide
  expect(new Set(r.candidates.map(c=>c.rawHash)).size).toBe(new Set(r.candidates.map(c=>(c as {locator?:string}).locator)).size);
  expect(r.oddDuration).toEqual([]);
  const cov=coverageSummary(r);
  expect(cov.find(x=>x.api==='income'&&x.report_type===1)).toBeDefined();
  if(synthetic)expect(cov).toEqual([{api:'balancesheet',report_type:1,years:{'2023':1}},{api:'cashflow',report_type:1,years:{'2023':1}},{api:'income',report_type:1,years:{'2022':1,'2023':1,'2024':1}},{api:'income',report_type:4,years:{'2023':1}},{api:'income',report_type:5,years:{'2022':1}}]);
 });
 it('a page with data:null parses to nothing without throwing',()=>{
  const nullPages=loadTushareFixtures('600519.SH').filter(s=>Buffer.from(s.bytes).toString('utf8').includes('"data":null'));
  if(synthetic)expect(nullPages.map(s=>`${s.meta.api}:${(s.meta.params as {report_type:string}).report_type}`)).toEqual(['balancesheet:5']);
  for(const s of nullPages){const one=parseTushareStatements([s],{sinceYear:2014});expect(one.candidates).toEqual([]);expect(one.filings).toEqual([]);expect(one.skipped).toEqual([]);}
 });
 it('malformed pages fail as parse_error: row width mismatch, non-integer control column; bad dates are row_shape / missing date, odd end dates park as oddDuration',()=>{
  const snap=(fields:string[],rows:string)=>snapshotOf(new TextEncoder().encode(`{"code":0,"data":{"fields":${JSON.stringify(fields)},"items":[${rows}]}}`),{source:'tushare',api:'income',params:{report_type:'1'},page:1});
  const f=['ts_code','ann_date','end_date','report_type','total_revenue'];
  expect(()=>parseTushareStatements([snap(f,'["600519.SH","20240403","20231231",1]')])).toThrow(/invalid_row_width/);
  expect(()=>parseTushareStatements([snap(f,'["600519.SH","20240403","20231231",1.5,100]')])).toThrow(/invalid_control_field:report_type/);
  const bad=parseTushareStatements([snap(f,'["600519.SH","20240403","20231399",1,100],["600519.SH","20241399","20231231",1,100],["600519.SH","20240403","20230520",1,100]')],{sinceYear:2014});
  expect(bad.skipped).toContainEqual({reason:'row_shape',n:1});
  expect(bad.missingAvailableDate).toHaveLength(1);
  expect(bad.oddDuration.map(c=>c.periodEnd)).toEqual(['2023-05-20']);
 });
});
