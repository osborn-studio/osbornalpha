// src/lib/macro/explain.ts
// Rule-generated one-sentence statistical fact for a correlation result (spec §7). Strength words appear only for
// the change transform (|r| < 0.3 weak, < 0.6 moderate, else strong). The sign word comes from the same r that is
// printed (|r| < 0.005 prints as 0.00 and gets "near-zero", no direction). No mechanism or causal language;
// numbers are rounded for display only.
import type {AnalysisResult} from './correlation';
import type {Bilingual} from './types';
export function strengthOf(r:number):Bilingual{const a=Math.abs(r);return a<0.3?{zh:'弱',en:'weak'}:a<0.6?{zh:'中等',en:'moderate'}:{zh:'强',en:'strong'};}
const f2=(v:number)=>{const s=v.toFixed(2);return s==='-0.00'?'0.00':s;};
function lagText(k:number):Bilingual{
 if(k>0)return {zh:`指标领先 ${k} 个月`,en:`indicator leads by ${k} month${k===1?'':'s'}`};
 if(k<0)return {zh:`资产领先 ${-k} 个月`,en:`asset leads by ${-k} month${k===-1?'':'s'}`};
 return {zh:'同期',en:'same month'};
}
const unitText=(u:string)=>u==='bp'?' bp':u==='pct'?'%':'';
export function explainResult(res:AnalysisResult,names:{indicator:Bilingual;asset:Bilingual}):Bilingual{
 const {indicator:i,asset:a}=names;
 switch(res.kind){
  case 'change':{
   const l=lagText(res.lag);const near=Math.abs(res.r)<0.005;const s=strengthOf(res.r);
   const zhW=near?'近零相关':`${s.zh}${res.r>0?'正':'负'}相关`,enW=near?'near-zero correlation':`${s.en} ${res.r>0?'positive':'negative'} correlation`;
   return {zh:`${res.from} 至 ${res.to}，${i.zh}月度变化与${a.zh}月度变化的相关系数 r = ${f2(res.r)}（${zhW}，R² = ${f2(res.r2)}，n = ${res.n}，${l.zh}）。统计关系不代表因果。`,
    en:`From ${res.from} to ${res.to}, monthly changes in ${i.en} and ${a.en} have r = ${f2(res.r)} (${enW}, R² = ${f2(res.r2)}, n = ${res.n}, ${l.en}). A statistical relationship is not causation.`};
  }
  case 'level':{
   const l=lagText(res.lag);
   return {zh:`探索性（水平口径）：${res.from} 至 ${res.to}，${i.zh}与${a.zh}水平值的相关系数 r = ${f2(res.r)}（n = ${res.n}，${l.zh}）。趋势序列的水平相关不代表关系。`,
    en:`Exploratory (levels): from ${res.from} to ${res.to}, the levels of ${i.en} and ${a.en} have r = ${f2(res.r)} (n = ${res.n}, ${l.en}). Level correlation between trending series does not show a relationship.`};
  }
  case 'rolling':{
   const rs=res.points.map(p=>p.r);const lo=f2(Math.min(...rs)),hi=f2(Math.max(...rs));
   return {zh:`滚动 ${res.window_months} 个月：${res.points.length} 个窗口（${res.from} 至 ${res.to}），r 介于 ${lo} 与 ${hi} 之间。`,
    en:`Rolling ${res.window_months} months: ${res.points.length} windows (${res.from} to ${res.to}); r ranges from ${lo} to ${hi}.`};
  }
  case 'event_window':{
   if(!res.stats)return {zh:`独立完整事件 ${res.independent} 个，少于 5 个，只给逐事件表（±${res.n_months} 个月）。`,en:`${res.independent} independent complete events, fewer than 5; per-event table only (±${res.n_months} months).`};
   const u=unitText(res.y_unit),p=res.stats.post;
   return {zh:`${res.independent} 个独立完整事件（±${res.n_months} 个月）：事件后${a.zh}变化中位数 ${f2(p.median)}${u}（四分位 ${f2(p.q1)}${u} / ${f2(p.q3)}${u}）。`,
    en:`${res.independent} independent complete events (±${res.n_months} months): median change in ${a.en} after the event ${f2(p.median)}${u} (quartiles ${f2(p.q1)}${u} / ${f2(p.q3)}${u}).`};
  }
 }
}
