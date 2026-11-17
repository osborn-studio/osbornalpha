// src/lib/broker-research/extract/locate.ts
// Verbatim quote location and slicing in UTF-16 page offsets (spec §5.2, §4.6). First hit wins;
// every overlapping hit is reported. Surrogate pairs cannot be split.
import {LOCATE_VERSION} from '../versions';
export type PageText={page:number;text:string}[];
export type LocateResult=|{version:string;status:'located';page:number;char_start:number;char_end:number;multiple_hits:number[]|null}|{version:string;status:'unverified';page:number;reason:'page_missing'|'empty_quote'|'not_found'|'splits_surrogate_pair'};
const isHigh=(c:number)=>c>=0xd800&&c<=0xdbff;
const isLow=(c:number)=>c>=0xdc00&&c<=0xdfff;
const insidePair=(t:string,i:number)=>i>0&&i<t.length&&isHigh(t.charCodeAt(i-1))&&isLow(t.charCodeAt(i));
export function pageText(pages:PageText,page:number):string|null{const hits=pages.filter(p=>p.page===page);if(hits.length>1)throw new Error(`duplicate_page:${page}`);return hits[0]?.text??null;}
export function locateQuote(pages:PageText,page:number,quote:string):LocateResult{const miss=(reason:'page_missing'|'empty_quote'|'not_found'|'splits_surrogate_pair'):LocateResult=>({version:LOCATE_VERSION,status:'unverified',page,reason});if(quote.length===0)return miss('empty_quote');const text=pageText(pages,page);if(text===null)return miss('page_missing');const hits:number[]=[];let raw=0;for(let i=text.indexOf(quote);i!==-1;i=text.indexOf(quote,i+1)){raw++;if(!insidePair(text,i)&&!insidePair(text,i+quote.length))hits.push(i);}if(hits.length===0)return miss(raw>0?'splits_surrogate_pair':'not_found');return {version:LOCATE_VERSION,status:'located',page,char_start:hits[0],char_end:hits[0]+quote.length,multiple_hits:hits.length>1?hits:null};}
export function sliceText(pages:PageText,page:number,start:number,end:number):string|null{const text=pageText(pages,page);if(text===null||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>text.length)return null;if(insidePair(text,start)||insidePair(text,end))return null;return text.slice(start,end);}
