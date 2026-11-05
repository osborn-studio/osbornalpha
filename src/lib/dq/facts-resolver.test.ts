import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({materialize:vi.fn()}));
vi.mock('../facts/derive',()=>({materialize:mocks.materialize,FORMULA_VERSION:'facts-derive/1.0'}));

import {memoryTableClient} from '../db/memory-table-client';
import {quarantine} from './quarantine';
import {resolveFactsItem} from './facts-resolver';
import {FactsDbError} from '../facts/types';
import type {FactRow,FactsDb} from '../facts/types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const BATCH='55555555-0000-4000-8000-000000000001';
const A='20000000-0000-4000-8000-00000000000a',B='20000000-0000-4000-8000-00000000000b',C='20000000-0000-4000-8000-00000000000c';
const NOW=()=>new Date('2026-11-04T09:00:00.000Z');
const fact=(id:string,value:string):FactRow=>({fact_id:id,issuer_id:ISSUER,market:'US',filing_id:'f',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value,value_text:value,unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',status:'quarantined',raw_hash:'h',created_at:'2024-01-01T00:00:00Z'});

function harness(){
 const tables=memoryTableClient({dq_quarantine:['id']});
 const values=new Map([[A,'100'],[B,'1e2'],[C,'200']]);
 const resolve=vi.fn<(id:string,chosen:string[],by:string)=>Promise<{promoted:number;skipped:number}>>(async()=>({promoted:1,skipped:0}));
 const db={resolveFactsQuarantine:resolve,factsByIds:async(ids:string[])=>ids.filter(i=>values.has(i)).map(i=>fact(i,values.get(i)!))} as unknown as FactsDb;
 const item=async(reasonCode:string,factIds:string[],key:Record<string,string|null>={issuer_id:ISSUER,market:'US'})=>{
  const id=await quarantine(tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`k:${reasonCode}`,reasonCode,batchId:BATCH,payload:{key,fact_ids:factIds,run_id:'r'}});
  return (await tables.select('dq_quarantine',{id},{limit:1}))[0];
 };
 const row=async(id:string)=>(await tables.select('dq_quarantine',{id},{limit:1}))[0];
 return {tables,db,resolve,item,row};
}
beforeEach(()=>{vi.clearAllMocks();mocks.materialize.mockResolvedValue(3);});

describe('resolveFactsItem',()=>{
 it('accepts a same_day_conflict with chosen rows of one value, persists the verdict through the function and materializes',async()=>{
  const {tables,db,resolve,item}=harness();
  const it_=await item('same_day_conflict',[A,B,C]);
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A,B],resolvedBy:ADMIN,now:NOW});
  expect(resolve).toHaveBeenCalledWith(it_.id,[A,B],ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(r).toEqual({outcome:'resolved',promoted:1,skipped:0,chosenFactIds:[A,B],hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'}});
 });
 it('writes detail.hook on the item and keeps what the function wrote in detail',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('identity_bs',[A]);
  resolve.mockImplementationOnce(async(id:string,chosen:string[])=>{await tables.update('dq_quarantine',{id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail:{chosen_fact_ids:chosen}});return {promoted:1,skipped:0};});
  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(resolve).toHaveBeenCalledWith(it_.id,[A],ADMIN);
  expect((await row(String(it_.id))).detail).toEqual({chosen_fact_ids:[A],hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'}});
 });
 it('rejects a verdict outside the item or with mixed values',async()=>{
  const {tables,db,resolve,item}=harness();
  const it_=await item('same_day_conflict',[A,B,C]);
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A,'20000000-0000-4000-8000-00000000dead'],resolvedBy:ADMIN})).toEqual({outcome:'invalid_choice'});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A,C],resolvedBy:ADMIN})).toEqual({outcome:'invalid_choice'});
  expect(resolve).not.toHaveBeenCalled();
  // acknowledgement only: no chosen rows, the group stays parked for good
  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN});
  expect(resolve).toHaveBeenCalledWith(it_.id,[],ADMIN);
 });
 it('acknowledges items without fact rows through the function and skips materialize',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('ambiguous_value',[]);
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(resolve).toHaveBeenCalledWith(it_.id,[],ADMIN);
  expect(mocks.materialize).not.toHaveBeenCalled();
  expect(r.hook).toEqual({stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'});
  expect((await row(String(it_.id))).detail).toMatchObject({hook:{state:'done'}});
 });
 it('propagates run_pending from the function and leaves the item open',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('identity_gp',[A]);
  resolve.mockRejectedValueOnce(new FactsDbError('run_pending'));
  await expect(resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN})).rejects.toMatchObject({code:'run_pending'});
  expect((await row(String(it_.id))).status).toBe('open');
  expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('records a failed materialize as hook failed, and a later POST re-runs only the hook',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('identity_bs',[A]);
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('stale_computation'));
  const first=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(first.hook).toEqual({stage:'materialize',state:'failed',at:'2026-11-04T09:00:00.000Z',message:'stale_computation'});
  await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x'});
  const later=()=>new Date('2026-11-04T10:00:00.000Z');
  const second=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN,now:later});
  expect(second).toEqual({outcome:'hook_retried',hook:{stage:'done',state:'done',at:'2026-11-04T10:00:00.000Z'}});
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(mocks.materialize).toHaveBeenCalledTimes(2);
  const third=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN});
  expect(third).toEqual({outcome:'already_resolved',hook:{stage:'done',state:'done',at:'2026-11-04T10:00:00.000Z'}});
  expect(mocks.materialize).toHaveBeenCalledTimes(2);
 });
 it('rejects through the generic transition and never touches fact rows',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const it_=await item('same_day_conflict',[A,B]);
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'resolved'});
  expect((await row(String(it_.id)))).toMatchObject({status:'resolved_reject',resolved_by:ADMIN});
  expect(resolve).not.toHaveBeenCalled();expect(mocks.materialize).not.toHaveBeenCalled();
  expect(await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'already_resolved'});
 });
});
