// src/lib/macro/cn-series.ts
// AKShare call specifications for the active CN series (spec §4.2, §4.4), derived from the catalog's
// source.seriesKey so the catalog stays the single source of truth:
//   macro_china_nbs_nation|<kind>|<tree path> > <indicator>   (indicator = NBS i_showname without whitespace)
//   bond_china_yield|<curve name>|<tenor column>
//   currency_boc_safe|<currency column>
// plus adapter-only parameters (NBS daily window, era leaves for history, ChinaBond windows) and the URL
// path of the one response per call that carries the data (the evidence the TS parsers read). Exported to
// scripts/macro/cn-series.json for the Python collector (scripts/macro/export-cn-series.ts); a Task 9 test
// keeps the committed JSON equal to this module's output.
import {collectableOf} from './catalog';
import type {MacroSeriesDef,PeriodKind} from './types';

export type CnFunction='macro_china_nbs_nation'|'bond_china_yield'|'currency_boc_safe';
export interface CnSeriesSpec{
 series_id:string;function:CnFunction;fetch_host:string;period:PeriodKind;
 /** URL path of the data response; other responses of the call (pages, trees, spreadsheets) are not evidence. */
 evidence_path:string;
 /** NBS: indicator i_showname (whitespace removed); ChinaBond: tenor column header; SAFE: currency column header. */
 column:string;
 kind?:string;path?:string;curve?:string;
 /** NBS: period argument of the daily call. */
 daily_period?:string;
 /** NBS history calls: [{path, period}] (era leaves). */
 backfill?:{path:string;period:string}[];
 /** ChinaBond: daily window length and the first day of the yearly history windows. */
 window_days?:number;backfill_from?:string;
}
export const CN_SPEC_VERSION='cn-series/1';
const NBS_PATH='/dg/website/publicrelease/web/external/stream/esData';
const CHINABOND_PATH='/cbweb-pbc-web/pbc/historyQuery';
const SAFE_PATH='/AppStructured/hlw/RMBQuery.do';
/** NBS splits some tables into era leaves; history comes from the sibling leaves (verified 2026-11-06). */
const NBS_ERA_HISTORY:Record<string,{path:string;period:string}[]>={
 CN_CPI_INDEX:[
  {path:'价格指数 > 居民消费价格分类指数(上年同月=100) > 全国居民消费价格分类指数(上年同月=100)(2021-2025)',period:'2021-2025'},
  {path:'价格指数 > 居民消费价格分类指数(上年同月=100) > 全国居民消费价格分类指数(上年同月=100)(2016-2020)',period:'2016-2020'},
 ],
};
const strip=(s:string)=>s.replace(/\s+/g,'');

export function cnSpecOf(def:MacroSeriesDef):CnSeriesSpec{
 const src=def.source;
 if(!src||src.adapter!=='akshare')throw new Error(`not_akshare:${def.id}`);
 const parts=src.seriesKey.split('|');
 const base={series_id:def.id,fetch_host:src.fetchHost,period:def.period};
 if(parts[0]==='macro_china_nbs_nation'&&parts.length===3){
  const segs=parts[2].split('>').map(s=>s.trim()).filter(Boolean);
  if(segs.length<2)throw new Error(`bad_series_key:${def.id}`);
  const path=segs.slice(0,-1).join(' > ');
  const quarterly=def.period==='quarter';
  return {...base,function:'macro_china_nbs_nation',evidence_path:NBS_PATH,column:strip(segs[segs.length-1]),kind:parts[1],path,
   daily_period:quarterly?'LAST8':'LAST13',backfill:NBS_ERA_HISTORY[def.id]??[{path,period:'2016-'}]};
 }
 if(parts[0]==='bond_china_yield'&&parts.length===3)return {...base,function:'bond_china_yield',evidence_path:CHINABOND_PATH,curve:parts[1],column:parts[2],window_days:45,backfill_from:'2016-01-01'};
 if(parts[0]==='currency_boc_safe'&&parts.length===2)return {...base,function:'currency_boc_safe',evidence_path:SAFE_PATH,column:parts[1]};
 throw new Error(`unsupported_series_key:${def.id}`);
}

/** Specs of every active native akshare series, catalog order. */
export function cnSeriesSpecs():CnSeriesSpec[]{return collectableOf('akshare').map(cnSpecOf);}
/** The JSON document the Python collector reads (stable key order, trailing newline). */
export function cnSeriesDocument():string{return JSON.stringify({version:CN_SPEC_VERSION,series:cnSeriesSpecs()},null,1)+'\n';}
