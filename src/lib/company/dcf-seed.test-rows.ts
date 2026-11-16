// src/lib/company/dcf-seed.test-rows.ts
// Test-only fixture rows for the DCF seed (US: AAPL FY2023 cut; CN: 600519.SH FY2023 cut on a linked filing).
// Not a .test.ts file: imported by dcf-seed.test.ts and the /api/dcf route test. Fresh fact ids per call.
import {FIL_CN_LINKED,cnFact,fact} from './route-test-kit';
import type {FactRow} from '@/lib/facts/types';

export const END='2023-09-30',CN_END='2023-12-31';
export const inst=(concept:string,value:string,p:Partial<FactRow>={})=>fact({concept,statement:'BS',period_start:null,period_end:END,duration:'INSTANT',value,value_text:value,...p});
export function usRows():FactRow[]{
 return [fact(),fact({concept:'gross_profit',value:'169148000000',value_text:'169148000000'}),
  inst('shares_outstanding','15550061000',{unit:'shares'}),inst('cash','29965000000'),inst('short_term_borrowings','9822000000'),inst('long_term_borrowings','95281000000')];
}
const cinst=(concept:string,value:string,p:Partial<FactRow>={})=>cnFact({concept,statement:'BS',period_start:null,period_end:CN_END,duration:'INSTANT',value,value_text:value,filing_id:FIL_CN_LINKED,...p});
export function cnRows():FactRow[]{
 return [cnFact({filing_id:FIL_CN_LINKED}),cnFact({concept:'cost_of_revenue',value:'11867273851.13',value_text:'11867273851.13',filing_id:FIL_CN_LINKED}),
  cinst('shares_outstanding','1256197800',{unit:'shares'}),cinst('monetary_funds','69621263173.71'),cinst('short_term_borrowings','100000000'),cinst('long_term_borrowings','200000000'),cinst('bonds_payable','0')];
}
