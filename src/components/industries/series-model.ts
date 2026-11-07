// src/components/industries/series-model.ts
// SVG geometry of a series chart (spec §8.3, canvas "Detail" §3): one brass line over the ok cells,
// broken at missing cells (a gap is a gap, never a 0), a dot per ok cell (each a source-drawer
// button), four y ticks and ≤ 10 x labels. Coordinates use JS numbers; every label is formatted from
// a decimal string, and the same series is always rendered as a table next to the chart.
import {formatMetricValue} from '@/lib/industry/display';
import type {Locale} from '@/lib/industry/display';
import type {PublicCell} from '@/lib/industry/read';
import type {AggMetric} from '@/lib/industry/types';

export interface SeriesPoint{periodEnd:string;cell:PublicCell|null}
export interface SeriesGeometry{
 width:number;height:number;pad:{l:number;r:number;t:number;b:number};
 segments:string[];dots:{x:number;y:number;periodEnd:string;cell:PublicCell}[];
 yTicks:{y:number;label:string}[];xLabels:{x:number;label:string}[];
}
const plotted=(c:PublicCell|null):c is PublicCell=>!!c&&c.status==='ok'&&c.value!==null&&Number.isFinite(Number(c.value));
const r1=(n:number)=>Math.round(n*10)/10;

export function seriesGeometry(points:SeriesPoint[],metric:AggMetric,locale:Locale,size:{width:number;height:number}={width:780,height:300}):SeriesGeometry{
 const pad={l:64,r:12,t:16,b:32};
 const w=size.width-pad.l-pad.r,h=size.height-pad.t-pad.b;
 const vals=points.filter(p=>plotted(p.cell)).map(p=>Number(p.cell!.value));
 let lo=vals.length?Math.min(...vals):0,hi=vals.length?Math.max(...vals):1;
 if(hi===lo){const d=Math.abs(lo)>0?Math.abs(lo)*0.1:1;lo-=d;hi+=d;}
 const span=hi-lo;lo-=span*0.05;hi+=span*0.05;
 const x=(i:number)=>r1(pad.l+(points.length<=1?w/2:i*w/(points.length-1)));
 const y=(v:number)=>r1(pad.t+h-(v-lo)/(hi-lo)*h);
 const segments:string[]=[];let cur:string[]=[];
 const dots:SeriesGeometry['dots']=[];
 points.forEach((p,i)=>{
  if(!plotted(p.cell)){if(cur.length)segments.push(cur.join(' '));cur=[];return;}
  const px=x(i),py=y(Number(p.cell.value));
  cur.push(`${cur.length?'L':'M'}${px} ${py}`);
  dots.push({x:px,y:py,periodEnd:p.periodEnd,cell:p.cell});
 });
 if(cur.length)segments.push(cur.join(' '));
 const yTicks=[0,1,2,3].map(k=>{const v=lo+(hi-lo)*k/3;return {y:y(v),label:formatMetricValue(metric,v.toFixed(10),locale)};});
 const step=Math.max(1,Math.ceil(points.length/10));
 const allYearEnds=points.every(p=>p.periodEnd.endsWith('-12-31'));
 const xLabels=points.flatMap((p,i)=>i%step===0||i===points.length-1?[{x:x(i),label:allYearEnds?p.periodEnd.slice(0,4):p.periodEnd.slice(0,7)}]:[]);
 return {width:size.width,height:size.height,pad,segments,dots,yTicks,xLabels};
}
