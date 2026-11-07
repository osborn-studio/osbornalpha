// src/lib/company/event-text.ts
// Display model of one tracking event (spec §7.1–7.3; plan Task 17). Pure and browser-safe. Values are the
// disclosed value_text strings: scaled/grouped through the page's decimal helpers (string/BigInt, never floats)
// and always paired with currency + applied scale (unitCaption, as the overview does); relChange (exact
// decimal ratio) becomes a percent through BigInt. A gated value ({kind:'withheld',reason}, under `.value` of
// headline/from/to, or the relChange object itself) is shown as its reason only — no number leaks.
import {SCALE_EXP,defaultScale,formatValue,unitCaption,unitKindOfUnit,type ScaleId} from '@/components/company/format';
import type {PublicEvent} from './event-dto';

export type WithheldView={kind:'withheld';reason:'evidence_incomplete'|'citation_pending'};
export interface CaptionView{unit:string;scaleId:ScaleId|null}
export type ValueView={kind:'value';text:string;caption:CaptionView|null}|WithheldView|{kind:'missing'};
export type EventSummary=
 |{kind:'filing_published';formType:string;fiscalYear:number|null;fiscalPeriod:string|null;factCount:number|null}
 |{kind:'period_first_seen';periodEnd:string;duration:string;conceptCount:number|null;headline:{concept:string;value:ValueView}[];ambiguousUnits:string[]}
 |{kind:'fact_revised';concept:string;periodEnd:string;duration:string;from:ValueView;to:ValueView;relChange:ValueView|null};
export type EventLocale='zh'|'en';

const obj=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const str=(v:unknown)=>typeof v==='string'?v:null;
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const HEADLINE_ORDER=['revenue','revenue_operating','net_income_parent','operating_cash_flow'];

export function groupDigits(v:string):string{
 const m=/^(-?)(\d+)(\.\d+)?$/.exec(v);
 if(!m)return v;
 return m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,',')+(m[3]??'');
}
/** Exact decimal ratio → signed percent with `dp` decimals, half away from zero. */
export function ratioToPercent(r:string,dp=4):string|null{
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(r);
 if(!m)return null;
 const neg=m[1]==='-',frac=(m[3]??'').padEnd(dp+3,'0');
 let n=BigInt(m[2]+frac.slice(0,dp+2));
 if(Number(frac[dp+2])>=5)n+=1n;
 if(n===0n)return `0.${'0'.repeat(dp)}%`;
 const s=n.toString().padStart(dp+1,'0');
 return `${neg?'-':'+'}${s.slice(0,s.length-dp)}.${s.slice(s.length-dp)}%`;
}
function withheldOf(v:unknown):WithheldView|null{
 const o=obj(v);
 return o&&o.kind==='withheld'&&(o.reason==='evidence_incomplete'||o.reason==='citation_pending')?{kind:'withheld',reason:o.reason}:null;
}
/** A disclosed value in its unit: money is scaled like the overview (CNY+zh → 亿, other money → 百万), with a caption naming currency and scale. */
export function valueView(v:unknown,unit:string|null,locale:EventLocale):ValueView{
 const w=withheldOf(v);if(w)return w;
 const s=str(v);if(s===null)return {kind:'missing'};
 if(!unit)return {kind:'value',text:groupDigits(s),caption:null};
 const kind=unitKindOfUnit(unit);
 const exp=kind==='money'?SCALE_EXP[defaultScale(unit,locale)]:0;
 return {kind:'value',text:formatValue(s,kind,exp),caption:unitCaption(unit,exp)};
}
export function eventSummary(e:Pick<PublicEvent,'kind'|'payload'>,locale:EventLocale):EventSummary{
 const p=e.payload;
 switch(e.kind){
  case 'filing_published':
   return {kind:'filing_published',formType:str(p.formType)??'',fiscalYear:num(p.fiscalYear),fiscalPeriod:str(p.fiscalPeriod),factCount:num(p.factCount)};
  case 'period_first_seen':{
   const h=obj(p.headline)??{};
   return {kind:'period_first_seen',periodEnd:str(p.periodEnd)??'',duration:str(p.duration)??'',conceptCount:num(p.conceptCount),
    headline:HEADLINE_ORDER.filter(c=>obj(h[c])!==null).map(c=>{const x=obj(h[c])!;return {concept:c,value:valueView(x.value,str(x.unit),locale)};}),
    ambiguousUnits:Array.isArray(p.ambiguousUnits)?p.ambiguousUnits.filter((x):x is string=>typeof x==='string'):[]};
  }
  case 'fact_revised':{
   const unit=str(p.unit),rel=p.relChange;
   let relChange:ValueView|null=null;
   if(rel!==undefined){const w=withheldOf(rel);const pct=typeof rel==='string'?ratioToPercent(rel):null;relChange=w??(pct!==null?{kind:'value',text:pct,caption:null}:{kind:'missing'});}
   return {kind:'fact_revised',concept:str(p.concept)??'',periodEnd:str(p.periodEnd)??'',duration:str(p.duration)??'',
    from:valueView(obj(p.from)?.value,unit,locale),to:valueView(obj(p.to)?.value,unit,locale),relChange};
  }
 }
}
