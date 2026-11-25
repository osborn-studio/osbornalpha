// Topic spec §4.1 industry fixtures.
import {DATASETS} from '../../dq/datasets';
import type {MemorySourcesInput} from '../memory-sources';
import type {IndustryCell} from '../sources';
export const RUN={sic:'20000000-0000-4000-8000-000000000001',sw:'20000000-0000-4000-8000-000000000002',superseded:'20000000-0000-4000-8000-000000000003',building:'20000000-0000-4000-8000-000000000004',later:'20000000-0000-4000-8000-000000000005'};
const id=(run:string,code='3571')=>`${run}:${code}:roe:2025-01-01:2025-12-31`;
export const CELL={sicOk:id(RUN.sic),swSuperseded:id(RUN.superseded),unknownRun:id('20000000-0000-4000-8000-000000000099'),building:id(RUN.building),activatedLater:id(RUN.later),swInternal:id(RUN.sw),noRow:id(RUN.sic,'9999'),zeroDenominator:id(RUN.sic,'0000')};
export function industryFixture():MemorySourcesInput{
 const cell=(run_id:string,extra:Partial<IndustryCell['run']>={},code='3571'):IndustryCell&{key:{run_id:string;code:string;metric:string;period_start:string;period_end:string}}=>({
  key:{run_id,code,metric:'roe',period_start:'2025-01-01',period_end:'2025-12-31'},
  run:{run_id,scheme:'sic',version:'sec-current',level:2,generation:1,status:'active',history_class:'reconstruction',activated_at:'2026-11-10T00:00:00.000Z',method_version:'industry/1',code_version:'fixture/1',...extra},
  row:{status:'ok',missing_reason:null,value_text:run_id===RUN.sw?'0.333':'0.201',unit:'ratio',duration:'12M',n_members:52,n_with_data:41},label:{zh:code,en:code},
 });
 const zero=cell(RUN.sic,{},'0000');zero.row={...zero.row!,status:'missing',missing_reason:'zero_denominator',value_text:null};
 return {industry:{cells:[cell(RUN.sic),cell(RUN.sw,{scheme:'sw2021',version:'2021'}),cell(RUN.superseded,{scheme:'sw2021',version:'2021-pub',status:'superseded',history_class:'point_in_time'}),cell(RUN.building,{status:'building',activated_at:null}),cell(RUN.later,{activated_at:'2026-11-20T00:00:00.000Z'}),zero],
  publicDatasets:['scheme:sic:sec-current','scheme:sw2021:2021-pub']},freshness:{[DATASETS.industry.aggregate('sic')]:'fresh'}};
}
