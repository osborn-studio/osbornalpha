// Presentation-only ordering: stored grids and page defaults remain in the industry model.
import {metricsForScheme} from '@/lib/industry/read';
import type {CellDisplay} from '@/lib/industry/display';
import type {AggMetric,Scheme} from '@/lib/industry/types-us';

const SIC_DISPLAY_METRICS:readonly AggMetric[]=[
 'member_count','revenue_sum','net_margin','gross_margin','revenue_yoy','net_income_parent_sum','net_income_yoy',
];
export const metricsForDisplay=(scheme:Scheme):readonly AggMetric[]=>scheme==='sic'?SIC_DISPLAY_METRICS:metricsForScheme(scheme);

/** One cell per industry at the selected metric/period; trust the server's display decision. */
export function countIndustryValues(cells:readonly ({display:CellDisplay}|null|undefined)[]):number{
 return cells.filter(cell=>cell?.display==='value').length;
}
