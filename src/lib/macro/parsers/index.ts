// src/lib/macro/parsers/index.ts
// Parser registry for CN evidence (spec §4.4: the server never trusts Python numbers — it re-reads the value
// from the evidence bytes with these TS parsers). parserFor(seriesId) returns the series' call spec, the parser
// bound to it and the parser version (recorded in the retrieval's tool_versions); null for anything that is not
// an active native akshare series. claimPeriodEnd maps an AKShare DataFrame column label to period_end.
import {catalogById} from '../catalog';
import {cnSpecOf} from '../cn-series';
import type {CnSeriesSpec} from '../cn-series';
import {monthEnd,quarterEnd,isIsoDate} from '../periods';
import type {ParsedPoint,PeriodKind} from '../types';
import {CHINABOND_PARSER_VERSION,parseChinabondHistory} from './chinabond';
import {NBS_PARSER_VERSION,parseNbsEsData} from './nbs';
import {SAFE_PARSER_VERSION,parseSafeCentralParity} from './safe';

export interface CnParser{spec:CnSeriesSpec;version:string;parse:(bytes:Uint8Array)=>ParsedPoint[]}

export function parserFor(seriesId:string):CnParser|null{
 const def=catalogById(seriesId);
 if(!def||def.status!=='active'||def.derive||def.aliasOf||def.source?.adapter!=='akshare')return null;
 const spec=cnSpecOf(def);
 switch(spec.function){
  case 'macro_china_nbs_nation':return {spec,version:NBS_PARSER_VERSION,parse:b=>parseNbsEsData(b,{seriesId,indicator:spec.column,period:spec.period})};
  case 'bond_china_yield':return {spec,version:CHINABOND_PARSER_VERSION,parse:b=>parseChinabondHistory(b,{seriesId,curve:spec.curve!,column:spec.column})};
  case 'currency_boc_safe':return {spec,version:SAFE_PARSER_VERSION,parse:b=>parseSafeCentralParity(b,{seriesId,column:spec.column})};
 }
}

const QUARTERS:Record<string,number>={'一':1,'二':2,'三':3,'四':4};
/** '2026年9月' (month), '2026年第三季度' (quarter), 'YYYY-MM-DD' (day) → period_end; anything else → null. */
export function claimPeriodEnd(label:string,period:PeriodKind):string|null{
 const s=label.replace(/\s+/g,'');
 if(period==='month'){const m=/^(\d{4})年(\d{1,2})月$/.exec(s);return m&&Number(m[2])>=1&&Number(m[2])<=12?monthEnd(Number(m[1]),Number(m[2])):null;}
 if(period==='quarter'){const q=/^(\d{4})年第([一二三四])季度$/.exec(s);return q?quarterEnd(Number(q[1]),QUARTERS[q[2]]):null;}
 return isIsoDate(s)?s:null;
}
