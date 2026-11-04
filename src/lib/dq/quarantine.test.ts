import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
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
 it('rejects an unknown resolution status and a missing resolver',async()=>{
  const c=memoryTableClient();
  await expect(resolveQuarantine(c,'x',{status:'done' as never,resolvedBy:USER})).rejects.toThrow('invalid_status');
  await expect(resolveQuarantine(c,'x',{status:'resolved_accept',resolvedBy:''})).rejects.toThrow('invalid_resolver');
 });
});
