// Display-only definitions: excluded from the regime catalog and its formula closure.
import type {MacroSeriesDef,NativeFrequency,Bilingual,SeriesSource} from './types';
import {canonicalJson,sha256HexSync} from './catalog';
export type DisplayFrequency=NativeFrequency|'weekly';
export interface DisplaySeriesDef extends Omit<MacroSeriesDef,'nativeFrequency'|'weight'>{nativeFrequency:DisplayFrequency;weight:0;firstPeriod?:string}
export type AnySeriesDef=MacroSeriesDef|DisplaySeriesDef;
const FED:Bilingual={zh:'美国联邦储备委员会',en:'Board of Governors of the Federal Reserve System'};
const NYFED:Bilingual={zh:'纽约联邦储备银行',en:'Federal Reserve Bank of New York'};
const fred=(seriesKey:string,publisher:Bilingual):SeriesSource=>({adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher,via:{zh:'FRED（圣路易斯联储）',en:'FRED (Federal Reserve Bank of St. Louis)'},seriesKey,rights:'public_domain',attribution:{zh:`来源：${publisher.zh}，经 FRED（圣路易斯联储）`,en:`Source: ${publisher.en}, retrieved from FRED, Federal Reserve Bank of St. Louis`}});
const WALCL=fred('WALCL',FED),RRP=fred('RRPONTSYD',NYFED),WTREGEN=fred('WTREGEN',FED);
const rows:DisplaySeriesDef[]=[
 {id:'US_WALCL_W',region:'US',role:'indicator',type:null,name:{zh:'联储总资产（周三水平，周）',en:'Fed total assets, Wednesday level (weekly)'},unit:'usd_mn',nativeFrequency:'weekly',period:'day',adjustment:'na',status:'active',source:WALCL,revisionPolicy:'revisable',weight:0,changeKind:'pct',definitionVersion:1,firstPeriod:'2002-12-18',releaseLagDays:1},
 {id:'US_WALCL',region:'US',role:'indicator',type:null,name:{zh:'联储总资产（月内最后一次周观测）',en:'Fed total assets (last weekly observation of the month)'},unit:'usd_mn',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:WALCL,revisionPolicy:'revisable',weight:0,changeKind:'pct',definitionVersion:1,derive:{kind:'month_end',from:'US_WALCL_W'}},
 {id:'US_RRPONTSYD_D',region:'US',role:'indicator',type:null,name:{zh:'隔夜逆回购成交额（国债，日）',en:'Overnight reverse repo, Treasury securities sold (daily amount)'},unit:'usd_bn',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:RRP,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1,firstPeriod:'2003-02-07'},
 {id:'US_RRPONTSYD',region:'US',role:'indicator',type:null,name:{zh:'隔夜逆回购成交额（月内最后一个操作日）',en:'Overnight reverse repo amount (last operation day of the month)'},unit:'usd_bn',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:RRP,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1,derive:{kind:'month_end',from:'US_RRPONTSYD_D'}},
 {id:'US_WTREGEN_W',region:'US',role:'indicator',type:null,name:{zh:'财政部一般账户（周平均，以周三标记）',en:'Treasury General Account, week average (dated Wednesday)'},unit:'usd_mn',nativeFrequency:'weekly',period:'day',adjustment:'na',status:'active',source:WTREGEN,revisionPolicy:'revisable',weight:0,changeKind:'pct',definitionVersion:1,firstPeriod:'2002-12-18',releaseLagDays:1},
 {id:'US_WTREGEN',region:'US',role:'indicator',type:null,name:{zh:'财政部一般账户（月内最后一次周平均观测）',en:'Treasury General Account (last weekly average of the month)'},unit:'usd_mn',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:WTREGEN,revisionPolicy:'revisable',weight:0,changeKind:'pct',definitionVersion:1,derive:{kind:'month_end',from:'US_WTREGEN_W'}},
];
function deepFreeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
export const DISPLAY_CATALOG:readonly DisplaySeriesDef[]=deepFreeze(rows);
export const DISPLAY_CATALOG_VERSION=`macro-catalog/${sha256HexSync(canonicalJson(DISPLAY_CATALOG)).slice(0,12)}`;
