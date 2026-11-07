// src/components/macro/macro-format.ts
// Display formatting for macro numbers (spec §3.2, §10). Works on value_text (decimal strings) with exact string
// rounding, so a printed number never carries float drift. Arrows are neutral (macro indicators get no red/green).
// A missing value renders as '—'; the caller adds the 缺失/Missing label.
import {canonicalDecimal} from '@/lib/facts/json-numbers';
import {subtract,yoyPct} from '@/lib/macro/decimal';
import type {ChangeKind,PeriodKind} from '@/lib/macro/types';
export const MISSING='—';
export const MAX_DISPLAY_DECIMALS=2;
const fractionDigits=(canonical:string)=>{const i=canonical.indexOf('.');return i<0?0:canonical.length-i-1;};
/** Half away from zero, padded to `places`; exact (BigInt on the digit string). */
export function roundDecimalText(text:string,places:number):string{
 const c=canonicalDecimal(text);const neg=c.startsWith('-');
 const [ip,fp='']=(neg?c.slice(1):c).split('.');
 const frac=fp.padEnd(places+1,'0');
 const v=BigInt(ip+frac.slice(0,places))+(Number(frac[places])>=5?1n:0n);
 const s=v.toString().padStart(places+1,'0');
 const out=places>0?`${s.slice(0,-places)}.${s.slice(-places)}`:s;
 return `${neg&&v!==0n?'-':''}${out}`;
}
/** Source precision (trailing zeros kept: '4.80' stays '4.80'), capped at 2 decimals for display. */
export const formatValueText=(text:string):string=>{
 const c=canonicalDecimal(text);const raw=text.trim();
 const sourceDigits=/^[+-]?\d*\.\d+$/.test(raw)?raw.length-raw.indexOf('.')-1:fractionDigits(c);
 return roundDecimalText(c,Math.min(Math.max(sourceDigits,fractionDigits(c)),MAX_DISPLAY_DECIMALS));
};
export interface TypedChange{text:string;arrow:'↑'|'↓'|'→';kind:ChangeKind}
const isPositive=(text:string)=>{const c=canonicalDecimal(text);return c!=='0'&&!c.startsWith('-');};
/** Formats an exact change text in its kind: bp ≤ 1 decimal, pct 2 decimals, pp / points ≤ 2 decimals. Used directly for
 *  the overview's precomputed `change` (Task 13 views.ts changeOf) and by typedChange below. */
export function formatChange(c:{kind:ChangeKind;value_text:string}):TypedChange{
 const raw=canonicalDecimal(c.value_text);
 const places=c.kind==='bp'?Math.min(fractionDigits(raw),1):c.kind==='pct'?2:Math.min(fractionDigits(raw),MAX_DISPLAY_DECIMALS);
 const r=roundDecimalText(raw,places);const neg=r.startsWith('-');const abs=neg?r.slice(1):r;const zero=/^0(\.0+)?$/.test(abs);
 return {text:`${zero?'':neg?'−':'+'}${abs} ${c.kind}`,arrow:zero?'→':neg?'↓':'↑',kind:c.kind};
}
/** Change vs the previous comparable value in the series' change unit (spec §4.2 changeKind), exact. */
export function typedChange(cur:string|null,prev:string|null,kind:ChangeKind):TypedChange|null{
 if(cur===null||prev===null)return null;
 if(kind==='bp')return formatChange({kind,value_text:canonicalDecimal(`${subtract(cur,prev)}e2`)});
 if(kind==='pct')return isPositive(prev)?formatChange({kind,value_text:yoyPct(cur,prev)}):null;
 return formatChange({kind,value_text:subtract(cur,prev)});
}
export function formatPeriod(periodEnd:string,period:PeriodKind):string{
 if(period==='month')return periodEnd.slice(0,7);
 if(period==='quarter')return `${periodEnd.slice(0,4)}-Q${Math.ceil(Number(periodEnd.slice(5,7))/3)}`;
 return periodEnd;
}
/** UTC, minute precision: deterministic across server and browser time zones. */
export function formatInstant(iso:string):string{
 const d=new Date(iso);if(!Number.isFinite(d.getTime()))return MISSING;
 const s=d.toISOString();return `${s.slice(0,10)} ${s.slice(11,16)} UTC`;
}
const KNOWN_UNITS=new Set(['pct','index','index_1982_84_100','index_2009_11_100','index_prev_year_100','cny_per_100usd','usd_per_bbl']);
/** Localized catalog unit as a value suffix: '%' attaches directly, every other known unit follows a space; unknown → ''. */
export function unitSuffix(unit:string,t:(key:string)=>string):string{
 if(!KNOWN_UNITS.has(unit))return '';
 return unit==='pct'?'%':` ${t(`units.${unit}`)}`;
}
/** Localized unit name for headings (no leading space); '' for an unknown unit. */
export const unitLabel=(unit:string,t:(key:string)=>string):string=>KNOWN_UNITS.has(unit)?t(`units.${unit}`):'';
