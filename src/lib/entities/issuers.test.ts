import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {upsertIssuerByIdentifiers,attachSecurity} from './issuers';

const LEI_APPLE='HWUPKR0MPOU8FGXBT394';
const LEI_OTHER='529900T8BM49AURSDO55';

describe('upsertIssuerByIdentifiers',()=>{
 it('creates a new issuer, reuses it on a matching hard id, enriches null fields and merges provenance per key',async()=>{
  const c=memoryTableClient({issuers:['issuer_id']});
  const first=await upsertIssuerByIdentifiers(c,{cik:'0000320193',canonical_name_en:'Apple Inc.',country_code:'US',provenance:{cik:{source:'sec'}}});
  expect(first.created).toBe(true);
  expect(c.rows('issuers')[0].cik).toBe('320193');
  const second=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'APPLE INC',provenance:{lei:{source:'gleif'}}});
  expect(second).toMatchObject({created:false,issuer_id:first.issuer_id});
  const row=c.rows('issuers')[0];
  expect(row.lei).toBe(LEI_APPLE);
  expect(row.canonical_name_en).toBe('Apple Inc.');
  expect(row.provenance).toEqual({cik:{source:'sec'},lei:{source:'gleif'}});
 });
 it('records a pending claim instead of writing when a hard identifier contradicts',async()=>{
  const c=memoryTableClient({issuers:['issuer_id'],issuer_identifier_claims:['id']});
  await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_APPLE,canonical_name_en:'Apple'});
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',lei:LEI_OTHER,canonical_name_en:'X',provenance:{lei:{source:'test'}}});
  expect(out).toEqual({issuer_id:null,created:false,conflict:true});
  expect(c.rows('issuers')).toHaveLength(1);
  expect(c.rows('issuers')[0].lei).toBe(LEI_APPLE);
  expect(c.rows('issuer_identifier_claims')).toEqual([expect.objectContaining({id_type:'lei',value:LEI_OTHER,status:'pending',source:'test'})]);
 });
 it('rejects invalid hard identifiers before touching the database',async()=>{
  const c=memoryTableClient();
  await expect(upsertIssuerByIdentifiers(c,{cik:'abc',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:cik');
  await expect(upsertIssuerByIdentifiers(c,{lei:'BAD',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:lei');
  await expect(upsertIssuerByIdentifiers(c,{usci:'123',canonical_name_en:'X'})).rejects.toThrow('invalid_identifier:usci');
  expect(c.rows('issuers')).toHaveLength(0);
 });
 it('recovers from a unique-index race by re-reading and reusing the winner',async()=>{
  const c=memoryTableClient({issuers:['issuer_id']});
  const base=c.insert.bind(c);let raced=false;
  c.insert=async(t,row)=>{ if(t==='issuers'&&!raced){raced=true;await base('issuers',{...row,issuer_id:'winner'});throw new Error('duplicate key value violates unique constraint "issuers_cik_idx"');} return base(t,row); };
  const out=await upsertIssuerByIdentifiers(c,{cik:'320193',canonical_name_en:'Apple'});
  expect(out).toMatchObject({issuer_id:'winner',created:false});
  expect(c.rows('issuers')).toHaveLength(1);
 });
});

describe('attachSecurity',()=>{
 const sec={issuer_id:'a',ticker:'AAPL',share_class:'common' as const,is_primary:true,valid_from:'2000-01-01',source:'sec'};
 it('inserts once and reports duplicate for the same issuer even with a later valid_from',async()=>{
  const c=memoryTableClient({issuer_securities:['issuer_id','ticker','valid_from']});
  expect(await attachSecurity(c,sec)).toBe('inserted');
  expect(await attachSecurity(c,sec)).toBe('duplicate');
  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05'})).toBe('duplicate');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('reports conflict and writes nothing when another issuer currently owns the ticker',async()=>{
  const c=memoryTableClient({issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id']});
  await attachSecurity(c,sec);
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2026-11-05'})).toBe('conflict');
  expect(c.rows('issuer_securities')).toHaveLength(1);
 });
 it('allows a new owner once the previous interval is closed',async()=>{
  const c=memoryTableClient({issuer_securities:['issuer_id','ticker','valid_from']});
  await attachSecurity(c,{...sec,valid_to:'2010-01-01'});
  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2010-01-01'})).toBe('inserted');
 });
});
