// src/lib/documents/classify.ts
// Document classification (spec §5.4). classify(source, input) maps one listed item to doc_class,
// fiscal_year / fiscal_period / period_end, filing_source_ref and language. Pure: no I/O. A rule
// change bumps CLASSIFIER_GEN (types.ts) and old rows are reclassified through reclassify_document.
//  edgar:    form → class; fiscal fields null; filing_source_ref = accession (source_ref before '/'); 'en'.
//  cninfo:   title keywords with exclusions (摘要|英文|更正|已取消|补充); fiscal_year = the single
//            four-digit year before 年 in the title; period_end by class; 'zh'.
//  hkexnews: headline keywords (title when the headline is empty); period from a 截至…止 /
//            "for the … ended …" phrase in the title (cnDate), else null; language 'en' for an _e suffix, else 'zh' (a
//            file without a suffix is a bilingual PDF). filing_source_ref stays null (the HK filing ref carries the
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
 [/^(10-K|20-F|40-F|10-K\/A|20-F\/A|40-F\/A)$/,'annual_report'],
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

// cninfo (F3 review, Task 5): only titles that END in a report phrase are reports; notices ABOUT a report
// (inquiry replies, meeting notices, review opinions, delay or disclosure reminders, H-share notices) are other.
const CN_EXCLUDE=/摘要|英文|更正|已取消|补充|关于|提示性|说明会|意见|问询|回复|延期|H股公告/;
const CN_REPORT_TAIL=/(年度报告|半年度报告|中期报告|第?[一三]季度报告)(全文|正文)?([（(][^）)]*[）)])?$/;
function classifyCninfo(i:ClassifyInput):Classified{
 const t=i.title.normalize('NFKC').trim();
 const years=[...new Set([...t.matchAll(/((?:19|20)\d{2})\s*年/g)].map(m=>Number(m[1])))];
 const year=years.length===1?years[0]:null;
 const periodic=(doc_class:DocClass,fiscal_period:FiscalPeriod,mmdd:string):Classified=>({doc_class,fiscal_year:year,fiscal_period:year===null?null:fiscal_period,period_end:year===null?null:`${year}-${mmdd}`,filing_source_ref:null,language:'zh'});
 const m=CN_EXCLUDE.test(t)?null:CN_REPORT_TAIL.exec(t);
 if(m){
  const phrase=m[1];
  if(phrase==='半年度报告'||phrase==='中期报告')return periodic('interim_report','H1','06-30');
  if(phrase==='年度报告')return periodic('annual_report','FY','12-31');
  return /一/.test(phrase)?periodic('quarterly_report','Q1','03-31'):periodic('quarterly_report','Q3','09-30');
 }
 if(/业绩快报|业绩预告/.test(t)&&!/关于|提示性|说明会|意见|问询|回复|延期/.test(t))return {doc_class:'results_announcement',fiscal_year:year,fiscal_period:null,period_end:null,filing_source_ref:null,language:'zh'};
 return {doc_class:'other',...NONE,filing_source_ref:null,language:'zh'};
}

// HKEX (F3 review, Task 5): the headline's bracketed category tokens are matched EXACTLY; delay / despatch
// notices ([延遲發送年報], [Delay in Despatch of Annual Report]) are other. With no bracketed token (empty
// headline: title fallback) the text is matched loosely, after the same delay/despatch exclusion.
const HK_TOKENS:Record<string,DocClass>={
 '年報':'annual_report','年报':'annual_report','annual report':'annual_report',
 '中期報告':'interim_report','中期报告':'interim_report','半年度報告':'interim_report','半年度报告':'interim_report','中期/半年度報告':'interim_report','中期/半年度报告':'interim_report',
 'interim report':'interim_report','half-year report':'interim_report','interim/half-year report':'interim_report',
 '季度報告':'quarterly_report','季度报告':'quarterly_report','quarterly report':'quarterly_report',
 '業績公告':'results_announcement','业绩公告':'results_announcement','全年業績':'results_announcement','全年业绩':'results_announcement',
 '中期業績':'results_announcement','中期业绩':'results_announcement','季度業績':'results_announcement','季度业绩':'results_announcement',
 'results announcement':'results_announcement','final results':'results_announcement','interim results':'results_announcement','quarterly results':'results_announcement',
};
const HK_NOTICE=/延遲|延迟|推遲|推迟|寄發|寄发|發送|发送|刊發|刊发|delay|despatch|dispatch|postpone|notice of|notification/i;
function hkLoose(text:string):DocClass{
 if(HK_NOTICE.test(text))return 'other';
 if(/年報|年报|Annual Report/i.test(text))return 'annual_report';
 if(/中期\/半年度報告|中期報告|半年度報告|中期报告|半年度报告|Interim Report|Interim\/Half-Year Report|Half-Year Report/i.test(text))return 'interim_report';
 if(/季度報告|季度报告|Quarterly Report/i.test(text))return 'quarterly_report';
 if(/業績公告|全年業績|中期業績|季度業績|业绩公告|全年业绩|中期业绩|季度业绩|Results Announcement|Final Results|Interim Results|Quarterly Results/i.test(text))return 'results_announcement';
 return 'other';
}
function hkClass(headline:string,title:string):DocClass{
 const tokens=[...headline.matchAll(/\[([^\]]*)\]/g)].map(m=>m[1].normalize('NFKC').trim().toLowerCase());
 if(tokens.length>0){for(const t of tokens){const c=HK_TOKENS[t];if(c)return c;}return 'other';}
 return hkLoose(headline.length>0?headline:title);
}
/** The reporting period phrase of an HKEX title: 截至<date>止(年度|六個月|三個月|九個月) or "for the (financial year|N months|period) ended <date>". */
function hkPeriod(title:string):{end:string;duration:'FY'|'H1'|'3M'|'9M'|null}|null{
 const t=title.normalize('NFKC');
 const zh=/截至\s*(.+?)\s*止\s*(年度|六個月|六个月|三個月|三个月|九個月|九个月)?/.exec(t);
 if(zh){const end=cnDate(zh[1]);if(end)return {end,duration:zh[2]==='年度'?'FY':!zh[2]?null:/^六/.test(zh[2])?'H1':/^三/.test(zh[2])?'3M':'9M'};}
 const en=/for the\s+((?:financial\s+)?year|(?:six|6)[\s-]months?(?:\s+period)?|(?:three|3)[\s-]months?(?:\s+period)?|(?:nine|9)[\s-]months?(?:\s+period)?|period)\s+ended\s+(.+)$/i.exec(t);
 if(en){
  const end=cnDate(en[2]);
  if(end){const d=en[1].toLowerCase();return {end,duration:/year/.test(d)?'FY':/^(six|6)/.test(d)?'H1':/^(three|3)/.test(d)?'3M':/^(nine|9)/.test(d)?'9M':null};}
 }
 return null;
}
const HK_PERIODIC=new Set<DocClass>(['annual_report','interim_report','quarterly_report','results_announcement']);
function classifyHkex(i:ClassifyInput):Classified{
 const head=(i.headline??'').trim();
 const doc_class=hkClass(head,i.title);
 // a file with no _c/_e suffix is a single bilingual PDF: zh, so it can still be the primary document
 const language:'zh'|'en'=/_e$/i.test(i.source_ref)?'en':'zh';
 const p=HK_PERIODIC.has(doc_class)?hkPeriod(i.title):null;
 if(!p)return {doc_class,...NONE,filing_source_ref:null,language};
 const month=p.end.slice(5,7);
 // 3 / 9 months are Q1 / Q3 only at the calendar quarter ends the cninfo rules use (03 / 09); otherwise unknown
 const fiscal_period:FiscalPeriod|null=p.duration==='3M'?(month==='03'?'Q1':null):p.duration==='9M'?(month==='09'?'Q3':null):p.duration??(doc_class==='annual_report'?'FY':doc_class==='interim_report'?'H1':null);
 return {doc_class,fiscal_year:Number(p.end.slice(0,4)),fiscal_period,period_end:p.end,filing_source_ref:null,language};
}

export function classify(source:ListedSource,input:ClassifyInput):Classified{
 if(source==='edgar')return classifyEdgar(input);
 if(source==='cninfo')return classifyCninfo(input);
 return classifyHkex(input);
}
