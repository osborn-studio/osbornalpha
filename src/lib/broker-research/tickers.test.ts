// Broker ticker parsing and issuer-resolution snapshots (spec §5.4, §4.5).
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {parseBrokerTicker,resolveTargets,uploadedAtToday} from './tickers';

describe('parseBrokerTicker (spec §5.4)',()=>{
 const cases:[string,string|undefined,string,string|null,string[]][]=[
  ['BABA US',undefined,'BABA','US',['BABA']],
  ['BABA UN',undefined,'BABA','US',['BABA']],
  ['BABA.N',undefined,'BABA','US',['BABA']],
  ['NVDA UW',undefined,'NVDA','US',['NVDA']],
  ['NVDA.O',undefined,'NVDA','US',['NVDA']],
  ['NVDA.OQ',undefined,'NVDA','US',['NVDA']],
  ['AAPL UQ',undefined,'AAPL','US',['AAPL']],
  ['BRK/B US',undefined,'BRK.B','US',['BRK.B']],
  ['BRK.B',undefined,'BRK.B','US',['BRK.B']],
  ['BRK.A',undefined,'BRK.A','US',['BRK.A','BRK']],
  ['9988 HK',undefined,'9988.HK','HK',['09988.HK']],
  ['9988.HK',undefined,'9988.HK','HK',['09988.HK']],
  ['0700 HK',undefined,'0700.HK','HK',['00700.HK']],
  ['700 HK',undefined,'0700.HK','HK',['00700.HK']],
  ['00700.HK',undefined,'0700.HK','HK',['00700.HK']],
  ['600519 CH',undefined,'600519.SH','A',['600519.SH']],
  ['000858 CH',undefined,'000858.SZ','A',['000858.SZ']],
  ['600519 SS',undefined,'600519.SH','A',['600519.SH']],
  ['600519.SS',undefined,'600519.SH','A',['600519.SH']],
  ['600519 C1',undefined,'600519.SH','A',['600519.SH']],
  ['000858 C2',undefined,'000858.SZ','A',['000858.SZ']],
  ['000858.SZ',undefined,'000858.SZ','A',['000858.SZ']],
  ['SH600519',undefined,'600519.SH','A',['600519.SH']],
  ['(NYSE: BABA)',undefined,'BABA','US',['BABA']],
  ['NASDAQ:NVDA',undefined,'NVDA','US',['NVDA']],
  ['HKEX: 9988',undefined,'9988.HK','HK',['09988.HK']],
  ['baba us',undefined,'BABA','US',['BABA']],
  ['  9988   HK ',undefined,'9988.HK','HK',['09988.HK']],
  ['９９８８ ＨＫ',undefined,'9988.HK','HK',['09988.HK']],
  ['BABA',undefined,'BABA','US',['BABA']],
  ['BABA','NYSE','BABA','US',['BABA']],
  ['600519',undefined,'600519.SH','A',['600519.SH']],
  ['600519','SSE','600519.SH','A',['600519.SH']],
  ['9988','HKEX','9988.HK','HK',['09988.HK']],
  ['9988',undefined,'9988.HK','HK',['09988.HK']],
 ];
 it.each(cases)('%s (hint %s) → %s',(stated,hint,key,market,cands)=>{
  const p=parseBrokerTicker(stated,hint);
  expect(p).toEqual({method:'parseBrokerTicker/1',stated,targetKey:key,market:market===null?null:market==='US'?'US':market==='HK'?'HK':'A',candidates:cands});
 });
 it('falls back to a verbatim stated: key with no candidates',()=>{
  for(const [s,h] of [['7203 JT',undefined],['BABA','HKEX'],['9988','NYSE'],['600519','TSE'],['Alibaba Group',undefined],['BABA LN',undefined]] as const){
   expect(parseBrokerTicker(s,h)).toEqual({method:'parseBrokerTicker/1',stated:s,targetKey:`stated:${s}`,market:null,candidates:[]});
  }
 });
 it('an explicit suffix wins over the hint; empty input throws',()=>{
  expect(parseBrokerTicker('9988 HK','NYSE').targetKey).toBe('9988.HK');
  expect(()=>parseBrokerTicker('  ')).toThrow('empty_ticker');
 });
});

describe('uploadedAtToday',()=>{
 it('uses the UTC calendar date',()=>{
  expect(uploadedAtToday('2026-11-05T23:30:00-05:00')).toBe('2026-11-06');
  expect(uploadedAtToday('2026-11-06T07:59:59+08:00')).toBe('2026-11-05');
  expect(()=>uploadedAtToday('yesterday')).toThrow('invalid_uploaded_at');
 });
});

async function seed(){
 const c=memoryTableClient();
 const issuer=(id:string,extra:Record<string,unknown>={})=>c.insert('issuers',{issuer_id:id,canonical_name_en:id,canonical_name_zh:null,cik:null,lei:null,usci:null,status:'active',merged_into:null,...extra});
 const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>c.insert('issuer_securities',{issuer_id,ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from,valid_to,source:'test'});
 await issuer('ali');await issuer('mt');await issuer('xa');await issuer('x');await issuer('d1');await issuer('d2');await issuer('new');
 await issuer('old',{status:'merged',merged_into:'ali'});
 await sec('ali','BABA','2014-09-19');await sec('ali','09988.HK','2019-11-26');
 await sec('mt','600519.SH','2001-08-27');
 await sec('xa','XYZ.A','2020-01-01');await sec('x','XYZ','2020-01-01');
 await sec('d1','DUP','2020-01-01');await sec('d2','DUP','2021-01-01');
 await sec('new','NEWC','2026-11-06');
 await sec('ali','GONE','2010-01-01','2026-11-05');
 await sec('old','OLDT','2010-01-01');
 return c;
}

describe('resolveTargets (spec §5.4, §4.5)',()=>{
 const AT='2026-11-05T10:00:00Z';
 it('resolves a dual listing to one issuer with a snapshot of the issuer_securities row',async()=>{
  const r=await resolveTargets(await seed(),[{tickerAsStated:'BABA US'},{tickerAsStated:'9988 HK',exchangeHint:'HKEX'}],AT);
  expect(r.map(x=>[x.targetKey,x.outcome,x.issuerId,x.securityTicker,x.reasonCode])).toEqual([['BABA','resolved','ali','BABA',null],['9988.HK','resolved','ali','09988.HK',null]]);
  expect(r[1].resolution).toEqual({method:'parseBrokerTicker/1',candidates:['09988.HK'],resolver:'resolveIssuer',today:'2026-11-05',outcome:'resolved',
   issuer_securities_row:{issuer_id:'ali',ticker:'09988.HK',valid_from:'2019-11-26',valid_to:null},lookups:[{ticker:'09988.HK',issuer_id:'ali',row:{issuer_id:'ali',ticker:'09988.HK',valid_from:'2019-11-26',valid_to:null}}]});
 });
 it('unresolved: unknown code, unparseable code, expired row',async()=>{
  const r=await resolveTargets(await seed(),[{tickerAsStated:'ZZZZ US'},{tickerAsStated:'7203 JT'},{tickerAsStated:'GONE US'}],AT);
  expect(r.map(x=>[x.targetKey,x.outcome,x.issuerId,x.reasonCode])).toEqual([['ZZZZ','unresolved',null,'unresolved_ticker'],['stated:7203 JT','unresolved',null,'unresolved_ticker'],['GONE','unresolved',null,'unresolved_ticker']]);
  expect(r[1].resolution).toMatchObject({candidates:[],lookups:[],issuer_securities_row:null});
 });
 it('conflict: candidates resolving to different issuers, and an ambiguous owner',async()=>{
  const r=await resolveTargets(await seed(),[{tickerAsStated:'XYZ.A'},{tickerAsStated:'DUP US'}],AT);
  expect(r.map(x=>[x.targetKey,x.outcome,x.issuerId,x.securityTicker,x.reasonCode])).toEqual([['XYZ.A','conflict',null,null,'ticker_issuer_conflict'],['DUP','conflict',null,null,'ticker_issuer_conflict']]);
  expect(r[0].resolution.lookups).toEqual([{ticker:'XYZ.A',issuer_id:'xa',row:{issuer_id:'xa',ticker:'XYZ.A',valid_from:'2020-01-01',valid_to:null}},{ticker:'XYZ',issuer_id:'x',row:{issuer_id:'x',ticker:'XYZ',valid_from:'2020-01-01',valid_to:null}}]);
  expect(r[1].resolution.lookups).toEqual([{ticker:'DUP',issuer_id:null,error:'ambiguous_owner',row:null}]);
 });
 it('today is the UTC date of uploaded_at, not the local date',async()=>{
  const c=await seed();
  expect((await resolveTargets(c,[{tickerAsStated:'NEWC US'}],'2026-11-05T23:30:00-05:00'))[0]).toMatchObject({outcome:'resolved',issuerId:'new',resolution:{today:'2026-11-06'}});
  expect((await resolveTargets(c,[{tickerAsStated:'NEWC US'}],'2026-11-06T07:00:00+08:00'))[0]).toMatchObject({outcome:'unresolved',resolution:{today:'2026-11-05'}});
 });
 it('a merged issuer redirect resolves but records no security row of the survivor',async()=>{
  const [r]=await resolveTargets(await seed(),[{tickerAsStated:'OLDT US'}],AT);
  expect(r).toMatchObject({outcome:'resolved',issuerId:'ali',securityTicker:'OLDT',resolution:{issuer_securities_row:null,lookups:[{ticker:'OLDT',issuer_id:'ali',redirected_from:'old',row:null}]}});
 });
 it('shares one lookup per target_key and keeps each stated form',async()=>{
  const c=await seed();let selects=0;
  const counting={...c,select:(...a:Parameters<typeof c.select>)=>{selects++;return c.select(...a);}};
  const r=await resolveTargets(counting,[{tickerAsStated:'BABA US'},{tickerAsStated:'BABA.N'}],AT);
  expect(r.map(x=>[x.targetKey,x.tickerAsStated,x.outcome])).toEqual([['BABA','BABA US','resolved'],['BABA','BABA.N','resolved']]);
  const once=selects;selects=0;
  await resolveTargets(counting,[{tickerAsStated:'BABA US'}],AT);
  expect(once).toBe(selects);
 });
 it('rejects an invalid uploaded_at',async()=>{
  await expect(resolveTargets(await seed(),[{tickerAsStated:'BABA US'}],'n/a')).rejects.toThrow('invalid_uploaded_at');
 });
});
