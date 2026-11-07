// src/lib/macro/decimal.ts
// Exact decimal-string arithmetic for macro values (spec §0.2 M8, plan cross-task conventions).
// Values travel as canonical decimal text (src/lib/facts/json-numbers.ts::canonicalDecimal); here
// they become scaled BigInts, never doubles. yoyPct = (cur/prev − 1) × 100 rounded half-even to 4
// decimals; minus100 (上年同月=100 index → pp) and subtract are exact. Results are canonical.
import {canonicalDecimal,decimalEquals} from '../facts/json-numbers';

export const canonical=canonicalDecimal;
export const equals=decimalEquals;
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
/** num/den rounded half-to-even (den ≠ 0). */
function divHalfEven(num:bigint,den:bigint):bigint{
 if(den<0n){num=-num;den=-den;}
 const q=num/den;const r=num%den;const twice=(r<0n?-r:r)*2n;
 if(twice<den)return q;
 const away=num<0n?q-1n:q+1n;
 if(twice>den)return away;
 return q%2n===0n?q:away;
}
export function compare(a:string,b:string):-1|0|1{const [x,y]=align(scaled(a),scaled(b));return x<y?-1:x>y?1:0;}
export function subtract(a:string,b:string):string{const [x,y,s]=align(scaled(a),scaled(b));return fromScaled(x-y,s);}
export const minus100=(x:string):string=>subtract(x,'100');
export function yoyPct(cur:string,prev:string):string{
 const [c,p]=align(scaled(cur),scaled(prev));
 if(p===0n)throw new Error('decimal_division_by_zero');
 return fromScaled(divHalfEven((c-p)*100n*10000n,p),4);
}
