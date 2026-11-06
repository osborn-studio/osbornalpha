// src/lib/documents/sources/hkexnews.ts
// HKEXnews list adapter (spec §6.2). fetch_key = 5-digit stock code; prefix.do resolves the stockId
// once per run (the collectors pass the 4-digit form, e.g. 0268, which is what we send); the title
// search returns the whole result table for a date range (parseTitleSearch from collectors/hkexnews.ts,
// which throws layout_changed on drift). A segment is a date range (backfill: calendar year; poll: the
// poll window). Whether the title search caps rows per range is unverified (spec §15 q2): the
// commander records it; if it caps, segments become shorter ranges (a later change). source_ref = the
// PDF file id (…/2026090300863_c.pdf → 2026090300863_c). Both language versions are listed (spec §5.1):
// one Chinese search (lang=zh, _c files) and one English search (lang=en, _e files) per segment, merged.
// The English page is assumed to share the recorded Chinese layout (unverified: the F3-1 verification
// records an English fixture; `languages:['zh']` turns the English search off if it differs).
// form_type and headline = the HKEX headline; published_at = release time (HKT → UTC), 'instant'.
import {HKEX_PREFIX,HKEX_TITLESEARCH,parseTitleSearch} from '../../research/ingest/collectors/hkexnews';
import {classify} from '../classify';
import {PERIODIC_CLASSES,orderListed,pollSegment,yearSegments} from './shared';
import type {Budget,Listed,PoliteHttp,SourceAdapter} from './shared';

export const HKEX_INTERVAL_MS=1000;
export interface HkexnewsAdapterOptions{http:PoliteHttp;allAnnouncements?:boolean;languages?:readonly ('zh'|'en')[]}

/** File id of an HKEX document link: last path segment without its .pdf/.htm/.html extension; null otherwise. */
export function hkexSourceRef(url:string):string|null{
 let path:string;
 try{path=new URL(url).pathname;}catch{return null;}
 return /\/([^/]+)\.(pdf|htm|html)$/i.exec(path)?.[1]??null;
}

export function hkexnewsAdapter(opts:HkexnewsAdapterOptions):SourceAdapter{
 const ids=new Map<string,number>();
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
 return {
  source:'hkexnews',coverageGap:null,
  segments:(scope,mode,sinceYear,now)=>mode==='poll'?[pollSegment(scope,now)]:yearSegments(sinceYear,now),
  async list(scope,seg,budget){
   const stockId=await stockIdOf(scope.fetch_key,budget);
   const out:Listed[]=[];
   for(const lang of opts.languages??['zh','en']){
    const body=new URLSearchParams({lang:lang==='zh'?'ZH':'EN',category:'0',market:'SEHK',searchType:'1',documentType:'-1',t1code:'-2',t2Gcode:'-2',t2code:'-2',stockId:String(stockId),
     from:seg.from.replace(/-/g,''),to:seg.to.replace(/-/g,''),'MB-Daterange':'0',title:''}).toString();
    const rows=parseTitleSearch(await opts.http.postForm(lang==='zh'?HKEX_TITLESEARCH:HKEX_TITLESEARCH.replace('lang=zh','lang=en'),body,budget));
    for(const r of rows){
     const ref=hkexSourceRef(r.document_url);
     if(!ref)continue;
     if(!opts.allAnnouncements&&!PERIODIC_CLASSES.has(classify('hkexnews',{form_type:r.headline,headline:r.headline,title:r.title,source_ref:ref}).doc_class))continue;
     out.push({source_ref:ref,source_url:r.document_url,title:r.title,form_type:r.headline||null,headline:r.headline,published_at:r.released_at,precision:'instant'});
    }
   }
   return orderListed(out);
  },
 };
}
