// src/lib/facts/providers/tushare-statements.test.ts
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Budget} from '../types';
import {TushareError,type TushareRaw} from '../../data/sources/tushare';
import {FACT_CONCEPTS,tushareFieldsFor} from '../concepts';
import {decodeColumns,scanJsonNumbers} from '../json-numbers';
import {TUSHARE_APIS,TUSHARE_NUMBER_SCHEMA,addDecimals,coverageSummary,fetchTushareStatements,fieldsFor,isTushareQuotaMessage,parseTushareStatements,resetTusharePacing} from './tushare-statements';
import {SYNTHETIC_DIR,commitRecording,loadTushareFixtures,manifestName,writeRecording} from './tushare-fixtures';
import {snapshotOf} from './shared';

const budget=(ms=300_000):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});
let seq=0;   // every response carries a unique request_id, like the real API
const raw=(items:unknown[][],hasMore:boolean,fields='ts_code,end_date'):TushareRaw=>{const text=JSON.stringify({request_id:`r-${++seq}`,code:0,msg:null,data:{fields:fields.split(','),items,has_more:hasMore}});return {bytes:new TextEncoder().encode(text),sha256:createHash('sha256').update(text).digest('hex'),httpStatus:200,requestId:'r',code:0,msg:'',fields:fields.split(','),items,hasMore};};

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
   const text=`{"data":{"fields":${JSON.stringify(['ts_code','report_type',...cols])},"items":[["600519.SH",1,${cols.map(()=>'12345678901234567890.125').join(',')}]]}}`;
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
   const r=parseTushareStatements([snapshotOf(new TextEncoder().encode(text),{source:'tushare',api,params:{ts_code:'600519.SH',report_type:'1'},page:1})],{sinceYear:2014});
   const mapped=FACT_CONCEPTS.filter(c=>c.tushare?.api===api);
   expect(r.candidates.map(c=>c.concept).sort()).toEqual(mapped.map(c=>c.id).sort());
   for(const c of r.candidates){const def=mapped.find(m=>m.id===c.concept)!;expect(c.value).toBe('sum' in def.tushare!?'24691357802469135780.25':'12345678901234567890.125');}
  }
 });
});

describe('fetchTushareStatements',()=>{
 beforeEach(()=>{resetTusharePacing();});
 it('a pacing wait that would end inside the 20 s reserve is rejected without sleeping',async()=>{
  const sleep=vi.fn(async()=>{});const t=7_000_000;
  const call=vi.fn(async()=>raw([],false));
  await expect(fetchTushareStatements('600519.SH',2014,budget(20_100),{call,sleep,now:()=>t})).rejects.toMatchObject({code:'tushare_unavailable',message:'tushare_unavailable: budget_exhausted'});
  expect(sleep).not.toHaveBeenCalled();expect(call).toHaveBeenCalledTimes(1);
 });
 it('calls 3 apis × report types 1/4/5 with start_date, exactly one request and one snapshot per stream (offset 0, page 1)',async()=>{
  const call=vi.fn(async(api:string,params:Record<string,unknown>,_f:string,_o:{limit?:number;offset?:number}={})=>{
   if(api==='income'&&params.report_type==='1')return raw([['600519.SH','20231231'],['600519.SH','20230930']],false);
   return raw([],false);
  });
  const snaps=await fetchTushareStatements('600519.SH',2014,budget(),{call,pageSize:2,sleep:async()=>{}});
  expect(call).toHaveBeenCalledTimes(9);
  expect(call.mock.calls.map(c=>`${c[0]}:${(c[1] as {report_type:string}).report_type}`).slice(0,3)).toEqual(['income:1','income:4','income:5']);
  for(const c of call.mock.calls)expect(c[1]).toMatchObject({ts_code:'600519.SH',start_date:'20140101'});
  const income1=snaps.filter(s=>s.meta.api==='income'&&(s.meta.params as {report_type:string}).report_type==='1');
  expect(income1.map(s=>[s.meta.page,s.meta.has_more,(s.meta.params as {offset:number}).offset])).toEqual([[1,false,0]]);
  expect(snaps).toHaveLength(9);
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
 it('fails closed with multi_page_unverified when a page says has_more=true (offset paging is not order-stable on tied rows); no second page is requested',async()=>{
  const call=vi.fn(async()=>raw([['600519.SH','20231231'],['600519.SH','20230930']],true));
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call,pageSize:2,sleep:async()=>{}})).rejects.toMatchObject({code:'tushare_unavailable',message:'tushare_unavailable: multi_page_unverified'});
  expect(call).toHaveBeenCalledTimes(1);
  const short=vi.fn(async()=>raw([['600519.SH','20231231']],true));
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:short,pageSize:5,sleep:async()=>{}})).rejects.toMatchObject({message:'tushare_unavailable: multi_page_unverified'});
  expect(short).toHaveBeenCalledTimes(1);
  const empty=vi.fn(async()=>raw([],true));
  await expect(fetchTushareStatements('600519.SH',2014,budget(),{call:empty,pageSize:5,sleep:async()=>{}})).rejects.toMatchObject({message:'tushare_unavailable: multi_page_unverified'});
 });
 it('has_more=false stops even on a full page, and the parser reports the suspicious full page',async()=>{
  const full=vi.fn(async()=>raw([['600519.SH','20231231'],['600519.SH','20230930']],false));
  const one=await fetchTushareStatements('600519.SH',2014,budget(),{call:full,pageSize:2,sleep:async()=>{}});
  expect(full).toHaveBeenCalledTimes(9);expect(one).toHaveLength(9);
  const parsed=parseTushareStatements(one.slice(0,1));
  expect(parsed.skipped).toContainEqual({reason:'page_full_no_more',n:1});
 });
 it('maps budget and timeout failures: -2 → budget_exhausted, -4 → snapshot_too_large, aborted budget → budget_aborted, other abort → request_timeout; the reserve is applied once',async()=>{
  const run=(e:unknown,b=budget())=>fetchTushareStatements('600519.SH',2014,b,{call:async()=>{throw e;},sleep:async()=>{}}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect((await run(new TushareError(-2,'budget exhausted'))).message).toBe('tushare_unavailable: budget_exhausted');
  expect(await run(new TushareError(-4,'response too large'))).toMatchObject({code:'snapshot_too_large'});
  const timeout=Object.assign(new Error('The operation timed out SECRET'),{name:'TimeoutError'});
  expect((await run(timeout)).message).toBe('tushare_unavailable: request_timeout');
  const ctl=new AbortController();
  const aborting:Budget={remainingMs:()=>300_000,signal:ctl.signal};
  const e=await fetchTushareStatements('600519.SH',2014,aborting,{call:async()=>{ctl.abort(new Error('deadline'));throw Object.assign(new Error('x'),{name:'AbortError'});},sleep:async()=>{}}).then(()=>{throw new Error('expected a rejection');},(x:unknown)=>x as Error);
  expect(e.message).toBe('tushare_unavailable: budget_aborted');
  const seen:{timeoutMs?:number;reserveMs?:number}[]=[];
  await fetchTushareStatements('600519.SH',2014,budget(100_000),{call:async(_a,_p,_f,o)=>{seen.push({timeoutMs:o?.timeoutMs,reserveMs:o?.reserveMs});return raw([],false);},sleep:async()=>{}});
  expect(seen[0]).toEqual({timeoutMs:30_000,reserveMs:0});
  const seen2:(number|undefined)[]=[];
  await fetchTushareStatements('600519.SH',2014,budget(35_000),{call:async(_a,_p,_f,o)=>{seen2.push(o?.timeoutMs);return raw([],false);},sleep:async()=>{}});
  expect(seen2[0]).toBe(15_000);   // remaining 35 s minus ONE 20 s reserve
 });
});

describe('parseTushareStatements (600519.SH fixtures)',()=>{
 // always the hand-written synthetic set (fixed code), so the exact-value assertions hold even after real fixtures are recorded
 const r=parseTushareStatements(loadTushareFixtures('600519.SH',SYNTHETIC_DIR),{sinceYear:2014});
 const find=(concept:string,ref:string)=>r.candidates.find(c=>c.concept===concept&&c.filingRef===ref);
 it('builds YTD duration candidates with CNY units, Jan-1 period_start and the source_ref filing key',()=>{
  const fy23=r.candidates.filter(c=>c.concept==='revenue'&&c.periodEnd==='2023-12-31'&&c.filingRef.split(':')[2]==='1');
  expect(fy23).toHaveLength(1);
  expect(fy23[0]).toMatchObject({periodStart:'2023-01-01',duration:'12M',unit:'CNY',statement:'IS',sourceConcept:'income.total_revenue',consolidation:'consolidated'});
  expect(fy23[0].filingRef).toMatch(/^600519\.SH:20231231:1:\d{8}$/);
  expect(fy23[0]).toMatchObject({value:'150560000000.12',filingRef:'600519.SH:20231231:1:20240403'});
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
  expect(sga.value).toBe('14378000000');
  expect(find('eps_basic',annual)).toMatchObject({unit:'CNY/share',duration:'12M'});
  expect(find('shares_outstanding',annual)).toMatchObject({unit:'shares',duration:'INSTANT',periodStart:null,statement:'BS'});
  expect(find('monetary_funds',annual)).toMatchObject({unit:'CNY',duration:'INSTANT',sourceConcept:'balancesheet.money_cap'});
  expect(r.candidates.some(c=>c.concept==='cash')).toBe(false);
  expect(find('operating_cash_flow',annual)).toMatchObject({statement:'CF',duration:'12M'});
  {expect(r.skipped).toContainEqual({reason:'is_calc',n:1});expect(r.skipped).toContainEqual(expect.objectContaining({reason:'null:short_term_borrowings'}));}
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
  {expect(a).toMatchObject({concept:'revenue',value:'127554000000'});expect(b).toMatchObject({value:'127554000001'});expect(avail(a.filingRef)).toBe('2023-03-31');expect(avail(b!.filingRef)).toBe('2024-04-03');}
 });
 it('same filing + same key with different values (update_flag 0/1) → ambiguous; equal values stay single; missing ann dates → missingAvailableDate',()=>{
  expect(r.ambiguous).toHaveLength(1);
  expect(r.ambiguous[0].key).toBe('600519.SH:20240630:1:20240803|revenue|2024-01-01|2024-06-30|CNY');
  expect(r.ambiguous[0].candidates.map(c=>c.value)).toEqual(['83000000000','83400000000']);
  expect(r.candidates.filter(c=>c.filingRef==='600519.SH:20240630:1:20240803'&&c.concept==='revenue')).toEqual([]);
  expect(find('revenue_operating','600519.SH:20240630:1:20240803')).toMatchObject({value:'81900000000'});
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({ts_code:'600519.SH',end_date:'20230331',report_type:4,api:'income'})]);
 });
 it('parked rows carry row-level evidence: locator on ambiguous candidates, lossless values + snapshot sha256 + locator on rows without a date',()=>{
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
  expect(cov).toEqual([{api:'balancesheet',report_type:1,years:{'2023':1}},{api:'cashflow',report_type:1,years:{'2023':1}},{api:'income',report_type:1,years:{'2022':1,'2023':1,'2024':1}},{api:'income',report_type:4,years:{'2023':1}},{api:'income',report_type:5,years:{'2022':1}}]);
 });
 it('a page with data:null parses to nothing without throwing',()=>{
  const nullPages=loadTushareFixtures('600519.SH',SYNTHETIC_DIR).filter(s=>Buffer.from(s.bytes).toString('utf8').includes('"data":null'));
  expect(nullPages.map(s=>`${s.meta.api}:${(s.meta.params as {report_type:string}).report_type}`)).toEqual(['balancesheet:5']);
  for(const s of nullPages){const one=parseTushareStatements([s],{sinceYear:2014});expect(one.candidates).toEqual([]);expect(one.filings).toEqual([]);expect(one.skipped).toEqual([]);}
 });
 it('malformed pages fail as parse_error: row width mismatch, non-integer control column; bad dates are row_shape / missing date, odd end dates park as oddDuration',()=>{
  const snap=(fields:string[],rows:string)=>snapshotOf(new TextEncoder().encode(`{"code":0,"data":{"fields":${JSON.stringify(fields)},"items":[${rows}]}}`),{source:'tushare',api:'income',params:{ts_code:'600519.SH',report_type:'1'},page:1});
  const f=['ts_code','ann_date','end_date','report_type','total_revenue'];
  expect(()=>parseTushareStatements([snap(f,'["600519.SH","20240403","20231231",1]')])).toThrow(/invalid_row_width/);
  expect(()=>parseTushareStatements([snap(f,'["600519.SH","20240403","20231231",1.5,100]')])).toThrow(/invalid_control_field:report_type/);
  const bad=parseTushareStatements([snap(f,'["600519.SH","20240403","20231399",1,100],["600519.SH","20241399","20231231",1,100],["600519.SH","20240403","20230520",1,100]')],{sinceYear:2014});
  expect(bad.skipped).toContainEqual({reason:'row_shape',n:1});
  expect(bad.missingAvailableDate).toHaveLength(1);
  expect(bad.oddDuration.map(c=>c.periodEnd)).toEqual(['2023-05-20']);
 });
});

describe('parser hardening',()=>{
 const F=['ts_code','ann_date','f_ann_date','end_date','report_type','update_flag','total_revenue','sell_exp','admin_exp'];
 const snap=(rows:string,params:Record<string,unknown>={ts_code:'600519.SH',report_type:'1'},fields=F)=>snapshotOf(new TextEncoder().encode(`{"code":0,"data":{"fields":${JSON.stringify(fields)},"items":[${rows}],"has_more":false}}`),{source:'tushare',api:'income',params,page:1});
 it('ts_code of every row must equal the requested ts_code, and all snapshots of one parse must be for the same issuer',()=>{
  expect(()=>parseTushareStatements([snap('["000333.SZ","20240403","20240403","20231231",1,1,100,1,1]')])).toThrow(/ts_code_mismatch/);
  expect(()=>parseTushareStatements([snap('["600519.SH","20240403","20240403","20231231",1,1,100,1,1]'),snap('["000333.SZ","20240403","20240403","20231231",1,1,100,1,1]',{ts_code:'000333.SZ',report_type:'1'})])).toThrow(/ts_code_mismatch/);
  expect(()=>parseTushareStatements([snap('["600519.SH","20240403","20240403","20231231",1,1,100,1,1]',{report_type:'1'})])).toThrow(/ts_code_missing/);
  try{parseTushareStatements([snap('["000333.SZ","20240403","20240403","20231231",1,1,100,1,1]')]);}catch(e){expect(e).toMatchObject({code:'parse_error'});}
 });
 it('a present but invalid f_ann_date parks the row (both original strings kept); ann_date is used only when f_ann_date is absent/null/empty',()=>{
  const r=parseTushareStatements([snap('["600519.SH","20240403","20241399","20231231",1,1,100,1,1],["600519.SH","20240403",null,"20230930",1,1,100,1,1],["600519.SH","20240405","","20230630",1,1,100,1,1]')],{sinceYear:2014});
  expect(r.missingAvailableDate).toEqual([expect.objectContaining({end_date:'20231231',f_ann_date:'20241399',ann_date:'20240403',row:0,values:expect.objectContaining({total_revenue:'100'})})]);
  expect(r.filings.map(f=>f.sourceRef).sort()).toEqual(['600519.SH:20230630:1:20240405','600519.SH:20230930:1:20240403']);
 });
 it('sga_expense with one null component is missing, not the other component alone',()=>{
  const r=parseTushareStatements([snap('["600519.SH","20240403","20240403","20231231",1,1,100,5,null]')],{sinceYear:2014});
  expect(r.candidates.some(c=>c.concept==='sga_expense')).toBe(false);
  expect(r.skipped).toContainEqual({reason:'null:sga_expense',n:1});
  expect(r.candidates.find(c=>c.concept==='revenue')?.value).toBe('100');
 });
 it('update_flag / report_type / is_calc given as strings behave like integers',()=>{
  const r=parseTushareStatements([snap('["600519.SH","20240403","20240403","20231231","1","1",100,1,1]')],{sinceYear:2014});
  expect(r.candidates.find(c=>c.concept==='revenue')).toMatchObject({filingRef:'600519.SH:20231231:1:20240403',value:'100'});
  expect((r.candidates[0] as {locator?:string}).locator).toContain('update_flag=1');
  const cf=snapshotOf(new TextEncoder().encode('{"code":0,"data":{"fields":["ts_code","ann_date","f_ann_date","end_date","report_type","is_calc","n_cashflow_act"],"items":[["600519.SH","20240403","20240403","20231231","1","1",5]],"has_more":false}}'),{source:'tushare',api:'cashflow',params:{ts_code:'600519.SH',report_type:'1'},page:1});
  expect(parseTushareStatements([cf],{sinceYear:2014}).skipped).toContainEqual({reason:'is_calc',n:1});
 });
 it('invalid JSON text fails with the fixed message json_invalid',()=>{
  const bad=snapshotOf(new TextEncoder().encode('{"data": SECRET-TEXT'),{source:'tushare',api:'income',params:{ts_code:'600519.SH',report_type:'1'},page:1});
  const e=(()=>{try{parseTushareStatements([bad]);}catch(x){return x as Error;}return new Error('no throw');})();
  expect(e.message).toBe('parse_error: json_invalid');
 });
});

describe('fixture manifest loader and recorder',()=>{
 const dirs:string[]=[];
 const tmp=()=>{const d=mkdtempSync(join(tmpdir(),'tushare-fx-'));dirs.push(d);return d;};
 const copySynthetic=(dst:string)=>{for(const f of readdirSync(SYNTHETIC_DIR))copyFileSync(join(SYNTHETIC_DIR,f),join(dst,f));};
 afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
 it('loads only manifest-listed pages: a stale extra page is ignored',()=>{
  const d=tmp();copySynthetic(d);
  writeFileSync(join(d,'600519.SH.income.rt1.p2.json'),'{"code":0,"data":{"fields":["ts_code"],"items":[["600519.SH"]],"has_more":false}}');
  writeFileSync(join(d,'600519.SH.income.rt1.p1.json.bak'),'x');
  const snaps=loadTushareFixtures('600519.SH',d);
  expect(snaps).toHaveLength(6);
  expect(snaps.some(x=>x.meta.page===2)).toBe(false);
 });
 it('rejects a tampered page, a missing page, non-contiguous pages and a last page that still says has_more',()=>{
  const d=tmp();copySynthetic(d);
  writeFileSync(join(d,'600519.SH.income.rt5.p1.json'),'{"code":0,"data":null}');
  expect(()=>loadTushareFixtures('600519.SH',d)).toThrow(/fixture_sha256_mismatch/);
  const d2=tmp();copySynthetic(d2);rmSync(join(d2,'600519.SH.cashflow.rt1.p1.json'));
  expect(()=>loadTushareFixtures('600519.SH',d2)).toThrow(/fixture_page_missing/);
  const d3=tmp();copySynthetic(d3);
  const m=JSON.parse(readFileSync(join(d3,manifestName('600519.SH')),'utf8')) as {pages:{file:string;page:number}[]};
  m.pages.find(p=>p.file.includes('cashflow'))!.page=2;
  writeFileSync(join(d3,manifestName('600519.SH')),JSON.stringify(m));
  expect(()=>loadTushareFixtures('600519.SH',d3)).toThrow(/fixture_manifest_entry/);
  const d4=tmp();
  const more=snapshotOf(new TextEncoder().encode('{"code":0,"data":{"fields":["ts_code"],"items":[["600519.SH"]],"has_more":true}}'),{source:'tushare',api:'income',params:{ts_code:'600519.SH',report_type:'1'},page:1,has_more:true});
  expect(()=>writeRecording(d4,'600519.SH',[more])).toThrow(/fixture_last_page_has_more/);
 });
 it('commitRecording replaces the issuer set, removes pages absent from the new recording and leaves other issuers alone',()=>{
  const dst=tmp();copySynthetic(dst);
  writeFileSync(join(dst,'000333.SZ.keep.txt'),'other issuer');
  const src=tmp();
  const page=(t:string)=>snapshotOf(new TextEncoder().encode(`{"request_id":"x","code":0,"msg":null,"data":{"fields":["ts_code"],"items":[["600519.SH"]],"has_more":${t}}}`),{source:'tushare',api:'income',params:{ts_code:'600519.SH',report_type:'1'},page:t==='true'?1:2,has_more:t==='true'});
  writeRecording(src,'600519.SH',[page('true'),page('false')]);
  const r=commitRecording(src,dst,'600519.SH');
  expect(r.removed).toEqual(expect.arrayContaining(['600519.SH.balancesheet.rt1.p1.json','600519.SH.cashflow.rt1.p1.json','600519.SH.income.rt4.p1.json']));
  expect(readdirSync(dst).filter(f=>f.startsWith('600519.SH.')&&f.endsWith('.json')&&!f.endsWith('.meta.json')&&!f.includes('manifest')).every(f=>/^600519\.SH\.g[0-9a-z]+\.income\.rt1\.p[12]\.json$/.test(f))).toBe(true);
  expect(readdirSync(dst).filter(f=>f.startsWith('600519.SH.')&&f.endsWith('.json')&&!f.endsWith('.meta.json')&&!f.includes('manifest'))).toHaveLength(2);
  expect(readdirSync(dst)).toContain('000333.SZ.keep.txt');
  expect(loadTushareFixtures('600519.SH',dst).map(x=>x.meta.page)).toEqual([1,2]);
  mkdirSync(join(dst,'x'));   // unrelated entries do not matter
 });
 it('is generational: a failure after the new pages are written but before the manifest rename leaves the old generation intact and loadable; the next commit sweeps the leftovers',()=>{
  const dst=tmp();copySynthetic(dst);
  const before=loadTushareFixtures('600519.SH',dst);
  const page=(t:string,n:number)=>snapshotOf(new TextEncoder().encode(`{"request_id":"x${n}","code":0,"msg":null,"data":{"fields":["ts_code"],"items":[["600519.SH"]],"has_more":${t}}}`),{source:'tushare',api:'income',params:{ts_code:'600519.SH',report_type:'1'},page:n,has_more:t==='true'});
  const src=tmp();writeRecording(src,'600519.SH',[page('false',1)],undefined,'gnew1');
  const manifestBefore=readFileSync(join(dst,manifestName('600519.SH')),'utf8');
  expect(()=>commitRecording(src,dst,'600519.SH',{beforeManifest:()=>{throw new Error('interrupted');}})).toThrow('interrupted');
  expect(readdirSync(dst)).toContain('600519.SH.gnew1.income.rt1.p1.json');   // new generation is on disk ...
  expect(readFileSync(join(dst,manifestName('600519.SH')),'utf8')).toBe(manifestBefore);   // ... but the pointer did not move
  const after=loadTushareFixtures('600519.SH',dst);
  expect(after.map(x=>x.sha256)).toEqual(before.map(x=>x.sha256));   // old generation fully intact
  expect(readdirSync(dst).some(f=>f.endsWith('.tmp'))).toBe(false);
  const r=commitRecording(src,dst,'600519.SH');
  expect(r.removed).toContain('600519.SH.income.rt1.p1.json');
  expect(loadTushareFixtures('600519.SH',dst)).toHaveLength(1);
  // a re-record never reuses a name referenced by the current manifest
  const src2=tmp();writeRecording(src2,'600519.SH',[page('false',1)]);
  const names=JSON.parse(readFileSync(join(src2,manifestName('600519.SH')),'utf8')).pages.map((p:{file:string})=>p.file);
  expect(names.some((n:string)=>readdirSync(dst).includes(n))).toBe(false);
 });
});
