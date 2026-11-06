// src/lib/documents/sources/cninfo.ts
// 巨潮 list adapter (spec §6.2). fetch_key '<code>,<orgId>' (orgId empty → resolved once per run by
// topSearch, exact code match, same protocol as collectors/cninfo.ts). A segment is a date range
// (backfill: one calendar year; poll: the poll window); list() walks every hisAnnouncement/query page
// (PAGE_SIZE 30; a short page is the last page even when hasMore says otherwise — observed live) and
// returns the segment's complete list in stable order. category stays '' (its periodic-report value is
// unverified, spec §15 q4) and classify() filters to PERIODIC_CLASSES unless allAnnouncements.
// SH/SZ only: column sse for 6xxxxx, szse otherwise. published_at = announcementTime (Beijing
// midnight), precision 'date'. PDF url = static.cninfo.com.cn/<adjunctUrl>.
import {CNINFO_HISTORY,CNINFO_TOPSEARCH} from '../../research/ingest/collectors/cninfo';
import {classify} from '../classify';
import {PERIODIC_CLASSES,orderListed,pollSegment,yearSegments} from './shared';
import type {Budget,Listed,PoliteHttp,SourceAdapter} from './shared';

export const CNINFO_INTERVAL_MS=500;
const STATIC='http://static.cninfo.com.cn/';
const PAGE_SIZE=30,MAX_PAGES=200;
interface Announcement{announcementId?:unknown;announcementTitle?:unknown;announcementTime?:unknown;adjunctUrl?:unknown;adjunctType?:unknown}
export interface CninfoAdapterOptions{http:PoliteHttp;allAnnouncements?:boolean}

export function parseCninfoKey(key:string):{code:string;orgId:string|null}{
 const m=/^(\d{6}),([^,]*)$/.exec(key);
 if(!m)throw new Error('invalid_fetch_key');
 return {code:m[1],orgId:m[2].length>0?m[2]:null};
}

export function cninfoAdapter(opts:CninfoAdapterOptions):SourceAdapter{
 const orgCache=new Map<string,string>();
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
  source:'cninfo',coverageGap:null,
  segments:(scope,mode,sinceYear,now)=>mode==='poll'?[pollSegment(scope,now)]:yearSegments(sinceYear,now),
  async list(scope,seg,budget){
   const {code,orgId:known}=parseCninfoKey(scope.fetch_key);
   const orgId=await orgIdOf(code,known,budget);
   const column=code.startsWith('6')?'sse':'szse';
   const out:Listed[]=[];
   for(let pageNum=1;;pageNum++){
    if(pageNum>MAX_PAGES)throw new Error('cninfo_too_many_pages');
    const body=new URLSearchParams({pageNum:String(pageNum),pageSize:String(PAGE_SIZE),column,tabName:'fulltext',plate:'',stock:`${code},${orgId}`,searchkey:'',secid:'',category:'',trade:'',
     seDate:`${seg.from}~${seg.to}`,sortName:'',sortType:'',isHLtitle:'true'}).toString();
    const page=JSON.parse(await opts.http.postForm(CNINFO_HISTORY,body,budget)) as {announcements?:unknown;hasMore?:unknown};
    if(page.announcements!==null&&page.announcements!==undefined&&!Array.isArray(page.announcements))throw new Error('layout_changed: announcements');
    const rows=(page.announcements??[]) as Announcement[];
    for(const a of rows){
     if(typeof a.announcementId!=='string'||typeof a.announcementTime!=='number'||typeof a.adjunctUrl!=='string'||typeof a.announcementTitle!=='string')throw new Error('layout_changed: announcement');
     const title=a.announcementTitle.replace(/<[^>]+>/g,'').trim();
     const formType=typeof a.adjunctType==='string'?a.adjunctType:null;
     if(!opts.allAnnouncements&&!PERIODIC_CLASSES.has(classify('cninfo',{form_type:formType,title,source_ref:a.announcementId}).doc_class))continue;
     out.push({source_ref:a.announcementId,source_url:STATIC+a.adjunctUrl.replace(/^\/+/,''),title,form_type:formType,published_at:new Date(a.announcementTime).toISOString(),precision:'date'});
    }
    if(page.hasMore!==true||rows.length<PAGE_SIZE)break;
   }
   return orderListed(out);
  },
 };
}
