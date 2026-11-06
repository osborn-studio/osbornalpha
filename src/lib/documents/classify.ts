// src/lib/documents/classify.ts
// Document classification (spec §5.4). classify(source, input) maps one listed item to doc_class,
// fiscal_year / fiscal_period / period_end, filing_source_ref and language. Pure: no I/O. A rule
// change bumps CLASSIFIER_GEN (types.ts) and old rows are reclassified through reclassify_document.
//  edgar:    form → class; fiscal fields null; filing_source_ref = accession (source_ref before '/'); 'en'.
//  cninfo:   title keywords with exclusions (摘要|英文|更正|已取消|补充); fiscal_year = the single
//            four-digit year before 年 in the title; period_end by class; 'zh'.
//  hkexnews: headline keywords (title when the headline is empty); period from a 截至…止 /
//            "for the … ended …" phrase in the title (cnDate), else null; language from the _c/_e
//            suffix of source_ref. filing_source_ref stays null (the HK filing ref carries the
//            document version, spec §4.9; it is bound by the promotion step, not here).
// cnDate(s) finds the FIRST date in s written as 二零二五年十二月三十一日 / 二〇二五年… /
// 2025年12月31日 / 31 December 2025 / December 31, 2025 (NFKC first, so full-width digits work)
// and returns it as an ISO date, null when none or the calendar date is invalid.
import {CLASSIFIER_GEN} from './types';
import type {DocClass,FiscalPeriod,ListedSource} from './types';

export {CLASSIFIER_GEN};
export interface ClassifyInput{form_type?:string|null;title:string;headline?:string|null;source_ref:string}
export interface Classified{doc_class:DocClass;fiscal_year:number|null;fiscal_period:FiscalPeriod|null;period_end:string|null;filing_source_ref:string|null;language:'zh'|'en'|null}

const CN_DIGIT:Record<string,number>={'零':0,'〇':0,'○':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
/** 一..九, 十, 十二, 二十, 三十一 → 1..31; null for anything else. */
function cnSmall(s:string):number|null{
 if(/^[一二三四五六七八九]$/.test(s))return CN_DIGIT[s];
 const m=/^([一二三])?十([一二三四五六七八九])?$/.exec(s);
 if(!m)return null;
 return (m[1]?CN_DIGIT[m[1]]:1)*10+(m[2]?CN_DIGIT[m[2]]:0);
}
const pad=(n:number)=>String(n).padStart(2,'0');
function isoOf(y:number,m:number,d:number):string|null{
 if(!Number.isInteger(y)||y<1900||y>2999||m<1||m>12||d<1||d>31)return null;
 const t=new Date(Date.UTC(y,m-1,d));
 if(t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)return null;
 return `${y}-${pad(m)}-${pad(d)}`;
}
const DATE_PATTERNS:{re:RegExp;parse:(m:RegExpExecArray)=>string|null}[]=[
 {re:/([零〇○一二三四五六七八九]{4})\s*年\s*([一二三四五六七八九十]{1,3})\s*月\s*([一二三四五六七八九十]{1,3})\s*日/,
  parse:m=>{const y=Number([...m[1]].map(c=>CN_DIGIT[c]).join(''));const mo=cnSmall(m[2]),d=cnSmall(m[3]);return mo===null||d===null?null:isoOf(y,mo,d);}},
 {re:/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,parse:m=>isoOf(Number(m[1]),Number(m[2]),Number(m[3]))},
 {re:/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})\b/i,
  parse:m=>isoOf(Number(m[3]),MONTHS.indexOf(m[2].toLowerCase())+1,Number(m[1]))},
 {re:/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
  parse:m=>isoOf(Number(m[3]),MONTHS.indexOf(m[1].toLowerCase())+1,Number(m[2]))},
];
/** First date in `s` (earliest position across all patterns) as YYYY-MM-DD; null when none parses. */
export function cnDate(s:string):string|null{
 const text=s.normalize('NFKC');
 let best:{at:number;iso:string|null}|null=null;
 for(const p of DATE_PATTERNS){
  const m=p.re.exec(text);
  if(m&&(best===null||m.index<best.at))best={at:m.index,iso:p.parse(m)};
 }
 return best?.iso??null;
}

const EDGAR_CLASS:[RegExp,DocClass][]=[
 [/^(10-K|20-F|40-F|10-K\/A|20-F\/A)$/,'annual_report'],
 [/^(10-Q|10-Q\/A)$/,'quarterly_report'],
 [/^(8-K|8-K\/A|6-K)$/,'current_report'],
 [/^(S-1|424B.*)$/,'registration'],
 [/^DEF 14A$/,'proxy'],
 // SCHEDULE 13D/13G is EDGAR's current name for the SC 13D/13G forms (and their amendments).
 [/^(SC|SCHEDULE) 13[DG](\/A)?$/,'ownership'],
];
const NONE={fiscal_year:null,fiscal_period:null,period_end:null} as const;

function classifyEdgar(i:ClassifyInput):Classified{
 const form=(i.form_type??'').trim().toUpperCase().replace(/\s+/g,' ');
 const hit=EDGAR_CLASS.find(([re])=>re.test(form));
 const accn=i.source_ref.split('/')[0];
 return {doc_class:hit?hit[1]:'other',...NONE,filing_source_ref:accn||null,language:'en'};
}

const CN_EXCLUDE=/摘要|英文|更正|已取消|补充/;
function classifyCninfo(i:ClassifyInput):Classified{
 const t=i.title.normalize('NFKC');
 const years=[...new Set([...t.matchAll(/((?:19|20)\d{2})\s*年/g)].map(m=>Number(m[1])))];
 const year=years.length===1?years[0]:null;
 const periodic=(doc_class:DocClass,fiscal_period:FiscalPeriod,mmdd:string):Classified=>({doc_class,fiscal_year:year,fiscal_period:year===null?null:fiscal_period,period_end:year===null?null:`${year}-${mmdd}`,filing_source_ref:null,language:'zh'});
 const excluded=CN_EXCLUDE.test(t);
 if(!excluded&&t.includes('半年度报告'))return periodic('interim_report','H1','06-30');
 if(!excluded&&t.includes('年度报告')&&!t.includes('半年'))return periodic('annual_report','FY','12-31');
 if(!excluded&&/第?一季度报告/.test(t))return periodic('quarterly_report','Q1','03-31');
 if(!excluded&&/第?三季度报告/.test(t))return periodic('quarterly_report','Q3','09-30');
 if(/业绩快报|业绩预告/.test(t))return {doc_class:'results_announcement',fiscal_year:year,fiscal_period:null,period_end:null,filing_source_ref:null,language:'zh'};
 return {doc_class:'other',...NONE,filing_source_ref:null,language:'zh'};
}

function hkClass(text:string):DocClass{
 if(/年報|年报|Annual Report/i.test(text))return 'annual_report';
 if(/中期\/半年度報告|中期報告|半年度報告|中期报告|半年度报告|Interim Report|Interim\/Half-Year Report|Half-Year Report/i.test(text))return 'interim_report';
 if(/季度報告|季度报告|Quarterly Report/i.test(text))return 'quarterly_report';
 if(/業績公告|全年業績|中期業績|业绩公告|全年业绩|中期业绩|Results Announcement|Final Results|Interim Results/i.test(text))return 'results_announcement';
 return 'other';
}
/** The reporting period phrase of an HKEX title: 截至<date>止(年度|六個月) or "for the (year|six months) ended <date>". */
function hkPeriod(title:string):{end:string;duration:'FY'|'H1'|null}|null{
 const t=title.normalize('NFKC');
 const zh=/截至\s*(.+?)\s*止\s*(年度|六個月|六个月)?/.exec(t);
 if(zh){const end=cnDate(zh[1]);if(end)return {end,duration:zh[2]==='年度'?'FY':zh[2]?'H1':null};}
 const en=/for the\s+(year|six months|six-month period|period)\s+ended\s+(.+)$/i.exec(t);
 if(en){const end=cnDate(en[2]);if(end)return {end,duration:/^year$/i.test(en[1])?'FY':/six/i.test(en[1])?'H1':null};}
 return null;
}
const HK_PERIODIC=new Set<DocClass>(['annual_report','interim_report','quarterly_report','results_announcement']);
function classifyHkex(i:ClassifyInput):Classified{
 const head=(i.headline??'').trim();
 const doc_class=hkClass(head.length>0?head:i.title);
 const language=/_c$/i.test(i.source_ref)?'zh':/_e$/i.test(i.source_ref)?'en':null;
 const p=HK_PERIODIC.has(doc_class)?hkPeriod(i.title):null;
 if(!p)return {doc_class,...NONE,filing_source_ref:null,language};
 const fiscal_period:FiscalPeriod|null=p.duration??(doc_class==='annual_report'?'FY':doc_class==='interim_report'?'H1':null);
 return {doc_class,fiscal_year:Number(p.end.slice(0,4)),fiscal_period,period_end:p.end,filing_source_ref:null,language};
}

export function classify(source:ListedSource,input:ClassifyInput):Classified{
 if(source==='edgar')return classifyEdgar(input);
 if(source==='cninfo')return classifyCninfo(input);
 return classifyHkex(input);
}
