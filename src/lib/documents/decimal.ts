// src/lib/documents/decimal.ts
// Exact decimal-string arithmetic for HK financial values (spec §7.5 item 5, §7.6 R5-8): a value
// is presented × scale with the sign rule applied, and never passes through Number. Scaling is a
// decimal-point shift (canonicalDecimal accepts an exponent); addition and subtraction use BigInt on
// a common number of fraction digits. Every result is in the canonical form of
// src/lib/facts/json-numbers.ts::canonicalDecimal (no exponent, no leading/trailing zeros, '-0' →
// '0'). Invalid input throws invalid_decimal (a programming error, not a data outcome).
// parsePresented reads one table cell (NFKC first: full-width digits, commas and parentheses
// become ASCII): '(1,234)' and '-1,234' are negative, a lone dash (- – —) is 'dash' (no value for
// the period), anything else that is not a well-grouped number is null.
import {canonicalDecimal} from '../facts/json-numbers';

export type Scale='1'|'0.01'|'1000'|'1000000';
const SHIFT:Record<Scale,number>={'1':0,'0.01':-2,'1000':3,'1000000':6};
const DECIMAL=/^-?\d+(?:\.\d+)?$/;
const invalid=(s:unknown)=>new Error(`invalid_decimal:${String(s).slice(0,40)}`);

/** A plain signed decimal literal (no exponent, no grouping, no '+'). */
export function isDecimal(s:string):boolean{return typeof s==='string'&&DECIMAL.test(s);}
const check=(s:string)=>{if(!isDecimal(s))throw invalid(s);return s;};

/** digits × scale, exactly (digits may carry a sign and a fraction). */
export function scaleDecimal(digits:string,scale:Scale):string{
 const k=SHIFT[scale];
 if(k===undefined)throw invalid(scale);
 return canonicalDecimal(`${check(digits)}e${k}`);
}
export function negate(d:string):string{
 const c=canonicalDecimal(check(d));
 return c==='0'?'0':c.startsWith('-')?c.slice(1):`-${c}`;
}
/** Both operands as BigInt on the same number of fraction digits. */
function aligned(a:string,b:string):{x:bigint;y:bigint;frac:number}{
 const ca=canonicalDecimal(check(a)),cb=canonicalDecimal(check(b));
 const fa=ca.split('.')[1]?.length??0,fb=cb.split('.')[1]?.length??0;const frac=Math.max(fa,fb);
 const big=(c:string,f:number)=>BigInt(c.replace('.','')+'0'.repeat(frac-f));
 return {x:big(ca,fa),y:big(cb,fb),frac};
}
function fromScaled(n:bigint,frac:number):string{
 const neg=n<0n;let s=(neg?-n:n).toString();
 if(frac>0){s=s.padStart(frac+1,'0');s=`${s.slice(0,s.length-frac)}.${s.slice(s.length-frac)}`;}
 return canonicalDecimal(`${neg?'-':''}${s}`);
}
export function addDecimal(a:string,b:string):string{const {x,y,frac}=aligned(a,b);return fromScaled(x+y,frac);}
export function subDecimal(a:string,b:string):string{const {x,y,frac}=aligned(a,b);return fromScaled(x-y,frac);}

const GROUPED=/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
/** One presented table cell → unsigned digits (commas removed) and its sign; 'dash' for a lone dash; null otherwise. */
export function parsePresented(cell:string):{digits:string;negative:boolean}|'dash'|null{
 const s=cell.normalize('NFKC').trim();
 if(/^[-–—]$/.test(s))return 'dash';
 const m=/^(\()?([-–—])?([\d,]+(?:\.\d+)?)(\))?$/.exec(s);
 if(!m)return null;
 const [,open,minus,body,close]=m;
 if(!!open!==!!close||(open&&minus))return null;
 if(!GROUPED.test(body))return null;
 return {digits:body.replace(/,/g,''),negative:!!open||!!minus};
}
