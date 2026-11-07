// src/lib/company/decimal.ts
// Exact decimal helpers of the company module (spec §4.1 relChange, §5.3 formatDecimalText; plan
// 事件 payload schema). Strings in, strings out: BigInt on a common scale, never JS floating point.
// Rounding is half away from zero everywhere (same rule as facts derive.ts). Task 5 creates the
// parse/sub/relChange part; Task 7 appends the display formatting helpers below the marker.
import {canonicalDecimal} from '@/lib/facts/json-numbers';

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
