// src/lib/macro/strategy/numeric.ts
// Exact decimal arithmetic and descriptive statistics for P3/P4 (spec 2026-11-07 §5.6, §5.3, §5.5). P1 decimal.ts is not on
// main, so subtract / add / compare / sign / toBp work here on canonicalDecimal text as scaled BigInts (WP-S6 may swap in
// P1 decimal.ts). Floats appear only where §5.6 allows: pctChange (one Number() per operand, once) and the type-7
// quartiles over already computed raw changes. pctRatio is the exact companion of pctChange: facts and views keep the
// exact ratio text '<end>/<base>', and roundPctRatio rounds it once, at presentation (never a pre-rounded value).
import {canonicalDecimal} from '@/lib/facts/json-numbers';

interface Scaled{n:bigint;scale:number}
function scaled(raw:string):Scaled{
 const c=canonicalDecimal(raw);const neg=c.startsWith('-');const body=neg?c.slice(1):c;
 const dot=body.indexOf('.');const int=dot<0?body:body.slice(0,dot);const frac=dot<0?'':body.slice(dot+1);
 const n=BigInt(int+frac);
 return {n:neg?-n:n,scale:frac.length};
}
const pow10=(k:number)=>10n**BigInt(k);
function align(a:Scaled,b:Scaled):[bigint,bigint,number]{const s=Math.max(a.scale,b.scale);return [a.n*pow10(s-a.scale),b.n*pow10(s-b.scale),s];}
function fromScaled(n:bigint,scale:number):string{
 const neg=n<0n;let digits=(neg?-n:n).toString();
 if(scale>0){digits=digits.padStart(scale+1,'0');digits=`${digits.slice(0,-scale)}.${digits.slice(-scale)}`;}
 return canonicalDecimal(`${neg?'-':''}${digits}`);
}
export const canonical=canonicalDecimal;
export function compare(a:string,b:string):-1|0|1{const [x,y]=align(scaled(a),scaled(b));return x<y?-1:x>y?1:0;}
export function subtract(a:string,b:string):string{const [x,y,s]=align(scaled(a),scaled(b));return fromScaled(x-y,s);}
export function add(a:string,b:string):string{const [x,y,s]=align(scaled(a),scaled(b));return fromScaled(x+y,s);}
export const sign=(v:string):-1|0|1=>{const c=canonicalDecimal(v);return c==='0'?0:c.startsWith('-')?-1:1;};
/** Exact decimal × 100 (percentage points → basis points), same as P2 events.ts toBp. */
export const toBp=(delta:string):string=>canonicalDecimal(`${canonicalDecimal(delta)}e2`);
/** Simple % change (end/base − 1) × 100 as a full-precision double: the one float step §5.6 allows. base ≤ 0 → throws non_positive_base. */
export function pctChange(end:string,base:string):number{
 if(sign(base)<=0)throw new Error('non_positive_base');
 return (Number(canonicalDecimal(end))/Number(canonicalDecimal(base))-1)*100;
}
/** Exact form of the same change: the ratio text '<end>/<base>' (canonical decimals). base ≤ 0 → throws non_positive_base. */
export function pctRatio(end:string,base:string):string{
 if(sign(base)<=0)throw new Error('non_positive_base');
 return `${canonicalDecimal(end)}/${canonicalDecimal(base)}`;
}
const RATIO=/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/;
/** (end/base − 1) × 100 of a pctRatio text, rounded once, half away from zero, to exactly dp places (BigInt, no float);
 *  a zero result carries no sign. 100 → 100.04996 at dp 1 is '0.0' (true change 0.04996 %). */
export function roundPctRatio(ratio:string,dp:number):string{
 const m=RATIO.exec(ratio);if(!m)throw new Error(`invalid_pct_ratio:${ratio}`);
 const [e,b]=align(scaled(m[1]),scaled(m[2]));if(b<=0n)throw new Error('non_positive_base');
 const num=(e-b)*100n*pow10(dp);const abs=num<0n?-num:num;
 let q=abs/b;if((abs%b)*2n>=b)q+=1n;
 let digits=q.toString();
 if(dp>0){digits=digits.padStart(dp+1,'0');digits=`${digits.slice(0,-dp)}.${digits.slice(-dp)}`;}
 return num<0n&&q!==0n?`-${digits}`:digits;
}
/** Type-7 quantile of an ascending, non-empty array: h=(n−1)p, q=x[⌊h⌋]+(h−⌊h⌋)(x[⌊h⌋+1]−x[⌊h⌋]). */
export function quantile7(sorted:readonly number[],p:number):number{
 if(sorted.length===0)throw new Error('quantile_empty');
 for(let i=1;i<sorted.length;i++)if(sorted[i]<sorted[i-1])throw new Error('quantile_unsorted');
 const h=(sorted.length-1)*p;const lo=Math.floor(h);
 if(lo+1>=sorted.length)return sorted[lo];
 return sorted[lo]+(h-lo)*(sorted[lo+1]-sorted[lo]);
}
export function quartiles(values:readonly number[]):{q1:number;median:number;q3:number}{
 const s=[...values].sort((a,b)=>a-b);
 return {q1:quantile7(s,0.25),median:quantile7(s,0.5),q3:quantile7(s,0.75)};
}
export const median=(values:readonly number[]):number=>quartiles(values).median;
