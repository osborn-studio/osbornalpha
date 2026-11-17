// src/components/macro/correlation-presets.ts
// Shared definitions for default result cards and prefilled forms. No stored runs are created by preset reads.
import type {AnalysisSpec} from '@/lib/macro/correlation';
export const PRESETS_VERSION='macro-presets/1';
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
