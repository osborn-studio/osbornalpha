// src/lib/industry/memberships.test.ts
import {describe,it,expect} from 'vitest';
import {countUnresolved,effectiveValidTo,isMemberAt,membersAt,membersAtPure,unresolvedAt} from './memberships';
import type {IndustryDb,MembershipRow,SourceMembershipRow} from './types';

const I='11111111-1111-4111-8111-111111111111',J='22222222-2222-4222-8222-222222222222';
let n=0;
const row=(over:Partial<MembershipRow>):MembershipRow=>({membership_id:`m-${++n}`,issuer_id:I,scheme:'sw2021',version:'2021',code:'801120.SI',level:1,valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,
 source:'tushare:index_member_all',source_membership_id:null,batch_id:'b',status:'ok',superseded_by:null,provenance:{availability:'effective_date_assumed'},...over});

describe('effectiveValidTo: the four combinations (spec §4.6)',()=>{
 it('open window → null',()=>{expect(effectiveValidTo(row({}),'2030-01-01')).toBeNull();});
 it('closed and known by knownBy → valid_to',()=>{expect(effectiveValidTo(row({valid_to:'2023-07-31',valid_to_available_date:'2023-07-31'}),'2023-07-31')).toBe('2023-07-31');});
 it('closed but knownBy before the closure is knowable → null (still open as far as knownBy knows)',()=>{expect(effectiveValidTo(row({valid_to:'2023-07-31',valid_to_available_date:'2023-07-31'}),'2023-07-30')).toBeNull();});
 it('available_date after knownBy → the row is not a member at all',()=>{
  const r=row({available_date:'2023-07-31',valid_from:'2023-07-31'});
  expect(effectiveValidTo(r,'2023-06-30')).toBeNull();
  expect(isMemberAt(r,'2023-12-31','2023-06-30')).toBe(false);
  expect(isMemberAt(r,'2023-12-31','2023-07-31')).toBe(true);
 });
});

describe('isMemberAt',()=>{
 it('needs status ok and valid_from <= on; the window is half-open at effective_valid_to',()=>{
  const r=row({valid_to:'2023-07-31',valid_to_available_date:'2023-07-31'});
  expect(isMemberAt(r,'2021-07-29','2030-01-01')).toBe(false);
  expect(isMemberAt(r,'2021-07-30','2030-01-01')).toBe(true);
  expect(isMemberAt(r,'2023-07-30','2030-01-01')).toBe(true);
  expect(isMemberAt(r,'2023-07-31','2030-01-01')).toBe(false);
  expect(isMemberAt({...r,status:'superseded'},'2022-01-01','2030-01-01')).toBe(false);
  expect(isMemberAt({...r,status:'quarantined'},'2022-01-01','2030-01-01')).toBe(false);
 });
});

describe('acceptance sample 2 (spec §14): a company moved from X to Y on 2023-07-31',()=>{
 // 002463.SZ in the synthetic fixtures: X = 801120.SI [2021-07-30, 2023-07-31), Y = 801080.SI from 2023-07-31
 const rows=[
  row({code:'801120.SI',valid_to:'2023-07-31',valid_to_available_date:'2023-07-31'}),
  row({code:'801080.SI',valid_from:'2023-07-31',available_date:'2023-07-31'}),
  row({issuer_id:J,code:'801120.SI'}),
 ];
 const q=(code:string,on:string,knownBy:string)=>membersAtPure(rows,{scheme:'sw2021',version:'2021',code,level:1,on,knownBy}).map(r=>r.issuer_id);
 it('on 2022-12-31 known by 2022-12-31: X contains it',()=>{expect(q('801120.SI','2022-12-31','2022-12-31')).toEqual([I,J]);expect(q('801080.SI','2022-12-31','2022-12-31')).toEqual([]);});
 it('on 2023-12-31 known by 2023-12-31: Y contains it, X does not',()=>{expect(q('801080.SI','2023-12-31','2023-12-31')).toEqual([I]);expect(q('801120.SI','2023-12-31','2023-12-31')).toEqual([J]);});
 it('on 2023-12-31 known by 2023-06-30 (before the exit is knowable): X still contains it, Y not yet',()=>{expect(q('801120.SI','2023-12-31','2023-06-30')).toEqual([I,J]);expect(q('801080.SI','2023-12-31','2023-06-30')).toEqual([]);});
});

describe('membersAtPure / membersAt',()=>{
 it('filters by scheme, version, code and level; keeps one row per issuer; validates dates',()=>{
  const rows=[row({}),row({level:2,code:'801120.SI'}),row({scheme:'sic',version:'sec-current'}),row({valid_from:'2019-01-01',available_date:'2019-01-01',valid_to:'2020-01-01',valid_to_available_date:'2025-01-01'})];
  const out=membersAtPure(rows,{scheme:'sw2021',version:'2021',code:'801120.SI',level:1,on:'2021-08-01',knownBy:'2021-08-01'});
  expect(out.map(r=>r.valid_from)).toEqual(['2021-07-30']);
  expect(()=>membersAtPure(rows,{scheme:'sw2021',version:'2021',code:'x',level:1,on:'20210801',knownBy:'2021-08-01'})).toThrow('invalid_date:on');
 });
 it('membersAt reads candidates from IndustryDb.membershipCandidates and applies the same filter',async()=>{
  const asked:unknown[]=[];
  const db={membershipCandidates:async(q:unknown)=>{asked.push(q);return [row({valid_to:'2023-07-31',valid_to_available_date:'2023-07-31'}),row({issuer_id:J,status:'superseded',superseded_by:'m-x'})];}} as unknown as IndustryDb;
  expect((await membersAt(db,{scheme:'sw2021',version:'2021',code:'801120.SI',level:1,on:'2023-12-31',knownBy:'2023-06-30'})).map(r=>r.issuer_id)).toEqual([I]);
  expect(await membersAt(db,{scheme:'sw2021',version:'2021',code:'801120.SI',level:1,on:'2023-12-31',knownBy:'2023-12-31'})).toEqual([]);
  expect(asked[0]).toEqual({scheme:'sw2021',version:'2021',code:'801120.SI',level:1,on:'2023-12-31'});
 });
});

describe('unresolvedAt / countUnresolved (spec §5.2 n_unresolved)',()=>{
 const src=(over:Partial<SourceMembershipRow>):SourceMembershipRow=>({id:`s-${++n}`,scheme:'sw2021',version:'2021',source:'tushare:index_member_all',ts_code:'688999.SH',name:null,l1_code:'801080.SI',l2_code:'801081.SI',l3_code:'850812.SI',in_date:'2022-08-01',out_date:null,observed_at:'2026-11-09T00:00:00.000Z',batch_id:'b',raw_hash:'h',locator:{},status:'current',superseded_by:null,issuer_id:null,resolution:{},resolution_error:null,...over});
 const rows=[
  src({}),src({id:'dup',l3_code:'850813.SI'}),                                    // same ts_code twice: counted once at L1
  src({ts_code:'600087.SH',l1_code:'801120.SI',l2_code:'801124.SI',l3_code:'851241.SI',in_date:'2021-07-30',out_date:'2023-10-20'}),
  src({ts_code:'600000.SH',issuer_id:'resolved'}),src({ts_code:'600001.SH',status:'superseded'}),
 ];
 it('counts distinct unresolved current ts_codes by level and date with the effective-date assumptions',()=>{
  expect(countUnresolved(rows,{code:'801080.SI',level:1,on:'2023-12-31',knownBy:'2026-11-09'})).toBe(1);
  expect(countUnresolved(rows,{code:'850813.SI',level:3,on:'2023-12-31',knownBy:'2026-11-09'})).toBe(1);
  expect(countUnresolved(rows,{code:'801080.SI',level:1,on:'2022-07-31',knownBy:'2026-11-09'})).toBe(0);
  expect(countUnresolved(rows,{code:'801120.SI',level:1,on:'2023-12-31',knownBy:'2026-11-09'})).toBe(0);
  expect(countUnresolved(rows,{code:'801120.SI',level:1,on:'2023-12-31',knownBy:'2023-06-30'})).toBe(0);   // 600087.SH out 2023-10-20 < on
  expect(countUnresolved(rows,{code:'801120.SI',level:1,on:'2023-10-20',knownBy:'2026-11-09'})).toBe(1);   // out_date inclusive (K3)
  expect(countUnresolved(rows,{code:'801120.SI',level:1,on:'2023-10-21',knownBy:'2026-11-09'})).toBe(0);
  expect(unresolvedAt(rows,{code:'801080.SI',level:1,on:'2023-12-31',knownBy:'2026-11-09'}).map(r=>r.ts_code)).toEqual(['688999.SH']);
 });
});
