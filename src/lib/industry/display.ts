// src/lib/industry/display.ts
// Presentation rules shared by the read models, the routes and the components (spec §5.2 display
// thresholds, §8.2 cell states, §11 "missing is never shown as 0"). Thresholds are compared as exact
// rationals and values are formatted by string arithmetic: no value passes through a JS number
// (plan contract: decimal strings end to end).
import {DISPLAY_MAX_UNRESOLVED,DISPLAY_MIN_COVERAGE} from './method-constants';   // NOT ./method: it hashes via node:crypto and this file is rendered by client components
import type {AggMetric,CellStatus,ValuationCellRow} from './types';

export type CellDisplay='value'|'insufficient'|'unresolved'|'missing';
export type Locale='zh'|'en';

function fraction(x:number|string):{n:bigint;d:bigint}{
 const s=typeof x==='number'?String(x):x;
 const m=/^(\d+)(?:\.(\d+))?$/.exec(s);
 if(!m)throw new Error(`invalid_threshold:${s}`);
 const f=m[2]??'';
 return {n:BigInt(m[1]+f),d:10n**BigInt(f.length)};
}
/** num/den >= t exactly (den > 0); t as a decimal literal or number ('0.8' | 0.8 → 8/10). */
export function ratioAtLeast(num:number,den:number,t:number|string):boolean{const f=fraction(t);return BigInt(num)*f.d>=f.n*BigInt(den);}
/** num/den > t exactly (den > 0). */
export function ratioAbove(num:number,den:number,t:number|string):boolean{const f=fraction(t);return BigInt(num)*f.d>f.n*BigInt(den);}

export interface CountedCell{status:CellStatus;n_members:number;n_with_data:number;n_unresolved:number}
/**
 * Spec §5.2: an ok cell is shown as its value only when coverage n_with_data/(n_members+n_unresolved)
 * >= DISPLAY_MIN_COVERAGE and the unresolved share <= DISPLAY_MAX_UNRESOLVED; otherwise the page shows
 * the counts ("x/y" or "z unresolved") and the value stays in the API. Unresolved wins over coverage.
 */
export function cellDisplay(c:CountedCell):CellDisplay{
 if(c.status!=='ok')return 'missing';
 const den=c.n_members+c.n_unresolved;
 if(den===0)return 'value';
 if(ratioAbove(c.n_unresolved,den,DISPLAY_MAX_UNRESOLVED))return 'unresolved';
 if(!ratioAtLeast(c.n_with_data,den,DISPLAY_MIN_COVERAGE))return 'insufficient';
 return 'value';
}

/**
 * Decimal text → display text: move the point by `shift` (2 = percent, -8 = 亿), round half away from
 * zero to `digits`, optionally group thousands with ','. Unparseable input is returned unchanged.
 */
export function formatDecimal(value:string,opts:{shift?:number;digits:number;group?:boolean}):string{
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
 if(!m)return value;
 const neg=m[1]==='-',keep=opts.digits;
 let digits=m[2]+(m[3]??''),point=m[2].length+(opts.shift??0);
 if(point<=0){digits='0'.repeat(1-point)+digits;point=1;}
 if(point>digits.length)digits=digits+'0'.repeat(point-digits.length);
 const int=digits.slice(0,point),frac=digits.slice(point);
 const padded=frac+'0'.repeat(keep+1);
 let q=BigInt(int+padded.slice(0,keep));
 if(padded[keep]>='5')q+=1n;
 const s=q.toString().padStart(keep+1,'0');
 let ip=s.slice(0,s.length-keep).replace(/^0+(?=\d)/,'');
 const fp=s.slice(s.length-keep);
 if(opts.group)ip=ip.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const out=keep>0?`${ip}.${fp}`:ip;
 return neg&&/[1-9]/.test(out)?`-${out}`:out;
}

export interface ValueFormat{shift:number;digits:number;group:boolean;signed:boolean;suffix:Record<Locale,string>}
const PCT:ValueFormat={shift:2,digits:1,group:false,signed:false,suffix:{zh:'%',en:'%'}};
const PCT_SIGNED:ValueFormat={...PCT,signed:true};
const CNY_YI:ValueFormat={shift:-8,digits:2,group:true,signed:false,suffix:{zh:' 亿元',en:' × 1e8 CNY'}};
const USD_BN:ValueFormat={shift:-9,digits:2,group:true,signed:false,suffix:{zh:' 十亿美元',en:' bn USD'}};
const COUNT:ValueFormat={shift:0,digits:0,group:true,signed:false,suffix:{zh:'',en:''}};
const MULTIPLE:ValueFormat={shift:0,digits:2,group:true,signed:false,suffix:{zh:'',en:''}};
export const METRIC_FORMAT:Record<AggMetric,ValueFormat>={revenue_sum:CNY_YI,net_income_parent_sum:CNY_YI,gross_margin:PCT,roe:PCT,revenue_yoy:PCT_SIGNED,net_income_yoy:PCT_SIGNED,member_count:COUNT};
export const VALUATION_FORMAT:Record<ValuationCellRow['metric'],ValueFormat>={pe_ttm:MULTIPLE,pe_static:MULTIPLE,pb:MULTIPLE,market_cap:CNY_YI};

export function formatWith(f:ValueFormat,value:string,locale:Locale):string{
 const body=formatDecimal(value,{shift:f.shift,digits:f.digits,group:f.group});
 const signed=f.signed&&!body.startsWith('-')&&/[1-9]/.test(body)?`+${body}`:body;
 return `${signed}${f.suffix[locale]}`;
}
export const formatMetricValue=(metric:AggMetric,value:string,locale:Locale)=>formatWith(METRIC_FORMAT[metric],value,locale);
export const formatValuation=(metric:ValuationCellRow['metric'],value:string,locale:Locale)=>formatWith(VALUATION_FORMAT[metric],value,locale);
/** Fact money in the constituents table: CNY in 亿, USD in billions; any other unit verbatim. */
export function formatMoney(value:string,unit:string,locale:Locale):string{
 if(unit==='CNY')return formatWith(CNY_YI,value,locale);
 if(unit==='USD')return formatWith(USD_BN,value,locale);
 return `${value} ${unit}`;
}
/** Percent text (one decimal) of a 0..1 ratio string: '0.382' → '38.2'. */
export const percentText=(ratio:string)=>formatDecimal(ratio,{shift:2,digits:1});
