// src/lib/macro/strategy/data/response-dims-v1.ts
// Policy response dimensions v1 (spec 2026-11-07 §5.3, macro-policy-response/1). All dimensions use MONTHLY series
// (P1 month-end derivations). Restricted / missing state comes from the frozen catalog, so the two stock-index columns show
// "restricted" while their catalog rows are restricted; northbound flows are outside the catalog.
import type {Bilingual} from '../contract';
export interface ResponseDimDef{id:string;label:Bilingual;unit:'pct'|'bp';kind:'series'|'spread'|'not_in_catalog';series?:string;a?:string;b?:string;reason?:Bilingual}
export const RESPONSE_DIMS_V1:readonly ResponseDimDef[]=[
 {id:'US_DTWEXBGS',label:{zh:'美元名义广义指数',en:'Nominal broad U.S. dollar index'},unit:'pct',kind:'series',series:'US_DTWEXBGS'},
 {id:'CN_USDCNY_CP',label:{zh:'人民币汇率中间价（美元）',en:'RMB central parity (USD)'},unit:'pct',kind:'series',series:'CN_USDCNY_CP'},
 {id:'US_CN_10Y_SPREAD',label:{zh:'中美 10 年期国债利差',en:'US–China 10-year spread'},unit:'bp',kind:'spread',a:'US_DGS10',b:'CN_CGB_10Y'},
 {id:'CN_CGB_10Y',label:{zh:'中债 10 年期国债收益率',en:'ChinaBond 10-year yield'},unit:'bp',kind:'series',series:'CN_CGB_10Y'},
 {id:'US_DGS10',label:{zh:'美国 10 年期国债收益率',en:'U.S. 10-year Treasury yield'},unit:'bp',kind:'series',series:'US_DGS10'},
 {id:'US_WTI',label:{zh:'WTI 原油',en:'WTI crude oil'},unit:'pct',kind:'series',series:'US_WTI'},
 {id:'US_SP500',label:{zh:'标普 500 指数',en:'S&P 500'},unit:'pct',kind:'series',series:'US_SP500'},
 {id:'CN_CSI300',label:{zh:'沪深 300 指数',en:'CSI 300 Index'},unit:'pct',kind:'series',series:'CN_CSI300'},
 {id:'CN_NORTHBOUND',label:{zh:'北向资金',en:'Northbound flows'},unit:'pct',kind:'not_in_catalog',reason:{zh:'目录没有北向资金序列',en:'No northbound-flow series in the catalog'}},
];
