// src/lib/macro/strategy/policy-response-explain.ts
// Number-only sentences for the policy response matrix (spec 2026-11-07 §5.3): one per hike / cut cell with statistics.
// They state the computed numbers and nothing else (no forecast wording). Display rounding only: 0.1% / 1 bp.
import type {Bilingual,Cell,PolicyResponseView,ResponseDim} from './contract';
const fmt=(x:number,unit:'pct'|'bp')=>unit==='pct'?`${x.toFixed(1)}%`:`${Math.round(x)+0} bp`;
const DIR={hike:{zh:'加息',en:'hikes'},cut:{zh:'降息',en:'cuts'}} as const;
export function cellSentence(dir:'hike'|'cut',dim:ResponseDim,cell:Cell,window:number):Bilingual|null{
 if(cell.status!=='stats')return null;
 const med=fmt(cell.median_raw,cell.unit),q1=fmt(cell.q1_raw,cell.unit),q3=fmt(cell.q3_raw,cell.unit);
 return {
  zh:`${cell.n} 次独立${DIR[dir].zh}后 ${window} 个月末，${dim.label.zh}变化的中位数为 ${med}（四分位 ${q1} 至 ${q3}）`,
  en:`After ${cell.n} independent ${DIR[dir].en}, the median change in ${dim.label.en} over ${window} month-end${window===1?'':'s'} was ${med} (interquartile ${q1} to ${q3})`,
 };
}
export function responseSentences(v:Pick<PolicyResponseView,'window'|'dims'|'rows'>):Bilingual[]{
 const out:Bilingual[]=[];
 for(const row of v.rows){
  if(row.direction==='qe_qt')continue;
  for(const d of v.dims){const s=cellSentence(row.direction,d,row.cells[d.id],v.window);if(s)out.push(s);}
 }
 return out;
}
