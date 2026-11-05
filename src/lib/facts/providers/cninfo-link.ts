// src/lib/facts/providers/cninfo-link.ts
// 巨潮 filing linkage (spec §6.3 linkCn). For an A-share periodic filing, list hisAnnouncement/query over
// available_date ± 3 days (every page) and keep titles that name the report year and kind and are not
// 摘要/英文/已取消/补充; 更正 titles are excluded, except for restatement filings and filings that were
// corrected (a type-5 row exists for the same key), which must match 更正 + year + kind. Exactly one hit →
// {document_ref, document_url}; zero → 'none'; several → 'ambiguous'. SH/SZ only (BJ → 'none' without a
// request). Same endpoint, 500 ms pacing and body as research/ingest/collectors/cninfo.ts; orgId from
// issuers.cninfo_org_id, else resolveOrgId (not persisted here). Network errors throw; the caller still
// counts the attempt (link_attempts + 1, stop at 5).
import {createClient,DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {CNINFO_HISTORY,resolveOrgId} from '../../research/ingest/collectors/cninfo';
import type {Budget,FilingRow} from '../types';

export const CNINFO_STATIC='http://static.cninfo.com.cn/';
export const CNINFO_PAGE_SIZE=30;
export const CNINFO_WINDOW_DAYS=3;
export const KIND_WORDS={annual:['年度报告','年报'],semiannual:['半年度报告','半年报','中期报告'],q1:['第一季度报告','一季度报告','第一季度季报'],q3:['第三季度报告','三季度报告','第三季度季报']} as const;
/** Kinds are mutually exclusive: 半年度报告 / 半年报 contain the annual words, so an annual filing refuses any 半年 title (round-1 #8). */
export const KIND_VETO:Partial<Record<keyof typeof KIND_WORDS,RegExp>>={annual:/半年/};
export const EXCLUDE=/摘要|英文|已取消|补充/;
export type CninfoLinkResult={document_ref:string;document_url:string}|'none'|'ambiguous';
export interface LinkFiling{form_type:FilingRow['form_type'];fiscal_year:number|null;period_end:string|null;available_date:string;corrected?:boolean}
export interface LinkIssuer{ts_code:string;cninfo_org_id:string|null}
export interface LinkOptions{fetch?:typeof fetch;userAgent?:string;budget:Budget;minIntervalMs?:number}
interface Announcement{announcementId?:string;announcementTitle?:string;adjunctUrl?:string}
const KIND_BY_MONTH:Record<string,keyof typeof KIND_WORDS|undefined>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};

function kindOf(f:LinkFiling):keyof typeof KIND_WORDS|null{
 if(f.form_type==='annual'||f.form_type==='semiannual'||f.form_type==='q1'||f.form_type==='q3')return f.form_type;
 if(f.form_type==='restatement'&&f.period_end)return KIND_BY_MONTH[f.period_end.slice(5,7)]??null;
 return null;
}
export function matchesAnnouncement(title:string,f:LinkFiling):boolean{
 const kind=kindOf(f);
 if(!kind||f.fiscal_year===null)return false;
 const t=title.replace(/<[^>]+>/g,'').replace(/\s+/g,'');
 if(EXCLUDE.test(t))return false;
 const veto=KIND_VETO[kind];
 if(veto&&veto.test(t))return false;
 const correction=f.form_type==='restatement'||f.corrected===true;
 if(correction!==t.includes('更正'))return false;
 if(!t.includes(`${f.fiscal_year}年`))return false;
 return KIND_WORDS[kind].some(w=>t.includes(w));
}
const shiftDate=(ymd:string,days:number)=>new Date(Date.parse(`${ymd}T00:00:00Z`)+days*86_400_000).toISOString().slice(0,10);
export function cninfoQueryBody(q:{code:string;orgId:string;column:'sse'|'szse';availableDate:string;pageNum:number}):string{
 const seDate=`${shiftDate(q.availableDate,-CNINFO_WINDOW_DAYS)}~${shiftDate(q.availableDate,CNINFO_WINDOW_DAYS)}`;
 return new URLSearchParams({pageNum:String(q.pageNum),pageSize:String(CNINFO_PAGE_SIZE),column:q.column,tabName:'fulltext',plate:'',stock:`${q.code},${q.orgId}`,searchkey:'',secid:'',category:'',trade:'',seDate,sortName:'',sortType:'',isHLtitle:'true'}).toString();
}

export async function linkCninfoFiling(filing:LinkFiling,issuer:LinkIssuer,opts:LinkOptions):Promise<CninfoLinkResult>{
 const m=/^(\d{6})\.(SH|SZ)$/.exec(issuer.ts_code);
 if(!m||kindOf(filing)===null||filing.fiscal_year===null)return 'none';
 const code=m[1],column=m[2]==='SH'?'sse':'szse';
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const orgId=issuer.cninfo_org_id??(await resolveOrgId(code,{fetch:opts.fetch,userAgent:ua}))?.orgId;
 if(!orgId)return 'none';
 const client=createClient({ctx:null as never,companies:[],since:'',fetch:opts.fetch,userAgent:ua,minIntervalMs:opts.minIntervalMs},500);
 const hits:{id:string;url:string}[]=[];
 for(let pageNum=1;;pageNum++){
  if(opts.budget.signal.aborted||opts.budget.remainingMs()<=20_000)throw new Error('budget_exhausted');
  const res=await client.post(CNINFO_HISTORY,cninfoQueryBody({code,orgId,column,availableDate:filing.available_date,pageNum}));
  if(!res.ok)throw new Error(`cninfo ${res.status}`);
  const page=await res.json() as {announcements?:Announcement[]|null;hasMore?:boolean};
  const list=page.announcements??[];
  for(const a of list)if(typeof a.announcementId==='string'&&typeof a.adjunctUrl==='string'&&matchesAnnouncement(a.announcementTitle??'',filing))hits.push({id:a.announcementId,url:CNINFO_STATIC+a.adjunctUrl});
  if(!page.hasMore||list.length<CNINFO_PAGE_SIZE)break;
 }
 if(hits.length===0)return 'none';
 if(hits.length>1)return 'ambiguous';
 return {document_ref:hits[0].id,document_url:hits[0].url};
}
