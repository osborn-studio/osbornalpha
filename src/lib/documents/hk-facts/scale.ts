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
export type EpsUnit={ok:true;unit:string;scale:Scale;cite:CiteRange;inherited:boolean;/** inherited from explicit currency evidence that is not contiguous with the sub-unit token: cited as unit_currency instead of the table's amount unit */currencyCite?:CiteRange}|{ok:false;reason:string};

const CURRENCY_RE=/人民幣元|人民币元|港幣|港币|港元|HK\$|人民幣|人民币|\bRMB\b|美元|US\$/gi;
const currencyOf=(w:string):Currency=>/^(港幣|港币|港元|HK\$)$/i.test(w)?'HKD':/^(美元|US\$)$/i.test(w)?'USD':'CNY';
const MULTIPLIER_RE=/['’]000,000|百萬元|百万元|百萬|百万|\bmillions?\b|['’]000|千元|千|元|\bdollars?\b/gi;
const multiplierOf=(w:string):Scale=>/000,000|百萬|百万|million/i.test(w)?'1000000':/000|千/.test(w)?'1000':'1';

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
// Per-share evidence is resolved across ALL the EPS evidence lines (the row label, the lines of the EPS
// section) before a unit is decided: complete currency-qualified sub-units (港仙 / HK cents / US cents /
// RMB cents / 人民幣分) are final; a bare sub-unit (仙 / cents / （分）) takes its currency from explicit
// currency words in the same evidence, else from the table currency (inherited); a currency word alone
// is a whole-unit EPS (scale 1). Unsupported qualifiers (EUR cents) and conflicting currencies refuse.
const EPS_TOKEN_RE=/港仙|\b([A-Z]{2,4})\s?cents?\b|人民幣分|人民币分|[（(]\s*分\s*[）)]|以每股分計|以每股分计|仙|\bcents?\b|人民幣元|人民币元|港元|HK\$|US\$|美元|\bRMB\b|人民幣|人民币|\bHKD\b|\bUSD\b|\bCNY\b/g;
const QUALIFIER:Record<string,Currency>={HK:'HKD',HKD:'HKD',US:'USD',USD:'USD',RMB:'CNY',CNY:'CNY'};
interface EpsSource{page_no:number;text:string;char_start:number}
type EpsHit={kind:'complete';currency:Currency;range:CiteRange}|{kind:'bare';range:CiteRange}|{kind:'currency';currency:Currency;range:CiteRange}|{kind:'unsupported';word:string};
function epsHits(sources:EpsSource[]):{hit:EpsHit;src:EpsSource}[]{
 const out:{hit:EpsHit;src:EpsSource}[]=[];
 for(const src of sources){
  for(const m of matchesIn(src.text,EPS_TOKEN_RE)){
   const w=m.text;const range={page_no:src.page_no,char_start:src.char_start+m.start,char_end:src.char_start+m.end};
   let hit:EpsHit;
   if(m.groups[0]!==undefined){const c=QUALIFIER[m.groups[0]];hit=c?{kind:'complete',currency:c,range}:{kind:'unsupported',word:m.groups[0]};}
   else if(/^港仙$/.test(w))hit={kind:'complete',currency:'HKD',range};
   else if(/^(人民幣分|人民币分)$/.test(w))hit={kind:'complete',currency:'CNY',range};
   else if(/^(仙|cents?|[（(]\s*分\s*[）)]|以每股分計|以每股分计)$/i.test(w))hit={kind:'bare',range};
   else hit={kind:'currency',currency:/^(港元|HK\$|HKD)$/.test(w)?'HKD':/^(美元|US\$|USD)$/.test(w)?'USD':'CNY',range};
   out.push({hit,src});
  }
 }
 return out;
}
const cpLen=(s:string)=>Array.from(s).length;
export function detectEpsUnit(sources:EpsSource[],tableCurrency:Currency|null):EpsUnit{
 const hits=epsHits(sources);
 const bad=hits.find(h=>h.hit.kind==='unsupported');
 if(bad&&bad.hit.kind==='unsupported')return {ok:false,reason:`eps_qualifier:${bad.hit.word}`};
 const currencies=new Set<Currency>();
 for(const {hit} of hits)if(hit.kind==='complete'||hit.kind==='currency')currencies.add(hit.currency);
 if(currencies.size>1)return {ok:false,reason:`eps_currencies:${[...currencies].sort().join(',')}`};
 const complete=hits.find(h=>h.hit.kind==='complete');
 if(complete&&complete.hit.kind==='complete')return {ok:true,unit:`${complete.hit.currency}/share`,scale:'0.01',cite:complete.hit.range,inherited:false};
 type Found<K extends EpsHit['kind']>={hit:Extract<EpsHit,{kind:K}>;src:EpsSource};
 const pick=<K extends 'bare'|'currency'>(k:K):Found<K>|undefined=>{for(const h of hits)if(h.hit.kind===k)return h as Found<K>;return undefined;};
 const bare=pick('bare'),explicit=pick('currency');
 if(bare){
  if(explicit){
   const a=explicit,b=bare;const cur=explicit.hit.currency;
   const end=(x:{src:EpsSource})=>x.src.char_start+cpLen(x.src.text);
   const adjacent=a.src.page_no===b.src.page_no&&(a.src===b.src||end(a)+1===b.src.char_start||end(b)+1===a.src.char_start);
   if(adjacent){
    const lo=Math.min(a.hit.range.char_start,b.hit.range.char_start),hi=Math.max(a.hit.range.char_end,b.hit.range.char_end);
    return {ok:true,unit:`${cur}/share`,scale:'0.01',cite:{page_no:b.src.page_no,char_start:lo,char_end:hi},inherited:false};
   }
   return {ok:true,unit:`${cur}/share`,scale:'0.01',cite:b.hit.range,inherited:true,currencyCite:a.hit.range};
  }
  if(tableCurrency===null)return {ok:false,reason:'eps_currency'};
  return {ok:true,unit:`${tableCurrency}/share`,scale:'0.01',cite:bare.hit.range,inherited:true};
 }
 if(explicit)return {ok:true,unit:`${explicit.hit.currency}/share`,scale:'1',cite:explicit.hit.range,inherited:false};
 return {ok:false,reason:'eps_no_subunit'};
}
