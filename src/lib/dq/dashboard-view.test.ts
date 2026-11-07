// src/lib/dq/dashboard-view.test.ts
import {describe,expect,it} from 'vitest';
import {conflictCode,quarantineActions,successNoticeCode,amendBody,claimMode,disclosureTone,overdueDays,quarantineAcceptBody,quarantineControl,suggestedOp,sumByMarket} from './dashboard-view';

describe('calendar view rules',()=>{
 it.each([['overdue','text-danger'],['filed_not_ingested','text-warn'],['unknown_upstream','text-text-muted italic'],['pending','text-text-dim'],['received_late','text-warn'],['received',''],['other','text-text-dim']])('%s → %j',(s,tone)=>{expect(disclosureTone(s)).toBe(tone);});
 it('overdue days only for overdue rows with a due date',()=>{
  expect(overdueDays({disclosure_state:'overdue',due_date:'2026-08-10'},'2026-11-05')).toBe(87);
  expect(overdueDays({disclosure_state:'pending',due_date:'2026-08-10'},'2026-11-05')).toBeNull();
  expect(overdueDays({disclosure_state:'overdue',due_date:null},'2026-11-05')).toBeNull();
  expect(sumByMarket({US:2,CN:3})).toBe(5);expect(sumByMarket(undefined)).toBe(0);
 });
});

describe('claims view rules',()=>{
 it('legacy is SQL-only, evidence_only needs an amendment, others accept directly',()=>{
  expect(claimMode('legacy')).toBe('sql_only');expect(claimMode('evidence_only')).toBe('amend');expect(claimMode('set_identifier')).toBe('accept');
 });
 it('builds the amend body per op and rejects incomplete forms',()=>{
  const base={issuerId:'i',ticker:'NEW',validFrom:'2026-01-01'};
  expect(amendBody({...base,op:'backdate_window',date:'2025-12-15',method:'ticker_change'})).toEqual({ok:true,body:{status:'accepted',amend:{op:'backdate_window',target:{issuer_id:'i',ticker:'NEW',valid_from:'2026-01-01'},params:{new_valid_from:'2025-12-15',valid_from_method:'ticker_change'}}}});
  expect(amendBody({...base,op:'close_security',date:'2026-03-01',method:'delisting'})).toMatchObject({ok:true,body:{amend:{params:{valid_to:'2026-03-01',valid_to_method:'delisting'}}}});
  expect(amendBody({...base,ticker:'',op:'close_security',date:'2026-03-01',method:'delisting'})).toEqual({ok:false,error:'amend_security'});
  expect(amendBody({...base,op:'close_security',date:'03/01/2026',method:'delisting'})).toEqual({ok:false,error:'amend_date'});
  expect(amendBody({...base,op:'close_security',date:'2026-03-01',method:'listing_date'})).toEqual({ok:false,error:'amend_method'});
  expect(suggestedOp({params:{suggested_op:'close_security'}})).toBe('close_security');expect(suggestedOp({})).toBe('backdate_window');
 });
});

describe('quarantine inline controls',()=>{
 it('ambiguous_value lists candidates and accepts only a listed index',()=>{
  const c=quarantineControl({reason_code:'ambiguous_value',payload:{candidates:[{value:'100',unit:'USD',sourceConcept:'Revenues',filingRef:'acc-1'},{value:'101',unit:'USD',sourceConcept:'SalesRevenueNet',filingRef:'acc-1'}]}});
  expect(c).toEqual({kind:'candidates',options:[{index:0,label:'100 USD · Revenues · acc-1'},{index:1,label:'101 USD · SalesRevenueNet · acc-1'}]});
  expect(quarantineAcceptBody(c,1)).toEqual({status:'resolved_accept',chosen_candidate_index:1});
  expect(quarantineAcceptBody(c,2)).toBeNull();expect(quarantineAcceptBody(c,null)).toBeNull();
 });
 it('lineage_conflict pairs fact ids with values (by fact_id, else by position) and accepts only a listed fact',()=>{
  const c=quarantineControl({reason_code:'lineage_conflict',payload:{fact_ids:['f1','f2'],values:[{issuer_id:'A',filing:'x',value:'1'},{fact_id:'f2',issuer_id:'B',filing:'y',value:'2'}]}});
  expect(c).toEqual({kind:'lineage',options:[{factId:'f1',label:'1 · A · x'},{factId:'f2',label:'2 · B · y'}]});
  expect(quarantineAcceptBody(c,'f2')).toEqual({status:'resolved_accept',keep_fact_id:'f2'});
  expect(quarantineAcceptBody(c,'f9')).toBeNull();
 });
 it('reconcile_mismatch restore is enabled only by a passing latest_result with server-computed restorable',()=>{
  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:true,detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:true,reason:'passing'});
  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
  expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
  const off=quarantineControl({reason_code:'reconcile_mismatch',detail:{latest_result:{passed:false}}});
  expect(off).toEqual({kind:'restore',enabled:false,reason:'not_passing'});
  expect(quarantineAcceptBody(off,null)).toBeNull();
  expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
  expect(quarantineControl({reason_code:'same_day_conflict'})).toEqual({kind:'plain'});
 });
 it('a row not live-checked (restorable_checked:false, over the per-load cap) shows a distinct unchecked reason, never inputs_changed',()=>{
  const passing={reason_code:'reconcile_mismatch',restorable:false,detail:{latest_result:{passed:true}}};
  const unchecked=quarantineControl({...passing,restorable_checked:false});
  expect(unchecked).toEqual({kind:'restore',enabled:false,reason:'unchecked'});
  expect(quarantineAcceptBody(unchecked,null)).toBeNull();
  expect(quarantineControl({...passing,restorable_checked:true})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
  expect(quarantineControl({...passing,restorable:true,restorable_checked:true})).toEqual({kind:'restore',enabled:true,reason:'passing'});
  // settled from the stored result alone: the stored reason wins even when the row was not live-checked
  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{latest_result:{passed:false}}})).toEqual({kind:'restore',enabled:false,reason:'not_passing'});
  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
 });
});

describe('quarantine actions and response notices',()=>{
 const cand=quarantineControl({reason_code:'ambiguous_value',payload:{candidates:[{value:'1'},{value:'2'}]}});
 const lin=quarantineControl({reason_code:'lineage_conflict',payload:{fact_ids:['f1','f2'],values:[]}});
 it('ambiguous rows: adopt needs a selection, acknowledge is explicit, no generic accept',()=>{
  expect(quarantineActions(cand,null)).toEqual([{id:'adopt',body:null},{id:'acknowledge',body:{status:'resolved_accept'}},{id:'reject',body:{status:'resolved_reject'}}]);
  expect(quarantineActions(cand,1)[0]).toEqual({id:'adopt',body:{status:'resolved_accept',chosen_candidate_index:1}});
 });
 it('lineage rows: only keep-selected and reject',()=>{
  expect(quarantineActions(lin,null).map(a=>a.id)).toEqual(['keep','reject']);
  expect(quarantineActions(lin,null)[0].body).toBeNull();
  expect(quarantineActions(lin,'f2')[0].body).toEqual({status:'resolved_accept',keep_fact_id:'f2'});
 });
 it('restore and plain rows',()=>{
  const on=quarantineControl({reason_code:'reconcile_mismatch',restorable:true,detail:{latest_result:{passed:true}}});
  expect(quarantineActions(on,null)[0]).toEqual({id:'restore',body:{status:'resolved_accept'},reason:'passing'});
  const off=quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{latest_result:{passed:true}}});
  expect(quarantineActions(off,null)[0]).toEqual({id:'restore',body:null,reason:'unchecked'});
  expect(quarantineActions({kind:'plain'},null)).toEqual([{id:'accept',body:{status:'resolved_accept'}},{id:'reject',body:{status:'resolved_reject'}}]);
 });
 it('reads the landed route envelope',()=>{
  expect(successNoticeCode({id:'q',outcome:'resolved',restore:{promoted:0,skipped:['f1']},detail:{restore_note:'no_rows_promoted'}})).toBe('no_rows_promoted');
  expect(successNoticeCode({restore:{promoted:2,skipped:[]}})).toBeNull();
  expect(successNoticeCode(null)).toBeNull();
  expect(conflictCode({id:'q',outcome:'conflict',error:'not_passing',detail:{restore_note:'inputs_unavailable'}})).toBe('inputs_unavailable');
  expect(conflictCode({error:'value_conflict'})).toBe('value_conflict');
  expect(conflictCode({id:'q',outcome:'already_resolved'})).toBe('already_resolved');
  expect(conflictCode({})).toBeNull();
 });
});
