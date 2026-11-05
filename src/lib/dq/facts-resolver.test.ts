import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({materialize:vi.fn()}));
vi.mock('../facts/derive',()=>({materialize:mocks.materialize,FORMULA_VERSION:'facts-derive/1.0'}));

import {memoryTableClient} from '../db/memory-table-client';
import {quarantine} from './quarantine';
import {markAudited,resolveFactsItem} from './facts-resolver';
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
 const resolve=vi.fn<(id:string,chosen:string[],by:string)=>Promise<{promoted:number;skipped:number}>>(async(_id,chosen)=>({promoted:1,skipped:0,chosenFactIds:chosen}));
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
  resolve.mockImplementationOnce(async(id:string,chosen:string[])=>{await tables.update('dq_quarantine',{id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail:{chosen_fact_ids:chosen}});return {promoted:1,skipped:0,chosenFactIds:chosen};});
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
  expect(second).toMatchObject({outcome:'hook_retried',hook:{stage:'done',state:'done',at:'2026-11-04T10:00:00.000Z'},auditAs:'resolved'});
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(mocks.materialize).toHaveBeenCalledTimes(2);
  const third=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN});
  expect(third).toEqual({outcome:'already_resolved',hook:{stage:'done',state:'done',at:'2026-11-04T10:00:00.000Z'}});
  expect(mocks.materialize).toHaveBeenCalledTimes(2);
 });
 it('returns and reports the committed chosen ids, not the pre-lock snapshot (membership merged between read and resolve)',async()=>{
  const {tables,db,resolve,item}=harness();
  const it_=await item('same_day_conflict',[A,B]);
  resolve.mockImplementationOnce(async()=>({promoted:2,skipped:0,chosenFactIds:[A,B]}));
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A],resolvedBy:ADMIN,now:NOW});
  expect(r.chosenFactIds).toEqual([A,B]);
  // identity item: the function rebuilt the member set after a merge; the answer carries the rebuilt set
  const idt=await item('identity_bs',[A]);
  resolve.mockImplementationOnce(async()=>({promoted:2,skipped:0,chosenFactIds:[A,C]}));
  expect((await resolveFactsItem(db,tables,idt,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).chosenFactIds).toEqual([A,C]);
 });
 it('ignores member ids that no longer exist in the value precheck and leaves the verdict to SQL',async()=>{
  const {tables,db,resolve,item}=harness();
  const GONE='20000000-0000-4000-8000-00000000d00d';
  const it_=await item('same_day_conflict',[A,B,GONE]);
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenFactIds:[A,GONE],resolvedBy:ADMIN,now:NOW});
  expect(r.outcome).toBe('resolved');
  expect(resolve).toHaveBeenCalledWith(it_.id,[A,GONE],ADMIN);
 });
 it('a hook-write failure after the function committed still answers resolved with hook failed',async()=>{
  const {tables,db,item}=harness();
  const it_=await item('identity_bs',[A]);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const update=vi.spyOn(tables,'update').mockRejectedValue(new Error('db gone secret-detail'));
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  update.mockRestore();spy.mockRestore();
  expect(r.outcome).toBe('resolved');
  expect(r.hook).toMatchObject({state:'failed',message:'hook_write_failed'});
 });
 it('an accepted item whose hook is pending or missing is unfinished: POST re-runs materialize only and audits as resolved once',async()=>{
  for(const detail of [{chosen_fact_ids:[A],hook:{stage:'materialize',state:'pending',at:'x'}},{chosen_fact_ids:[A]}]){
   vi.clearAllMocks();mocks.materialize.mockResolvedValue(1);
   const {tables,db,resolve,item,row}=harness();
   const it_=await item('identity_bs',[A]);
   await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail});
   const r=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
   expect(r).toMatchObject({outcome:'hook_retried',hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'},auditAs:'resolved'});
   expect(resolve).not.toHaveBeenCalled();
   expect(mocks.materialize).toHaveBeenCalledTimes(1);
   await markAudited(tables,String(it_.id));
   // finished and audited: a further POST is a plain already_resolved
   expect(await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN})).toMatchObject({outcome:'already_resolved'});
  }
 });
 it('a retry of an already audited item with a failing materialize audits nothing; success audits as hook_retried',async()=>{
  const {tables,db,item,row}=harness();
  const it_=await item('identity_gp',[A]);
  await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail:{audit_written:true,hook:{stage:'materialize',state:'failed',at:'x'}}});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.materialize.mockRejectedValueOnce(new Error('postgres: relation secret_table missing'));
  const bad=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  spy.mockRestore();
  expect(bad).toMatchObject({outcome:'hook_retried',auditAs:null,hook:{state:'failed',message:'materialize_failed'}});
  const ok=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(ok).toMatchObject({outcome:'hook_retried',auditAs:'hook_retried'});
 });
 it('an item without a valid issuer/market target gets hook failed no_target, not done',async()=>{
  const {tables,db,item}=harness();
  const it_=await item('identity_bs',[A],{});
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(r.hook).toEqual({stage:'materialize',state:'failed',at:'2026-11-04T09:00:00.000Z',message:'no_target'});
  expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('a different admin recovering an unfinished accept gets a recovered record of the persisted resolution; a reject POST on an accepted item never retries',async()=>{
  const {tables,db,resolve,item,row}=harness();
  const OTHER='11111111-2222-4333-8444-555555555555';
  const it_=await item('same_day_conflict',[A,B]);
  await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'x',detail:{chosen_fact_ids:[A,B],hook:{stage:'materialize',state:'pending',at:'x'}}});
  expect(await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_reject',resolvedBy:OTHER})).toMatchObject({outcome:'already_resolved'});
  expect(mocks.materialize).not.toHaveBeenCalled();
  const r=await resolveFactsItem(db,tables,await row(String(it_.id)),{status:'resolved_accept',resolvedBy:OTHER,now:NOW});
  expect(r.auditAs).toBe('resolved');
  expect(r.chosenFactIds).toEqual([A,B]);
  expect(r.recovered).toEqual({resolvedBy:ADMIN,status:'resolved_accept',chosenFactIds:[A,B],recoveredBy:OTHER,recoveredAt:'2026-11-04T09:00:00.000Z'});
  expect(resolve).not.toHaveBeenCalled();
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
