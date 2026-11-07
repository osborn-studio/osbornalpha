// src/components/macro/correlation-presets.ts
// The 8 prefilled correlation forms (spec §3.4 "热门分析"). They only fill the form: no stored runs, no automatic
// recompute. workbench-options.test.ts checks every preset is a valid request.
import type {AnalysisSpec} from '@/lib/macro/correlation';
export type PresetForm=Omit<AnalysisSpec,'request_id'>;
export interface Preset{id:'p1'|'p2'|'p3'|'p4'|'p5'|'p6'|'p7'|'p8';region:'US'|'CN';form:PresetForm}
export const PRESETS:readonly Preset[]=[
 {id:'p1',region:'US',form:{kind:'change',indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:0,window:'10y'}},
 {id:'p2',region:'US',form:{kind:'change',indicator_id:'US_CPI_YOY',asset_id:'US_UST10Y',lag:0,window:'10y'}},
 {id:'p3',region:'US',form:{kind:'change',indicator_id:'US_CPI_YOY',asset_id:'US_WTI',lag:-1,window:'10y'}},
 {id:'p4',region:'US',form:{kind:'change',indicator_id:'US_DTWEXBGS',asset_id:'US_WTI',lag:0,window:'10y'}},
 {id:'p5',region:'US',form:{kind:'rolling',indicator_id:'US_UNRATE',asset_id:'US_UST10Y',lag:0,window:'all'}},
 {id:'p6',region:'US',form:{kind:'event_window',indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:0,window:'all',event_n:6}},
 {id:'p7',region:'CN',form:{kind:'change',indicator_id:'CN_PMI_MFG',asset_id:'CN_CGB10Y',lag:0,window:'10y'}},
 {id:'p8',region:'CN',form:{kind:'level',indicator_id:'CN_CPI_YOY',asset_id:'CN_CGB10Y',lag:0,window:'10y'}},
];
