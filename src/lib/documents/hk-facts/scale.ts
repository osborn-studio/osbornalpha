// Units and multipliers of HK statements (spec §7.5 step 3). Amounts: the statement's first-page
// title region and first table header block are searched; currency words (港幣/港币/港元/HK$ →
// HKD, 人民幣元/人民币元/人民幣/人民币/RMB → CNY, 美元/US$ → USD; 人民幣元 is taken whole, see plan
// D1 note 4) are removed BEFORE the multiplier search, longest first ('000,000 / 百萬元 / 百萬 /
// million → 1000000; '000 / 千元 / 千 → 1000; 元 / dollars → 1), so 港元 never yields 元. Exactly one
// currency and one multiplier, else the reason (no_currency, no_multiplier, currencies:…,
// multipliers:…) — the caller emits unit_ambiguous and produces no candidate (payload.scale cannot be
// null). Per-share rows never inherit the table multiplier: the row label, then the EPS heading, must
// carry a sub-unit (港仙 / HK cents → HKD 0.01; RMB cents / 人民幣分 → CNY 0.01; 仙 / cents → the
// table currency 0.01; 人民幣元 / RMB → CNY 1; 港元 / HK$ → HKD 1). Units are spec-2 units.ts strings:
// HKD/CNY/USD and <CCY>/share. Amount evidence: the first currency line and the multiplier line,
// cited as one range spanning both (R2-P2-1); per-share evidence the token, plus — when the token
// names no currency (仙 / cents) — the table's amount-unit range (R2-P1-1, the caller cites it).
import type {LayoutLine} from '../types';
import {matchesIn} from './locate';

export type Currency='HKD'|'CNY'|'USD';
export type Scale='1'|'0.01'|'1000'|'1000000';
export interface CiteRange{page_no:number;char_start:number;char_end:number}
/** evidence = the first currency line and the multiplier line (one entry when they coincide); cite = the one range from the first to the last evidence line (same page), so a replay of detectAmountUnit over the cited text reads the same currency and multiplier (codex plan round 2 R2-P2-1). */
export type AmountUnit={ok:true;currency:Currency;scale:Scale;cite:CiteRange;evidence:CiteRange[]}|{ok:false;reason:string};
/** inherited = the token (仙 / cents) names no currency and the table currency was used: the caller must cite the table's amount-unit evidence as well (R2-P1-1). */
export type EpsUnit={ok:true;unit:string;scale:Scale;cite:CiteRange;inherited:boolean}|{ok:false;reason:string};

const CURRENCY_RE=/人民幣元|人民币元|港幣|港币|港元|HK\$|人民幣|人民币|\bRMB\b|美元|US\$/gi;
const currencyOf=(w:string):Currency=>/^(港幣|港币|港元|HK\$)$/i.test(w)?'HKD':/^(美元|US\$)$/i.test(w)?'USD':'CNY';
const MULTIPLIER_RE=/['’]000,000|百萬元|百万元|百萬|百万|\bmillions?\b|['’]000|千元|千|元|\bdollars?\b/gi;
const multiplierOf=(w:string):Scale=>/000,000|百萬|百万|million/i.test(w)?'1000000':/000|千/.test(w)?'1000':'1';
const EPS_SUBUNIT_RE=/港仙|\bHK\s?cents?\b|\bRMB\s?cents?\b|人民幣分|人民币分|人民幣元|人民币元|港元|HK\$|\bRMB\b|仙|\bcents?\b/i;

export function detectAmountUnit(lines:{page_no:number;line:LayoutLine}[]):AmountUnit{
 const currencies=new Set<Currency>();const scales=new Map<Scale,{page_no:number;line:LayoutLine}>();let currencyLine:{page_no:number;line:LayoutLine}|null=null;
 for(const u of lines){
  for(const m of u.line.text.matchAll(CURRENCY_RE)){currencies.add(currencyOf(m[0]));currencyLine??=u;}
  for(const m of u.line.text.replace(CURRENCY_RE,' ').matchAll(MULTIPLIER_RE)){const s=multiplierOf(m[0]);if(!scales.has(s))scales.set(s,u);}
 }
 if(currencies.size>1)return {ok:false,reason:`currencies:${[...currencies].sort().join(',')}`};
 if(currencies.size===0)return {ok:false,reason:'no_currency'};
 if(scales.size>1)return {ok:false,reason:`multipliers:${[...scales.keys()].join(',')}`};
 if(scales.size===0)return {ok:false,reason:'no_multiplier'};
 const [[scale,u]]=[...scales.entries()];
 const used=[currencyLine!,u].filter((x,i,a)=>a.indexOf(x)===i).sort((a,b)=>a.line.char_start-b.line.char_start);
 if(new Set(used.map(x=>x.page_no)).size>1)return {ok:false,reason:'unit_split_pages'};
 const evidence=used.map(x=>({page_no:x.page_no,char_start:x.line.char_start,char_end:x.line.char_end}));
 return {ok:true,currency:[...currencies][0],scale,cite:{page_no:u.page_no,char_start:evidence[0].char_start,char_end:Math.max(...evidence.map(e=>e.char_end))},evidence};
}
export function detectEpsUnit(sources:{page_no:number;text:string;char_start:number}[],tableCurrency:Currency|null):EpsUnit{
 for(const s of sources){
  const m=matchesIn(s.text,EPS_SUBUNIT_RE)[0];
  if(!m)continue;
  const w=m.text;let currency:Currency|null;let scale:Scale;
  if(/^(港仙|HK\s?cents?)$/i.test(w)){currency='HKD';scale='0.01';}
  else if(/^(RMB\s?cents?|人民幣分|人民币分)$/i.test(w)){currency='CNY';scale='0.01';}
  else if(/^(仙|cents?)$/i.test(w)){currency=tableCurrency;scale='0.01';}
  else if(/^(港元|HK\$)$/i.test(w)){currency='HKD';scale='1';}
  else{currency='CNY';scale='1';}                                     // 人民幣元 / 人民币元 / RMB
  if(currency===null)return {ok:false,reason:'eps_currency'};
  return {ok:true,unit:`${currency}/share`,scale,cite:{page_no:s.page_no,char_start:s.char_start+m.start,char_end:s.char_start+m.end},inherited:/^(仙|cents?)$/i.test(w)};
 }
 return {ok:false,reason:'eps_no_subunit'};
}
