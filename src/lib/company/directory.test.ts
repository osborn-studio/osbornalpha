// src/lib/company/directory.test.ts
import {describe,expect,it} from 'vitest';
import {DIRECTORY_Q_RE,issuerIdsByPrefix,toDirectoryRows,type PrefixClient,type PrefixPage} from './directory';
import type {CoverageRow} from './types';

/** Fake anon client: order() is recorded, range(a,b) slices like PostgREST (server max-rows 1000). 计划第 3 轮审计 R8 */
function fakePrefix(names:Record<string,unknown>[],tickers:Record<string,unknown>[],fail=false){
 const log:Record<string,string[]>={issuers:[],issuer_securities:[]};
 const pageOf=(rows:Record<string,unknown>[],l:string[]):PrefixPage=>{
  const p:PrefixPage={order:(col)=>{l.push(`order:${col}`);return p;},range:async(a,b)=>{l.push(`range:${a}-${b}`);return fail?{data:null,error:{message:'boom'}}:{data:rows.slice(a,Math.min(b+1,a+1000)),error:null};}};
  return p;
 };
 const sb:PrefixClient={from:(table)=>({select:(cols)=>({
  or:(f)=>{log[table].push(`select:${cols}`,`or:${f}`);return pageOf(names,log[table]);},
  ilike:(col,pat)=>{log[table].push(`select:${cols}`,`ilike:${col}:${pat}`);return pageOf(tickers,log[table]);},
 })})};
 return {sb,log};
}
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const cov=(issuer_id:string,market:'US'|'CN',p:Partial<CoverageRow>={}):CoverageRow=>({issuer_id,market,filings_count:10,facts_count:500,concepts_covered:30,earliest_period_end:'2015-09-26',latest_period_end:'2025-09-27',latest_available_date:'2025-10-31',citation_summary:{linked:0,pending:0,edgar:10},scope_last_success_at:'2026-11-02T03:00:00Z',scope_last_status:'success',based_on_rev:3,rebuilt_at:'x',rebuild_id:'r',rebuild_batch_id:'b',...p});

describe('directory helpers',()=>{
 it('q whitelist',()=>{
  for(const ok of ['AAP','贵州','600519','BRK.A','Kweichow Moutai','A-B'])expect(DIRECTORY_Q_RE.test(ok),ok).toBe(true);
  for(const bad of ['','a,b','a(b','a*','a%','a_b','"x"','x'.repeat(25)])expect(DIRECTORY_Q_RE.test(bad),bad).toBe(false);
 });
 it('rows: names, the stream’s current tickers (primary first), coverage fields; never a per-user field',()=>{
  const rows=toDirectoryRows([cov(A,'US'),cov(B,'CN',{citation_summary:{linked:9,pending:1,edgar:0}})],{
   issuers:[{issuer_id:A,canonical_name_zh:null,canonical_name_en:'Apple Inc.'},{issuer_id:B,canonical_name_zh:'贵州茅台',canonical_name_en:'Kweichow Moutai'}],
   securities:[
    {issuer_id:A,ticker:'AAPL',is_primary:true,valid_from:'2000-01-01',valid_to:null},
    {issuer_id:B,ticker:'600519.SH',is_primary:true,valid_from:'2001-08-27',valid_to:null},
    {issuer_id:B,ticker:'OLD.SH',is_primary:false,valid_from:'1990-01-01',valid_to:'2000-01-01'},
   ]},'2026-11-06');
  expect(rows[1]).toEqual({issuerId:B,market:'CN',names:{zh:'贵州茅台',en:'Kweichow Moutai'},primaryTicker:'600519.SH',tickers:['600519.SH'],
   latestPeriodEnd:'2025-09-27',latestAvailableDate:'2025-10-31',conceptsCovered:30,citationSummary:{linked:9,pending:1,edgar:0},
   scopeLastSuccessAt:'2026-11-02T03:00:00Z',scopeLastStatus:'success'});
  expect(rows[0]).toMatchObject({issuerId:A,market:'US',primaryTicker:'AAPL',tickers:['AAPL']});
 });
 it('issuerIdsByPrefix: names (zh/en, case-insensitive prefix) ∪ current tickers, de-duplicated; stable order + range pages',async()=>{
  const {sb,log}=fakePrefix([{issuer_id:A}],[{issuer_id:A,valid_from:'2000-01-01',valid_to:null},{issuer_id:C,valid_from:'1990-01-01',valid_to:'2000-01-01'},{issuer_id:B,valid_from:'2001-01-01',valid_to:null}]);
  expect((await issuerIdsByPrefix(sb,'aap','2026-11-06')).sort()).toEqual([A,B]);
  expect(log.issuers.slice(0,4)).toEqual(['select:issuer_id','or:canonical_name_zh.ilike."aap*",canonical_name_en.ilike."aap*"','order:issuer_id','range:0-999']);
  expect(log.issuer_securities.slice(0,6)).toEqual(['select:issuer_id,valid_from,valid_to','ilike:ticker:AAP%','order:issuer_id','order:ticker','order:valid_from','range:0-999']);
  expect(log.issuer_securities.filter(x=>x.startsWith('range:'))).toEqual(['range:0-999','range:3-1002']);   // read until an empty page
 });
 it('pages through every candidate: a current match after 1,500 expired securities and name matches beyond row 1,000 are found (计划第 3 轮审计 R8)',async()=>{
  const expired=Array.from({length:1500},(_,i)=>({issuer_id:uid(i),valid_from:'1990-01-01',valid_to:'2000-01-01'}));
  const names=Array.from({length:1200},(_,i)=>({issuer_id:uid(10000+i)}));
  const {sb,log}=fakePrefix(names,[...expired,{issuer_id:B,valid_from:'2001-01-01',valid_to:null}]);
  const ids=new Set(await issuerIdsByPrefix(sb,'aap','2026-11-06'));
  expect(ids.has(B)).toBe(true);
  expect(ids.has(uid(11199))).toBe(true);
  expect(expired.some(e=>ids.has(e.issuer_id))).toBe(false);
  expect(ids.size).toBe(1201);
  expect(log.issuer_securities.filter(x=>x.startsWith('range:'))).toEqual(['range:0-999','range:1000-1999','range:1501-2500']);
  expect(log.issuers.filter(x=>x.startsWith('range:'))).toEqual(['range:0-999','range:1000-1999','range:1200-2199']);
 });
 it('a failed page fails the whole search (never a silently partial match set)',async()=>{
  const {sb}=fakePrefix([{issuer_id:A}],[],true);
  await expect(issuerIdsByPrefix(sb,'aap','2026-11-06')).rejects.toThrow('directory_search_failed');
 });
});
