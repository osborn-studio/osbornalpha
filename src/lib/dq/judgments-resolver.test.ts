// src/lib/dq/judgments-resolver.test.ts
// F4 Task 14 (spec §7.6): verdicts on dataset 'judgments' items. basis_mismatch accept = accept_refetched with the
// item's own evidence hash (integrity-checked); ambiguous_fact accept = choose_fact whose digest is one of the
// candidates; base_bar_missing / benchmark_gap accept → resolution_not_applicable; accept writes the override via
// one RPC (audited there; stale / closed → stale); reject is ONE rejectQuarantinedSettlement RPC (void + flip +
// audit) unless the judgment is already final (then validated atomic cleanup); idempotency_conflict items are a plain resolve;
// everything is idempotent.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {digest} from '../judgments/canonical';
import {memoryJudgmentsDb} from '../judgments/memory-judgments-db';
import {PRICE_RESOLVER_VERSION} from '../judgments/resolvers/price';
import {priceJudgment,testMethodologyRow} from '../judgments/testing/fixtures';
import type {JudgmentsDb,SettlementRow} from '../judgments/types';
import {startBatch} from './batches';
import {resolveJudgmentsItem} from './judgments-resolver';

const ITEM='3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',SHA='a'.repeat(40);
const NOW=new Date('2026-03-05T10:00:00.000Z');
const {row:J}=priceJudgment({baseDate:'2026-01-12',registeredClose:107,batchId:'00000000-0000-4000-8000-000000000001'});
const EVIDENCE={bars:[{date:'2026-01-12',close:106}],result:{value:111/106-1,from:'2026-01-12',to:'2026-01-20',label_available_at:'2026-01-20T21:00:00.000Z'}};
const H=digest(EVIDENCE);
const CANDS=[{key:{metric:'q_single_revenue'},value_text:'1000',realized_value:1000},{key:{metric:'q_single_revenue'},value_text:'1001',realized_value:1001}];
const CUTOFF='2026-03-02T04:00:00.000Z';
type Stubbed=JudgmentsDb&{getJudgment:ReturnType<typeof vi.fn>;settlementsOf:ReturnType<typeof vi.fn>;applyQuarantineOverride:ReturnType<typeof vi.fn>;resolveClosedQuarantine:ReturnType<typeof vi.fn>;rejectQuarantinedSettlement:ReturnType<typeof vi.fn>;appendSettlement:ReturnType<typeof vi.fn>};

let tables:ReturnType<typeof memoryTableClient>;let db:Stubbed;
beforeEach(()=>{
 tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id']});
 db={resolveClosedQuarantine:vi.fn(async()=>'applied'),getJudgment:vi.fn(async()=>J),settlementsOf:vi.fn(async()=>[]),applyQuarantineOverride:vi.fn(async()=>'applied'),rejectQuarantinedSettlement:vi.fn(async()=>({seq:1,status:'applied'})),appendSettlement:vi.fn(async()=>({seq:1,status:'applied'}))} as unknown as Stubbed;
});
async function item(reason:string,payload:Record<string,unknown>,table='judgment_settlements'){
 const row={id:ITEM,dataset:'judgments',table_name:table,natural_key:J.judgment_id,reason_code:reason,status:'open',payload,detail:{},batch_id:'00000000-0000-4000-8000-000000000001',resolved_by:null,resolved_at:null,created_at:'2026-03-02T04:00:00.000Z'};
 await tables.insert('dq_quarantine',row);
 return row;
}
const run=(row:Record<string,unknown>,status:'resolved_accept'|'resolved_reject',resolution?:unknown,codeVersion:string|null=SHA)=>
 resolveJudgmentsItem({db,tables,codeVersion,now:()=>NOW},row,{status,resolution,resolvedBy:ADMIN});
const stored=async()=>(await tables.select('dq_quarantine',{id:ITEM},{limit:1}))[0];

describe('resolveJudgmentsItem',()=>{
 it('basis_mismatch accept_refetched with the item hash → one override RPC carrying the frozen evidence; audited by the RPC',async()=>{
  const row=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H,registered_bar:{close:107},cutoff:CUTOFF});
  const r=await run(row,'resolved_accept',{kind:'accept_refetched',evidence_hash:H});
  expect(r).toEqual({outcome:'resolved',audited:true,judgmentId:J.judgment_id,resolution:'accept_refetched',seq:null});
  expect(db.applyQuarantineOverride).toHaveBeenCalledWith(J.judgment_id,
   {reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:H,evidence:EVIDENCE},evidence_hash:H,resolved_by:ADMIN,at:NOW.toISOString(),cutoff:CUTOFF},
   ITEM,expect.objectContaining({action:'dq.quarantine_resolve',user_id:ADMIN,object_id:ITEM}));
  expect(db.appendSettlement).not.toHaveBeenCalled();
 });
 it('accept: an item without a resolution cutoff is refused; the RPC answering stale / closed → stale (409), item_not_open → already_resolved (P1-03, P1-04)',async()=>{
  const noCutoff=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H});
  expect((await run(noCutoff,'resolved_accept',{kind:'accept_refetched',evidence_hash:H})).outcome).toBe('invalid_resolution');
  expect(db.applyQuarantineOverride).not.toHaveBeenCalled();
  const row={...noCutoff,payload:{evidence:EVIDENCE,evidence_hash:H,cutoff:CUTOFF}};
  for(const [rpc,outcome] of [['stale','stale'],['closed','stale'],['item_not_open','already_resolved']] as const){
   db.applyQuarantineOverride.mockResolvedValueOnce(rpc);
   expect({rpc,o:(await run(row,'resolved_accept',{kind:'accept_refetched',evidence_hash:H})).outcome}).toEqual({rpc,o:outcome});
  }
 });
 it('basis_mismatch: missing / wrong-kind / wrong-hash verdicts and tampered stored evidence → invalid_resolution, nothing written',async()=>{
  const row=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H,cutoff:CUTOFF});
  for(const res of [undefined,'x',{kind:'choose_fact',chosen:CANDS[0]},{kind:'accept_refetched',evidence_hash:'b'.repeat(64)},{kind:'accept_refetched'}])
   expect({res,o:(await run(row,'resolved_accept',res)).outcome}).toEqual({res,o:'invalid_resolution'});
  const tampered={...row,payload:{evidence:{...EVIDENCE,bars:[]},evidence_hash:H,cutoff:CUTOFF}};
  expect((await run(tampered,'resolved_accept',{kind:'accept_refetched',evidence_hash:H})).outcome).toBe('invalid_resolution');
  expect(db.applyQuarantineOverride).not.toHaveBeenCalled();
 });
 it('ambiguous_fact choose_fact: the chosen object must be one of the candidates (by digest)',async()=>{
  const row=await item('settlement_ambiguous_fact',{candidates:CANDS,evidence_hash:'c'.repeat(64),cutoff:CUTOFF});
  expect((await run(row,'resolved_accept',{kind:'choose_fact',chosen:{...CANDS[1],value_text:'1002'}})).outcome).toBe('invalid_resolution');
  const r=await run(row,'resolved_accept',{kind:'choose_fact',chosen:CANDS[1]});
  expect(r).toMatchObject({outcome:'resolved',audited:true,resolution:'choose_fact'});
  expect(db.applyQuarantineOverride.mock.calls[0][1]).toEqual({reason_code:'settlement_ambiguous_fact',resolution:{kind:'choose_fact',chosen:CANDS[1]},evidence_hash:'c'.repeat(64),resolved_by:ADMIN,at:NOW.toISOString(),cutoff:CUTOFF});
 });
 it('base_bar_missing / benchmark_gap cannot be accepted → resolution_not_applicable',async()=>{
  for(const [i,reason] of ['settlement_base_bar_missing','settlement_benchmark_gap'].entries()){
   const row={...(await item(reason,{evidence_hash:H})),id:ITEM};
   expect((await run(row,'resolved_accept',{kind:'accept_refetched',evidence_hash:H})).outcome).toBe('resolution_not_applicable');
   await tables.update('dq_quarantine',{id:ITEM},{id:`00000000-0000-4000-8000-00000000dea${i}`});   // park the item so the next reason can reuse ITEM
  }
  expect(db.applyQuarantineOverride).not.toHaveBeenCalled();
 });
 it('reject → ONE rejectQuarantinedSettlement RPC (void(quarantine_rejected) as admin:<id>, request_key quarantine-reject:<item>, bound to the evidence identity read from the item, item flip and audit in one transaction) in a manual judgments.settle batch (P1-05, Q1-03)',async()=>{
  const row=await item('settlement_benchmark_gap',{missing_dates:['2026-01-14'],evidence_hash:H,cutoff:CUTOFF});
  const r=await run(row,'resolved_reject');
  expect(r).toEqual({outcome:'resolved',audited:true,judgmentId:J.judgment_id,resolution:'quarantine_rejected',seq:1});
  expect(db.rejectQuarantinedSettlement).toHaveBeenCalledWith(J.judgment_id,ITEM,{evidence_hash:H,cutoff:CUTOFF},`quarantine-reject:${ITEM}`,expect.objectContaining({
   kind:'void',outcome:null,realized:null,reason:'quarantine_rejected',actor:`admin:${ADMIN}`,resolver:'price_return',resolver_version:PRICE_RESOLVER_VERSION,code_version:SHA,
   evidence:{quarantine_id:ITEM,reason_code:'settlement_benchmark_gap',evidence_hash:H}}),expect.objectContaining({action:'dq.quarantine_resolve',user_id:ADMIN,object_id:ITEM}));
  expect(db.appendSettlement).not.toHaveBeenCalled();
  const batchId=db.rejectQuarantinedSettlement.mock.calls[0][4].batch_id;
  expect((await tables.select('ingest_batches',{batch_id:batchId},{limit:1}))[0]).toMatchObject({dataset:'judgments.settle',producer:'ts-judgments',triggered_by:'manual',status:'success',counts:expect.objectContaining({fetched:1,versioned:1})});
  expect((await stored()).status).toBe('open');                                              // the RPC flips the item; the hook never does it separately
 });
 it('reject: the RPC answering stale → stale (nothing written), item_not_open → already_resolved; an item without evidence_hash / cutoff → invalid_resolution (P1-05, Q1-03)',async()=>{
  const bare=await item('settlement_benchmark_gap',{missing_dates:['2026-01-14'],evidence_hash:H});
  expect((await run(bare,'resolved_reject')).outcome).toBe('invalid_resolution');
  expect(db.rejectQuarantinedSettlement).not.toHaveBeenCalled();
  const row={...bare,payload:{missing_dates:['2026-01-14'],evidence_hash:H,cutoff:CUTOFF}};
  db.rejectQuarantinedSettlement.mockResolvedValueOnce({seq:0,status:'stale'});
  expect(await run(row,'resolved_reject')).toMatchObject({outcome:'stale',audited:false,seq:null});
  db.rejectQuarantinedSettlement.mockResolvedValueOnce({seq:0,status:'item_not_open'});
  expect((await run(row,'resolved_reject')).outcome).toBe('already_resolved');
  expect((await stored()).status).toBe('open');
 });
 it('reject of an already final judgment uses validated atomic cleanup',async()=>{
  const row=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H,cutoff:CUTOFF});
  db.settlementsOf.mockResolvedValue([{seq:1,kind:'void',judgment_id:J.judgment_id} as SettlementRow]);
  expect(await run(row,'resolved_reject')).toMatchObject({outcome:'resolved',resolution:'quarantine_rejected',seq:1});
  expect(db.appendSettlement).not.toHaveBeenCalled();expect(db.rejectQuarantinedSettlement).not.toHaveBeenCalled();
  expect(db.resolveClosedQuarantine).toHaveBeenCalledWith(J.judgment_id,ITEM,{evidence_hash:H,cutoff:CUTOFF},ADMIN,expect.any(Object));
 });
 it('hook read → worker refresh → reject: the real RPC sees the refreshed queue and item and answers stale; nothing is written (Q1-03)',async()=>{
  const t=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});
  const mdb=memoryJudgmentsDb({tables:t});mdb.setNow(CUTOFF);
  await mdb.syncMethodology(testMethodologyRow(),'script',null);
  const {batchId}=await startBatch(t,{producer:'ts-judgments',dataset:'judgments.settle',codeVersion:SHA});
  const {insert,queue}=priceJudgment({baseDate:'2026-01-12',registeredClose:107,batchId});await mdb.registerJudgment(insert,queue);
  const id=insert.judgment_id;
  const patch=(hash:string,cutoff:string)=>{const attempt={reason_code:'settlement_basis_mismatch',evidence_hash:hash,cutoff};
   return {last_status:'inconsistent' as const,last_detail:{...attempt,incident:{...attempt,quarantined_at:cutoff}},next_attempt_at:'2000-01-01T00:00:00.000Z',attempts_increment:0 as const};};
  const lease=async()=>(await mdb.claimDue(10,600)).find(q=>q.judgment_id===id)!.lease_token!;
  const first=await mdb.quarantineSettlement(id,await lease(),'settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H,cutoff:CUTOFF,judgment_id:id},patch(H,CUTOFF),batchId);
  const read=(await t.select('dq_quarantine',{id:first.quarantine_id!},{limit:1}))[0];          // the route loads the item: (H, CUTOFF)
  const H2='f'.repeat(64),C2='2026-03-03T04:00:00.000Z';
  expect(await mdb.quarantineSettlement(id,await lease(),'settlement_basis_mismatch',{evidence:{bars:[]},evidence_hash:H2,cutoff:C2,judgment_id:id},patch(H2,C2),batchId)).toEqual({status:'quarantined',quarantine_id:first.quarantine_id});
  const r=await resolveJudgmentsItem({db:mdb,tables:t,codeVersion:SHA,now:()=>NOW},read,{status:'resolved_reject',resolvedBy:ADMIN});
  expect(r).toMatchObject({outcome:'stale',audited:false,seq:null});
  expect(await mdb.settlementsOf([id])).toEqual([]);
  expect((await t.select('dq_quarantine',{id:first.quarantine_id!},{limit:1}))[0].status).toBe('open');
 });
 it('reject without a code version → code_version_unavailable, nothing written',async()=>{
  const row=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H});
  expect((await run(row,'resolved_reject',undefined,null)).outcome).toBe('code_version_unavailable');
  expect(db.rejectQuarantinedSettlement).not.toHaveBeenCalled();expect((await stored()).status).toBe('open');
 });
 it('idempotent: a resolved item answers already_resolved without writes; the RPC refusing a non-open item is already_resolved too',async()=>{
  const row=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H});
  expect((await run({...row,status:'resolved_reject'},'resolved_reject')).outcome).toBe('already_resolved');
  db.applyQuarantineOverride.mockResolvedValueOnce('item_not_open');
  expect((await run({...row,payload:{...row.payload,cutoff:CUTOFF}},'resolved_accept',{kind:'accept_refetched',evidence_hash:H})).outcome).toBe('already_resolved');
  expect(db.appendSettlement).not.toHaveBeenCalled();expect(db.rejectQuarantinedSettlement).not.toHaveBeenCalled();
 });
 it('idempotency_conflict (table judgments) is a plain resolve without touching settlements',async()=>{
  const row=await item('idempotency_conflict',{registered:{},attempted:{}},'judgments');
  expect(await run(row,'resolved_accept')).toEqual({outcome:'resolved',audited:false,judgmentId:J.judgment_id,resolution:'plain',seq:null});
  expect((await stored()).status).toBe('resolved_accept');
  expect(db.getJudgment).not.toHaveBeenCalled();
 });
 it('choose_fact without payload evidence_hash is invalid',async()=>{
  const row=await item('settlement_ambiguous_fact',{candidates:CANDS,cutoff:CUTOFF});
  expect((await run(row,'resolved_accept',{kind:'choose_fact',chosen:CANDS[0]})).outcome).toBe('invalid_resolution');
  expect(db.applyQuarantineOverride).not.toHaveBeenCalled();
 });
 it('a non-settlement item rejects an accept resolution without touching settlement logic',async()=>{
  const row=await item('idempotency_conflict',{},'judgments');
  expect((await run(row,'resolved_accept',{kind:'choose_fact',chosen:CANDS[0]})).outcome).toBe('resolution_not_applicable');
  expect((await stored()).status).toBe('open');expect(db.getJudgment).not.toHaveBeenCalled();
 });
 it.each(['stale','item_not_open'])('reject %s is a successful zero-fetch info-only batch',async status=>{
  const row=await item('settlement_benchmark_gap',{evidence_hash:H,cutoff:CUTOFF});
  db.rejectQuarantinedSettlement.mockResolvedValueOnce({seq:0,status});
  await run(row,'resolved_reject');
  const [batch]=await tables.select('ingest_batches',{});
  expect(batch).toMatchObject({status:'success',counts:expect.objectContaining({fetched:0,duplicates:0,failed:0})});
  expect(batch.errors).toEqual([expect.objectContaining({code:`quarantine_reject_${status}`})]);
 });
 it.each(['applied','already_applied','stale','item_not_open','request_key_conflict','throw'])('reject %s finishes exactly once',async status=>{
  const row=await item('settlement_benchmark_gap',{evidence_hash:H,cutoff:CUTOFF});
  const update=vi.spyOn(tables,'update');
  if(status==='throw')db.rejectQuarantinedSettlement.mockRejectedValueOnce(new Error('down'));
  else db.rejectQuarantinedSettlement.mockResolvedValueOnce({seq:1,status});
  await run(row,'resolved_reject').catch(()=>undefined);
  expect(update.mock.calls.filter(([table,,patch])=>table==='ingest_batches'&&patch.status!==undefined)).toHaveLength(1);
 });
 it('a settlement item whose judgment does not exist → unknown_judgment',async()=>{
  const row=await item('settlement_basis_mismatch',{evidence:EVIDENCE,evidence_hash:H});
  db.getJudgment.mockResolvedValueOnce(null);
  expect((await run(row,'resolved_accept',{kind:'accept_refetched',evidence_hash:H})).outcome).toBe('unknown_judgment');
 });
});
