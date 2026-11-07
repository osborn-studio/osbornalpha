// src/lib/company/decimal.ts
// Exact decimal helpers of the company module (spec §4.1 relChange, §5.3 formatDecimalText; plan
// 事件 payload schema). Strings in, strings out: BigInt on a common scale, never JS floating point.
// Rounding is half away from zero everywhere (same rule as facts derive.ts). Task 5 creates the
// parse/sub/relChange part; Task 7 appends the display formatting helpers below the marker.
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {unitKindOf} from '@/lib/facts/units';

export interface Dec{n:bigint;s:number}
export const pow10=(k:number)=>10n**BigInt(k);
/** Exact value of a decimal string (exponent forms accepted); throws invalid_decimal like canonicalDecimal. */
export function parseDecimal(v:string):Dec{
 const c=canonicalDecimal(v);
 const neg=c.startsWith('-'),body=neg?c.slice(1):c,[i,f='']=body.split('.');
 const n=BigInt(i+f);return {n:neg?-n:n,s:f.length};
}
export function decToString(d:Dec):string{
 const neg=d.n<0n;let digits=(neg?-d.n:d.n).toString();
 if(d.s>0){digits=digits.padStart(d.s+1,'0');digits=`${digits.slice(0,-d.s)}.${digits.slice(-d.s)}`;}
 return canonicalDecimal((neg?'-':'')+digits);
}
function align(a:Dec,b:Dec):[bigint,bigint,number]{const s=Math.max(a.s,b.s);return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];}
/** num/den rounded half away from zero; den > 0. */
export function roundDiv(num:bigint,den:bigint):bigint{
 if(den<=0n)throw new RangeError('roundDiv: den must be positive');
 const q=num/den,r=num%den;                     // BigInt division truncates toward zero
 const twice=(r<0n?-r:r)*2n;
 return twice>=den?q+(num<0n?-1n:1n):q;
}
export function decimalSub(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return decToString({n:x-y,s});}
export const REL_CHANGE_SCALE=10;
/** (to − from) / |from| to REL_CHANGE_SCALE places, half away from zero, canonical; null when from is zero. */
export function decimalRelChange(from:string,to:string):string|null{
 const [x,y]=align(parseDecimal(from),parseDecimal(to));
 if(x===0n)return null;
 const q=roundDiv((y-x)*pow10(REL_CHANGE_SCALE),x<0n?-x:x);
 return decToString({n:q,s:REL_CHANGE_SCALE});
}
// ---- display formatting (Task 7) ----
export type DisplayScale='raw'|'thousand'|'million'|'hundred_million';
const DIVISORS:Record<DisplayScale,bigint>={raw:1n,thousand:1000n,million:1_000_000n,hundred_million:100_000_000n};
export const divisorOf=(scale:DisplayScale):bigint=>DIVISORS[scale];
/** Default display scale (spec §5.3): CNY + zh → 亿, other money → 百万, non-money units unscaled. */
export function scaleFor(unit:string,locale:'zh'|'en'):DisplayScale{
 if(unitKindOf(unit)!=='money')return 'raw';
 return unit==='CNY'&&locale==='zh'?'hundred_million':'million';
}
/** valueText ÷ divisor, half away from zero, exactly fractionDigits places; string/BigInt only. */
export function formatDecimalText(valueText:string,divisor:bigint,fractionDigits:number):string{
 if(divisor<=0n)throw new RangeError('divisor must be positive');
 if(!Number.isInteger(fractionDigits)||fractionDigits<0||fractionDigits>12)throw new RangeError('fractionDigits must be 0..12');
 const d=parseDecimal(valueText);
 const q=roundDiv(d.n*pow10(fractionDigits),pow10(d.s)*divisor);
 const neg=q<0n;const digits=(neg?-q:q).toString().padStart(fractionDigits+1,'0');
 const body=fractionDigits>0?`${digits.slice(0,-fractionDigits)}.${digits.slice(-fractionDigits)}`:digits;
 return neg?`-${body}`:body;
}
export function groupThousands(text:string):string{
 const neg=text.startsWith('-');const [i,f]=(neg?text.slice(1):text).split('.');
 const g=i.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return `${neg?'-':''}${g}${f!==undefined?`.${f}`:''}`;
}
