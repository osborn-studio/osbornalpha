// src/components/company/format.ts
// Display formatting of decimal value_text (plan 2026-11-06 Task 12; spec §5.3, §5.4). Integration
// decision: the scaling, rounding and grouping are Task 7's (src/lib/company/decimal.ts formatDecimalText /
// groupThousands / scaleFor — string/BigInt, half away from zero, never floating point); this file only
// adapts them to the page (exponent-based scale ids, percent display, invalid text passed through).
// value_text itself is never altered; only the display string is derived.
import {formatDecimalText,groupThousands,scaleFor,type DisplayScale} from '@/lib/company/decimal';
export type ScaleId=DisplayScale;
export const SCALES:readonly ScaleId[]=['raw','thousand','million','hundred_million'];
export const SCALE_EXP:Record<ScaleId,number>={raw:0,thousand:3,million:6,hundred_million:8};
export type UnitKind='money'|'shares'|'per_share'|'ratio';

/** Default scale = Task 7 scaleFor(currency, locale) (spec §5.3: CNY + zh → 亿, other money → 百万); no currency → raw. */
export function defaultScale(currency:string|null,locale:'zh'|'en'):ScaleId{return currency===null?'raw':scaleFor(currency,locale);}
export function unitKindOfUnit(unit:string):UnitKind{
 if(unit==='pure')return 'ratio';
 if(unit==='shares')return 'shares';
 if(unit.includes('/'))return 'per_share';
 return 'money';
}
interface Parts{neg:boolean;int:string;frac:string}
function parse(t:string):Parts|null{const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(t);return m?{neg:m[1]==='-',int:m[2],frac:m[3]??''}:null;}
function join(neg:boolean,int:string,frac:string):string{
 const i=int.replace(/^0+(?=\d)/,'')||'0';const zero=/^0*$/.test(i+frac);
 return (neg&&!zero?'-':'')+i+(frac?`.${frac}`:'');
}
/** value / 10^exp exactly (exp < 0 multiplies); trailing fraction zeros are dropped. Invalid input is returned unchanged. */
export function shiftDecimal(t:string,exp:number):string{
 const p=parse(t);if(!p)return t;
 let digits=p.int+p.frac,point=p.int.length-exp;
 if(point<=0){digits='0'.repeat(1-point)+digits;point=1;}
 if(point>digits.length)digits=digits+'0'.repeat(point-digits.length);
 return join(p.neg,digits.slice(0,point),digits.slice(point).replace(/0+$/,''));
}
/** Fixed `d` fraction digits, half away from zero, no negative zero (Task 7 formatDecimalText with divisor 1). */
export function roundDecimal(t:string,d:number):string{
 if(!parse(t))return t;
 return formatDecimalText(t,1n,d);
}
export function groupNumber(t:string):string{return parse(t)?groupThousands(t):t;}
/** value ÷ 10^exp to `digits` places (Task 7 formatDecimalText), grouped; exp 0 = the raw value grouped, unrounded. */
export function formatScaled(t:string,exp:number,digits=2):string{
 if(exp===0||!parse(t))return groupNumber(t);
 return groupThousands(formatDecimalText(t,10n**BigInt(exp),digits));
}
export function formatPercent(t:string,digits=2):string{const s=roundDecimal(shiftDecimal(t,-2),digits);return parse(s)?`${groupNumber(s)}%`:t;}
export function formatValue(t:string,kind:UnitKind,exp:number):string{
 if(kind==='ratio')return formatPercent(t);
 if(kind==='money')return formatScaled(t,exp);
 return groupNumber(t);
}
export const signed=(s:string)=>/^\d/.test(s)&&!/^0(\.0+)?%?$/.test(s)?`+${s}`:s;
export const divisorLabel=(exp:number)=>`1e${exp}`;
