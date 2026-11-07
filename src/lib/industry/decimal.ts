// src/lib/industry/decimal.ts
// Exact decimal arithmetic on canonical decimal strings (plan §共享契约 补充; spec §5.1). A copy of the
// BigInt `Dec` arithmetic of src/lib/facts/derive.ts, whose helpers are private and which this module
// must not edit: value = n / 10^s; add/sub/mul are exact; division rounds half away from zero to
// RATIO_SCALE places with one guard digit, exactly like derive.ts div(). Every result is a
// canonicalDecimal string. Inputs must be plain decimals (no exponent, no '+', no spaces): anything
// else throws invalid_decimal. No JS number ever carries a money or ratio value in this module.
import {canonicalDecimal} from '../facts/json-numbers';
import {RATIO_SCALE} from '../facts/derive';
export {RATIO_SCALE};

interface Dec{n:bigint;s:number}
const DEC_RE=/^-?\d+(\.\d+)?$/;
const pow10=(k:number)=>10n**BigInt(k);
/** True for a plain decimal string ('-12.50', '0', '7'); exponents and signs other than '-' are rejected. */
export const isDecimal=(v:unknown):v is string=>typeof v==='string'&&DEC_RE.test(v);
function parse(v:string):Dec{
 if(!isDecimal(v))throw new Error(`invalid_decimal:${String(v).slice(0,40)}`);
 const neg=v.startsWith('-'),body=neg?v.slice(1):v,[i,f='']=body.split('.');
 const n=BigInt(i+f);return {n:neg?-n:n,s:f.length};
}
function align(a:Dec,b:Dec):[bigint,bigint,number]{const s=Math.max(a.s,b.s);return [a.n*pow10(s-a.s),b.n*pow10(s-b.s),s];}
function toStr(d:Dec):string{
 const neg=d.n<0n;let digits=(neg?-d.n:d.n).toString();
 if(d.s>0){digits=digits.padStart(d.s+1,'0');digits=`${digits.slice(0,-d.s)}.${digits.slice(-d.s)}`;}
 return canonicalDecimal((neg?'-':'')+digits);
}
const addD=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {n:x+y,s};};

export const decAdd=(a:string,b:string):string=>toStr(addD(parse(a),parse(b)));
export const decSub=(a:string,b:string):string=>{const [x,y,s]=align(parse(a),parse(b));return toStr({n:x-y,s});};
/** Σ xs, exact; the empty sum is '0' (callers decide whether an empty set is missing). */
export const decSum=(xs:readonly string[]):string=>toStr(xs.reduce<Dec>((acc,x)=>addD(acc,parse(x)),{n:0n,s:0}));
export const decMul=(a:string,b:string):string=>{const x=parse(a),y=parse(b);return toStr({n:x.n*y.n,s:x.s+y.s});};
export const decAbs=(a:string):string=>{const x=parse(a);return toStr({n:x.n<0n?-x.n:x.n,s:x.s});};
export const decCmp=(a:string,b:string):-1|0|1=>{const [x,y]=align(parse(a),parse(b));return x<y?-1:x>y?1:0;};
export const decIsZero=(a:string):boolean=>parse(a).n===0n;
/** a / b rounded half away from zero to RATIO_SCALE places (derive.ts div semantics); null when b is zero. */
export function decDiv(a:string,b:string):string|null{
 const p=parse(a),q=parse(b);
 if(q.n===0n)return null;
 const [x,y]=align(p,q);
 const t=(x*pow10(RATIO_SCALE+1))/y;      // one guard digit; BigInt division truncates toward zero
 const r=t<0n?-((-t+5n)/10n):(t+5n)/10n;
 return toStr({n:r,s:RATIO_SCALE});
}
