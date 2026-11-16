// Exact decimal arithmetic for the HK checks (spec §7.6, R5-8): decimal strings → scaled BigInts,
// never Number. identity: |left − right| × tol.den ≤ max(|left|, |right|, 1) × tol.num (BS/GP and
// comparatives 5/1000, CF 2/100); the exact difference is kept as a canonical decimal string for
// the check detail. Inputs go through spec-2 canonicalDecimal (imported, not modified), which also
// rejects malformed text. Slicing here works on digit strings, never on page text offsets.
import {canonicalDecimal} from '../../facts/json-numbers';

interface Dec{n:bigint;s:number}
const pow10=(k:number)=>10n**BigInt(k);
const abs=(v:bigint)=>v<0n?-v:v;
function dec(v:string):Dec{
 const c=canonicalDecimal(v);const neg=c.startsWith('-');
 const [i,f='']=c.replace(/^-/,'').split('.');
 const n=BigInt(i+f);
 return {n:neg?-n:n,s:f.length};
}
function format(n:bigint,s:number):string{
 const digits=abs(n).toString().padStart(s+1,'0');
 const i=digits.slice(0,digits.length-s),f=digits.slice(digits.length-s);
 return canonicalDecimal(`${n<0n?'-':''}${i}${f?`.${f}`:''}`);
}
/** Both decimals at a common number of fractional digits. */
export function toScaled(a:string,b:string):{a:bigint;b:bigint;scale:number}{
 const x=dec(a),y=dec(b);const s=Math.max(x.s,y.s);
 return {a:x.n*pow10(s-x.s),b:y.n*pow10(s-y.s),scale:s};
}
export function exactIdentity(left:string,right:string,tol:{num:bigint;den:bigint}):{passed:boolean;diff:string}{
 if(tol.num<0n||tol.den<=0n)throw new Error('invalid_tolerance');
 const {a,b,scale}=toScaled(left,right);
 const d=a-b;
 const bound=[abs(a),abs(b),pow10(scale)].reduce((m,v)=>v>m?v:m);
 return {passed:abs(d)*tol.den<=bound*tol.num,diff:format(d,scale)};
}
export function sumDecimals(xs:string[]):string{
 let acc:Dec={n:0n,s:0};
 for(const x of xs){const v=dec(x);const s=Math.max(acc.s,v.s);acc={n:acc.n*pow10(s-acc.s)+v.n*pow10(s-v.s),s};}
 return format(acc.n,acc.s);
}
