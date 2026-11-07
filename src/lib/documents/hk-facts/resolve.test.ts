// src/lib/documents/hk-facts/resolve.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../../db/memory-table-client';
import {DocumentsDbError} from '../types';
import type {HkFactsPort} from './facts-port';
import {finalizeHkHooks,resolveHkFactsItem} from './resolve';

const ITEM='10000000-0000-4000-8000-000000000001';
const A='20000000-0000-4000-8000-00000000000a',B='20000000-0000-4000-8000-00000000000b';
const ADMIN='00000000-0000-4000-8000-0000000000ad';
type Port=Pick<HkFactsPort,'resolveHkFactsQuarantine'|'factsByIds'>;
function setup(over:Record<string,unknown>={},values:Record<string,string>={[A]:'100',[B]:'100.0'}){
 const tables=memoryTableClient({dq_quarantine:['id']});
 const item={id:ITEM,dataset:'facts.hk',table_name:'financial_facts',natural_key:'i:HK:k',reason_code:'same_day_conflict',status:'open',payload:{fact_ids:[A,B]},detail:{},batch_id:'b',resolved_by:null,resolved_at:null,created_at:'2026-11-06T00:00:00.000Z',...over};
 void tables.insert('dq_quarantine',item);
 const resolve=vi.fn(async(_id:string,chosen:string[])=>({promoted:chosen.length,skipped:0,chosenFactIds:chosen}));
 const facts=vi.fn(async(ids:string[])=>ids.map(id=>({fact_id:id,value:values[id]??'1'})));
 const port={resolveHkFactsQuarantine:resolve,factsByIds:facts} as unknown as Port;
 return {tables,item,port,resolve};
}

describe('resolveHkFactsItem',()=>{
 it('accepts a same_day_conflict verdict: chosen ⊆ members with one numeric value',async()=>{
  const {tables,item,port,resolve}=setup();
  const r=await resolveHkFactsItem(port,tables,item,{status:'resolved_accept',chosenFactIds:[A,B,A],resolvedBy:ADMIN});
  expect(r).toEqual({outcome:'resolved',promoted:2,skipped:0,chosenFactIds:[A,B]});
  expect(resolve).toHaveBeenCalledWith(ITEM,[A,B],ADMIN);
 });
 it('refuses a choice outside the members or with two values, before calling the database',async()=>{
  const s1=setup();
  expect(await resolveHkFactsItem(s1.port,s1.tables,s1.item,{status:'resolved_accept',chosenFactIds:['30000000-0000-4000-8000-000000000000'],resolvedBy:ADMIN})).toEqual({outcome:'invalid_choice'});
  const s2=setup({}, {[A]:'100',[B]:'101'});
  expect(await resolveHkFactsItem(s2.port,s2.tables,s2.item,{status:'resolved_accept',chosenFactIds:[A,B],resolvedBy:ADMIN})).toEqual({outcome:'invalid_choice'});
  expect(s1.resolve).not.toHaveBeenCalled();expect(s2.resolve).not.toHaveBeenCalled();
 });
 it('an identity item promotes all its members',async()=>{
  const {tables,item,port,resolve}=setup({reason_code:'identity_bs'});
  expect((await resolveHkFactsItem(port,tables,item,{status:'resolved_accept',resolvedBy:ADMIN})).outcome).toBe('resolved');
  expect(resolve).toHaveBeenCalledWith(ITEM,[A,B],ADMIN);
 });
 it('reject is the generic plan-1 flip; fact rows stay quarantined (no database call)',async()=>{
  const {tables,item,port,resolve}=setup();
  expect(await resolveHkFactsItem(port,tables,item,{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'resolved'});
  expect((await tables.select('dq_quarantine',{id:ITEM}))[0]).toMatchObject({status:'resolved_reject',resolved_by:ADMIN});
  expect(resolve).not.toHaveBeenCalled();
 });
 it('not an HK facts item → not_hk_item; a closed item → already_resolved',async()=>{
  const us=setup({dataset:'facts.us'});
  expect(await resolveHkFactsItem(us.port,us.tables,us.item,{status:'resolved_accept',resolvedBy:ADMIN})).toEqual({outcome:'not_hk_item'});
  const closed=setup({status:'resolved_accept'});
  expect(await resolveHkFactsItem(closed.port,closed.tables,closed.item,{status:'resolved_accept',resolvedBy:ADMIN})).toEqual({outcome:'already_resolved'});
 });
 it('maps run_pending / invalid_chosen / not_hk_item / item_not_open from the function and rethrows anything else',async()=>{
  for(const [code,outcome] of [['run_pending','run_pending'],['invalid_chosen','invalid_choice'],['not_hk_item','not_hk_item'],['item_not_open','already_resolved']] as const){
   const s=setup({reason_code:'identity_gp'});s.resolve.mockRejectedValueOnce(new DocumentsDbError(code));
   expect(await resolveHkFactsItem(s.port,s.tables,s.item,{status:'resolved_accept',resolvedBy:ADMIN})).toEqual({outcome});
  }
  const s=setup({reason_code:'identity_gp'});s.resolve.mockRejectedValueOnce(new Error('connection reset'));
  await expect(resolveHkFactsItem(s.port,s.tables,s.item,{status:'resolved_accept',resolvedBy:ADMIN})).rejects.toThrow('connection reset');
 });
});

describe('finalizeHkHooks',()=>{
 it('marks accepted facts.hk items whose hook is not done as done (hk_no_metrics) and touches nothing else',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id']});
  const row=(id:string,o:Record<string,unknown>)=>tables.insert('dq_quarantine',{id,dataset:'facts.hk',table_name:'financial_facts',natural_key:id,reason_code:'identity_bs',status:'resolved_accept',payload:{},detail:{},batch_id:'b',resolved_by:ADMIN,resolved_at:'2026-11-05T00:00:00.000Z',created_at:'2026-11-05T00:00:00.000Z',...o});
  await row('q1',{detail:{chosen_fact_ids:[A],hook:{stage:'materialize',state:'failed',at:'x',message:'no_target'}}});
  await row('q2',{detail:{hook:{stage:'done',state:'done',at:'y'}}});
  await row('q3',{dataset:'facts.us',detail:{hook:{stage:'materialize',state:'failed',at:'z'}}});
  await row('q4',{status:'open',resolved_by:null,resolved_at:null});
  await row('q5',{detail:{}});
  const now=new Date('2026-11-06T03:00:00.000Z');
  expect(await finalizeHkHooks(tables,now)).toBe(2);
  const get=async(id:string)=>(await tables.select('dq_quarantine',{id}))[0].detail as Record<string,unknown>;
  expect(await get('q1')).toEqual({chosen_fact_ids:[A],hook:{stage:'done',state:'done',at:now.toISOString(),message:'hk_no_metrics'}});
  expect(await get('q5')).toEqual({hook:{stage:'done',state:'done',at:now.toISOString(),message:'hk_no_metrics'}});
  expect((await get('q2')).hook).toEqual({stage:'done',state:'done',at:'y'});
  expect((await get('q3')).hook).toMatchObject({state:'failed'});
  expect(await get('q4')).toEqual({});
  expect(await finalizeHkHooks(tables,now)).toBe(0);
 });
});
