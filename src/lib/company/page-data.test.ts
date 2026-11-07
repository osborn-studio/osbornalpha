// src/lib/company/page-data.test.ts
import {describe,it,expect,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {loadCompanyPageData} from './page-data';
import type {CoverageRow} from './types';

const TODAY='2026-11-06';
const cov=(issuer_id:string,market:'US'|'CN'):CoverageRow=>({issuer_id,market,filings_count:3,facts_count:30,concepts_covered:12,earliest_period_end:'2020-12-31',latest_period_end:'2025-09-30',latest_available_date:'2025-10-25',citation_summary:{linked:9,pending:1,edgar:0},scope_last_success_at:'2026-11-02T00:00:00Z',scope_last_status:'success',based_on_rev:7,rebuilt_at:'x',rebuild_id:'r',rebuild_batch_id:'b'});
async function seed(){
 const c=memoryTableClient();
 await c.insert('issuers',{issuer_id:'mt',canonical_name_en:'Kweichow Moutai',canonical_name_zh:'贵州茅台',cik:null,lei:'300300S39XTBSV1ZPG26',usci:'91520000214434146R',status:'active',merged_into:null});
 await c.insert('issuers',{issuer_id:'tc',canonical_name_en:'Tencent',canonical_name_zh:'腾讯控股',cik:null,lei:null,usci:null,status:'active',merged_into:null});
 await c.insert('issuer_securities',{issuer_id:'mt',ticker:'600519.SH',isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'2001-08-27',valid_to:null,source:'curated'});
 await c.insert('issuer_securities',{issuer_id:'tc',ticker:'00700.HK',isin:null,figi:null,share_class:'H',is_primary:true,valid_from:'2004-06-16',valid_to:null,source:'curated'});
 return c;
}
describe('loadCompanyPageData',()=>{
 it('resolves the issuer and market from the matched security and reads coverage once',async()=>{
  const tables=await seed();const coverageOf=vi.fn(async()=>[cov('mt','CN')]);
  const d=await loadCompanyPageData({tables,coverageOf},'600519',TODAY);
  expect(d).toMatchObject({ticker:'600519',publicTicker:'600519.SH',market:'CN',factState:'ok',errorCode:null,streams:[]});
  expect(d.issuer?.issuer_id).toBe('mt');expect(d.coverage?.market).toBe('CN');
  expect(coverageOf).toHaveBeenCalledTimes(1);expect(coverageOf).toHaveBeenCalledWith(['mt']);
 });
 it('HK-only issuer → hk_pending, header identity kept, no US fallback',async()=>{
  const tables=await seed();
  const d=await loadCompanyPageData({tables,coverageOf:async()=>[]},'00700.HK',TODAY);
  expect(d).toMatchObject({factState:'hk_pending',market:null});expect(d.issuer?.names.zh).toBe('腾讯控股');
 });
 it('unknown ticker → no_issuer without reading coverage',async()=>{
  const tables=await seed();const coverageOf=vi.fn(async()=>[]);
  const d=await loadCompanyPageData({tables,coverageOf},'ZZZZ',TODAY);
  expect(d).toMatchObject({factState:'no_issuer',issuer:null});expect(coverageOf).not.toHaveBeenCalled();
 });
 it('issuer without a coverage row for its market → no_facts',async()=>{
  const tables=await seed();
  expect((await loadCompanyPageData({tables,coverageOf:async()=>[]},'600519.SH',TODAY)).factState).toBe('no_facts');
 });
 it('reports ambiguous ownership and internal failures as error codes, never throws',async()=>{
  const tables=await seed();
  const boom={...tables,select:async()=>{throw new Error('ambiguous_owner');}};
  expect((await loadCompanyPageData({tables:boom,coverageOf:async()=>[]},'X',TODAY)).errorCode).toBe('ambiguous_ticker');
  const down={...tables,select:async()=>{throw new Error('db down');}};
  expect((await loadCompanyPageData({tables:down,coverageOf:async()=>[]},'X',TODAY)).errorCode).toBe('internal');
 });
});
