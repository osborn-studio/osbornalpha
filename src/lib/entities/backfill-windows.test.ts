// src/lib/entities/backfill-windows.test.ts
import {describe,it,expect} from 'vitest';
import {TableError,type TableClient} from '../db/table-client';
import {memoryTableClient} from '../db/memory-table-client';
import {coverageE2} from './coverage';
import {applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from './windows';

const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.windows';
const w=(o:Partial<WindowRow>):WindowRow=>({issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{source:'curated'},...o});
const u=(ticker:string,o:Partial<UniverseDates>={}):[string,UniverseDates]=>[ticker,{ticker,list_date:'2001-08-27',delist_date:null,source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z',...o}];
const FROM_PROV={source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:ASOF,row:{list_date:'2001-08-27',source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z'}};

describe('planWindowBackfill',()=>{
 it('moves the earliest row to the listing date, copying the source row values into provenance',()=>{
  const p=planWindowBackfill([w({})],new Map([u('600519.SH')]),ASOF);
  expect(p.changes).toEqual([{kind:'from',row:w({}),newValidFrom:'2001-08-27',provenance:{valid_from:FROM_PROV}}]);
  expect(p.conflicts).toEqual([]);
 });
 it('equal dates change only the method and provenance; a later listing date is a conflict',()=>{
  expect(planWindowBackfill([w({valid_from:'2001-08-27'})],new Map([u('600519.SH')]),ASOF).changes[0]).toMatchObject({kind:'from',newValidFrom:'2001-08-27'});
  const late=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH')]),ASOF);
  expect(late.changes).toEqual([]);
  expect(late.conflicts).toEqual([{row:w({valid_from:'2000-01-01'}),reason:'list_date_after_first_observed',detail:{list_date:'2001-08-27',valid_from:'2000-01-01',source:'tushare_stock_basic'}}]);
 });
 it('touches only the earliest holding row of a ticker; curated rows qualify, other methods do not',()=>{
  const rows=[w({issuer_id:'i2',valid_from:'2010-01-01',valid_to:'2015-01-01'}),w({issuer_id:'i1',valid_from:'2015-01-01'})];
  const p=planWindowBackfill(rows,new Map([u('600519.SH')]),ASOF);
  expect(p.changes.map(c=>[c.kind,c.row.issuer_id])).toEqual([['from','i2']]);
  expect(planWindowBackfill([w({valid_from_method:'curated'})],new Map([u('600519.SH')]),ASOF).changes).toHaveLength(1);
  const done=planWindowBackfill([w({valid_from:'2001-08-27',valid_from_method:'listing_date'})],new Map([u('600519.SH')]),ASOF);
  expect(done.changes).toEqual([]);expect(done.unchanged).toBe(1);
  expect(planWindowBackfill([w({valid_from_method:'ticker_change'})],new Map([u('600519.SH')]),ASOF).skipped).toEqual(['method_ticker_change']);
 });
 it('closes the latest open row at the delisting date; a delisting on or before valid_from is a conflict',()=>{
  const rows=[w({issuer_id:'i2',valid_from:'2010-01-01',valid_to:'2015-01-01'}),w({issuer_id:'i1',valid_from:'2015-01-01'})];
  const p=planWindowBackfill(rows,new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
  const to=p.changes.find(c=>c.kind==='to')!;
  expect(to).toMatchObject({kind:'to',validFrom:'2015-01-01',newValidTo:'2026-06-30',provenance:{valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:ASOF,row:{delist_date:'2026-06-30',source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z'}}}});
  const bad=planWindowBackfill([w({valid_from:'2024-03-01'})],new Map([u('600519.SH',{list_date:null,delist_date:'2024-03-01'})]),ASOF);
  expect(bad.conflicts.map(c=>c.reason)).toEqual(['delist_on_or_before_valid_from']);
 });
 it('a single row gets both changes; the close uses the new valid_from and each change carries only its own single provenance key',()=>{
  const p=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
  expect(p.changes.map(c=>c.kind)).toEqual(['from','to']);
  const to=p.changes[1] as Extract<typeof p.changes[number],{kind:'to'}>;
  expect(to.validFrom).toBe('2001-08-27');
  expect(Object.keys(to.provenance)).toEqual(['valid_to']);
  expect(Object.keys((p.changes[0] as {provenance:object}).provenance)).toEqual(['valid_from']);
 });
 it('leaves US rows (no list_date) and tickers outside the universe alone',()=>{
  const p=planWindowBackfill([w({ticker:'AAPL'}),w({ticker:'ZZZZ'})],new Map([u('AAPL',{list_date:null})]),ASOF);
  expect(p.changes).toEqual([]);expect(p.skipped).toEqual(['no_list_date','not_in_universe']);
 });
});

describe('applyWindowBackfill',()=>{
 const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
 it('applies guarded updates and quarantines evidence conflicts',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({}));
  await c.insert('issuer_securities',row({ticker:'000001.SZ',valid_from:'1980-01-01'}));
  const plan=planWindowBackfill([w({}),w({ticker:'000001.SZ',valid_from:'1980-01-01'})],new Map([u('600519.SH',{delist_date:'2026-06-30'}),u('000001.SZ',{list_date:'1991-04-03'})]),ASOF);
  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
  const moved=c.rows('issuer_securities').find(r=>r.ticker==='600519.SH')!;
  expect(moved).toMatchObject({valid_from:'2001-08-27',valid_from_method:'listing_date',valid_to:'2026-06-30',valid_to_method:'delisting'});
  expect(Object.keys(moved.provenance as object).sort()).toEqual(['source','valid_from','valid_to']);
  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'000001.SZ:1980-01-01',reason_code:'window_evidence_conflict',status:'open'})]);
  expect(res.counts).toMatchObject({fetched:3,versioned:2,quarantined:1,failed:0});
 });
 it('an exclusion violation on the listing date is an ownership_conflict; the close is still attempted at the row\'s current start',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({}));
  const failing:TableClient={...c,rpc:async(fn,args)=>{if(fn==='set_security_window'&&args.p_side==='from')throw new TableError('rpc',fn,'conflicting key value violates exclusion constraint "issuer_securities_no_overlap"','23P01');return c.rpc(fn,args);}};
  const plan=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
  const res=await applyWindowBackfill(failing,plan,{batchId:BATCH,dataset:DATASET});
  expect(c.rows('dq_quarantine').map(q=>q.reason_code)).toEqual(['ownership_conflict']);
  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2024-03-01',valid_to:'2026-06-30',valid_to_method:'delisting'});
  expect(res.counts).toMatchObject({quarantined:1,failed:0,versioned:1});
  expect(res.errors.map(e=>e.code)).toEqual(['ownership_conflict']);
 });
});

describe('conflicts after a backdate, aggregation, paging, freshness',()=>{
 const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
 it('a conflict on a row whose backdate landed is parked under the CURRENT key with the original snapshot, and E2 counts it',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({}));
  const u1=new Map([u('600519.SH',{delist_date:'2000-01-01'})]);
  const plan=planWindowBackfill([w({})],u1,ASOF);
  expect(plan.changes.map(x=>x.kind)).toEqual(['from']);
  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(res.counts).toMatchObject({versioned:1,quarantined:1,failed:0});
  const q=c.rows('dq_quarantine');
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({natural_key:'600519.SH:2001-08-27',reason_code:'window_evidence_conflict',
   payload:{issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_from_method:'first_observed',current_valid_from:'2001-08-27'}});
  const rows=c.rows('issuer_securities');
  const e2=coverageE2({rows,listDates:new Map([['600519.SH','2001-08-27']]),queueIssuers:new Set(['i1']),openQuarantineKeys:new Set(q.map(x=>String(x.natural_key)))});
  expect(e2).toMatchObject({open_quarantine:1,passes:false});
 });
 it('two conflicts on one row persist as ONE item carrying both reasons and both evidence rows',async()=>{
  const c=memoryTableClient({dq_quarantine:['id']});
  await c.insert('issuers',{issuer_id:'i1'});
  await c.insert('issuer_securities',row({valid_from:'2000-01-01'}));
  const plan=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH',{list_date:'2001-08-27',delist_date:'1999-12-31'})]),ASOF);
  expect(plan.conflicts.map(x=>x.reason)).toEqual(['list_date_after_first_observed','delist_on_or_before_valid_from']);
  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
  const q=c.rows('dq_quarantine');
  expect(q).toHaveLength(1);
  expect(q[0].detail).toEqual({reason:'list_date_after_first_observed',reasons:['list_date_after_first_observed','delist_on_or_before_valid_from'],conflicts:[
   {reason:'list_date_after_first_observed',list_date:'2001-08-27',valid_from:'2000-01-01',source:'tushare_stock_basic'},
   {reason:'delist_on_or_before_valid_from',delist_date:'1999-12-31',valid_from:'2000-01-01',source:'tushare_stock_basic'}]});
  expect(res.counts).toMatchObject({quarantined:1,failed:0});
 });
 it('keysetAll never truncates silently: A,A,A,B with a cap of 3 either returns all rows or throws page_overflow',async()=>{
  const c=memoryTableClient();
  let i=0;for(const t of ['A','A','A','B'])await c.insert('t',{ticker:t,issuer_id:`i${i++}`,valid_from:'2020-01-01'});
  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
  await expect(keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).rejects.toThrow('page_overflow');
  expect(await keysetAll(c,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).toHaveLength(4);
  const exact=memoryTableClient();await exact.insert('t',{ticker:'A',issuer_id:'x',valid_from:'d'});await exact.insert('t',{ticker:'A',issuer_id:'y',valid_from:'d'});await exact.insert('t',{ticker:'A',issuer_id:'z',valid_from:'d'});
  const cap3:TableClient={...exact,select:(t,m,o)=>exact.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
  expect(await keysetAll(cap3,'t',{},{},'ticker',['issuer_id','ticker','valid_from'])).toHaveLength(3);   // a full last group is the end, not an overflow
 });
 it('keysetAll continues past a short page when the server caps pages below MAX_PAGE',async()=>{
  const c=memoryTableClient();
  const tickers=['A','B','B','C','D','E','F','F','G'];
  let i=0;for(const t of tickers)await c.insert('t',{ticker:t,issuer_id:`i${i++}`,valid_from:'2020-01-01'});
  const capped:TableClient={...c,select:(t,m,o)=>c.select(t,m,{...o,limit:Math.min(o?.limit??3,3)})};
  const got=await keysetAll(capped,'t',{},{},'ticker',['issuer_id','ticker','valid_from']);
  expect(got).toHaveLength(9);
  expect(await keysetAll(capped,'empty',{},{},'ticker',['ticker'])).toEqual([]);
 });
 it('freshness counts backfilled rows as landed: a partial run with versioned + quarantined only is ok; quarantine only is not',()=>{
  const base={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
  expect(windowsOutcome('partial',{...base,versioned:3,quarantined:2})).toEqual({ok:true,exitCode:0});
  expect(windowsOutcome('partial',{...base,quarantined:2})).toEqual({ok:false,exitCode:0});
  expect(windowsOutcome('partial',{...base,versioned:3,failed:1})).toMatchObject({ok:false,exitCode:1});
  expect(windowsOutcome('success',{...base,versioned:3})).toEqual({ok:true,exitCode:0});
 });
});
