// resolvePublicIssuer over the REAL resolveIssuer and a memory TableClient (no mocks).
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {resolvePublicIssuer} from './public-route';

const KEYS={issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']};
const id=(n:number)=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const issuer=(n:number)=>({issuer_id:id(n),status:'active',merged_into:null,lei:null,cik:null,usci:null,cninfo_org_id:null,hkex_stock_code_primary:null,canonical_name_zh:null,canonical_name_en:`Co ${n}`,country_code:null,provenance:{},created_at:'2020-01-01T00:00:00.000Z',updated_at:'2020-01-01T00:00:00.000Z'});
const sec=(n:number,ticker:string)=>({issuer_id:id(n),ticker,isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null});
async function seeded(){
 const c=memoryTableClient(KEYS);
 for(const [n,t] of [[1,'BRK'],[2,'BRK.A'],[3,'BRK.B'],[4,'600519.SH'],[5,'00700.HK'],[6,'AAPL']] as const){
  await c.insert('issuers',issuer(n));await c.insert('issuer_securities',sec(n,t));
 }
 return c;
}
const TODAY='2026-11-04';

describe('resolvePublicIssuer (real resolveIssuer)',()=>{
 it('BRK, BRK.A and BRK.B are three distinct US issuers; the slash form maps to the dotted ticker',async()=>{
  const c=await seeded();
  expect(await resolvePublicIssuer(c,'BRK.A',TODAY)).toEqual({issuerId:id(2),ticker:'BRK.A',market:'US'});
  expect(await resolvePublicIssuer(c,'brk/b',TODAY)).toEqual({issuerId:id(3),ticker:'BRK.B',market:'US'});
  expect(await resolvePublicIssuer(c,'BRK',TODAY)).toEqual({issuerId:id(1),ticker:'BRK',market:'US'});
  expect(await resolvePublicIssuer(c,'AAPL',TODAY)).toEqual({issuerId:id(6),ticker:'AAPL',market:'US'});
 });
 it('CN variants resolve to the canonical 600519.SH with market CN',async()=>{
  const c=await seeded();
  for(const t of ['600519','SH600519','600519.SS','600519.SH','sh600519'])
   expect(await resolvePublicIssuer(c,t,TODAY)).toEqual({issuerId:id(4),ticker:'600519.SH',market:'CN'});
 });
 it('a merged issuer\'s old ticker serves the TARGET issuer with the source ticker and its market; an expired source row and a merged HK ticker are rejected',async()=>{
  const c=await seeded();
  await c.insert('issuers',{...issuer(7),status:'merged',merged_into:id(6)});
  await c.insert('issuer_securities',sec(7,'OLDX'));
  await c.insert('issuers',{...issuer(8),status:'merged',merged_into:id(4)});
  await c.insert('issuer_securities',sec(8,'300999.SZ'));
  await c.insert('issuers',{...issuer(9),status:'merged',merged_into:id(6)});
  await c.insert('issuer_securities',sec(9,'01234.HK'));
  expect(await resolvePublicIssuer(c,'OLDX',TODAY)).toEqual({issuerId:id(6),ticker:'OLDX',market:'US'});
  expect(await resolvePublicIssuer(c,'300999',TODAY)).toEqual({issuerId:id(4),ticker:'300999.SZ',market:'CN'});
  expect(await resolvePublicIssuer(c,'01234.HK',TODAY)).toBeNull();
 });
 it('HK tickers (even when they resolve) and unknown tickers are rejected',async()=>{
  const c=await seeded();
  expect(await resolvePublicIssuer(c,'00700.HK',TODAY)).toBeNull();
  expect(await resolvePublicIssuer(c,'700',TODAY)).toBeNull();
  expect(await resolvePublicIssuer(c,'ZZZZ',TODAY)).toBeNull();
 });
});
