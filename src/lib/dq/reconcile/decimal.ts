// src/lib/dq/reconcile/decimal.ts
// Exact decimal arithmetic for reconciliation (spec §5.1). A decimal string becomes a scaled BigInt
// {units, scale} (value = units / 10^scale). Comparisons align the two scales by multiplying with
// powers of ten (cross-multiplication) and never divide; the only division is the reported ratio
// (rel_diff, tolerance), rounded half away from zero at a fixed number of places. Every input goes
// through plan 2's canonicalDecimal first, so exponents and leading/trailing zeros are accepted and
// anything else throws invalid_decimal. Number() is never applied to a value.
// Cap: every result is formatted through canonicalDecimal, whose literal limit is 512 characters; a sum,
// difference or product that would exceed it throws decimal_overflow (distinct from invalid_decimal, which
// means malformed input). Ratios (relDiff/divDecimal) are DERIVED/DISPLAY values: pass/fail must always be
// decided by exact comparison (compareDecimal/withinRadius), never by the rounded ratio.
import {canonicalDecimal} from '../../facts/json-numbers';

export interface ScaledDecimal{units:bigint;scale:number}
const pow10=(k:number)=>10n**BigInt(k);
const babs=(x:bigint)=>x<0n?-x:x;

export function parseDecimal(s:string):ScaledDecimal{
 const c=canonicalDecimal(s);
 const neg=c.startsWith('-');const body=neg?c.slice(1):c;const [i,f='']=body.split('.');
 const u=BigInt(i+f);
 return {units:neg?-u:u,scale:f.length};
}
const MAX_LITERAL=512;
export function formatDecimal(d:ScaledDecimal):string{
 const neg=d.units<0n;let digits=babs(d.units).toString();
 if(digits.length>MAX_LITERAL||d.scale>MAX_LITERAL)throw new Error('decimal_overflow');
 if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}
 if(digits.length+(neg?1:0)>MAX_LITERAL)throw new Error('decimal_overflow');
 return canonicalDecimal((neg?'-':'')+digits);
}
export const isDecimalText=(s:string):boolean=>{try{canonicalDecimal(s);return true;}catch{return false;}};
function align(a:ScaledDecimal,b:ScaledDecimal):[bigint,bigint,number]{const s=Math.max(a.scale,b.scale);return [a.units*pow10(s-a.scale),b.units*pow10(s-b.scale),s];}

export function compareDecimal(a:string,b:string):-1|0|1{const [x,y]=align(parseDecimal(a),parseDecimal(b));return x<y?-1:x>y?1:0;}
export function addDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x+y,scale:s});}
export function subDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x-y,scale:s});}
export function absDecimal(a:string):string{const d=parseDecimal(a);return formatDecimal({units:babs(d.units),scale:d.scale});}
export function mulDecimal(a:string,b:string):string{const x=parseDecimal(a),y=parseDecimal(b);return formatDecimal({units:x.units*y.units,scale:x.scale+y.scale});}
/** max(|x|) over the arguments (at least one). */
export function maxAbsDecimal(...xs:string[]):string{
 if(xs.length===0)throw new Error('empty_max');
 return xs.map(absDecimal).reduce((m,x)=>compareDecimal(x,m)>0?x:m);
}
/** a / b rounded half away from zero to `scale` places (one guard digit on the truncated absolute quotient). */
export function divDecimal(a:string,b:string,scale=10):string{
 if(!Number.isInteger(scale)||scale<0||scale>MAX_LITERAL)throw new Error('invalid_scale');
 const [x,y]=align(parseDecimal(a),parseDecimal(b));
 if(y===0n)throw new Error('division_by_zero');
 const q=(babs(x)*pow10(scale+1))/babs(y);
 const r=(q+5n)/10n;
 return formatDecimal({units:(x<0n)!==(y<0n)?-r:r,scale});
}
/** The ratio is <= 2, so its text is at most 2 + scale characters; 500 keeps it far inside the 512 literal cap. */
const REL_SCALE_CAP=500;
/** |l − r| / max(|l|, |r|, 1) (spec §5.1). Derived/display value. The default scale is 10 plus the digit count of the
 * denominator's integer part, so a 0.005 difference on a 3.8e11 base is not rounded to "0". */
export function relDiff(l:string,r:string,scale?:number):string{
 const den=maxAbsDecimal(l,r,'1');
 return divDecimal(absDecimal(subDecimal(l,r)),den,scale??Math.min(10+den.split('.')[0].length,REL_SCALE_CAP));
}
/** |value − center| <= radius, by aligning scales (no division). */
export function withinRadius(value:string,center:string,radius:string):boolean{
 const rad=parseDecimal(radius);if(rad.units<0n)throw new Error('negative_radius');
 const d=parseDecimal(subDecimal(value,center));
 const [x,y]=align({units:babs(d.units),scale:d.scale},rad);
 return x<=y;
}
