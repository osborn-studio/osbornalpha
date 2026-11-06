// src/lib/documents/sources/cninfo.ts
// 巨潮 list adapter (spec §6.2). fetch_key '<code>,<orgId>' (orgId empty → resolved once per run by
// topSearch, exact code match, same protocol as collectors/cninfo.ts). A segment is a date range
// (backfill: one calendar year; poll: the poll window); list() walks every hisAnnouncement/query page
// (PAGE_SIZE 30) until the collected count reaches totalAnnouncement/totalRecordNum; a short page or
// hasMore=false before the total, a repeated announcement, contradictory totals, or a missing
// `announcements` field (error envelope) is layout_changed, never a partial list; it returns the segment's complete list in stable order. category stays '' (its periodic-report value is
// unverified, spec §15 q4) and classify() filters to PERIODIC_CLASSES unless allAnnouncements.
// SH/SZ only: column sse for 6xxxxx, szse otherwise. published_at = announcementTime (Beijing
// midnight), precision 'date'. PDF url = static.cninfo.com.cn/<adjunctUrl>.
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../../research/ingest/collectors/cninfo';
import {classify} from '../classify';
import {HOST_POLICY,PERIODIC_CLASSES,orderListed,pollSegment,urlRejection,yearSegments} from './shared';
import type {Budget,Listed,PoliteHttp,Rejection,SourceAdapter} from './shared';

export const CNINFO_INTERVAL_MS=500;
const STATIC='https://static.cninfo.com.cn/';   // https; the recorded adjunctUrl is host-relative
const PAGE_SIZE=30,MAX_PAGES=200;
interface Announcement{announcementId?:unknown;announcementTitle?:unknown;announcementTime?:unknown;adjunctUrl?:unknown;adjunctType?:unknown}
interface Envelope{announcements?:unknown;hasMore?:unknown;totalAnnouncement?:unknown;totalRecordNum?:unknown}
export interface CninfoAdapterOptions{http:PoliteHttp;allAnnouncements?:boolean}

export function parseCninfoKey(key:string):{code:string;orgId:string|null}{
 const m=/^(\d{6}),([^,]*)$/.exec(key);
 if(!m)throw new Error('invalid_fetch_key');
 return {code:m[1],orgId:m[2].length>0?m[2]:null};
}

export function cninfoAdapter(opts:CninfoAdapterOptions):SourceAdapter{
 const orgCache=new Map<string,string>();
 const rejected:Rejection[]=[];
 const orgIdOf=async(code:string,known:string|null,budget:Budget):Promise<string>=>{
  if(known)return known;
  const hit=orgCache.get(code);if(hit)return hit;
  const rows=JSON.parse(await opts.http.postForm(CNINFO_TOPSEARCH,`keyWord=${encodeURIComponent(code)}&maxNum=10`,budget)) as {code?:unknown;orgId?:unknown}[];
  const row=Array.isArray(rows)?rows.find(r=>r.code===code&&typeof r.orgId==='string'&&r.orgId.length>0):undefined;
  if(!row)throw new Error('cninfo_org_unresolved');
  orgCache.set(code,row.orgId as string);
  return row.orgId as string;
 };
 return {
  source:'cninfo',rejected,coverageGap:null,
  segments:(scope,mode,sinceYear,now)=>mode==='poll'?[pollSegment(scope,now)]:yearSegments(sinceYear,now),
  async list(scope,seg,budget){
   const {code,orgId:known}=parseCninfoKey(scope.fetch_key);
   const orgId=await orgIdOf(code,known,budget);
   const column=code.startsWith('6')?'sse':'szse';
   const out:Listed[]=[];const seen=new Set<string>();
   let total:number|null=null;let collected=0;
   for(let pageNum=1;;pageNum++){
    if(pageNum>MAX_PAGES)throw new Error('cninfo_too_many_pages');
    const body=new URLSearchParams({pageNum:String(pageNum),pageSize:String(PAGE_SIZE),column,tabName:'fulltext',plate:'',stock:`${code},${orgId}`,searchkey:'',secid:'',category:'',trade:'',
     seDate:`${seg.from}~${seg.to}`,sortName:'',sortType:'',isHLtitle:'true'}).toString();
    const raw=await opts.http.postForm(CNINFO_HISTORY,body,budget);
    let page:Envelope;
    try{page=JSON.parse(raw) as Envelope;}catch{throw new Error('layout_changed: not json');}
    // The envelope must carry `announcements` (array, or null with a zero total) and a consistent total; an error envelope or a changed shape is never an empty list.
    if(page===null||typeof page!=='object'||!('announcements' in page))throw new Error('layout_changed: announcements missing');
    if(page.announcements!==null&&!Array.isArray(page.announcements))throw new Error('layout_changed: announcements');
    const totals=[page.totalAnnouncement,page.totalRecordNum].filter(t=>t!==undefined&&t!==null);
    if(totals.length===0||totals.some(t=>typeof t!=='number'||!Number.isInteger(t)||t<0)||new Set(totals).size!==1)throw new Error('layout_changed: total metadata');
    const pageTotal=totals[0] as number;
    if(total!==null&&pageTotal!==total)throw new Error('layout_changed: total changed between pages');
    total=pageTotal;
    const rows=(page.announcements??[]) as Announcement[];
    for(const a of rows){
     if(typeof a.announcementId!=='string'||typeof a.announcementTime!=='number'||typeof a.adjunctUrl!=='string'||typeof a.announcementTitle!=='string')throw new Error('layout_changed: announcement');
     if(seen.has(a.announcementId))throw new Error('layout_changed: repeated announcement (repeated page)');
     seen.add(a.announcementId);
     const title=a.announcementTitle.replace(/<[^>]+>/g,'').trim();
     const formType=typeof a.adjunctType==='string'?a.adjunctType:null;
     const url=STATIC+a.adjunctUrl.replace(/^\/+/,'');
     const bad=urlRejection(url,HOST_POLICY.cninfo);
     if(bad!==null){rejected.push({source_ref:a.announcementId,url,reason:bad});continue;}
     if(opts.allAnnouncements||PERIODIC_CLASSES.has(classify('cninfo',{form_type:formType,title,source_ref:a.announcementId}).doc_class))
      out.push({source_ref:a.announcementId,source_url:url,title,form_type:formType,published_at:new Date(a.announcementTime).toISOString(),precision:'date'});
    }
    collected+=rows.length;
    if(collected>total)throw new Error('layout_changed: more announcements than the total');
    if(collected===total){
     if(page.hasMore===true)throw new Error('layout_changed: hasMore with the total reached');
     break;
    }
    // total not reached: another page must exist and this one must have been full
    if(page.hasMore===false||rows.length<PAGE_SIZE)throw new Error('layout_changed: short page before the total');
   }
   return orderListed(out);
  },
 };
}
