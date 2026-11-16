// src/lib/documents/sources/hkexnews.ts
// HKEXnews list adapter (spec §6.2). fetch_key = 5-digit stock code; prefix.do resolves the stockId
// once per run (the collectors pass the 4-digit form, e.g. 0268, which is what we send); the title
// search returns the whole result table for a date range (parseTitleSearch from collectors/hkexnews.ts,
// which throws layout_changed on drift). A segment is a date range (backfill: calendar year; poll: the
// poll window). Whether the title search caps rows per range is unverified (spec §15 q2): the
// commander records it; if it caps, segments become shorter ranges (a later change). source_ref = the
// PDF file id (…/2026090300863_c.pdf → 2026090300863_c). Both language versions are listed (spec §5.1):
// one Chinese search (lang=zh, _c files) and one English search (lang=en, _e files) per segment, merged.
// UNVERIFIED (commander step b): the English path has no recorded lang=en page — the test server derives it from the
// Chinese fixture by renaming _c.pdf to _e.pdf, which proves neither English titles/headlines nor real _e URLs.
// Treat English listing as unverified until a real lang=en page is recorded.
// Completeness: the result page states `total-records`; fewer parsed rows than that (the search may cap rows per
// range) splits the date window, and a single day that is still short throws hkex_truncated. A <tr> that fails
// to parse throws layout_changed. t1code stays -2 (all categories): the financial-statements code (40000) and the
// results-announcement codes cannot be confirmed from the collectors or fixtures offline, so the periodic filter is
// the classifier and the truncation check carries completeness.
// The English page is assumed to share the recorded Chinese layout (unverified: the F3-1 verification
// records an English fixture; `languages:['zh']` turns the English search off if it differs).
// form_type and headline = the HKEX headline; published_at = release time (HKT → UTC), 'instant'.
import {HKEX_PREFIX,HKEX_TITLESEARCH,parseTitleSearch} from '../../research/ingest/collectors/hkexnews';
import {classify} from '../classify';
import {HOST_POLICY,PERIODIC_CLASSES,orderListed,pollSegment,urlRejection,yearSegments} from './shared';
import type {HkexRow} from '../../research/ingest/collectors/hkexnews';
import type {Budget,Listed,PoliteHttp,Rejection,Segment,SourceAdapter} from './shared';

export const HKEX_INTERVAL_MS=1000;
export interface HkexnewsAdapterOptions{http:PoliteHttp;allAnnouncements?:boolean;languages?:readonly ('zh'|'en')[]}

/** File id of an HKEX document link: last path segment without its .pdf/.htm/.html extension; null otherwise. */
export function hkexSourceRef(url:string):string|null{
 let path:string;
 try{path=new URL(url).pathname;}catch{return null;}
 return /\/([^/]+)\.(pdf|htm|html)$/i.exec(path)?.[1]??null;
}

/** Rows of the result table (<tr> in <tbody>) and the advertised total; either missing is layout drift. */
function tableCounts(html:string):{trs:number;total:number}{
 const tbody=/<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
 const tot=/total-records[^>]*>([^<]*)</i.exec(html);
 const digits=tot?/(\d[\d,]*)/.exec(tot[1]):null;
 if(!tbody||!digits)throw new Error('layout_changed: total-records not found');
 return {trs:tbody[1].split(/<tr[^>]*>/i).length-1,total:Number(digits[1].replace(/,/g,''))};
}
const dayNo=(d:string)=>Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10))/86_400_000;
const dayStr=(n:number)=>new Date(n*86_400_000).toISOString().slice(0,10);

export function hkexnewsAdapter(opts:HkexnewsAdapterOptions):SourceAdapter{
 const ids=new Map<string,number>();
 const rejected:Rejection[]=[];
 const stockIdOf=async(code:string,budget:Budget):Promise<number>=>{
  if(!/^\d{5}$/.test(code))throw new Error('invalid_fetch_key');
  const hit=ids.get(code);if(hit!==undefined)return hit;
  const name=String(Number(code)).padStart(4,'0');
  const text=await opts.http.getText(`${HKEX_PREFIX}?callback=callback&lang=ZH&type=A&name=${name}&market=SEHK`,budget);
  const json=JSON.parse(text.replace(/^[^(]*\(/,'').replace(/\);?\s*$/,'')) as {stockInfo?:{stockId?:unknown;code?:unknown}[]};
  const row=json.stockInfo?.find(s=>Number(s.code)===Number(code)&&typeof s.stockId==='number');
  if(!row)throw new Error('hkex_stock_unresolved');
  ids.set(code,row.stockId as number);
  return row.stockId as number;
 };
 /** One language, one date range; splits the range while the page shows fewer rows than it advertises. */
 const searchWindow=async(lang:'zh'|'en',stockId:number,from:string,to:string,budget:Budget):Promise<HkexRow[]>=>{
  const body=new URLSearchParams({lang:lang==='zh'?'ZH':'EN',category:'0',market:'SEHK',searchType:'1',documentType:'-1',t1code:'-2',t2Gcode:'-2',t2code:'-2',stockId:String(stockId),
   from:from.replace(/-/g,''),to:to.replace(/-/g,''),'MB-Daterange':'0',title:''}).toString();
  const html=await opts.http.postForm(lang==='zh'?HKEX_TITLESEARCH:HKEX_TITLESEARCH.replace('lang=zh','lang=en'),body,budget);
  const rows=parseTitleSearch(html);
  const {trs,total}=tableCounts(html);
  if(rows.length!==trs)throw new Error(`layout_changed: ${trs-rows.length} result row(s) failed to parse`);
  if(rows.length>total)throw new Error('layout_changed: more rows than total-records');
  if(rows.length===total)return rows;
  const lo=dayNo(from),hi=dayNo(to);
  if(lo>=hi)throw new Error(`hkex_truncated: ${from} shows ${rows.length} of ${total}`);
  const mid=Math.floor((lo+hi)/2);
  return [...await searchWindow(lang,stockId,from,dayStr(mid),budget),...await searchWindow(lang,stockId,dayStr(mid+1),to,budget)];
 };
 return {
  source:'hkexnews',rejected,coverageGap:null,
  segments:(scope,mode,sinceYear,now)=>mode==='poll'?[pollSegment(scope,now)]:yearSegments(sinceYear,now),
  async list(scope,seg:Segment,budget){
   const stockId=await stockIdOf(scope.fetch_key,budget);
   const out:Listed[]=[];
   for(const lang of opts.languages??['zh','en']){
    for(const r of await searchWindow(lang,stockId,seg.from,seg.to,budget)){
     const ref=hkexSourceRef(r.document_url);
     if(!ref)continue;
     const bad=urlRejection(r.document_url,HOST_POLICY.hkexnews);
     if(bad!==null){rejected.push({source_ref:ref,url:r.document_url,reason:bad});continue;}
     if(!opts.allAnnouncements&&!PERIODIC_CLASSES.has(classify('hkexnews',{form_type:r.headline,headline:r.headline,title:r.title,source_ref:ref}).doc_class))continue;
     out.push({source_ref:ref,source_url:r.document_url,title:r.title,form_type:r.headline||null,headline:r.headline,published_at:r.released_at,precision:'instant'});
    }
   }
   return orderListed(out);
  },
 };
}
