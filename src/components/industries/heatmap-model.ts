// src/components/industries/heatmap-model.ts
// Layout of the list heatmap (spec §8.2, canvas "Main"): rows = nodes, columns = period ends, one
// cell per (node, period end) from the active run. Colour is a single brass hue whose alpha runs
// 0.12–0.6 over the value range of the displayed cells, with the value overprinted; cells that fail
// a display threshold show their counts, missing cells show '—' and their reason (never 0, never
// red/green). JS numbers are used only to compute alpha (colour), never for any displayed text.
import {formatMetricValue} from '@/lib/industry/display';
import type {Locale} from '@/lib/industry/display';
import type {NodeView,PublicCell} from '@/lib/industry/read';
import type {AggMetric,MissingReason} from '@/lib/industry/types';

export const ALPHA_MIN=0.12,ALPHA_MAX=0.6;
export type HeatText=
 |{kind:'value';text:string}
 |{kind:'insufficient';n:number;d:number}
 |{kind:'unresolved';n:number}
 |{kind:'missing';reason:MissingReason|'absent'};
export interface HeatCell{periodEnd:string;cell:PublicCell|null;text:HeatText;alpha:number|null;mobileHidden:boolean}
export interface HeatRow{node:NodeView;cells:HeatCell[]}

export function alphaFor(v:number,min:number,max:number):number{
 if(!(max>min))return Math.round((ALPHA_MIN+ALPHA_MAX)/2*100)/100;
 const t=Math.min(1,Math.max(0,(v-min)/(max-min)));
 return Math.round((ALPHA_MIN+(ALPHA_MAX-ALPHA_MIN)*t)*100)/100;
}
/** The brass token at `alpha` (no hard-coded colour: color-mix over var(--accent)). */
export const brassBackground=(alpha:number)=>`color-mix(in srgb, var(--accent) ${Math.round(alpha*100)}%, transparent)`;

export function heatText(c:PublicCell|null,metric:AggMetric,locale:Locale):HeatText{
 if(!c)return {kind:'missing',reason:'absent'};
 if(c.display==='missing')return {kind:'missing',reason:c.missingReason??'empty_set'};
 if(c.display==='unresolved')return {kind:'unresolved',n:c.nUnresolved};
 if(c.display==='insufficient')return {kind:'insufficient',n:c.nWithData,d:c.nMembers+c.nUnresolved};
 return {kind:'value',text:formatMetricValue(metric,c.value??'',locale)};
}

/** Rows in node order; the last `mobileColumns` period ends stay visible below 640px (canvas M-List). */
export function heatmapModel(nodes:NodeView[],periodEnds:string[],cells:PublicCell[],metric:AggMetric,locale:Locale,mobileColumns=5):HeatRow[]{
 const byKey=new Map(cells.filter(c=>c.metric===metric).map(c=>[`${c.code}|${c.periodEnd}`,c]));
 const shown=cells.filter(c=>c.metric===metric&&c.display==='value'&&c.value!==null).map(c=>Number(c.value)).filter(Number.isFinite);
 const min=shown.length?Math.min(...shown):0,max=shown.length?Math.max(...shown):0;
 const firstMobile=Math.max(0,periodEnds.length-mobileColumns);
 return nodes.map(node=>({node,cells:periodEnds.map((pe,i)=>{
  const cell=byKey.get(`${node.code}|${pe}`)??null;
  const text=heatText(cell,metric,locale);
  return {periodEnd:pe,cell,text,alpha:text.kind==='value'&&cell?.value?alphaFor(Number(cell.value),min,max):null,mobileHidden:i<firstMobile};
 })}));
}
