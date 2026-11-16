// src/lib/company/coverage.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {summarizeCoverage} from './coverage';
import {factRow,filingSummary,resetBuilders,sequenced,withCounts} from './test-builders';

beforeEach(()=>resetBuilders());
describe('summarizeCoverage',()=>{
 it('counts filings, ok rows, concepts, period range, last availability, citations and copies scope_last_*',()=>{
  const f1=filingSummary({availableDate:'2024-02-01',citation:'linked'}),f2=filingSummary({availableDate:'2025-03-01',citation:'pending'}),f3=filingSummary({availableDate:'2025-04-01',citation:'edgar'});
  const gen0=filingSummary({availableDate:'2025-05-01',mappingGen:0});
  const rows=sequenced([factRow(f1,{period_end:'2022-12-31',period_start:'2022-01-01'}),factRow(f2,{concept:'net_income_parent'}),factRow(f2,{value:'7'}),factRow(f3,{status:'quarantined',period_end:'2030-12-31'})],[f1,f2,f3]);
  expect(rows).toHaveLength(3);
  const c=summarizeCoverage({rows:[...rows,{...factRow(f3,{period_end:'2030-12-31'}),status:'quarantined'},{...factRow(f1,{concept:'other_concept',period_end:'1999-12-31'}),status:'quarantined'}],filings:withCounts([f1,f2,f3,gen0],rows),scope:{last_success_at:'2026-11-05T10:00:00.000Z',last_status:'success'}});
  expect(c).toEqual({filings_count:3,facts_count:3,concepts_covered:2,earliest_period_end:'2022-12-31',latest_period_end:'2023-12-31',latest_available_date:'2025-04-01',
   citation_summary:{linked:1,pending:1,edgar:1},scope_last_success_at:'2026-11-05T10:00:00.000Z',scope_last_status:'success'});
 });
 it('uses financial statement periods rather than DEI cover observations, retaining their coverage counts',()=>{
  const filing=filingSummary({availableDate:'2026-10-22'});
  const financial=factRow(filing,{period_start:'2026-01-01',period_end:'2026-09-30',duration:'9M'});
  // SEC AAL accession 0000006201-26-000052 contains a future-dated DEI cover observation.
  const cover=factRow(filing,{concept:'shares_outstanding',source_concept:'dei:EntityCommonStockSharesOutstanding',statement:'DEI',period_start:null,period_end:'2027-07-17',duration:'INSTANT',unit:'shares'});
  const earlierCover={...cover,period_end:'2020-01-01'};
  expect(summarizeCoverage({rows:[financial,cover,earlierCover],filings:[filing],scope:null})).toMatchObject({
   earliest_period_end:'2026-09-30',latest_period_end:'2026-09-30',facts_count:3,concepts_covered:2,filings_count:1,latest_available_date:'2026-10-22',
  });
  expect(summarizeCoverage({rows:[cover],filings:[filing],scope:null})).toMatchObject({
   earliest_period_end:null,latest_period_end:null,facts_count:1,concepts_covered:1,
  });
 });
 it('empty stream and missing scope row',()=>{
  expect(summarizeCoverage({rows:[],filings:[],scope:null})).toEqual({filings_count:0,facts_count:0,concepts_covered:0,earliest_period_end:null,latest_period_end:null,latest_available_date:null,
   citation_summary:{linked:0,pending:0,edgar:0},scope_last_success_at:null,scope_last_status:null});
 });
 it('failed scope status is copied as is',()=>{
  expect(summarizeCoverage({rows:[],filings:[],scope:{last_success_at:null,last_status:'failed'}})).toMatchObject({scope_last_success_at:null,scope_last_status:'failed'});
 });
});
