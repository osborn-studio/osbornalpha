// Topic spec §4.1 macro fixtures.
import {DATASETS} from '../../dq/datasets';
import type {ObservationRow} from '@/lib/macro/types';
import type {MemorySourcesInput} from '../memory-sources';
export const OBS={unrateV1:'10000000-0000-4000-8000-000000000001',unrateV2:'10000000-0000-4000-8000-000000000002',vix:'10000000-0000-4000-8000-000000000003',thirdParty:'10000000-0000-4000-8000-000000000004',quarantined:'10000000-0000-4000-8000-000000000005',orphan:'10000000-0000-4000-8000-000000000006'};
export function macroFixture():MemorySourcesInput{
 const row=(id:string,series_id:string,value_text:string,extra:Partial<ObservationRow>={}):ObservationRow=>({
  observation_id:id,series_id,period_end:'2026-08-31',value_text,version:1,available_at:'2026-09-05T12:30:00.000Z',availability_basis:'first_seen',
  ingested_at:'2026-09-05T12:30:00.000Z',status:'ok',retrieval_id:id,locator:{kind:'csv_row',line:2,column:1},derived_from:null,transform:null,code_version:'fixture/1',batch_id:id,...extra,
 });
 const rows=[row(OBS.unrateV1,'US_UNRATE','4.3'),row(OBS.vix,'US_VIX','18.75'),row(OBS.thirdParty,'US_TP_ACTIVE','77.25'),row(OBS.quarantined,'US_UNRATE','6.7',{period_end:'2026-07-31',status:'quarantined'}),row(OBS.orphan,'US_GONE','8.8')];
 return {macro:{rows,series:[
  {id:'US_UNRATE',name:{zh:'失业率',en:'Unemployment'},unit:'pct',status:'active',rights:'public_domain',publisher:{zh:'BLS',en:'BLS'},relay:null,adapter:'fred_csv',dataset:DATASETS.macro.fred},
  {id:'US_VIX',name:{zh:'波动率',en:'Volatility'},unit:'points',status:'restricted',rights:'third_party',publisher:{zh:'CBOE',en:'CBOE'},relay:null,adapter:'fred_csv',dataset:DATASETS.macro.fred},
  {id:'US_TP_ACTIVE',name:{zh:'第三方',en:'Third party'},unit:'points',status:'active',rights:'third_party',publisher:{zh:'Source',en:'Source'},relay:null,adapter:'fred_csv',dataset:DATASETS.macro.fred},
 ],retrievals:rows.map(r=>({retrieval_id:r.observation_id,fetch_url:'https://example.com/data.csv',fetched_at:r.ingested_at,sha256:'a'.repeat(64)}))},freshness:{[DATASETS.macro.fred]:'fresh'}};
}
