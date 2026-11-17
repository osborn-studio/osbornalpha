// Topic spec §4.1 financial fact fixtures (X19).
import type {FactRow} from '@/lib/facts/types';
import type {MemorySourcesInput} from '../memory-sources';
import type {FactInfo} from '../sources';
export const FACT={usOk:'30000000-0000-4000-8000-000000000001',usRestated:'30000000-0000-4000-8000-000000000002',unknown:'30000000-0000-4000-8000-000000000003',hk:'30000000-0000-4000-8000-000000000004',quarantined:'30000000-0000-4000-8000-000000000005',staged:'30000000-0000-4000-8000-000000000006',usLater:'30000000-0000-4000-8000-000000000007',cnPending:'30000000-0000-4000-8000-000000000008',usIncomplete:'30000000-0000-4000-8000-000000000009'};
export function factFixture():MemorySourcesInput{
 const info=(fact_id:string,extra:Partial<FactRow>={}):FactInfo=>({
  row:{fact_id,issuer_id:'30000000-0000-4000-8000-000000000010',market:'US',filing_id:fact_id,run_id:fact_id,concept:'us-gaap:Revenues',source_concept:'us-gaap:Revenues',statement:'IS',
   period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1000',value_text:'1000',unit:'USD',consolidation:'consolidated',available_date:'2026-02-01',mapping_gen:1,mapping_version:'facts/1',status:'ok',raw_hash:'a'.repeat(64),created_at:'2026-02-01T00:00:00.000Z',...extra},
  issuer:{name:{zh:'样本公司',en:'Sample Company'},ticker:'TEST'},filing:{form_type:'10-K',source_ref:fact_id,url:'https://example.com/filing'},publisher:'SEC',
 });
 return {facts:{infos:[info(FACT.usOk),info(FACT.usRestated,{value:'1010',value_text:'1010',available_date:'2026-11-20'}),info(FACT.hk,{market:'HK' as FactRow['market']}),info(FACT.quarantined,{status:'quarantined',value:'5555.55',value_text:'5555.55'}),info(FACT.staged,{status:'staged'}),info(FACT.usLater,{available_date:'2026-12-01',concept:'Later'}),info(FACT.cnPending,{market:'CN',value:'987654321.12',value_text:'987654321.12'}),info(FACT.usIncomplete,{concept:'Incomplete',value:'8888.88',value_text:'8888.88'})],
  ineligible:new Map([[FACT.cnPending,'citation_pending'],[FACT.usIncomplete,'evidence_incomplete']])},freshness:{'facts.us':'fresh','facts.cn':'fresh'}};
}
