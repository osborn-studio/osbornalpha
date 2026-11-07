// src/lib/broker-research/extract/typed.ts
// Evidence conversion and currency marks (spec §5.3, §5.2). Failed conversion preserves source
// text and clears typed components. Prices never infer a currency from their amount text.
import {canonicalDecimal} from '../../facts/json-numbers';
import {dec,decShift,decString} from '../decimal';
import type {FieldName,TypedValue} from '../types';
export const CURRENCY_MARKS:Readonly<Record<string,string>>=Object.freeze({'US$':'USD','USD':'USD','美元':'USD','美金':'USD','HK$':'HKD','HKD':'HKD','港元':'HKD','港币':'HKD','港幣':'HKD','RMB':'CNY','CNY':'CNY','CN¥':'CNY','人民币':'CNY','人民幣':'CNY'});
const KNOWN_ISO=new Set(Object.values(CURRENCY_MARKS));
const MARKS_LONGEST_FIRST=Object.keys(CURRENCY_MARKS).sort((a,b)=>b.length-a.length);
export type TypedFailure='not_a_number'|'not_a_percentage'|'not_months'|'not_a_date'|'unknown_currency'|'currency_mark_mismatch';
export interface TypedResult{value:TypedValue;failure:TypedFailure|null}
const PRICE_FIELDS:readonly FieldName[]=['target_price','price_at_report'];
const CURRENCY_FIELDS:readonly FieldName[]=['target_currency','price_currency'];
const PCT_FIELDS:readonly FieldName[]=['upside_stated','wacc','terminal_growth','terminal_value_share'];
const DATE_FIELDS:readonly FieldName[]=['published_date','price_as_of_date'];
const upperAscii=(s:string)=>s.replace(/[a-z]/g,c=>c.toUpperCase());
const clean=(s:string)=>s.normalize('NFKC').replace(/−/g,'-').trim();
const plain=(value_text:string,failure:TypedFailure|null=null):TypedResult=>({value:{value_text,value_num:null,value_currency:null,value_unit:null,value_date:null},failure});
export function currencyMarksIn(s:string):Set<string>{const t=upperAscii(clean(s)),out=new Set<string>();for(let i=0;i<t.length;){const m=MARKS_LONGEST_FIRST.find(k=>t.startsWith(k,i));if(m){out.add(CURRENCY_MARKS[m]);i+=m.length;}else i++;}return out;}
const NUMBER=/^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/;
function parseNumber(s:string):string|null{const m=NUMBER.exec(s);return m?canonicalDecimal(`${m[1]==='-'?'-':''}${m[2].replace(/,/g,'')}${m[3]??''}`):null;}
function parsePrice(s:string):string|null{let t=upperAscii(clean(s));for(const m of MARKS_LONGEST_FIRST)t=t.split(m).join('');return parseNumber(t.replace(/[$¥元]/g,'').replace(/\s+/g,''));}
function parsePct(s:string):string|null{const m=/^(.*?)\s*%$/.exec(clean(s)),n=m?parseNumber(m[1].replace(/\s+/g,'')):null;return n===null?null:decString(decShift(dec(n),-2));}
const CN_HORIZON:Readonly<Record<string,number>>={'半年':6,'一年':12,'两年':24,'二年':24,'兩年':24};
function parseMonths(s:string):string|null{const t=clean(s);if(CN_HORIZON[t]!==undefined)return String(CN_HORIZON[t]);const mo=/^(\d{1,3})\s*-?\s*(?:months?|mos?|个月|個月)$/i.exec(t);if(mo)return canonicalDecimal(mo[1]);const yr=/^(\d{1,2})\s*-?\s*(?:years?|yrs?|年)$/i.exec(t);return yr?String(Number(yr[1])*12):null;}
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function monthIndex(name:string):number|null{const n=name.toLowerCase().replace(/\.$/,'');const i=MONTHS.indexOf(n.slice(0,3));if(i<0)return null;const full=['january','february','march','april','may','june','july','august','september','october','november','december'][i];return n.length===3||n===full||(i===8&&n==='sept')?i+1:null;}
function isoDate(y:number,m:number,d:number):string|null{const iso=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,ms=Date.parse(`${iso}T00:00:00Z`);return Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==iso?null:iso;}
function parseDate(s:string):string|null{const t=clean(s).replace(/\s+/g,' ');let m=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)??/^(\d{4}) ?年 ?(\d{1,2}) ?月 ?(\d{1,2}) ?日$/.exec(t);if(m)return isoDate(Number(m[1]),Number(m[2]),Number(m[3]));m=/^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+\.?),? (\d{4})$/.exec(t);if(m){const mi=monthIndex(m[2]);return mi?isoDate(Number(m[3]),mi,Number(m[1])):null;}m=/^([A-Za-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(t);if(m){const mi=monthIndex(m[1]);return mi?isoDate(Number(m[3]),mi,Number(m[2])):null;}return null;}
export function toTyped(field:FieldName,valueText:string,quote?:string):TypedResult{
 if(PRICE_FIELDS.includes(field)){const n=parsePrice(valueText);return n===null?plain(valueText,'not_a_number'):{value:{value_text:n,value_num:n,value_currency:null,value_unit:'price',value_date:null},failure:null};}
 if(CURRENCY_FIELDS.includes(field)){const v=upperAscii(clean(valueText)),iso=/^[A-Z]{3}$/.test(v)?v:CURRENCY_MARKS[v];if(!iso||!KNOWN_ISO.has(iso))return plain(valueText,'unknown_currency');if(quote!==undefined){const marks=currencyMarksIn(quote);if(marks.size!==1||!marks.has(iso))return plain(valueText,'currency_mark_mismatch');}return {value:{value_text:iso,value_num:null,value_currency:iso,value_unit:null,value_date:null},failure:null};}
 if(PCT_FIELDS.includes(field)){const n=parsePct(valueText);return n===null?plain(valueText,'not_a_percentage'):{value:{value_text:valueText,value_num:n,value_currency:null,value_unit:'pct',value_date:null},failure:null};}
 if(field==='target_horizon'){const n=parseMonths(valueText);return n===null?plain(valueText,'not_months'):{value:{value_text:valueText,value_num:n,value_currency:null,value_unit:'months',value_date:null},failure:null};}
 if(DATE_FIELDS.includes(field)){const d=parseDate(valueText);return d===null?plain(valueText,'not_a_date'):{value:{value_text:valueText,value_num:null,value_currency:null,value_unit:null,value_date:d},failure:null};}
 return plain(valueText);
}
