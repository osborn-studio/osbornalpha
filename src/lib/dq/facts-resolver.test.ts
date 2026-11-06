import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({materialize:vi.fn()}));
vi.mock('../facts/derive',()=>({materialize:mocks.materialize,FORMULA_VERSION:'facts-derive/1.0'}));

import {memoryTableClient} from '../db/memory-table-client';
import {quarantine} from './quarantine';
import {markAudited,resolveFactsItem} from './facts-resolver';
import {FactsDbError} from '../facts/types';
import type {FactRow,FactsDb,FilingRow} from '../facts/types';

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
  const rpc=vi.spyOn(tables,'rpc').mockRejectedValue(new Error('db gone secret-detail'));
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  rpc.mockRestore();spy.mockRestore();
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

describe('resolveFactsItem — plan 3 dispatch (spec §4.6, §5.6, T10)',()=>{
 const FILING='30000000-0000-4000-8000-000000000001',T='40000000-0000-4000-8000-000000000004',KEEP='20000000-0000-4000-8000-0000000000ee';
 const filingRow=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:FILING,issuer_id:ISSUER,market:'US',source:'edgar',origin:'sec',form_type:'10-Q',fiscal_year:2023,fiscal_period:'Q3',period_end:'2023-09-30',available_date:'2023-11-03',source_ref:'0000320193-23-000106',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2024-01-01T00:00:00.000Z',accepted_at:null,acceptance_source:null,...p});
 const cand=(o:Record<string,unknown>={})=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value:'110',unit:'USD',consolidation:'consolidated',filingRef:'0000320193-23-000106',rawHash:'h-110',...o});
 const okRow=(p:Partial<FactRow>):FactRow=>({...fact('20000000-0000-4000-8000-0000000000aa','0'),filing_id:FILING,status:'ok',period_start:'2023-07-01',period_end:'2023-09-30',duration:'3M',...p});
 function h3(o:{readRows?:FactRow[];revs?:number[]}={}){
  const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id']});
  const revs=[...(o.revs??[4])];
  const db={
   findFilingBySourceRef:vi.fn(async(source:string,ref:string)=>source==='edgar'&&ref==='0000320193-23-000106'?filingRow():null),
   readFacts:vi.fn(async(_issuer:string,_market:string,_opts:{history?:boolean})=>({stateRev:revs.length>1?revs.shift()!:revs[0],rows:o.readRows??[],truncated:false})),
   adoptCandidate:vi.fn(async(_item:string,_index:number,_batch:string,_rev:number,_by:string)=>({factId:'50000000-0000-4000-8000-000000000005',runId:'60000000-0000-4000-8000-000000000006',issuerId:ISSUER,market:'US' as const})),
   restoreReconciled:vi.fn(async():Promise<{promoted:number;skipped:{fact_id:string;reason:string}[]}>=>({promoted:1,skipped:[]})),
   resolveLineageConflict:vi.fn(async()=>({quarantined:1})),
   resolveFactsQuarantine:vi.fn(async()=>({promoted:0,skipped:0,chosenFactIds:[]})),
   factsByIds:vi.fn(async()=>[]),
  };
  const item=async(reasonCode:string,payload:Record<string,unknown>,o2:{naturalKey?:string;detail?:Record<string,unknown>}={})=>{
   const id=await quarantine(tables,{dataset:'facts.us',table:'financial_facts',naturalKey:o2.naturalKey??`k:${reasonCode}:${Math.random()}`,reasonCode,batchId:BATCH,payload,detail:o2.detail});
   return (await tables.select('dq_quarantine',{id},{limit:1}))[0];
  };
  return {tables,db:db as unknown as FactsDb&typeof db,item};
 }
 const ambiguousPayload=(cands=[cand(),cand({value:'111',rawHash:'h-111'})])=>({key:{issuer_id:'00000000-0000-4000-8000-0000000000ff',market:'US'},candidates:cands,run_id:'r'});

 it('ambiguous_value + chosenCandidateIndex: filing from the candidate (not the payload), rules on candidate ∪ ok rows, a dq-resolver batch, adoptCandidate under the read stateRev, materialize of the filing issuer',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('ambiguous_value',ambiguousPayload());
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:1,resolvedBy:ADMIN,now:NOW,today:'2026-11-04'});
  expect(db.findFilingBySourceRef).toHaveBeenCalledWith('edgar','0000320193-23-000106');
  expect(db.readFacts).toHaveBeenCalledWith(ISSUER,'US',expect.objectContaining({asOf:'2026-11-04',from:'2023-09-30',to:'2023-09-30',history:true}));
  const [batch]=tables.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'dq-resolver',dataset:'facts.us',status:'success',triggered_by:'manual'});
  expect(db.adoptCandidate).toHaveBeenCalledWith(it_.id,1,batch.batch_id,4,ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(r).toEqual({outcome:'resolved',hook:{stage:'done',state:'done',at:'2026-11-04T09:00:00.000Z'},adoptedFactId:'50000000-0000-4000-8000-000000000005',chosenFactIds:['50000000-0000-4000-8000-000000000005']});
 });
 it('rule_failed: the candidate breaks a statement identity with the ok rows → 400-class outcome, nothing written, no batch',async()=>{
  const {tables,db,item}=h3({readRows:[okRow({concept:'liabilities_and_equity',statement:'BS',period_start:null,duration:'INSTANT',value:'200',value_text:'200'})]});
  const it_=await item('ambiguous_value',ambiguousPayload([cand({concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT',value:'100'})]));
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'rule_failed',code:'identity_bs'});
  expect(db.adoptCandidate).not.toHaveBeenCalled();expect(tables.rows('ingest_batches')).toEqual([]);
 });
 it('plan audit P1: a later filing that supersedes the balancing rows does not hide them — history read, only the candidate filing at its active generation counts',async()=>{
  const LATER='30000000-0000-4000-8000-000000000009';
  const bs={concept:'liabilities_and_equity',statement:'BS' as const,period_start:null,duration:'INSTANT' as const};
  const own=okRow({...bs,value:'200',value_text:'200',is_current:false});                                        // the candidate filing's own row, superseded
  const later=okRow({...bs,fact_id:'20000000-0000-4000-8000-0000000000bb',filing_id:LATER,value:'100',value_text:'100',is_current:true});
  const {tables,db,item}=h3();
  db.readFacts.mockImplementation(async(_i:string,_m:string,opts:{history?:boolean})=>({stateRev:4,rows:opts.history?[own,later]:[later],truncated:false}));
  const it_=await item('ambiguous_value',ambiguousPayload([cand({concept:'total_assets',statement:'BS',periodStart:null,duration:'INSTANT',value:'100'})]));
  const go=()=>resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW});
  expect(await go()).toEqual({outcome:'rule_failed',code:'identity_bs'});                                         // 100 ≠ 200 of its own filing
  expect(db.readFacts).toHaveBeenCalledWith(ISSUER,'US',expect.objectContaining({history:true}));
  expect(db.adoptCandidate).not.toHaveBeenCalled();
  db.readFacts.mockImplementation(async()=>({stateRev:4,rows:[{...own,mapping_gen:2},later],truncated:false}));   // another generation / another filing never count
  expect((await go()).outcome).toBe('resolved');
  expect(db.adoptCandidate).toHaveBeenCalledTimes(1);
 });
 it('plan audit P1: a truncated read refuses the adoption (conflict read_truncated), no batch, nothing written',async()=>{
  const {tables,db,item}=h3();
  db.readFacts.mockResolvedValue({stateRev:4,rows:[],truncated:true});
  const it_=await item('ambiguous_value',ambiguousPayload());
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:'read_truncated'});
  expect(db.adoptCandidate).not.toHaveBeenCalled();expect(tables.rows('ingest_batches')).toEqual([]);
 });
 it('stale_evaluation: re-read and re-evaluate once, then adopt under the new rev; a second stale answer is a 409 conflict',async()=>{
  const a=h3({revs:[4,5]});
  a.db.adoptCandidate.mockRejectedValueOnce(new FactsDbError('stale_evaluation'));
  const it1=await a.item('ambiguous_value',ambiguousPayload());
  expect((await resolveFactsItem(a.db,a.tables,it1,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).outcome).toBe('resolved');
  expect(a.db.readFacts).toHaveBeenCalledTimes(2);
  expect(a.db.adoptCandidate.mock.calls.map(c=>c[3])).toEqual([4,5]);
  const b=h3();
  b.db.adoptCandidate.mockRejectedValue(new FactsDbError('stale_evaluation'));
  const it2=await b.item('ambiguous_value',ambiguousPayload());
  expect(await resolveFactsItem(b.db,b.tables,it2,{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:'stale_evaluation'});
  expect(b.tables.rows('ingest_batches')[0]).toMatchObject({status:'failed'});
 });
 it('adopt codes: out-of-range index and bad candidate → invalid_choice; unknown filing → conflict filing_not_found (no db write); SQL codes → conflict; batch_mismatch is a programming error (thrown)',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('ambiguous_value',ambiguousPayload([cand(),cand({rawHash:7}),cand({filingRef:'nope'})]));
  const go=(i:number)=>resolveFactsItem(db,tables,it_,{status:'resolved_accept',chosenCandidateIndex:i,resolvedBy:ADMIN,now:NOW});
  expect(await go(9)).toEqual({outcome:'invalid_choice',code:'invalid_choice'});
  expect(await go(1)).toEqual({outcome:'invalid_choice',code:'invalid_candidate'});
  expect(await go(2)).toEqual({outcome:'conflict',code:'filing_not_found'});
  expect(db.adoptCandidate).not.toHaveBeenCalled();
  for(const c of ['generation_moved','conflict_exists','duplicate','replay_required','filing_not_found'] as const){
   db.adoptCandidate.mockRejectedValueOnce(new FactsDbError(c));expect(await go(0)).toEqual({outcome:'conflict',code:c});
  }
  db.adoptCandidate.mockRejectedValueOnce(new FactsDbError('invalid_candidate'));expect(await go(0)).toEqual({outcome:'invalid_choice',code:'invalid_candidate'});
  db.adoptCandidate.mockRejectedValueOnce(new FactsDbError('batch_mismatch'));
  await expect(go(0)).rejects.toMatchObject({code:'batch_mismatch'});
  expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('ambiguous_value without an index stays the plan-2 acknowledgement (resolve_facts_quarantine)',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('ambiguous_value',ambiguousPayload());
  await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(db.resolveFactsQuarantine).toHaveBeenCalledWith(it_.id,[],ADMIN);expect(db.adoptCandidate).not.toHaveBeenCalled();
 });
 it('reconcile_mismatch: without inputsHashNow → 409 not_passing + reconcile_wiring_missing (no write); {unavailable} → that note (inputs_unavailable / current_evidence_unavailable); with a hash → restoreReconciled(item, batch, hash) and materialize of the persisted target; promoted 0 → restore_note; not_passing → conflict',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('reconcile_mismatch',{fact_ids:[A]},{detail:{issuer_id:ISSUER,market:'US',pair:'us.companyfacts_vs_ixbrl',hook:{stage:'materialize',state:'pending'}}});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>({unavailable:'inputs_unavailable' as const})})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'inputs_unavailable'});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>({unavailable:'current_evidence_unavailable' as const})})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'current_evidence_unavailable'});
  expect(db.restoreReconciled).not.toHaveBeenCalled();expect(tables.rows('ingest_batches')).toEqual([]);
  const hashOf=vi.fn(async()=>'hash-now');
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf});
  expect(hashOf).toHaveBeenCalledWith(it_);
  expect(db.restoreReconciled).toHaveBeenCalledWith(it_.id,expect.any(String),'hash-now',ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,ISSUER,'US');
  expect(r).toMatchObject({outcome:'resolved',promoted:1,restore:{promoted:1,skipped:[]},hook:{state:'done'}});
  db.restoreReconciled.mockResolvedValueOnce({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}]});
  expect((await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).restore).toEqual({promoted:0,skipped:[{fact_id:A,reason:'ineligible'}],restore_note:'no_rows_promoted'});
  db.restoreReconciled.mockRejectedValueOnce(new FactsDbError('not_passing'));
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).toEqual({outcome:'conflict',code:'not_passing'});
 });
 it('lineage_conflict: keep_fact_id is required; resolveLineageConflict, then materialize of T from the natural key',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'invalid_choice',code:'keep_fact_id_required'});
  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW});
  expect(db.resolveLineageConflict).toHaveBeenCalledWith(it_.id,KEEP,expect.any(String),ADMIN);
  expect(mocks.materialize).toHaveBeenCalledWith(db,T,'US');
  expect(r).toMatchObject({outcome:'resolved',quarantined:1,chosenFactIds:[KEEP],hook:{state:'done'}});
  for(const c of ['lineage_changed','scope_missing','unresolved'] as const){db.resolveLineageConflict.mockRejectedValueOnce(new FactsDbError(c));expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:c});}
 });
 it('reconcile_review: accept and reject are the plan-1 status flip only (no promotion, no hook, no materialize)',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('reconcile_review',{fact_ids:[A]});
  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'resolved'});
  const [row]=await tables.select('dq_quarantine',{id:it_.id});
  expect(row).toMatchObject({status:'resolved_accept',resolved_by:ADMIN});expect(row.detail).toEqual({});
  expect(db.resolveFactsQuarantine).not.toHaveBeenCalled();expect(mocks.materialize).not.toHaveBeenCalled();
 });
 it('rejecting a new-reason item is the generic flip (rows stay quarantined)',async()=>{
  const {tables,db,item}=h3();
  for(const reason of ['reconcile_mismatch','lineage_conflict','ambiguous_value']){
   const it_=await item(reason,{fact_ids:[A]});
   expect(await resolveFactsItem(db,tables,it_,{status:'resolved_reject',resolvedBy:ADMIN})).toEqual({outcome:'resolved'});
  }
  expect(db.restoreReconciled).not.toHaveBeenCalled();expect(db.resolveLineageConflict).not.toHaveBeenCalled();expect(db.adoptCandidate).not.toHaveBeenCalled();
 });
 it('unfinished verdicts (adopted / restored / lineage) with a missing, pending or failed hook re-run materialize only, on the persisted target; 502 semantics come from hook failed',async()=>{
  const {tables,db,item}=h3();
  const done=async(reason:string,detail:Record<string,unknown>,naturalKey?:string)=>{
   const it_=await item(reason,{fact_ids:[A]},{naturalKey,detail});
   await tables.update('dq_quarantine',{id:it_.id},{status:'resolved_accept',resolved_by:ADMIN,resolved_at:'2026-11-04T08:00:00.000Z'});
   return (await tables.select('dq_quarantine',{id:it_.id},{limit:1}))[0];
  };
  const adopted=await done('ambiguous_value',{adopted_fact_id:'f-new',issuer_id:ISSUER,market:'US',hook:{stage:'materialize',state:'pending'}});
  mocks.materialize.mockRejectedValueOnce(new FactsDbError('stale_computation'));
  const first=await resolveFactsItem(db,tables,adopted,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});
  expect(first).toMatchObject({outcome:'hook_retried',hook:{state:'failed',message:'stale_computation'}});
  expect(db.adoptCandidate).not.toHaveBeenCalled();
  const restored=await done('reconcile_mismatch',{restored_by_batch:'b',issuer_id:T,market:'US'});                 // hook missing
  expect((await resolveFactsItem(db,tables,restored,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).outcome).toBe('hook_retried');
  expect(mocks.materialize).toHaveBeenLastCalledWith(db,T,'US');
  const lineage=await done('lineage_conflict',{chosen_fact_ids:[KEEP],issuer_id:T,market:'US',hook:{stage:'materialize',state:'failed'}});
  expect((await resolveFactsItem(db,tables,lineage,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).outcome).toBe('hook_retried');
  const ack=await done('ambiguous_value',{hook:{stage:'done',state:'done',at:'x'}});
  expect((await resolveFactsItem(db,tables,ack,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW})).outcome).toBe('already_resolved');
 });
 it('plan audit P4: hook and audit writes patch only their key — a newer latest_result committed right before the write survives',async()=>{
  const {tables,db,item}=h3();
  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`,detail:{latest_result:{passed:true,reconciliation_id:'r-old'}}});
  // a concurrent writer (apply_reconcile_result / another verdict) commits just before our first detail write;
  // the old read-then-replace would have written its stale copy back over it
  const newer=async()=>{const [cur]=await tables.select('dq_quarantine',{id:it_.id});await tables.update('dq_quarantine',{id:it_.id},{detail:{...(cur.detail as Record<string,unknown>),latest_result:{passed:false,reconciliation_id:'r-newer'}}});};
  let fired=false;
  const racing:typeof tables={...tables,
   async update(t,m,p){if(t==='dq_quarantine'&&'detail' in p&&!fired){fired=true;await newer();}return tables.update(t,m,p);},
   async rpc(fn,a){if(fn==='patch_quarantine_detail'&&!fired){fired=true;await newer();}return tables.rpc(fn,a);}};
  const r=await resolveFactsItem(db,racing,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW});
  expect(r.hook).toMatchObject({stage:'done',state:'done'});
  await markAudited(racing,String(it_.id));
  const [row]=await tables.select('dq_quarantine',{id:it_.id});
  expect(row.detail).toMatchObject({latest_result:{passed:false,reconciliation_id:'r-newer'},hook:{stage:'done',state:'done'},audit_written:true});
 });

 it('never reaches the generic resolve_facts_quarantine for reconcile_mismatch / lineage_conflict (use_dedicated_resolver); target_not_active and use_dedicated_resolver surface as conflicts',async()=>{
  const {tables,db,item}=h3();
  for(const reason of ['reconcile_mismatch','lineage_conflict']){
   const a=await item(reason,{fact_ids:[A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`,detail:{issuer_id:ISSUER,market:'US'}});
   await resolveFactsItem(db,tables,a,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>'h'});
   const b=await item(reason,{fact_ids:[A]},{detail:{issuer_id:ISSUER,market:'US'}});
   await resolveFactsItem(db,tables,b,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW});          // no keep / no wiring: refused before any call
   await resolveFactsItem(db,tables,b,{status:'resolved_reject',resolvedBy:ADMIN,now:NOW});
  }
  expect(db.resolveFactsQuarantine).not.toHaveBeenCalled();
  const it_=await item('lineage_conflict',{fact_ids:[KEEP,A]},{naturalKey:`${T}:revenue:2023-07-01:2023-09-30:consolidated:USD:2023-11-03`});
  for(const c of ['target_not_active','use_dedicated_resolver'] as const){
   db.resolveLineageConflict.mockRejectedValueOnce(new FactsDbError(c));
   expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW})).toEqual({outcome:'conflict',code:c});
  }
 });
});
