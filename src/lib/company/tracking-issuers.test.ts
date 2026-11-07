// src/lib/company/tracking-issuers.test.ts
import {describe,expect,it} from 'vitest';
import {streamOfTicker,toWatchCards} from './tracking-issuers';
import type {CoverageRow,WatchRow} from './types';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',H='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',M='ffffffff-ffff-4fff-8fff-ffffffffffff';
const w=(issuer_id:string,p:Partial<WatchRow>={}):WatchRow=>({user_id:'u',issuer_id,note:null,muted:false,created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',...p});
const cov=(issuer_id:string,market:'US'|'CN',p:Partial<CoverageRow>={}):CoverageRow=>({issuer_id,market,filings_count:1,facts_count:1,concepts_covered:1,earliest_period_end:null,latest_period_end:'2025-09-27',latest_available_date:'2025-10-31',citation_summary:{linked:0,pending:0,edgar:1},scope_last_success_at:null,scope_last_status:null,based_on_rev:1,rebuilt_at:'x',rebuild_id:'r',rebuild_batch_id:'b',...p});

describe('tracking issuer cards',()=>{
 it('streamOfTicker',()=>{
  expect(streamOfTicker('AAPL')).toBe('US');
  expect(streamOfTicker('BRK.A')).toBe('US');
  expect(streamOfTicker('600519.SH')).toBe('CN');
  expect(streamOfTicker('00700.HK')).toBe('HK');
 });
 it('builds cards: names, current tickers with the primary first, coverage streams, HK-only flag, unread labels, newest update first',()=>{
  const cards=toWatchCards({
   watches:[w(A,{updated_at:'2026-11-02T00:00:00Z'}),w(H),w(M,{muted:true,note:'n'})],
   issuers:[{issuer_id:A,canonical_name_zh:null,canonical_name_en:'Apple Inc.'},{issuer_id:H,canonical_name_zh:'腾讯控股',canonical_name_en:'Tencent'},{issuer_id:M,canonical_name_zh:null,canonical_name_en:'Microsoft'}],
   securities:[
    {issuer_id:A,ticker:'AAPL',is_primary:true,valid_from:'2000-01-01',valid_to:null},
    {issuer_id:A,ticker:'AAPL.OLD',is_primary:false,valid_from:'1990-01-01',valid_to:'1999-01-01'},
    {issuer_id:H,ticker:'00700.HK',is_primary:true,valid_from:'2004-06-16',valid_to:null},
    {issuer_id:M,ticker:'MSFT',is_primary:true,valid_from:'2000-01-01',valid_to:null},
   ],
   coverage:[cov(A,'US'),cov(M,'US')],
   unread:{counts:new Map([[A,250],[H,0]]),complete:true},
   today:'2026-11-06',
  });
  expect(cards.map(c=>c.issuerId)).toEqual([A,H,M]);
  expect(cards[0]).toMatchObject({names:{zh:null,en:'Apple Inc.'},tickers:[{ticker:'AAPL',stream:'US',isPrimary:true}],primaryTicker:{US:'AAPL'},streams:[{market:'US',latestPeriodEnd:'2025-09-27',latestAvailableDate:'2025-10-31'}],hkOnly:false,unread:100,unreadLabel:'99+'});
  expect(cards[1]).toMatchObject({hkOnly:true,streams:[],primaryTicker:{HK:'00700.HK'},unread:0,unreadLabel:'0'});
  expect(cards[2]).toMatchObject({muted:true,note:'n',unread:null,unreadLabel:null});
 });
});
