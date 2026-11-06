// src/lib/evals/compare.ts
// F6 comparison primitive (spec §5.2, §0 R5-10; not plan 3's decimal.ts::compareDecimal). Decimal strings
// are aligned to a common scale as BigInt — no floating point anywhere:
//   passed ⇔ |l−r| ≤ rel × max(|l|,|r|,1)      (same semantics as dq_reconciliations.tolerance)
// evaluated as |L−R|·10^s_rel ≤ T·max(|L|,|R|,10^S) on the scaled integers. absDiff is the exact |l−r| in
// canonical decimal form; relDiff = |l−r| / max(|l|,|r|,1) truncated toward zero to 10 decimal places
// (display only — plan 3 rounds, F6 truncates). Input grammar: -?digits(.digits)?, no exponent, no '+',
// no whitespace, at most 512 characters; rel must also be non-negative. Anything else → RangeError.
import {canonicalDecimal} from '../facts/json-numbers';

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?$/;
const MAX_INPUT=512;
const REL_DIGITS=10;
const pow10=(n:number):bigint=>10n**BigInt(n);
const abs=(x:bigint):bigint=>x<0n?-x:x;
const max=(...xs:bigint[]):bigint=>xs.reduce((a,b)=>a>b?a:b);

/** '-12.340' → {unscaled:-12340n, scale:3}. Throws RangeError on anything outside the grammar. */
export function parseDecimalParts(s:string):{unscaled:bigint;scale:number}{
 if(typeof s!=='string'||s.length>MAX_INPUT)throw new RangeError('invalid_decimal');
 const m=DECIMAL.exec(s);
 if(!m)throw new RangeError(`invalid_decimal:${s.slice(0,40)}`);
 const frac=m[3]??'';
 const magnitude=BigInt(m[2]+frac);
 return {unscaled:m[1]==='-'?-magnitude:magnitude,scale:frac.length};
}
/** unscaled × 10^-scale as canonical decimal text ('-0' → '0', no trailing zeros). */
export function formatDecimal(unscaled:bigint,scale:number):string{
 const neg=unscaled<0n;
 const digits=abs(unscaled).toString().padStart(scale+1,'0');
 const text=scale===0?digits:`${digits.slice(0,digits.length-scale)}.${digits.slice(digits.length-scale)}`;
 return canonicalDecimal(`${neg?'-':''}${text}`);
}

export function compareWithinTolerance(left:string,right:string,rel:string):{passed:boolean;absDiff:string;relDiff:string}{
 const l=parseDecimalParts(left),r=parseDecimalParts(right),t=parseDecimalParts(rel);
 if(t.unscaled<0n)throw new RangeError('invalid_tolerance:negative');
 const s=Math.max(l.scale,r.scale);
 const L=l.unscaled*pow10(s-l.scale),R=r.unscaled*pow10(s-r.scale);
 const diff=abs(L-R);
 const denominator=max(abs(L),abs(R),pow10(s));
 return {
  passed:diff*pow10(t.scale)<=t.unscaled*denominator,
  absDiff:formatDecimal(diff,s),
  relDiff:formatDecimal(diff*pow10(REL_DIGITS)/denominator,REL_DIGITS),
 };
}
