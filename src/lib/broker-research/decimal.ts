// src/lib/broker-research/decimal.ts
// Exact decimal arithmetic for broker rules and text checks (spec §5.3, §7.1). Values are
// scaled BigInts, never binary floating point; rounding is half away from zero.
import {canonicalDecimal} from '../facts/json-numbers';
export interface Dec{units:bigint;scale:number}
const pow10=(n:number)=>10n**BigInt(n);
const validScale=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw new Error('invalid_scale');};
export function dec(raw:string):Dec{const c=canonicalDecimal(raw),neg=c.startsWith('-');const [i,f='']=(neg?c.slice(1):c).split('.');const units=BigInt(i+f);return {units:neg?-units:units,scale:f.length};}
export function decString(d:Dec):string{validScale(d.scale);const neg=d.units<0n;let digits=(neg?-d.units:d.units).toString();if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}return canonicalDecimal(`${neg?'-':''}${digits}`);}
const align=(a:Dec,b:Dec):[bigint,bigint,number]=>{const s=Math.max(a.scale,b.scale);return [a.units*pow10(s-a.scale),b.units*pow10(s-b.scale),s];};
export const decAdd=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {units:x+y,scale:s};};
export const decSub=(a:Dec,b:Dec):Dec=>{const [x,y,s]=align(a,b);return {units:x-y,scale:s};};
export const decMul=(a:Dec,b:Dec):Dec=>({units:a.units*b.units,scale:a.scale+b.scale});
export const decCmp=(a:Dec,b:Dec):-1|0|1=>{const [x,y]=align(a,b);return x<y?-1:x>y?1:0;};
export const decAbs=(a:Dec):Dec=>({units:a.units<0n?-a.units:a.units,scale:a.scale});
export const decNeg=(a:Dec):Dec=>({units:-a.units,scale:a.scale});
export const decSign=(a:Dec):-1|0|1=>a.units<0n?-1:a.units>0n?1:0;
export function decShift(a:Dec,k:number):Dec{if(!Number.isSafeInteger(k))throw new Error('invalid_scale');if(k<=0)return {units:a.units,scale:a.scale-k};return a.scale>=k?{units:a.units,scale:a.scale-k}:{units:a.units*pow10(k-a.scale),scale:0};}
export function decRound(a:Dec,dp:number):Dec{validScale(dp);if(a.scale<=dp)return a;const drop=pow10(a.scale-dp),neg=a.units<0n,abs=neg?-a.units:a.units;let q=abs/drop;if((abs%drop)*2n>=drop)q+=1n;return {units:neg?-q:q,scale:dp};}
export function decDiv(a:Dec,b:Dec,dp:number):Dec{validScale(dp);if(b.units===0n)throw new Error('division_by_zero');const num=a.units*pow10(b.scale+dp+1),den=b.units*pow10(a.scale),neg=(num<0n)!==(den<0n);const q=(num<0n?-num:num)/(den<0n?-den:den),r=q%10n>=5n?q/10n+1n:q/10n;return {units:neg?-r:r,scale:dp};}
export const round1=(raw:string):string=>decString(decRound(dec(raw),1));
export const decimalCompare=(a:string,b:string)=>decCmp(dec(a),dec(b));
