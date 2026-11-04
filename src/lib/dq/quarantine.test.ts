import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TableError} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {startBatch} from './batches';
import {quarantine,resolveQuarantine,listOpenQuarantine} from './quarantine';

const USER='00000000-0000-0000-0000-000000000001';

describe('quarantine',()=>{
 it('records an open item tied to a batch, lists it, and resolves it with actor and time',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'facts'});
  const id=await quarantine(c,{dataset:'facts',table:'financial_facts',naturalKey:'AAPL|revenue|2023-09-30',reasonCode:'identity_failed',detail:{rule:'gross'},payload:{value:1},batchId});
  const open=await listOpenQuarantine(c,'facts');
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({id,status:'open',reason_code:'identity_failed',natural_key:'AAPL|revenue|2023-09-30',resolved_at:null,resolved_by:null});
  expect(await resolveQuarantine(c,id,{status:'resolved_accept',resolvedBy:USER})).toBe('resolved');
  expect(await listOpenQuarantine(c,'facts')).toHaveLength(0);
  const row=c.rows('dq_quarantine')[0];
  expect(row).toMatchObject({status:'resolved_accept',resolved_by:USER});
  expect(typeof row.resolved_at).toBe('string');
 });
 it('deduplicates an open item with the same dataset/table/key/reason and returns the existing id',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'facts'});
  const input={dataset:'facts',table:'t',naturalKey:'k',reasonCode:'range',batchId};
  const a=await quarantine(c,input);
  const b=await quarantine(c,{...input,detail:{second:true}});
  expect(b).toBe(a);
  expect(c.rows('dq_quarantine')).toHaveLength(1);
  await resolveQuarantine(c,a,{status:'resolved_reject',resolvedBy:USER});
  const d=await quarantine(c,input); // resolved rows do not block a new open item
  expect(d).not.toBe(a);
  expect(c.rows('dq_quarantine')).toHaveLength(2);
 });
 it('reports not_found and already_resolved instead of silently overwriting',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  const id=await quarantine(c,{dataset:'d',table:'t',naturalKey:'k',reasonCode:'r',batchId});
  expect(await resolveQuarantine(c,'00000000-0000-0000-0000-00000000dead',{status:'resolved_accept',resolvedBy:USER})).toBe('not_found');
  expect(await resolveQuarantine(c,id,{status:'resolved_accept',resolvedBy:USER})).toBe('resolved');
  expect(await resolveQuarantine(c,id,{status:'resolved_reject',resolvedBy:'00000000-0000-0000-0000-000000000002'})).toBe('already_resolved');
  expect(c.rows('dq_quarantine')[0]).toMatchObject({status:'resolved_accept',resolved_by:USER});
 });
 it('reports already_resolved when another resolver wins between the read and the update',async()=>{
  const c=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id']});
  const {batchId}=await startBatch(c,{producer:'p',dataset:'d'});
  const id=await quarantine(c,{dataset:'d',table:'t',naturalKey:'k',reasonCode:'r',batchId});
  c.update=async()=>0;
  expect(await resolveQuarantine(c,id,{status:'resolved_accept',resolvedBy:USER})).toBe('already_resolved');
 });
 it('rejects an unknown resolution status, a non-UUID id and a non-UUID resolver',async()=>{
  const c=memoryTableClient();
  const ID='00000000-0000-0000-0000-0000000000aa';
  await expect(resolveQuarantine(c,ID,{status:'done' as never,resolvedBy:USER})).rejects.toThrow('invalid_status');
  await expect(resolveQuarantine(c,'x',{status:'resolved_accept',resolvedBy:USER})).rejects.toThrow('invalid_id');
  await expect(resolveQuarantine(c,undefined as never,{status:'resolved_accept',resolvedBy:USER})).rejects.toThrow('invalid_id');
  await expect(resolveQuarantine(c,ID,{status:'resolved_accept',resolvedBy:''})).rejects.toThrow('invalid_resolver');
  await expect(resolveQuarantine(c,ID,{status:'resolved_accept',resolvedBy:'admin'})).rejects.toThrow('invalid_resolver');
 });
 it('returns the concurrent winner id when the insert loses the open-key race (23505)',async()=>{
  const WINNER='00000000-0000-0000-0000-0000000000bb';
  let selects=0;const inserted:unknown[]=[];
  const stub:TableClient={
   select:async()=>(selects++===0?[]:[{id:WINNER,status:'open'}]),
   insert:async(t,row)=>{inserted.push(row);throw new TableError('insert',t,'duplicate key value violates unique constraint "dq_quarantine_open_key_uniq"','23505');},
   update:async()=>0,upsert:async()=>{},count:async()=>0,
  };
  expect(await quarantine(stub,{dataset:'d',table:'t',naturalKey:'k',reasonCode:'r',batchId:'00000000-0000-0000-0000-000000000003'})).toBe(WINNER);
  expect(selects).toBe(2);
  expect(inserted).toHaveLength(1);
 });
 it('rethrows a 23505 when no open row exists afterwards, and any non-unique error',async()=>{
  const input={dataset:'d',table:'t',naturalKey:'k',reasonCode:'r',batchId:'00000000-0000-0000-0000-000000000003'};
  const base={update:async()=>0,upsert:async()=>{},count:async()=>0,select:async()=>[]};
  const dup=new TableError('insert','dq_quarantine','duplicate key','23505');
  await expect(quarantine({...base,insert:async()=>{throw dup;}},input)).rejects.toBe(dup);
  const fk=new TableError('insert','dq_quarantine','violates foreign key','23503');
  await expect(quarantine({...base,insert:async()=>{throw fk;}},input)).rejects.toBe(fk);
 });
 it('listOpenQuarantine validates limit as an integer 1..1000',async()=>{
  const c=memoryTableClient();
  for(const bad of [0,-1,1.5,NaN,1001])await expect(listOpenQuarantine(c,'d',bad)).rejects.toThrow('invalid_limit');
  await expect(listOpenQuarantine(c,'d',1000)).resolves.toEqual([]);
 });
});
