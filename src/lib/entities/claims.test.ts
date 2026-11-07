// src/lib/entities/claims.test.ts
import {afterEach,describe,it,expect,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TableError} from '../db/table-client';
import {buildClaimDetail,canonicalJson,claimEvidence,claimTargetKey,fileClaim,isIsoDate,provenanceKeysFor,validateClaimDetail} from './claims';
import type {ClaimInput} from './claims';
import type {ClaimDetail,ClaimEvidence} from './types';

const SHA='b'.repeat(64);
const EV:ClaimEvidence={source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA};
const I='11111111-1111-4111-8111-111111111111';
const issuerT={issuer_id:I};
const rowT={issuer_id:I,ticker:'600519.SH',valid_from:'2001-08-27'};
const d=(over:Record<string,unknown>={})=>({schema:'claim/1',evidence_kind:'hard_identifier',target:issuerT,params:{},evidence:EV,sources:[],...over}) as ClaimDetail;
const verdict=(r:ReturnType<typeof validateClaimDetail>)=>r.ok?'ok':r.error;
const client=()=>memoryTableClient({issuer_identifier_claims:['id']});

afterEach(()=>{vi.useRealTimers();});

describe('claimTargetKey',()=>{
 it('is op:issuer for issuer-level targets and op:issuer|ticker|valid_from for security rows',()=>{
  expect(claimTargetKey('set_identifier',issuerT)).toBe(`set_identifier:${I}`);
  expect(claimTargetKey('close_security',rowT)).toBe(`close_security:${I}|600519.SH|2001-08-27`);
 });
});

describe('validateClaimDetail (mirrors identifier_claim_problem in SQL)',()=>{
 it('accepts one well-formed claim per op',()=>{
  const ok:[Parameters<typeof validateClaimDetail>[0],Parameters<typeof validateClaimDetail>[1],ClaimDetail][]=[
   ['set_identifier','lei',d()],
   ['set_identifier','isin',d({target:rowT,params:{candidates:[{compositeFIGI:'BBG000B9XRY4'}]}})],
   ['correct_identifier','figi',d({target:rowT,params:{expected_current:'BBG000B9XRY4',new_value:'BBG000B9Y5X2'}})],
   ['attach_security','ticker',d({params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x',ticker:'0700.HK'},provenance_written:{valid_from:{source:'x'}}})],
   ['attach_security','ticker',d({evidence_kind:'name_match',params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'hkex_list_name_match',isin:'CNE1000003G1'}})],
   ['close_security','ticker',d({evidence_kind:'filing_form',target:rowT,params:{valid_to:'2026-03-02',valid_to_method:'delisting'}})],
   ['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-08-01',valid_from_method:'ticker_change'}})],
   ['evidence_only','ticker',d({evidence_kind:'filing_form',params:{suggested_op:'backdate_window',accession:'0001234567-26-000001',form:'8-A12B'}})],
  ];
  for(const [op,t,detail] of ok)expect({op,t,r:verdict(validateClaimDetail(op,t,detail))}).toEqual({op,t,r:'ok'});
 });
 it('names the field at fault',()=>{
  const cases:[Parameters<typeof validateClaimDetail>,string][]=[
   [['legacy','lei',d()],'legacy_claim'],
   [['set_identifier','lei',{...d(),schema:'claim/0'}],'invalid_claim:schema'],
   [['set_identifier','lei',d({evidence_kind:'confidence'})],'invalid_claim:evidence_kind'],
   [['set_identifier','lei',d({target:{issuer_id:''}})],'invalid_claim:target.issuer_id'],
   [['set_identifier','lei',d({params:[]})],'invalid_claim:params'],
   [['set_identifier','lei',d({evidence:{...EV,evidence_sha256:'XYZ'}})],'invalid_claim:evidence'],
   [['set_identifier','lei',d({evidence:{...EV,as_of:'2026-02-30'}})],'invalid_claim:evidence'],
   [['set_identifier','lei',d({sources:[{...EV,source:''}]})],'invalid_claim:sources'],
   [['set_identifier','lei',d({target:rowT})],'invalid_claim:target'],
   [['set_identifier','lei',d({target:{issuer_id:I,extra:'x'}})],'invalid_claim:target'],
   [['set_identifier','isin',d()],'invalid_claim:target'],
   [['set_identifier','ticker',d()],'invalid_claim:op_id_type'],
   [['set_identifier','lei',d({params:{expected_current:'x'}})],'invalid_claim:params'],
   [['correct_identifier','lei',d({params:{expected_current:'A',new_value:'A'}})],'invalid_claim:params'],
   [['correct_identifier','lei',d({params:{expected_current:'A',new_value:'B'}}),'C'],'invalid_claim:params.new_value'],
   [['attach_security','ticker',d({target:rowT})],'invalid_claim:op_id_type'],
   [['attach_security','ticker',d({params:{share_class:'B',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x'}})],'invalid_claim:params'],
   [['attach_security','ticker',d({params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x',isin:'CN12'}})],'invalid_claim:params'],
   [['close_security','ticker',d({target:rowT,params:{valid_to:'2001-08-27',valid_to_method:'delisting'}})],'invalid_claim:params'],
   [['close_security','ticker',d({target:rowT,params:{valid_to:'2026-03-02',valid_to_method:'vanished'}})],'invalid_claim:params'],
   [['close_security','ticker',d({target:rowT,params:{valid_to:'2026-03-02',valid_to_method:'delisting'}}),'000001.SZ'],'invalid_claim:target.ticker'],
   [['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-09-01',valid_from_method:'listing_date'}})],'invalid_claim:params'],
   [['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-08-01',valid_from_method:'first_observed'}})],'invalid_claim:params'],
   [['evidence_only','ticker',d({params:{suggested_op:'merge'}})],'invalid_claim:params.suggested_op'],
   [['evidence_only','ticker',d({params:{suggested_op:['attach_security']}})],'invalid_claim:params.suggested_op'],
   [['evidence_only','lei',d()],'invalid_claim:op_id_type'],
   [['set_identifier','lei',d({provenance_written:{cik:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
   [['set_identifier','lei',d({provenance_written:{lei:{source:'x',user_id:'u'}}})],'invalid_claim:provenance_written:secret_key'],
   [['evidence_only','ticker',d({provenance_written:{valid_from:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
   [['set_identifier','lei',d({provenance_written:{}})],'invalid_claim:provenance_written'],
   [['attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x',ticker:'bad ticker'}})],'invalid_claim:params'],
   [['attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'}}),'a b'],'invalid_claim:params.ticker'],
  ];
  for(const [args,want] of cases)expect({args:JSON.stringify(args),got:verdict(validateClaimDetail(...args))}).toEqual({args:JSON.stringify(args),got:want});
 });
 it('allows exactly the provenance keys the accepted op writes',()=>{
  expect(provenanceKeysFor('set_identifier','lei')).toEqual(['lei']);
  expect(provenanceKeysFor('correct_identifier','isin')).toEqual(['isin']);
  expect(provenanceKeysFor('attach_security','ticker')).toEqual(['isin','figi','valid_from']);
  expect(provenanceKeysFor('close_security','ticker')).toEqual(['valid_to']);
  expect(provenanceKeysFor('backdate_window','ticker')).toEqual(['valid_from']);
  expect(provenanceKeysFor('evidence_only','ticker')).toEqual([]);
  expect(verdict(validateClaimDetail('attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'},provenance_written:{valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}}})))).toBe('ok');
 });
});

describe('claim evidence helpers',()=>{
 it('hashes the canonical JSON of a record (key order never matters) and falls back to today (UTC) for a non-date as_of',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
  expect(canonicalJson({b:1,a:{d:[2,{f:1,e:null}],c:'x',u:undefined}})).toBe('{"a":{"c":"x","d":[2,{"e":null,"f":1}]},"b":1}');
  const a=claimEvidence({source:'sec',asOf:'2026-11-04T12:00:00Z',record:{cik:'320193',lei:'HWUPKR0MPOU8FGXBT394'}});
  expect(a).toEqual(claimEvidence({source:'sec',asOf:'2026-11-04',record:{lei:'HWUPKR0MPOU8FGXBT394',cik:'320193'}}));
  expect(a).toEqual({source:'sec',as_of:'2026-11-04',evidence_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)});
  expect(claimEvidence({source:'x',asOf:'garbage',record:{}}).as_of).toBe('2026-11-05');
  expect(claimEvidence({source:'x',record:{},locator:'row:3',note:'n'})).toMatchObject({as_of:'2026-11-05',locator:'row:3',note:'n'});
  expect([isIsoDate('2026-02-28'),isIsoDate('2026-02-30'),isIsoDate('2026-2-3'),isIsoDate(20260228)]).toEqual([true,false,false,false]);
 });
 it('builds a claim/1 detail with an empty sources list by default',()=>{
  expect(buildClaimDetail({evidence_kind:'hard_identifier',target:issuerT,evidence:EV})).toEqual({schema:'claim/1',evidence_kind:'hard_identifier',target:issuerT,params:{},evidence:EV,sources:[]});
  expect(buildClaimDetail({evidence_kind:'provider_mapping',target:rowT,params:{candidates:[]},evidence:EV,provenance_written:{isin:{source:'gleif'}}})).toMatchObject({params:{candidates:[]},provenance_written:{isin:{source:'gleif'}}});
 });
});

describe('fileClaim',()=>{
 const input=(over:Partial<ClaimInput>={}):ClaimInput=>({issuer_id:I,id_type:'lei',value:'529900T8BM49AURSDO55',source:'gleif',op:'set_identifier',detail:d(),...over});
 it('writes a claim/1 row: op, target_key, detail with a sources list, no confidence',async()=>{
  const c=client();
  expect(await fileClaim(c,input())).toBe(true);
  expect(c.rows('issuer_identifier_claims')).toEqual([{id:expect.any(String),issuer_id:I,id_type:'lei',value:'529900T8BM49AURSDO55',source:'gleif',confidence:null,status:'pending',
   op:'set_identifier',target_key:`set_identifier:${I}`,detail:d(),resolved_by:null,resolved_at:null,created_at:expect.any(String)}]);
 });
 it('appends only new evidence to the pending claim with the same key and never changes its target or params',async()=>{
  const c=client();
  await fileClaim(c,input());
  expect(await fileClaim(c,input())).toBe(false);                                     // same evidence: nothing appended
  const later={...EV,as_of:'2026-11-06',evidence_sha256:'c'.repeat(64)};
  expect(await fileClaim(c,input({detail:d({evidence:later,params:{note:'other'}})}))).toBe(false);
  expect(c.rows('issuer_identifier_claims')[0].detail).toEqual({...d(),sources:[later]});
  expect(await fileClaim(c,input({detail:d({evidence:later})}))).toBe(false);         // already among the sources
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([later]);
  expect(await fileClaim(c,input({op:'correct_identifier',detail:d({params:{expected_current:'HWUPKR0MPOU8FGXBT394',new_value:'529900T8BM49AURSDO55'}})}))).toBe(true);   // another op is another claim
  expect(c.rows('issuer_identifier_claims')).toHaveLength(2);
 });
 it('treats a 23505 insert race as the winner existing and appends to it',async()=>{
  const c=client();
  await fileClaim(c,input());
  const select=c.select.bind(c);let blind=true;
  c.select=async(t,m,o)=>{if(t==='issuer_identifier_claims'&&blind){blind=false;return [];}return select(t,m,o);};
  const insert=c.insert.bind(c);
  c.insert=async(t,r)=>{if(t==='issuer_identifier_claims')throw new TableError('insert',t,'duplicate key value violates unique constraint "issuer_identifier_claims_pending_unique"','23505');return insert(t,r);};
  const later={...EV,evidence_sha256:'d'.repeat(64)};
  expect(await fileClaim(c,input({detail:d({evidence:later})}))).toBe(false);
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([later]);
 });
 it('concurrent filers of the same pending key both keep their evidence (append_claim_evidence, plan audit P3)',async()=>{
  const c=client();
  await fileClaim(c,input());
  const e1={...EV,evidence_sha256:'e'.repeat(64)},e2={...EV,evidence_sha256:'f'.repeat(64)};
  expect(await Promise.all([fileClaim(c,input({detail:d({evidence:e1})})),fileClaim(c,input({detail:d({evidence:e2})}))])).toEqual([false,false]);
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([e1,e2]);
  const {rpc:_rpc,...noRpc}=c;
  await expect(fileClaim(noRpc,input({detail:d({evidence:{...EV,evidence_sha256:'9'.repeat(64)}})}))).rejects.toThrow('rpc_unavailable:append_claim_evidence');
 });
 it('appends every incoming evidence item (evidence and each source) on the existing-row and the insert-race paths',async()=>{
  const B={...EV,evidence_sha256:'1'.repeat(64)},C={...EV,evidence_sha256:'2'.repeat(64)},D={...EV,evidence_sha256:'3'.repeat(64)},E={...EV,evidence_sha256:'4'.repeat(64)};
  const c=client();
  await fileClaim(c,input());
  expect(await fileClaim(c,input({detail:d({evidence:B,sources:[C]})}))).toBe(false);
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([B,C]);
  const select=c.select.bind(c);let blind=true;
  c.select=async(t,m,o)=>{if(t==='issuer_identifier_claims'&&blind){blind=false;return [];}return select(t,m,o);};
  const insert=c.insert.bind(c);
  c.insert=async(t,r)=>{if(t==='issuer_identifier_claims')throw new TableError('insert',t,'duplicate key value violates unique constraint "issuer_identifier_claims_pending_unique"','23505');return insert(t,r);};
  expect(await fileClaim(c,input({detail:d({evidence:D,sources:[E,C]})}))).toBe(false);
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([B,C,D,E]);
 });
 it('retries once when the pending claim is resolved between lookup and append (not_found)',async()=>{
  const c=client();
  await fileClaim(c,input());
  const rpc=c.rpc.bind(c);let first=true;
  c.rpc=async(fn,a)=>{if(first){first=false;await c.update('issuer_identifier_claims',{status:'pending'},{status:'rejected'});}return rpc(fn,a);};
  const later={...EV,evidence_sha256:'5'.repeat(64)};
  expect(await fileClaim(c,input({detail:d({evidence:later})}))).toBe(true);     // a new pending claim was inserted
  const rows=c.rows('issuer_identifier_claims');
  expect(rows.map(r=>r.status)).toEqual(['rejected','pending']);
  expect((rows[1].detail as ClaimDetail).evidence).toEqual(later);
 });
 it('retries after an insert unique conflict whose winner was resolved meanwhile, and appends to a new winner',async()=>{
  const c=client();
  await fileClaim(c,input());
  const select=c.select.bind(c);let blind=true;
  c.select=async(t,m,o)=>{if(t==='issuer_identifier_claims'&&blind){blind=false;return [];}return select(t,m,o);};
  const insert=c.insert.bind(c);let raced=true;
  c.insert=async(t,r)=>{if(raced){raced=false;throw new TableError('insert',t,'duplicate key value violates unique constraint "issuer_identifier_claims_pending_unique"','23505');}return insert(t,r);};
  const rpc=c.rpc.bind(c);let first=true;
  c.rpc=async(fn,a)=>{if(first){first=false;await c.update('issuer_identifier_claims',{status:'pending'},{status:'accepted'});}return rpc(fn,a);};
  expect(await fileClaim(c,input())).toBe(true);
  expect(c.rows('issuer_identifier_claims').map(r=>r.status)).toEqual(['accepted','pending']);
 });
 it('throws claim_not_persisted instead of returning false when nothing could be persisted',async()=>{
  const c=client();
  await fileClaim(c,input());
  c.rpc=async()=>'not_found';
  await expect(fileClaim(c,input({detail:d({evidence:{...EV,evidence_sha256:'6'.repeat(64)}})}))).rejects.toThrow('claim_not_persisted');
 });
 it('stores detail.sources deduped by (source, evidence_sha256), without the primary evidence',async()=>{
  const B={...EV,evidence_sha256:'1'.repeat(64)};
  const c=client();
  expect(await fileClaim(c,input({detail:d({sources:[EV,B,{...B,as_of:'2026-11-06'},B]})}))).toBe(true);
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([B]);
 });
 it('validates before touching the database',async()=>{
  const c=client();
  await expect(fileClaim(c,input({detail:d({target:{issuer_id:'22222222-2222-4222-8222-222222222222'}})}))).rejects.toThrow('invalid_claim:target.issuer_id');
  await expect(fileClaim(c,input({op:'correct_identifier',detail:d({params:{expected_current:'A',new_value:'B'}})}))).rejects.toThrow('invalid_claim:params.new_value');
  await expect(fileClaim(c,input({source:''}))).rejects.toThrow('invalid_claim:source');
  await expect(fileClaim(c,input({value:''}))).rejects.toThrow('invalid_claim:value');
  await expect(fileClaim(c,{...input(),op:'legacy' as never})).rejects.toThrow('legacy_claim');
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
 });
});
