import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {resolveIssuer} from './resolve';

const TODAY='2026-11-05';
async function seed(){
 const c=memoryTableClient();
 await c.insert('issuers',{issuer_id:'a',canonical_name_en:'Apple Inc.',canonical_name_zh:'苹果',cik:'320193',lei:'HWUPKR0MPOU8FGXBT394',usci:null,status:'active',merged_into:null});
 await c.insert('issuers',{issuer_id:'old',canonical_name_en:'Old Apple Shell',canonical_name_zh:null,cik:'999',lei:null,usci:null,status:'merged',merged_into:'a'});
 await c.insert('issuers',{issuer_id:'chain',canonical_name_en:'Chain',canonical_name_zh:null,cik:'998',lei:null,usci:null,status:'merged',merged_into:'old'});
 await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL',isin:'US0378331005',figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
 await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL.OLD',isin:null,figi:null,share_class:'other',is_primary:false,valid_from:'1990-01-01',valid_to:'1999-12-31',source:'sec'});
 await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL.FUT',isin:null,figi:null,share_class:'other',is_primary:false,valid_from:'2030-01-01',valid_to:null,source:'sec'});
 return c;
}

describe('resolveIssuer',()=>{
 it('resolves by ticker (normalized), isin, cik and lei and lists only securities current today by default',async()=>{
  const c=await seed();
  const byTicker=await resolveIssuer(c,{ticker:'aapl'},{today:TODAY});
  expect(byTicker?.issuer_id).toBe('a');
  expect(byTicker?.securities.map(s=>s.ticker)).toEqual(['AAPL']);
  expect(byTicker?.names).toEqual({zh:'苹果',en:'Apple Inc.'});
  expect((await resolveIssuer(c,{isin:'us0378331005'},{today:TODAY}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{cik:'0000320193'},{today:TODAY}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{lei:'hwupkr0mpou8fgxbt394'},{today:TODAY}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{ticker:'AAPL'},{today:TODAY,includeExpired:true}))?.securities.map(s=>s.ticker)).toEqual(['AAPL.OLD','AAPL','AAPL.FUT']);
 });
 it('ignores expired and future ownership rows when resolving by ticker',async()=>{
  const c=await seed();
  expect(await resolveIssuer(c,{ticker:'AAPL.OLD'},{today:TODAY})).toBeNull();
  expect(await resolveIssuer(c,{ticker:'AAPL.FUT'},{today:TODAY})).toBeNull();
  expect((await resolveIssuer(c,{ticker:'AAPL.FUT'},{today:'2030-06-01'}))?.issuer_id).toBe('a');
 });
 it('follows one merged_into hop and reports the redirect; refuses two hops',async()=>{
  const c=await seed();
  const out=await resolveIssuer(c,{cik:'999'},{today:TODAY});
  expect(out).toMatchObject({issuer_id:'a',redirected_from:'old',status:'active'});
  expect(await resolveIssuer(c,{cik:'998'},{today:TODAY})).toBeNull();
 });
 it('returns null for unknown identifiers and throws on empty or malformed queries',async()=>{
  const c=await seed();
  expect(await resolveIssuer(c,{ticker:'ZZZZ'},{today:TODAY})).toBeNull();
  await expect(resolveIssuer(c,{})).rejects.toThrow('empty_query');
  await expect(resolveIssuer(c,{cik:'abc'})).rejects.toThrow('invalid_identifier:cik');
  await expect(resolveIssuer(c,{isin:'US123'})).rejects.toThrow('invalid_identifier:isin');
  await expect(resolveIssuer(c,{lei:'nope'})).rejects.toThrow('invalid_identifier:lei');
 });
});
