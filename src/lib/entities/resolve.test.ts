import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {resolveIssuer,successCacheControl} from './resolve';

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

 it('rejects more than one identifier and validates today',async()=>{
  const c=await seed();
  await expect(resolveIssuer(c,{ticker:'AAPL',cik:'320193'},{today:TODAY})).rejects.toThrow('ambiguous_query');
  await expect(resolveIssuer(c,{isin:'US0378331005',lei:'HWUPKR0MPOU8FGXBT394'},{today:TODAY})).rejects.toThrow('ambiguous_query');
  // blank values do not count as supplied
  expect((await resolveIssuer(c,{ticker:'AAPL',cik:'  '},{today:TODAY}))?.issuer_id).toBe('a');
  for(const today of ['2026-13-01','2026-02-30','20261105','2026-1-05',' 2026-11-05'])
   await expect(resolveIssuer(c,{ticker:'AAPL'},{today})).rejects.toThrow('invalid_today');
 });
 it('tries the exact ticker before the normalized form',async()=>{
  const c=await seed();
  await c.insert('issuers',{issuer_id:'brk',canonical_name_en:'Berkshire',canonical_name_zh:null,cik:'1067983',lei:null,usci:null,status:'active',merged_into:null});
  await c.insert('issuers',{issuer_id:'other',canonical_name_en:'Other BRK',canonical_name_zh:null,cik:'1',lei:null,usci:null,status:'active',merged_into:null});
  await c.insert('issuer_securities',{issuer_id:'brk',ticker:'BRK.A',isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
  await c.insert('issuer_securities',{issuer_id:'brk',ticker:'BRK.B',isin:null,figi:null,share_class:'B',is_primary:false,valid_from:'2000-01-01',valid_to:null,source:'sec'});
  await c.insert('issuer_securities',{issuer_id:'other',ticker:'BRK',isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'sec'});
  expect((await resolveIssuer(c,{ticker:'BRK.A'},{today:TODAY}))?.issuer_id).toBe('brk');
  expect((await resolveIssuer(c,{ticker:'brk/b'},{today:TODAY}))?.issuer_id).toBe('brk');
  // no exact row: falls back to the normalized (Wind-suffix stripped) form
  expect((await resolveIssuer(c,{ticker:'AAPL.O'},{today:TODAY}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{ticker:'aapl'},{today:TODAY}))?.issuer_id).toBe('a');
 });
 it('falls back to the normalized ticker only when the exact ticker has no rows at all',async()=>{
  const c=await seed();
  for(const id of ['old-xyz','xyz'])await c.insert('issuers',{issuer_id:id,canonical_name_en:id,canonical_name_zh:null,cik:null,lei:null,usci:null,status:'active',merged_into:null});
  await c.insert('issuer_securities',{issuer_id:'old-xyz',ticker:'XYZ.A',isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:'2010-01-01',source:'t'});
  await c.insert('issuer_securities',{issuer_id:'xyz',ticker:'XYZ',isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'t'});
  // XYZ.A exists but is expired-only: null, not the current holder of XYZ
  expect(await resolveIssuer(c,{ticker:'XYZ.A'},{today:TODAY})).toBeNull();
  expect((await resolveIssuer(c,{ticker:'XYZ.A'},{today:'2005-01-01'}))?.issuer_id).toBe('old-xyz');
  // XYZ.N has no rows at all: falls back to XYZ
  expect((await resolveIssuer(c,{ticker:'XYZ.N'},{today:TODAY}))?.issuer_id).toBe('xyz');
 });
 it('throws ambiguous_owner when two issuers own the same ticker today',async()=>{
  const c=await seed();
  await c.insert('issuers',{issuer_id:'dup',canonical_name_en:'Dup',canonical_name_zh:null,cik:'2',lei:null,usci:null,status:'active',merged_into:null});
  await c.insert('issuer_securities',{issuer_id:'dup',ticker:'AAPL',isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2020-01-01',valid_to:null,source:'sec'});
  await expect(resolveIssuer(c,{ticker:'AAPL'},{today:TODAY})).rejects.toThrow('ambiguous_owner');
 });
 it('passes a dissolved status through',async()=>{
  const c=await seed();
  await c.insert('issuers',{issuer_id:'d',canonical_name_en:'Gone Corp',canonical_name_zh:null,cik:'4242',lei:null,usci:null,status:'dissolved',merged_into:null});
  expect(await resolveIssuer(c,{cik:'4242'},{today:TODAY})).toMatchObject({issuer_id:'d',status:'dissolved',securities:[]});
 });
 it('resolves an ISIN to its current owner, ignoring expired and future rows',async()=>{
  const c=await seed();
  for(const id of ['x1','x2','x3'])await c.insert('issuers',{issuer_id:id,canonical_name_en:id,canonical_name_zh:null,cik:null,lei:null,usci:null,status:'active',merged_into:null});
  const isin='US5949181045';
  await c.insert('issuer_securities',{issuer_id:'x1',ticker:'X1',isin,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:'2020-01-01',source:'t'});
  await c.insert('issuer_securities',{issuer_id:'x2',ticker:'X2',isin,figi:null,share_class:null,is_primary:true,valid_from:'2020-01-01',valid_to:null,source:'t'});
  await c.insert('issuer_securities',{issuer_id:'x3',ticker:'X3',isin,figi:null,share_class:null,is_primary:true,valid_from:'2027-01-01',valid_to:null,source:'t'});
  expect((await resolveIssuer(c,{isin},{today:TODAY}))?.issuer_id).toBe('x2');
  expect((await resolveIssuer(c,{isin},{today:'2010-06-01'}))?.issuer_id).toBe('x1');
 });
 it('accepts asOf as the evaluation date; today is a deprecated synonym',async()=>{
  const c=await seed();
  expect((await resolveIssuer(c,{ticker:'AAPL.FUT'},{asOf:'2030-06-01'}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{ticker:'AAPL.OLD'},{asOf:'1995-01-01'}))?.issuer_id).toBe('a');
  expect((await resolveIssuer(c,{ticker:'AAPL.OLD'},{asOf:'1995-01-01',today:'1995-01-01'}))?.issuer_id).toBe('a');
  await expect(resolveIssuer(c,{ticker:'AAPL'},{asOf:'2026-11-05',today:'2026-11-04'})).rejects.toThrow('invalid_as_of');
  for(const asOf of ['2026-02-30','20261105',' 2026-11-05'])await expect(resolveIssuer(c,{ticker:'AAPL'},{asOf})).rejects.toThrow('invalid_as_of');
 });
 it('returns the window methods of each security (null when the row carries no method; the in-memory client has no column defaults)',async()=>{
  const c=await seed();
  await c.insert('issuer_securities',{issuer_id:'a',ticker:'AAPL.W',isin:null,figi:null,share_class:'other',is_primary:false,valid_from:'2001-01-01',valid_to:'2002-01-01',valid_from_method:'listing_date',valid_to_method:'sec_file_absent',source:'sec'});
  const out=await resolveIssuer(c,{ticker:'AAPL'},{asOf:TODAY,includeExpired:true});
  expect(out?.securities.find(s=>s.ticker==='AAPL.W')).toMatchObject({valid_from_method:'listing_date',valid_to_method:'sec_file_absent'});
  expect(out?.securities.find(s=>s.ticker==='AAPL')).toMatchObject({valid_from_method:null,valid_to_method:null});
 });
 it('resolves a secondary security of a merged issuer to the target and its securities',async()=>{
  const c=await seed();
  await c.insert('issuer_securities',{issuer_id:'old',ticker:'OLDX',isin:null,figi:null,share_class:'common',is_primary:false,valid_from:'2001-01-01',valid_to:null,source:'sec'});
  const out=await resolveIssuer(c,{ticker:'OLDX'},{today:TODAY});
  expect(out).toMatchObject({issuer_id:'a',redirected_from:'old'});
  expect(out?.securities.map(s=>s.ticker)).toEqual(['AAPL']);
 });
});

describe('successCacheControl',()=>{
 const sm=(d:string)=>Number(/s-maxage=(\d+)/.exec(successCacheControl(new Date(d)))?.[1]);
 it('caches until the next UTC midnight, clamped to [60, 3600]',()=>{
  expect(successCacheControl(new Date('2026-11-05T23:30:00Z'))).toBe('public, s-maxage=1800, stale-while-revalidate=600');
  expect(sm('2026-11-05T23:59:30Z')).toBe(60);
  expect(sm('2026-11-05T00:00:00Z')).toBe(3600);
  expect(sm('2026-11-05T12:00:00Z')).toBe(3600);
 });
});
