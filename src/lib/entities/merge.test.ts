import {describe,it,expect} from 'vitest';
import {matchIssuer} from './merge';

const A={issuer_id:'a',lei:'HWUPKR0MPOU8FGXBT394',cik:'320193',usci:null};
const B={issuer_id:'b',lei:null,cik:'789019',usci:null};

describe('matchIssuer',()=>{
 it('returns same when a hard identifier matches and nothing contradicts',()=>{
  expect(matchIssuer([A,B],{cik:'320193'})).toEqual({kind:'same',issuer_id:'a'});
  expect(matchIssuer([A,B],{lei:'HWUPKR0MPOU8FGXBT394',cik:'320193'})).toEqual({kind:'same',issuer_id:'a'});
  expect(matchIssuer([B],{cik:'789019',lei:'529900T8BM49AURSDO55'})).toEqual({kind:'same',issuer_id:'b'}); // null on the candidate is enrichment, not conflict
 });
 it('returns conflict when matching identifiers point at different issuers or a hard id contradicts',()=>{
  expect(matchIssuer([A,B],{lei:'HWUPKR0MPOU8FGXBT394',cik:'789019'})).toEqual({kind:'conflict',issuer_ids:['a','b'],reason:'identifiers_split'});
  expect(matchIssuer([A],{cik:'320193',lei:'529900T8BM49AURSDO55'})).toEqual({kind:'conflict',issuer_ids:['a'],reason:'hard_id_mismatch'});
 });
 it('returns new when no hard identifier matches, and rejects an input without any hard identifier',()=>{
  expect(matchIssuer([A,B],{cik:'1018724'})).toEqual({kind:'new'});
  expect(()=>matchIssuer([A],{cninfo_org_id:'x'})).toThrow('no_hard_identifier');
 });
});
