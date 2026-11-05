// src/lib/facts/providers/cninfo-link.ts
// 巨潮 filing linkage (spec §6.3 linkCn). For an A-share periodic filing, list hisAnnouncement/query over
// available_date ± 3 days (every page) and keep titles that name the report year and kind and are not
// 摘要/英文/已取消/补充; 更正 titles are excluded, except for restatement filings and filings that were
// corrected (a type-5 row exists for the same key), which must match 更正 + year + kind. Exactly one hit →
// {document_ref, document_url}; zero → 'none'; several → 'ambiguous'. SH/SZ only (BJ → 'none' without a
// request). Same endpoint, 500 ms pacing and body as research/ingest/collectors/cninfo.ts; orgId from
// issuers.cninfo_org_id, else resolveOrgId (not persisted here). Network errors throw; the caller still
// counts the attempt (link_attempts + 1, stop at 5).
// Title matching is whole-title (round-1 follow-up): [short name：]<YYYY>年<kind word>[permitted suffix] only; 更正 announcements
// use their own pattern; inquiry letters, opinions, resolutions and other documents that merely mention the report never match.
// Budget/pacing: every request (org lookup included) checks the budget first, waits for ONE module-level pacing slot (reserved
// synchronously, >= 500 ms between request starts, shared by every caller in the process) and runs under budget.signal combined
// with a per-request timeout capped at remaining - 20 s; errors are fixed codes (budget_aborted / budget_exhausted / cninfo <status>
// / cninfo_timeout / cninfo_bad_body), never response bodies.
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../../research/ingest/collectors/cninfo';
import type {Budget,FilingRow} from '../types';
import {createPacer,sleep} from './shared';

export const CNINFO_STATIC='http://static.cninfo.com.cn/';
export const CNINFO_PAGE_SIZE=30;
export const CNINFO_WINDOW_DAYS=3;
export const KIND_WORDS={annual:['年度报告','年报'],semiannual:['半年度报告','半年报','中期报告'],q1:['第一季度报告','一季度报告','第一季度季报'],q3:['第三季度报告','三季度报告','第三季度季报']} as const;
export const EXCLUDE=/摘要|英文|已取消|补充|问询|意见|决议|函/;
/** The only suffixes a report title may carry after the kind word. */
export const PERMITTED_SUFFIX='(?:（(?:修订版|修订稿|修订后|更正后|更正版|更新后|更新版)）)?';
export const CNINFO_MIN_INTERVAL_MS=500;
export const CNINFO_RESERVE_MS=20_000;
export const CNINFO_REQUEST_TIMEOUT_MS=30_000;
export type CninfoLinkResult={document_ref:string;document_url:string}|'none'|'ambiguous';
export interface LinkFiling{form_type:FilingRow['form_type'];fiscal_year:number|null;period_end:string|null;available_date:string;corrected?:boolean}
export interface LinkIssuer{ts_code:string;cninfo_org_id:string|null}
export interface LinkOptions{fetch?:typeof fetch;userAgent?:string;budget:Budget;minIntervalMs?:number;now?:()=>number;sleep?:typeof sleep}
interface Announcement{announcementId?:string;announcementTitle?:string;adjunctUrl?:string}
const KIND_BY_MONTH:Record<string,keyof typeof KIND_WORDS|undefined>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};

function kindOf(f:LinkFiling):keyof typeof KIND_WORDS|null{
 if(f.form_type==='annual'||f.form_type==='semiannual'||f.form_type==='q1'||f.form_type==='q3')return f.form_type;
 if(f.form_type==='restatement'&&f.period_end)return KIND_BY_MONTH[f.period_end.slice(5,7)]??null;
 return null;
}
// Short company name: no digits, no brackets, never a 关于 lead-in; optionally followed by a colon.
const NAME='[^\\d：:（）()]{0,20}';
const HEAD=`(?!关于)${NAME}[：:]?`;
export function matchesAnnouncement(title:string,f:LinkFiling):boolean{
 const kind=kindOf(f);
 if(!kind||f.fiscal_year===null)return false;
 const t=title.replace(/<[^>]+>/g,'').replace(/\s+/g,'').replace(/\(/g,'（').replace(/\)/g,'）');
 if(EXCLUDE.test(t))return false;
 const words=`(?:${KIND_WORDS[kind].join('|')})`;
 const correction=f.form_type==='restatement'||f.corrected===true;
 const re=correction
  ?new RegExp(`^(?:${NAME}[：:])?关于${NAME}${f.fiscal_year}年${words}的?更正(?:说明)?公告$`)
  :new RegExp(`^${HEAD}${f.fiscal_year}年${words}${PERMITTED_SUFFIX}$`);
 return re.test(t);
}
const shiftDate=(ymd:string,days:number)=>new Date(Date.parse(`${ymd}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
export function cninfoQueryBody(q:{code:string;orgId:string;column:'sse'|'szse';availableDate:string;pageNum:number}):string{
 const seDate=`${shiftDate(q.availableDate,-CNINFO_WINDOW_DAYS)}~${shiftDate(q.availableDate,CNINFO_WINDOW_DAYS)}`;
 return new URLSearchParams({pageNum:String(q.pageNum),pageSize:String(CNINFO_PAGE_SIZE),column:q.column,tabName:'fulltext',plate:'',stock:`${q.code},${q.orgId}`,searchkey:'',secid:'',category:'',trade:'',seDate,sortName:'',sortType:'',isHLtitle:'true'}).toString();
}

const pacer=createPacer(CNINFO_MIN_INTERVAL_MS);   // one pace across org lookups, history pages, successive filings and concurrent callers
/** Test hook: forget the pacing state. */
export const resetCninfoPacing=()=>pacer.reset();

/** One paced, budget-bound POST; returns status and the fully consumed body text. */
async function post(url:string,body:string,opts:LinkOptions,ua:string):Promise<{status:number;text:string}>{
 const {budget}=opts;
 await pacer.admit({budget,reserveMs:CNINFO_RESERVE_MS,now:opts.now,sleep:opts.sleep,minIntervalMs:opts.minIntervalMs});   // throws PacerError: budget_aborted | budget_exhausted
 const timeoutMs=Math.min(CNINFO_REQUEST_TIMEOUT_MS,budget.remainingMs()-CNINFO_RESERVE_MS);
 const signal=AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)]);
 try{
  const res=await (opts.fetch??fetch)(url,{method:'POST',body,headers:{'User-Agent':ua,'Content-Type':'application/x-www-form-urlencoded'},signal});
  const status=res.status;
  if(!res.ok)return {status,text:''};                       // body of a failed response is never read or surfaced
  return {status,text:await res.text()};                   // consumed under the same signal
 }catch(e){
  if(budget.signal.aborted)throw new Error('budget_aborted');
  if(signal.aborted)throw new Error('cninfo_timeout');
  throw e instanceof Error&&/^cninfo/.test(e.message)?e:new Error('cninfo_network');
 }
}
const parseJson=<T>(text:string):T=>{try{return JSON.parse(text) as T;}catch{throw new Error('cninfo_bad_body');}};

async function lookupOrgId(code:string,opts:LinkOptions,ua:string):Promise<string|null>{
 const r=await post(CNINFO_TOPSEARCH,`keyWord=${encodeURIComponent(code)}&maxNum=10`,opts,ua);
 if(r.status<200||r.status>=300)throw new Error(`cninfo ${r.status}`);
 const rows=parseJson<Array<{code?:string;orgId?:string}>>(r.text);
 const hit=Array.isArray(rows)?rows.find(x=>x.code===code&&typeof x.orgId==='string'):undefined;
 return hit?.orgId??null;
}

export async function linkCninfoFiling(filing:LinkFiling,issuer:LinkIssuer,opts:LinkOptions):Promise<CninfoLinkResult>{
 const m=/^(\d{6})\.(SH|SZ)$/.exec(issuer.ts_code);
 if(!m||kindOf(filing)===null||filing.fiscal_year===null)return 'none';
 const code=m[1],column=m[2]==='SH'?'sse':'szse';
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 if(opts.budget.signal.aborted)throw new Error('budget_aborted');
 if(opts.budget.remainingMs()<=CNINFO_RESERVE_MS)throw new Error('budget_exhausted');
 const orgId=issuer.cninfo_org_id??await lookupOrgId(code,opts,ua);
 if(!orgId)return 'none';
 const hits:{id:string;url:string}[]=[];
 for(let pageNum=1;;pageNum++){
  const res=await post(CNINFO_HISTORY,cninfoQueryBody({code,orgId,column,availableDate:filing.available_date,pageNum}),opts,ua);
  if(res.status<200||res.status>=300)throw new Error(`cninfo ${res.status}`);
  const page=parseJson<{announcements?:Announcement[]|null;hasMore?:boolean}>(res.text);
  const list=page.announcements??[];
  for(const a of list)if(typeof a.announcementId==='string'&&typeof a.adjunctUrl==='string'&&matchesAnnouncement(a.announcementTitle??'',filing))hits.push({id:a.announcementId,url:CNINFO_STATIC+a.adjunctUrl});
  if(!page.hasMore||list.length<CNINFO_PAGE_SIZE)break;
 }
 if(hits.length===0)return 'none';
 if(hits.length>1)return 'ambiguous';
 return {document_ref:hits[0].id,document_url:hits[0].url};
}
