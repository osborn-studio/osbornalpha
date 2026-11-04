import {describe,it,expect} from 'vitest';
import {planSecLoad} from './load-sec';

describe('planSecLoad',()=>{
 it('keeps only tickers present in the universe, normalizes them, and builds issuer + security inputs without inventing domicile or share class',()=>{
  const plan=planSecLoad([
   {cik:'320193',name:'Apple Inc.',ticker:'AAPL',exchange:'Nasdaq'},
   {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOG',exchange:'Nasdaq'},
   {cik:'1652044',name:'Alphabet Inc.',ticker:'GOOGL',exchange:'Nasdaq'},
   {cik:'99999',name:'Not Listed',ticker:'ZZZZ',exchange:'OTC'},
   {cik:'1067983',name:'Berkshire',ticker:'BRK-B',exchange:'NYSE'},
  ],new Set(['AAPL','GOOG','GOOGL','BRK.B']),'2026-11-05');
  expect(plan.skipped).toEqual(['ZZZZ']);
  expect(plan.issuers).toEqual([
   {cik:'320193',canonical_name_en:'Apple Inc.',provenance:{cik:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'},canonical_name_en:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'}}},
   {cik:'1652044',canonical_name_en:'Alphabet Inc.',provenance:{cik:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'},canonical_name_en:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'}}},
   {cik:'1067983',canonical_name_en:'Berkshire',provenance:{cik:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'},canonical_name_en:{source:'sec_company_tickers_exchange',as_of:'2026-11-05'}}},
  ]);
  expect(plan.securities).toEqual([
   {cik:'320193',ticker:'AAPL',share_class:'unknown',is_primary:true,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1652044',ticker:'GOOG',share_class:'unknown',is_primary:true,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1652044',ticker:'GOOGL',share_class:'unknown',is_primary:false,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'Nasdaq'}},
   {cik:'1067983',ticker:'BRK.B',share_class:'unknown',is_primary:true,valid_from:'2026-11-05',source:'sec_company_tickers_exchange',provenance:{exchange:'NYSE'}},
  ]);
 });
});
